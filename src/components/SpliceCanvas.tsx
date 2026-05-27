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
import { applyNestedLiveRoutes } from "../engine/groupRouting";
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

function fmt(value: number): string {
  return value.toFixed(1);
}

function orthogonalPath(points: Point[]): string {
  if (points.length === 0) return "";
  return points.map((point, index) => `${index === 0 ? "M" : "L"} ${fmt(point.x)} ${fmt(point.y)}`).join(" ");
}

function fusionPoint(route: RoutedStrand): Point {
  if (route.points.length <= 2) {
    return { x: (route.source.x + route.target.x) / 2, y: (route.source.y + route.target.y) / 2 };
  }
  return { x: route.midX, y: (route.source.y + route.target.y) / 2 };
}

function routeLegs(route: RoutedStrand, dot: Point): RouteLegs {
  if (route.points.length <= 2) {
    return { sourceLeg: [route.source, dot], targetLeg: [dot, route.target] };
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
    style: { width: cable.width, height: cable.height, background: "transparent", border: "none", padding: 0 },
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
      anchors: cable.anchors.map((anchor) => ({ ...anchor, absolute: { x: anchor.absolute.x + dx, y: anchor.absolute.y + dy } })),
    };
  });
  if (!hasMovedNode) return layout;
  const anchorDrafts: Record<string, Partial<Record<"source" | "target", FiberAnchor>>> = {};
  for (const cable of cables) {
    for (const anchor of cable.anchors) {
      anchorDrafts[anchor.connectionId] = { ...anchorDrafts[anchor.connectionId], [anchor.role]: anchor };
    }
  }
  const anchorsByConnection: LayoutPlan["anchorsByConnection"] = {};
  for (const [connectionId, draft] of Object.entries(anchorDrafts)) {
    if (draft.source && draft.target) anchorsByConnection[connectionId] = { source: draft.source, target: draft.target };
  }
  return { ...layout, cables, anchorsByConnection };
}

function SpliceCanvasInner({ layout, routes, overrides, onOverridesChange }: Props) {
  const nodesForLayout = useMemo(() => buildFlowNodes(layout), [layout]);
  const [nodes, setNodes, onNodesChange] = useNodesState<CableFlowNode>(nodesForLayout);
  const liveLayout = useMemo(() => layoutFromLiveNodes(layout, nodes), [layout, nodes]);
  const liveRoutes = useMemo(() => applyNestedLiveRoutes(routes.routes, liveLayout), [routes.routes, liveLayout]);

  useEffect(() => {
    setNodes(nodesForLayout);
  }, [nodesForLayout, setNodes]);

  const updateCablePosition = (cableId: string, position: Point) => {
    const cable = layout.cables.find((item) => item.id === cableId);
    if (!cable) return;
    const side = sideForCanvasX(position.x + cable.width / 2, layout.centerX);
    onOverridesChange({
      ...overrides,
      cableOverrides: { ...overrides.cableOverrides, [cable.id]: { ...overrides.cableOverrides[cable.id], position, side } },
    });
  };

  const toggleProtected = (connectionId: string) => {
    onOverridesChange({
      ...overrides,
      protectedConnectionIds: { ...overrides.protectedConnectionIds, [connectionId]: !overrides.protectedConnectionIds[connectionId] },
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
          {liveLayout.cables.length === 0 ? "No cable nodes parsed" : `${liveLayout.cables.length} cable nodes · ${liveRoutes.length} nested routes · ${routes.diagnostics.length} diagnostics`}
        </Panel>
        <ViewportPortal>
          <svg className="route-overlay" width={liveLayout.width} height={liveLayout.height} viewBox={`0 0 ${liveLayout.width} ${liveLayout.height}`}>
            <line x1={liveLayout.centerX} x2={liveLayout.centerX} y1="28" y2={liveLayout.height - 28} stroke="#cbd5e1" strokeDasharray="9 10" />
            <text x={liveLayout.centerX} y="38" textAnchor="middle" className="center-label">nested center routing V2</text>
            {liveRoutes.map((route) => {
              const hitD = orthogonalPath(route.points);
              const dot = fusionPoint(route);
              const legs = routeLegs(route, dot);
              const sourceD = orthogonalPath(legs.sourceLeg);
              const targetD = orthogonalPath(legs.targetLeg);
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
