import { colorSortIndex } from "./colors";
import type { FiberAnchor, LayoutPlan, Point, RoutedStrand, Segment, SpliceConnection } from "./types";

export const ROUTE_LANE_SPACING = 24;
export const ROUTE_GROUP_GAP = 72;
export const CENTER_ROUTE_MARGIN = 40;
export const SAME_SIDE_LOOP_INSET = 132;
export const ROUTE_Y_EPS = 0.5;

type AnchorPair = { source: FiberAnchor; target: FiberAnchor };

type RouteSeed = {
  conn: SpliceConnection;
  anchors: AnchorPair;
  source: Point;
  target: Point;
  routeType: "crossSide" | "sameSideLoop";
  groupKey: string;
};

type RoutedSeed = RouteSeed & {
  lane: number;
  midX: number;
  points: Point[];
  segments: Segment[];
};

type FiberGroup = {
  key: string;
  members: RouteSeed[];
  sourceY: number;
  targetY: number;
  routeType: RouteSeed["routeType"];
};

export function routingZoneKey(source: Point, target: Point, centerX: number): string {
  const sourceSide = source.x < centerX ? "L" : "R";
  const targetSide = target.x < centerX ? "L" : "R";
  return `${sourceSide}-${targetSide}:${Math.round(source.x)}:${Math.round(target.x)}`;
}

/**
 * V2 fiber group key.
 *
 * A fiber group is two or more fibers from the same source buffer tube.
 * OS/circuit name is intentionally NOT part of the group key. OS is only a
 * grouping hint; using it as a hard key splits paired fibers and caused the
 * bad separated routing seen in the V1 sample.
 */
function fiberGroupKey(conn: SpliceConnection): string {
  return [
    conn.source.cableId,
    String(conn.source.tubeColor),
    conn.target.cableId,
    String(conn.target.tubeColor),
  ].join("|");
}

function compareByFiberColorOrder(a: RouteSeed, b: RouteSeed): number {
  return (
    colorSortIndex(a.conn.source.fiberColor) - colorSortIndex(b.conn.source.fiberColor) ||
    a.conn.source.fiberNumber - b.conn.source.fiberNumber ||
    colorSortIndex(a.conn.target.fiberColor) - colorSortIndex(b.conn.target.fiberColor) ||
    a.conn.target.fiberNumber - b.conn.target.fiberNumber ||
    a.conn.id.localeCompare(b.conn.id)
  );
}

function compareGroups(a: FiberGroup, b: FiberGroup): number {
  return (
    a.sourceY - b.sourceY ||
    a.targetY - b.targetY ||
    String(a.members[0]?.conn.source.tubeColor ?? "").localeCompare(String(b.members[0]?.conn.source.tubeColor ?? "")) ||
    a.key.localeCompare(b.key)
  );
}

function pointsToSegments(points: Point[]): Segment[] {
  const segments: Segment[] = [];
  for (let index = 1; index < points.length; index += 1) {
    const from = points[index - 1]!;
    const to = points[index]!;
    if (Math.abs(from.x - to.x) < 0.01 && Math.abs(from.y - to.y) < 0.01) continue;
    segments.push({ kind: Math.abs(from.y - to.y) < 0.01 ? "h" : "v", from, to });
  }
  return segments;
}

function buildRoutePoints(source: Point, target: Point, midX: number): Point[] {
  if (Math.abs(source.y - target.y) <= ROUTE_Y_EPS) return [source, target];
  return [source, { x: midX, y: source.y }, { x: midX, y: target.y }, target];
}

function routeTypeFor(source: Point, target: Point, centerX: number): RouteSeed["routeType"] {
  return source.x < centerX === target.x < centerX ? "sameSideLoop" : "crossSide";
}

function centerBounds(layout: LayoutPlan): { left: number; right: number } {
  const leftCableRight = Math.max(0, ...layout.cables.filter((c) => c.side === "left").map((c) => c.x + c.width));
  const rightCableLeft = Math.min(layout.width, ...layout.cables.filter((c) => c.side === "right").map((c) => c.x));
  const left = Math.min(layout.centerX - ROUTE_LANE_SPACING, leftCableRight + CENTER_ROUTE_MARGIN);
  const right = Math.max(layout.centerX + ROUTE_LANE_SPACING, rightCableLeft - CENTER_ROUTE_MARGIN);
  return { left, right };
}

function routeSeeds(modelConnections: SpliceConnection[], layout: LayoutPlan): { seeds: RouteSeed[]; missingIds: string[] } {
  const seeds: RouteSeed[] = [];
  const missingIds: string[] = [];

  for (const conn of modelConnections) {
    const anchors = layout.anchorsByConnection[conn.id];
    if (!anchors) {
      missingIds.push(conn.id);
      continue;
    }

    const source = anchors.source.absolute;
    const target = anchors.target.absolute;
    seeds.push({
      conn,
      anchors,
      source,
      target,
      routeType: routeTypeFor(source, target, layout.centerX),
      groupKey: fiberGroupKey(conn),
    });
  }

  return { seeds, missingIds };
}

function buildGroups(seeds: RouteSeed[]): FiberGroup[] {
  const byGroup = new Map<string, RouteSeed[]>();
  for (const seed of seeds) {
    byGroup.set(seed.groupKey, [...(byGroup.get(seed.groupKey) ?? []), seed]);
  }

  return [...byGroup.entries()]
    .map(([key, members]) => {
      const sorted = [...members].sort(compareByFiberColorOrder);
      const sourceY = sorted.reduce((sum, item) => sum + item.source.y, 0) / Math.max(1, sorted.length);
      const targetY = sorted.reduce((sum, item) => sum + item.target.y, 0) / Math.max(1, sorted.length);
      return { key, members: sorted, sourceY, targetY, routeType: sorted[0]!.routeType };
    })
    .sort(compareGroups);
}

function groupLaneStarts(groups: FiberGroup[], left: number, right: number): number[] {
  const widths = groups.map((group) => Math.max(0, group.members.length - 1) * ROUTE_LANE_SPACING);
  const totalWidth = widths.reduce((sum, width) => sum + width, 0) + Math.max(0, groups.length - 1) * ROUTE_GROUP_GAP;
  const available = Math.max(0, right - left);

  let cursor = left + Math.max(0, (available - totalWidth) / 2);
  return widths.map((width, index) => {
    const start = cursor;
    cursor += width + (index < widths.length - 1 ? ROUTE_GROUP_GAP : 0);
    return start;
  });
}

function clampToCenter(x: number, left: number, right: number): number {
  return Math.max(left, Math.min(right, x));
}

/**
 * Main V2 router.
 *
 * It routes fiber groups first, then strands inside each group.
 * - groups are based on same source buffer tube + same target cable/tube
 * - fibers inside a group stay in fiber color-code order
 * - strands inside a group use fixed 24px spacing
 * - groups get larger visual gaps between them
 */
export function routeNestedFiberGroups(modelConnections: SpliceConnection[], layout: LayoutPlan): { routes: RoutedSeed[]; missingIds: string[] } {
  const { seeds, missingIds } = routeSeeds(modelConnections, layout);
  const bounds = centerBounds(layout);
  const byZone = new Map<string, RouteSeed[]>();

  for (const seed of seeds) {
    const key = routingZoneKey(seed.source, seed.target, layout.centerX);
    byZone.set(key, [...(byZone.get(key) ?? []), seed]);
  }

  const routed: RoutedSeed[] = [];

  for (const zoneSeeds of byZone.values()) {
    const groups = buildGroups(zoneSeeds);
    const starts = groupLaneStarts(groups, bounds.left, bounds.right);

    groups.forEach((group, groupIndex) => {
      const sameSideLoop = group.routeType === "sameSideLoop";
      const sideSign = group.members[0]!.source.x < layout.centerX ? 1 : -1;
      const base = sameSideLoop
        ? clampToCenter(group.members[0]!.source.x + sideSign * SAME_SIDE_LOOP_INSET, bounds.left, bounds.right)
        : starts[groupIndex]!;

      group.members.forEach((seed, index) => {
        const laneIndex = sameSideLoop ? group.members.length - 1 - index : index;
        const rawMidX = base + (sameSideLoop ? sideSign * laneIndex * ROUTE_LANE_SPACING : laneIndex * ROUTE_LANE_SPACING);
        const midX = clampToCenter(rawMidX, bounds.left, bounds.right);
        const points = buildRoutePoints(seed.source, seed.target, midX);

        routed.push({
          ...seed,
          lane: routed.length,
          midX,
          points,
          segments: pointsToSegments(points),
        });
      });
    });
  }

  return { routes: routed, missingIds };
}

export function applyNestedLiveRoutes(routes: RoutedStrand[], layout: LayoutPlan): RoutedStrand[] {
  const connLike: SpliceConnection[] = routes.flatMap((route) => {
    const anchors = layout.anchorsByConnection[route.connectionId];
    if (!anchors) return [];
    return [{
      id: route.connectionId,
      source: anchors.source,
      target: anchors.target,
      circuitName: route.circuitName,
    }];
  });

  const nested = routeNestedFiberGroups(connLike, layout).routes;
  const byId = new Map(nested.map((route) => [route.conn.id, route]));

  return routes.map((route) => {
    const next = byId.get(route.connectionId);
    if (!next) return route;

    return {
      ...route,
      source: next.source,
      target: next.target,
      midX: next.midX,
      lane: next.lane,
      zoneKey: routingZoneKey(next.source, next.target, layout.centerX),
      points: next.points,
      segments: next.segments,
    };
  });
}
