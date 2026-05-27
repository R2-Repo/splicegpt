import { fiberColorHex } from "./colors";
import { routeNestedFiberGroups, routingZoneKey, ROUTE_LANE_SPACING } from "./groupRouting";
import type { DiagramOverrides, LayoutPlan, RoutePlan, RoutedStrand, RoutingDiagnostic, Segment, SpliceModel } from "./types";

function verticalRangesOverlap(a: Segment, b: Segment): boolean {
  const a0 = Math.min(a.from.y, a.to.y);
  const a1 = Math.max(a.from.y, a.to.y);
  const b0 = Math.min(b.from.y, b.to.y);
  const b1 = Math.max(b.from.y, b.to.y);
  return Math.max(a0, b0) <= Math.min(a1, b1) - 1;
}

function horizontalRangesOverlap(a: Segment, b: Segment): boolean {
  const a0 = Math.min(a.from.x, a.to.x);
  const a1 = Math.max(a.from.x, a.to.x);
  const b0 = Math.min(b.from.x, b.to.x);
  const b1 = Math.max(b.from.x, b.to.x);
  return Math.max(a0, b0) <= Math.min(a1, b1) - 1;
}

function bendCount(route: RoutedStrand): number {
  if (route.points.length < 3) return 0;
  let bends = 0;
  for (let index = 2; index < route.points.length; index += 1) {
    const a = route.points[index - 2]!;
    const b = route.points[index - 1]!;
    const c = route.points[index]!;
    const firstHorizontal = Math.abs(a.y - b.y) < 0.5;
    const secondHorizontal = Math.abs(b.y - c.y) < 0.5;
    if (firstHorizontal !== secondHorizontal) bends += 1;
  }
  return bends;
}

function validateRoutes(routes: RoutedStrand[]): RoutingDiagnostic[] {
  const diagnostics: RoutingDiagnostic[] = [];
  for (const route of routes) {
    if (bendCount(route) > 2) {
      diagnostics.push({ level: "error", code: "ROUTE_TOO_MANY_BENDS", message: `Route ${route.connectionId} has more than two 90-degree bends.`, connectionIds: [route.connectionId] });
    }
  }
  for (let i = 0; i < routes.length; i += 1) {
    for (let j = i + 1; j < routes.length; j += 1) {
      const a = routes[i]!;
      const b = routes[j]!;
      if (a.zoneKey !== b.zoneKey) continue;
      for (const segA of a.segments) {
        for (const segB of b.segments) {
          if (segA.kind !== segB.kind) continue;
          if (segA.kind === "v") {
            const sameTrack = Math.abs(segA.from.x - segB.from.x) < ROUTE_LANE_SPACING - 0.5;
            if (sameTrack && verticalRangesOverlap(segA, segB)) {
              diagnostics.push({ level: "warning", code: "ROUTE_VERTICAL_STACK", message: `Routes ${a.connectionId} and ${b.connectionId} are stacked on the same vertical lane.`, connectionIds: [a.connectionId, b.connectionId] });
            }
          } else {
            const sameTrack = Math.abs(segA.from.y - segB.from.y) < ROUTE_LANE_SPACING - 0.5;
            if (sameTrack && horizontalRangesOverlap(segA, segB)) {
              diagnostics.push({ level: "warning", code: "ROUTE_HORIZONTAL_STACK", message: `Routes ${a.connectionId} and ${b.connectionId} are stacked on the same horizontal track.`, connectionIds: [a.connectionId, b.connectionId] });
            }
          }
        }
      }
    }
  }
  return diagnostics;
}

export function routeSpliceStrands(model: SpliceModel, layout: LayoutPlan, overrides: DiagramOverrides): RoutePlan {
  const diagnostics: RoutingDiagnostic[] = [];
  const nested = routeNestedFiberGroups(model.connections, layout);
  for (const connectionId of nested.missingIds) {
    diagnostics.push({ level: "error", code: "MISSING_ANCHOR", message: `Missing source or target anchor for ${connectionId}.`, connectionIds: [connectionId] });
  }
  const routes: RoutedStrand[] = nested.routes.map((route) => ({
    id: `route-${route.conn.id}`,
    connectionId: route.conn.id,
    source: route.source,
    target: route.target,
    midX: route.midX,
    points: route.points,
    segments: route.segments,
    lane: route.lane,
    zoneKey: routingZoneKey(route.source, route.target, layout.centerX),
    color: fiberColorHex[route.conn.source.fiberColor],
    protected: Boolean(overrides.protectedConnectionIds[route.conn.id]),
    circuitName: route.conn.circuitName,
  }));
  diagnostics.push(...validateRoutes(routes));
  return { routes, diagnostics };
}

export function routePath(points: { x: number; y: number }[]): string {
  return points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" ");
}
