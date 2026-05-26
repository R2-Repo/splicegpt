import { useEffect, useMemo } from "react";
import {
  Background,
  Controls,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  ViewportPortal,
  useNodesState,
  type NodeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { fiberColorHex } from "../engine/colors";
import { sideForCanvasX } from "../engine/layout";
import type { DiagramOverrides, FiberAnchor, LayoutPlan, Point, RoutedStrand, RoutePlan } from "../engine/types";
import { CableNode, type CableFlowNode } from "./CableNode";

type Props = {
  layout: LayoutPlan;
  routes: RoutePlan;
  overrides: DiagramOverrides;
  onOverridesChange: (next: DiagramOverrides) => void;
};

type RouteLegs = {
  sourceLeg: Point[];
  targetLeg: Point[];
};

const nodeTypes = { cable: CableNode } as NodeTypes;
const LANE_SPACING = 24;
const SAME_SIDE_INSET = 150;
const MIN_HANDLE_CLEARANCE = 60;
const CORNER_RADIUS = 4;

function fmt(value: number): string {
  return value.toFixed(1);
}

function pointBetween(from: Point, to: Point, distance: number): Point {
  const length = Math.hypot(to.x - from.x, to.y - from.y);
  if (length < 0.01) return from;
  const ratio = distance / length;
  return { x: from.x + (to.x - from.x) * ratio, y: from.y + (to.y - from.y) * ratio };
}

function smoothRoutePath(points: Point[]): string {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${fmt(points[0]!.x)} ${fmt(points[0]!.y)}`;
  if (points.length === 2) {
    const [source, target] = points;
    const direction = target.x >= source.x ? 1 : -1;
    const handle = Math.min(240, Math.max(64, Math.abs(target.x - source.x) * 0.5));
    return `M ${fmt(source.x)} ${fmt(source.y)} C ${fmt(source.x + handle * direction)} ${fmt(source.y)}, ${fmt(target.x - handle * direction)} ${fmt(target.y)}, ${fmt(target.x)} ${fmt(target.y)}`;
  }

  const parts = [`M ${fmt(points[0]!.x)} ${fmt(points[0]!.y)}`];
  for (let index = 1; index < points.length - 1; index += 1) {
    const previous = points[index - 1]!;
    const current = points[index]!;
    const next = points[index + 1]!;
    const previousLength = Math.hypot(current.x - previous.x, current.y - previous.y);
    const nextLength = Math.hypot(next.x - current.x, next.y - current.y);
    const radius = Math.min(CORNER_RADIUS, previousLength / 2, nextLength / 2);

    if (radius < 1) {
      parts.push(`L ${fmt(current.x)} ${fmt(current.y)}`);
      continue;
    }

    const before = pointBetween(current, previous, radius);
    const after = pointBetween(current, next, radius);
    parts.push(`L ${fmt(before.x)} ${fmt(before.y)}`);
    parts.push(`Q ${fmt(current.x)} ${fmt(current.y)} ${fmt(after.x)} ${fmt(after.y)}`);
  }

  const last = points[points.length - 1]!;
  parts.push(`L ${fmt(last.x)} ${fmt(last.y)}`);
  return parts.join(" ");
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

function liveRoutePoints(source: Point, target: Point, midX: number): Point[] {
  if (Math.abs(source.y - target.y) < 0.5) return [source, target];
  return [source, { x: midX, y: source.y }, { x: midX, y: target.y }, target];
}

function fusionPoint(route: RoutedStrand): Point {
  if (route.points.length <= 2) {
    return { x: (route.source.x + route.target.x) / 2, y: (route.source.y + route.target.y) / 2 };
  }
  return { x: route.midX, y: (route.source.y + route.target.y) / 2 };
}

function routeLegs(route: RoutedStrand, dot: Point): RouteLegs {
  if (route.points.length <= 2) {
    return {
      sourceLeg: [route.source, dot],
      targetLeg: [dot, route.target],
    };
  }

  return {
    sourceLeg: [route.source, { x: route.midX, y: route.source.y }, dot],
    targetLeg: [dot, { x: route.midX, y: route.target.y }, route.target],
  };
}

function buildFlowNodes(layout: LayoutPlan): CableFlowNode[] {
  return layout.cables.map((cable) => ({
    id: cable.id,
    type: "cable",
    position: { x: cable.x, y: cable.y },
    data: { cable },
    draggable: true,
    selectable: true,
    style: {
      width: cable.width,
      height: cable.height,
      background: "transparent",
      border: "none",
      padding: 0,
    },
  }));
}

function layoutFromLiveNodes(layout: LayoutPlan, nodes: CableFlowNode[]): LayoutPlan {
  const positions = new Map(nodes.map((node) => [node.id, node.position]));
  let hasMovedNode = false;

  const cables = layout.cables.map((cable) => {
    const position = positions.get(cable.id);
    if (!position) return cable;

    const dx = position.x - cable.x;
    const dy = position.y - cable.y;
    if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) return cable;

    hasMovedNode = true;
    return {
      ...cable,
      x: position.x,
      y: position.y,
      anchors: cable.anchors.map((anchor) => ({
        ...anchor,
        absolute: { x: anchor.absolute.x + dx, y: anchor.absolute.y + dy },
      })),
    };
  });

  if (!hasMovedNode) return layout;

  const anchorDrafts: Record<string, Partial<Record<"source" | "target", FiberAnchor>>> = {};
  for (const cable of cables) {
    for (const anchor of cable.anchors) {
      anchorDrafts[anchor.connectionId] = {
        ...anchorDrafts[anchor.connectionId],
        [anchor.role]: anchor,
      };
    }
  }

  const anchorsByConnection: LayoutPlan["anchorsByConnection"] = {};
  for (const [connectionId, draft] of Object.entries(anchorDrafts)) {
    if (draft.source && draft.target) anchorsByConnection[connectionId] = { source: draft.source, target: draft.target };
  }

  return { ...layout, cables, anchorsByConnection };
}

function zoneKey(source: Point, target: Point, centerX: number): string {
  return `${source.x < centerX ? "L" : "R"}-${target.x < centerX ? "L" : "R"}`;
}

function rerouteLive(routes: RoutedStrand[], layout: LayoutPlan): RoutedStrand[] {
  const grouped = new Map<string, RoutedStrand[]>();
  const projected = routes.flatMap((route) => {
    const anchors = layout.anchorsByConnection[route.connectionId];
    if (!anchors) return [];
    return [{ ...route, source: anchors.source.absolute, target: anchors.target.absolute }];
  });

  for (const route of projected) {
    const key = zoneKey(route.source, route.target, layout.centerX);
    grouped.set(key, [...(grouped.get(key) ?? []), route]);
  }

  const updated = new Map<string, RoutedStrand>();
  for (const [key, group] of grouped) {
    const ordered = [...group].sort((a, b) => a.lane - b.lane || a.connectionId.localeCompare(b.connectionId));
    for (const [lane, route] of ordered.entries()) {
      let midX = midpointLaneX({ source: route.source, target: route.target, lane, laneCount: ordered.length, centerX: layout.centerX });
      if (Math.abs(midX - route.source.x) < MIN_HANDLE_CLEARANCE || Math.abs(midX - route.target.x) < MIN_HANDLE_CLEARANCE) {
        const sourceSideSign = route.source.x < layout.centerX ? 1 : -1;
        midX = route.source.x + sourceSideSign * (MIN_HANDLE_CLEARANCE + lane * LANE_SPACING);
      }
      updated.set(route.id, {
        ...route,
        midX,
        lane,
        zoneKey: key,
        points: liveRoutePoints(route.source, route.target, midX),
      });
    }
  }

  return routes.map((route) => updated.get(route.id) ?? route);
}

function SpliceCanvasInner({ layout, routes, overrides, onOverridesChange }: Props) {
  const nodesForLayout = useMemo(() => buildFlowNodes(layout), [layout]);
  const [nodes, setNodes, onNodesChange] = useNodesState<CableFlowNode>(nodesForLayout);
  const liveLayout = useMemo(() => layoutFromLiveNodes(layout, nodes), [layout, nodes]);
  const liveRoutes = useMemo(() => rerouteLive(routes.routes, liveLayout), [routes.routes, liveLayout]);

  useEffect(() => {
    setNodes(nodesForLayout);
  }, [nodesForLayout, setNodes]);

  const updateCablePosition = (cableId: string, position: Point) => {
    const cable = layout.cables.find((item) => item.id === cableId);
    if (!cable) return;
    const side = sideForCanvasX(position.x + cable.width / 2, layout.centerX);
    onOverridesChange({
      ...overrides,
      cableOverrides: {
        ...overrides.cableOverrides,
        [cable.id]: { ...overrides.cableOverrides[cable.id], position, side },
      },
    });
  };

  const toggleProtected = (connectionId: string) => {
    onOverridesChange({
      ...overrides,
      protectedConnectionIds: {
        ...overrides.protectedConnectionIds,
        [connectionId]: !overrides.protectedConnectionIds[connectionId],
      },
    });
  };

  return (
    <div className="canvas-shell">
      <ReactFlow
        nodes={nodes}
        edges={[]}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onNodeDragStop={(_, node) => updateCablePosition(node.id, node.position)}
        defaultViewport={{ x: 0, y: 0, zoom: 0.82 }}
        minZoom={0.08}
        maxZoom={2.2}
        proOptions={{ hideAttribution: true }}
        nodesDraggable
        nodesConnectable={false}
        elementsSelectable
      >
        <Background gap={24} color="#dbe3ee" />
        <Controls position="bottom-right" />
        <Panel position="top-left" className="canvas-debug-panel">
          {liveLayout.cables.length === 0 ? "No cable nodes parsed" : `${liveLayout.cables.length} cable nodes · ${liveRoutes.length} live routes · 24px pitch`}
        </Panel>
        <ViewportPortal>
          <svg className="route-overlay" width={liveLayout.width} height={liveLayout.height} viewBox={`0 0 ${liveLayout.width} ${liveLayout.height}`}>
            <line x1={liveLayout.centerX} x2={liveLayout.centerX} y1="28" y2={liveLayout.height - 28} stroke="#cbd5e1" strokeDasharray="9 10" />
            <text x={liveLayout.centerX} y="38" textAnchor="middle" className="center-label">splice routing center</text>
            {liveRoutes.map((route) => {
              const hitD = smoothRoutePath(route.points);
              const dot = fusionPoint(route);
              const legs = routeLegs(route, dot);
              const sourceD = smoothRoutePath(legs.sourceLeg);
              const targetD = smoothRoutePath(legs.targetLeg);
              const anchors = liveLayout.anchorsByConnection[route.connectionId];
              const sourceColor = anchors ? fiberColorHex[anchors.source.fiberColor] : route.color;
              const targetColor = anchors ? fiberColorHex[anchors.target.fiberColor] : route.color;
              const sourceStroke = route.protected ? "#64748b" : sourceColor;
              const targetStroke = route.protected ? "#64748b" : targetColor;
              const strokeWidth = route.protected ? 3.8 : 3;
              const dash = route.protected ? "8 6" : undefined;

              return (
                <g key={route.id} className="route-group" onClick={() => toggleProtected(route.connectionId)}>
                  <path d={hitD} fill="none" stroke="#f8fafc" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
                  <path d={sourceD} fill="none" stroke={sourceStroke} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={dash} />
                  <path d={targetD} fill="none" stroke={targetStroke} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={dash} />
                  <circle cx={dot.x} cy={dot.y} r="4.5" fill="#111827" stroke="#ffffff" strokeWidth="1.5" />
                  <title>{`${route.connectionId}${route.circuitName ? ` - ${route.circuitName}` : ""}. Click to toggle protect/existing.`}</title>
                </g>
              );
            })}
          </svg>
        </ViewportPortal>
      </ReactFlow>
    </div>
  );
}

export function SpliceCanvas(props: Props) {
  return (
    <ReactFlowProvider>
      <SpliceCanvasInner {...props} />
    </ReactFlowProvider>
  );
}
