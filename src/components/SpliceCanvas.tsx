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
import { sideForCanvasX } from "../engine/layout";
import { routePath } from "../engine/routing";
import type { DiagramOverrides, LayoutPlan, Point, RoutedStrand, RoutePlan } from "../engine/types";
import { CableNode, type CableFlowNode } from "./CableNode";

type Props = {
  layout: LayoutPlan;
  routes: RoutePlan;
  overrides: DiagramOverrides;
  onOverridesChange: (next: DiagramOverrides) => void;
};

const nodeTypes = { cable: CableNode } as NodeTypes;

function fusionPoint(route: RoutedStrand): Point {
  if (route.points.length <= 2) {
    return {
      x: (route.source.x + route.target.x) / 2,
      y: (route.source.y + route.target.y) / 2,
    };
  }
  return {
    x: route.midX,
    y: (route.source.y + route.target.y) / 2,
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

function SpliceCanvasInner({ layout, routes, overrides, onOverridesChange }: Props) {
  const nodesForLayout = useMemo(() => buildFlowNodes(layout), [layout]);
  const [nodes, setNodes, onNodesChange] = useNodesState<CableFlowNode>(nodesForLayout);

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
          {layout.cables.length === 0 ? "No cable nodes parsed" : `${layout.cables.length} cable nodes · ${routes.routes.length} routes · 24px pitch`}
        </Panel>
        <ViewportPortal>
          <svg className="route-overlay" width={layout.width} height={layout.height} viewBox={`0 0 ${layout.width} ${layout.height}`}>
            <line x1={layout.centerX} x2={layout.centerX} y1="28" y2={layout.height - 28} stroke="#cbd5e1" strokeDasharray="9 10" />
            <text x={layout.centerX} y="38" textAnchor="middle" className="center-label">splice routing center</text>
            {routes.routes.map((route) => {
              const d = routePath(route.points);
              const dot = fusionPoint(route);
              return (
                <g key={route.id} className="route-group" onClick={() => toggleProtected(route.connectionId)}>
                  <path d={d} fill="none" stroke="#f8fafc" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
                  <path d={d} fill="none" stroke={route.protected ? "#64748b" : route.color} strokeWidth={route.protected ? 3.8 : 3} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={route.protected ? "8 6" : undefined} />
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
