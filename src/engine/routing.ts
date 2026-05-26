import { fiberColorHex } from "./colors";
import type { DiagramOverrides, LayoutPlan, Point, RoutePlan, RoutedStrand, RoutingDiagnostic, Segment, SpliceConnection, SpliceModel } from "./types";

const LANE_SPACING = 18;
const SAME_SIDE_INSET = 150;
const MIN_HANDLE_CLEARANCE = 52;

function zoneKey(source: Point, target: Point, centerX: number): string {
  const sourceSide = source.x < centerX ? "L" : "R";
  const targetSide = target.x < centerX ? "L" : "R";
  return `${sourceSide}-${targetSide}:${Math.round(source.x)}:${Math.round(target.x)}`;
}

function compareConnection(a: SpliceConnection, b: SpliceConnection): number {
  return a.source.cableName.localeCompare(b.source.cableName) || String(a.source.tubeColor).localeCompare(String(b.source.tubeColor)) || a.source.fiberNumber - b.source.fiberNumber || a.target.cableName.localeCompare(b.target.cableName) || String(a.target.tubeColor).localeCompare(String(b.target.tubeColor)) || a.target.fiberNumber - b.target.fiberNumber || a.id.localeCompare(b.id);
}

function pointsToSegments(points: Point[]): Segment[] {
  const segments: Segment[] = [];
  for (let i = 1; i < points.length; i += 1) {
    const from = points[i - 1]!;
    const to = points[i]!;
    if (Math.abs(from.x - to.x) < 0.01 && Math.abs(from.y - to.y) < 0.01) continue;
    segments.push({ kind: Math.abs(from.y - to.y) < 0.01 ? "h" : "v", from, to });
  }
  return segments;
}

function midpointLaneX(args: { source: Point; target: Point; lane: number; laneCount: number; centerX: number }): number {
  const { source, target, lane, laneCount, centerX } = args;
  const sameSide = source.x < centerX === target.x < centerX;
  if (sameSide) {
    const sideSign = source.x < centerX ? 1 : -1;
    return source.x + sideSign * (SAME_SIDE_INSET + lane * LANE_SPACING);
  }
  const middle = (source.x + target.x) / 2;
  return middle + (lane - (laneCount - 1) / 2) * LANE_SPACING;
}

function buildOrthogonalPoints(source: Point, target: Point, midX: number): Point[] {
  if (Math.abs(source.y - target.y) < 0.5) return [source, target];
  return [source, { x: midX, y: source.y }, { x: midX, y: target.y }, target];
}

function verticalRangesOverlap(a: Segment, b: Segment): boolean {
  const a0 = Math.min(a.from.y, a.to.y);
  const a1 = Math.max(a.from.y, a.to.y);
  const b0 = Math.min(b.from.y, b.to.y);
  const b1 = Math.max(b.from.y, b.to.y);
  return Math.max(a0, b0) <= Math.min(a1, b1) - 1;
}

function validateRoutes(routes: RoutedStrand[]): RoutingDiagnostic[] {
  const diagnostics: RoutingDiagnostic[] = [];
  for (let i = 0; i < routes.length; i += 1) {
    for (let j = i + 1; j < routes.length; j += 1) {
      const a = routes[i]!;
      const b = routes[j]!;
      if (a.zoneKey !== b.zoneKey) continue;
      const verticalA = a.segments.find((segment) => segment.kind === "v");
      const verticalB = b.segments.find((segment) => segment.kind === "v");
      if (!verticalA || !verticalB) continue;
      const sameTrack = Math.abs(verticalA.from.x - verticalB.from.x) < LANE_SPACING - 0.5;
      if (sameTrack && verticalRangesOverlap(verticalA, verticalB)) diagnostics.push({ level: "warning", code: "ROUTE_VERTICAL_STACK", message: `Routes ${a.connectionId} and ${b.connectionId} use nearly the same vertical lane.`, connectionIds: [a.connectionId, b.connectionId] });
    }
  }
  return diagnostics;
}

export function routeSpliceStrands(model: SpliceModel, layout: LayoutPlan, overrides: DiagramOverrides): RoutePlan {
  const diagnostics: RoutingDiagnostic[] = [];
  const groups = new Map<string, SpliceConnection[]>();
  for (const conn of model.connections) {
    const anchors = layout.anchorsByConnection[conn.id];
    if (!anchors) {
      diagnostics.push({ level: "error", code: "MISSING_ANCHOR", message: `Missing source or target anchor for ${conn.id}.`, connectionIds: [conn.id] });
      continue;
    }
    const key = zoneKey(anchors.source.absolute, anchors.target.absolute, layout.centerX);
    groups.set(key, [...(groups.get(key) ?? []), conn]);
  }
  const routes: RoutedStrand[] = [];
  for (const [key, connections] of groups) {
    const ordered = [...connections].sort(compareConnection);
    for (const [lane, conn] of ordered.entries()) {
      const anchors = layout.anchorsByConnection[conn.id];
      if (!anchors) continue;
      const source = anchors.source.absolute;
      const target = anchors.target.absolute;
      let midX = midpointLaneX({ source, target, lane, laneCount: ordered.length, centerX: layout.centerX });
      if (Math.abs(midX - source.x) < MIN_HANDLE_CLEARANCE || Math.abs(midX - target.x) < MIN_HANDLE_CLEARANCE) {
        const sourceSideSign = source.x < layout.centerX ? 1 : -1;
        midX = source.x + sourceSideSign * (MIN_HANDLE_CLEARANCE + lane * LANE_SPACING);
      }
      const points = buildOrthogonalPoints(source, target, midX);
      routes.push({ id: `route-${conn.id}`, connectionId: conn.id, source, target, midX, points, segments: pointsToSegments(points), lane, zoneKey: key, color: fiberColorHex[conn.source.fiberColor], protected: Boolean(overrides.protectedConnectionIds[conn.id]), circuitName: conn.circuitName });
    }
  }
  diagnostics.push(...validateRoutes(routes));
  return { routes, diagnostics };
}

export function routePath(points: Point[]): string {
  return points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" ");
}
