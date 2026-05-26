import { useMemo } from "react";
import {
  Background,
  Controls,
  ReactFlow,
  ReactFlowProvider,
  ViewportPortal,
  type NodeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { sideForCanvasX } from "../engine/layout";
import { routePath } from "../engine/routing";
import type { DiagramOverrides, LayoutPlan, Point, RoutePlan } from "../engine/types";
import { CableNode, type CableFlowNode } from "./CableNode";

type Props = {
  layout: LayoutPlan;
  routes: RoutePlan;
  overrides: DiagramOverrides;
  onOverridesChange: (next: DiagramOverrides) => void;
};

const nodeTypes = { cable: CableNode } as NodeTypes;

function routeMidpoint(points: Point[]): Point {
  return points[Math.floor(points.length / 2)] ?? { x: 0, y: 0 };
}

function SpliceCanvasInner({ layout, routes, overrides, onOverridesChange }: Props) {
  const nodes = useMemo<CableFlowNode[]>(
    () =>
      layout.cables.map((cable) => ({
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
      })),
    [layout.cables],
  );

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
        onNodeDrag={(_, node) => updateCablePosition(node.id, node.position)}
        onNodeDragStop={(_, node) => updateCablePosition(node.id, node.position)}
        minZoom={0.08}
        maxZoom={2.2}
        fitView
        fitViewOptions={{ padding: 0.18, maxZoom: 1 }}
        proOptions={{ hideAttribution: true }}
        nodesDraggable
        nodesConnectable={false}
        elementsSelectable
      >
        <Background gap={32} color="#cbd5e1" />
        <Controls position="bottom-right" />
        <ViewportPortal>
          <svg className="route-overlay" width={layout.width} height={layout.height} viewBox={`0 0 ${layout.width} ${layout.height}`}>
            <line x1={layout.centerX} x2={layout.centerX} y1="28" y2={layout.height - 28} stroke="#cbd5e1" strokeDasharray="9 10" />
            <text x={layout.centerX} y="38" textAnchor="middle" className="center-label">splice routing center</text>
            {routes.routes.map((route) => {
              const d = routePath(route.points);
              const label = routeMidpoint(route.points);
              return (
                <g key={route.id} className="route-group" onClick={() => toggleProtected(route.connectionId)}>
                  <path d={d} fill="none" stroke="#f8fafc" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
                  <path d={d} fill="none" stroke={route.protected ? "#64748b" : route.color} strokeWidth={route.protected ? 3.8 : 3} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={route.protected ? "8 6" : undefined} />
                  <rect x={label.x - 5} y={label.y - 5} width="10" height="10" rx="2" fill="#fff" stroke={route.color} strokeWidth="2" />
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
