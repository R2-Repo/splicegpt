import { colorSortIndex } from "./colors";
import type {
  FiberAnchor,
  LayoutPlan,
  Point,
  RoutedStrand,
  Segment,
  SpliceConnection,
} from "./types";

export const ROUTE_LANE_SPACING = 24;
export const ROUTE_GROUP_GAP = 48;
export const CENTER_ROUTE_MARGIN = 32;
export const SAME_SIDE_LOOP_INSET = 120;
export const ROUTE_Y_EPS = 0.5;

type RouteType = "crossSide" | "sameSideLoop";

type RouteSeed = {
  conn: SpliceConnection;
  source: Point;
  target: Point;
  routeType: RouteType;
  groupKey: string;
};

type RoutedSeed = RouteSeed & {
  lane: number;
  midX: number;
  points: Point[];
  segments: Segment[];
};

export function routingZoneKey(source: Point, target: Point, centerX: number): string {
  const sourceSide = source.x < centerX ? "L" : "R";
  const targetSide = target.x < centerX ? "L" : "R";
  return `${sourceSide}-${targetSide}:${Math.round(source.x)}:${Math.round(target.x)}`;
}

function fiberGroupKey(conn: SpliceConnection): string {
  return [
    conn.source.cableId,
    String(conn.source.tubeColor),
    conn.target.cableId,
    String(conn.target.tubeColor),
    conn.circuitName ?? "",
  ].join("|");
}

function compareByNestedFiberOrder(a: RouteSeed, b: RouteSeed): number {
  return (
    String(a.conn.source.tubeColor).localeCompare(String(b.conn.source.tubeColor)) ||
    colorSortIndex(a.conn.source.fiberColor) - colorSortIndex(b.conn.source.fiberColor) ||
    a.conn.source.fiberNumber - b.conn.source.fiberNumber ||
    String(a.conn.target.tubeColor).localeCompare(String(b.conn.target.tubeColor)) ||
    colorSortIndex(a.conn.target.fiberColor) - colorSortIndex(b.conn.target.fiberColor) ||
    a.conn.target.fiberNumber - b.conn.target.fiberNumber ||
    a.conn.id.localeCompare(b.conn.id)
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

function routeTypeFor(source: Point, target: Point, centerX: number): RouteType {
  return source.x < centerX === target.x < centerX ? "sameSideLoop" : "crossSide";
}

function centerBounds(layout: LayoutPlan): { left: number; right: number } {
  const leftCableRight = Math.max(
    0,
    ...layout.cables.filter((cable) => cable.side === "left").map((cable) => cable.x + cable.width),
  );
  const rightCableLeft = Math.min(
    layout.width,
    ...layout.cables.filter((cable) => cable.side === "right").map((cable) => cable.x),
  );
  const left = Math.min(layout.centerX - ROUTE_LANE_SPACING, leftCableRight + CENTER_ROUTE_MARGIN);
  const right = Math.max(layout.centerX + ROUTE_LANE_SPACING, rightCableLeft - CENTER_ROUTE_MARGIN);
  return { left, right };
}

function laneStartForGroups(groupSizes: number[], left: number, right: number): number[] {
  const groupWidths = groupSizes.map((size) => Math.max(0, size - 1) * ROUTE_LANE_SPACING);
  const totalWidth =
    groupWidths.reduce((sum, width) => sum + width, 0) +
    Math.max(0, groupSizes.length - 1) * ROUTE_GROUP_GAP;
  const available = Math.max(0, right - left);
  let cursor = left + Math.max(0, (available - totalWidth) / 2);
  return groupWidths.map((width, index) => {
    const start = cursor;
    cursor += width + (index < groupWidths.length - 1 ? ROUTE_GROUP_GAP : 0);
    return start;
  });
}

function routeSeeds(
  modelConnections: SpliceConnection[],
  layout: LayoutPlan,
): { seeds: RouteSeed[]; missingIds: string[] } {
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
      source,
      target,
      routeType: routeTypeFor(source, target, layout.centerX),
      groupKey: fiberGroupKey(conn),
    });
  }

  return { seeds, missingIds };
}

export function routeNestedFiberGroups(
  modelConnections: SpliceConnection[],
  layout: LayoutPlan,
): { routes: RoutedSeed[]; missingIds: string[] } {
  const { seeds, missingIds } = routeSeeds(modelConnections, layout);
  const bounds = centerBounds(layout);
  const byZone = new Map<string, RouteSeed[]>();

  for (const seed of seeds) {
    const key = routingZoneKey(seed.source, seed.target, layout.centerX);
    byZone.set(key, [...(byZone.get(key) ?? []), seed]);
  }

  const routed: RoutedSeed[] = [];

  for (const zoneSeeds of byZone.values()) {
    const byGroup = new Map<string, RouteSeed[]>();
    for (const seed of zoneSeeds) {
      byGroup.set(seed.groupKey, [...(byGroup.get(seed.groupKey) ?? []), seed]);
    }

    const groups = [...byGroup.values()]
      .map((group) => [...group].sort(compareByNestedFiberOrder))
      .sort((a, b) => compareByNestedFiberOrder(a[0]!, b[0]!));
    const starts = laneStartForGroups(
      groups.map((group) => group.length),
      bounds.left,
      bounds.right,
    );

    groups.forEach((group, groupIndex) => {
      const sameSideLoop = group[0]!.routeType === "sameSideLoop";
      const sideSign = group[0]!.source.x < layout.centerX ? 1 : -1;
      const base = sameSideLoop
        ? group[0]!.source.x + sideSign * SAME_SIDE_LOOP_INSET
        : starts[groupIndex]!;

      group.forEach((seed, index) => {
        const laneIndex = sameSideLoop ? group.length - 1 - index : index;
        const rawMidX = base + (sameSideLoop ? sideSign : 1) * laneIndex * ROUTE_LANE_SPACING;
        const midX = Math.max(bounds.left, Math.min(bounds.right, rawMidX));
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

function connectionFromRoute(route: RoutedStrand, anchors: { source: FiberAnchor; target: FiberAnchor }): SpliceConnection {
  return {
    id: route.connectionId,
    source: anchors.source,
    target: anchors.target,
    circuitName: route.circuitName,
  };
}

export function applyNestedLiveRoutes(routes: RoutedStrand[], layout: LayoutPlan): RoutedStrand[] {
  const connLike: SpliceConnection[] = routes.flatMap((route) => {
    const anchors = layout.anchorsByConnection[route.connectionId];
    if (!anchors) return [];
    return [connectionFromRoute(route, anchors)];
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
