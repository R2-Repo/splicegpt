import { useMemo, useRef, useState, type PointerEvent } from "react";
import { fiberColorHex, fiberTextColor } from "../engine/colors";
import { routePath } from "../engine/routing";
import type { CableLayout, DiagramOverrides, LayoutPlan, Point, RoutePlan, Side } from "../engine/types";
import { sideForCanvasX } from "../engine/layout";

type Props = {
  layout: LayoutPlan;
  routes: RoutePlan;
  overrides: DiagramOverrides;
  onOverridesChange: (next: DiagramOverrides) => void;
};

type DragState = {
  cableId: string;
  offset: Point;
};

function midpoint(points: Point[]): Point {
  if (points.length === 0) return { x: 0, y: 0 };
  const middle = points[Math.floor(points.length / 2)]!;
  return middle;
}

function sideLabel(side: Side): string {
  return side === "left" ? "Left" : "Right";
}

export function SpliceCanvas({ layout, routes, overrides, onOverridesChange }: Props) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [selectedCableId, setSelectedCableId] = useState<string | null>(null);
  const selectedCable = useMemo(
    () => layout.cables.find((cable) => cable.id === selectedCableId) ?? null,
    [layout.cables, selectedCableId],
  );

  const svgPoint = (event: PointerEvent<SVGSVGElement | SVGGElement>): Point => {
    const svg = svgRef.current;
    if (!svg) return { x: event.clientX, y: event.clientY };
    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const matrix = svg.getScreenCTM();
    if (!matrix) return { x: event.clientX, y: event.clientY };
    const transformed = point.matrixTransform(matrix.inverse());
    return { x: transformed.x, y: transformed.y };
  };

  const updateCablePosition = (cable: CableLayout, nextPosition: Point) => {
    const nextSide = sideForCanvasX(nextPosition.x + cable.width / 2, layout.centerX);
    onOverridesChange({
      ...overrides,
      cableOverrides: {
        ...overrides.cableOverrides,
        [cable.id]: {
          ...overrides.cableOverrides[cable.id],
          position: nextPosition,
          side: nextSide,
        },
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

  const snapSelectedToSide = (side: Side) => {
    if (!selectedCable) return;
    const x = side === "left" ? 80 : layout.width - 80 - selectedCable.width;
    onOverridesChange({
      ...overrides,
      cableOverrides: {
        ...overrides.cableOverrides,
        [selectedCable.id]: {
          ...overrides.cableOverrides[selectedCable.id],
          side,
          position: { x, y: selectedCable.y },
        },
      },
    });
  };

  return (
    <div className="canvas-shell">
      <div className="canvas-toolbar">
        <div>
          <strong>{layout.cables.length}</strong> cables, <strong>{routes.routes.length}</strong> routed strands
        </div>
        {selectedCable ? (
          <div className="canvas-toolbar__selection">
            <span>Selected: {selectedCable.name}</span>
            <button type="button" onClick={() => snapSelectedToSide("left")}>Snap left</button>
            <button type="button" onClick={() => snapSelectedToSide("right")}>Snap right</button>
          </div>
        ) : (
          <span className="muted">Drag cable cards. Every drag reroutes the full diagram.</span>
        )}
      </div>

      <div className="canvas-scroll">
        <svg
          ref={svgRef}
          className="splice-svg"
          viewBox={`0 0 ${layout.width} ${layout.height}`}
          width={layout.width}
          height={layout.height}
          onPointerMove={(event: PointerEvent<SVGSVGElement>) => {
            if (!drag) return;
            const cable = layout.cables.find((c) => c.id === drag.cableId);
            if (!cable) return;
            const point = svgPoint(event);
            updateCablePosition(cable, {
              x: Math.max(12, Math.min(layout.width - cable.width - 12, point.x - drag.offset.x)),
              y: Math.max(24, point.y - drag.offset.y),
            });
          }}
          onPointerUp={() => setDrag(null)}
          onPointerLeave={() => setDrag(null)}
        >
          <defs>
            <pattern id="grid" width="24" height="24" patternUnits="userSpaceOnUse">
              <path d="M 24 0 L 0 0 0 24" fill="none" stroke="#e5e7eb" strokeWidth="1" />
            </pattern>
            <filter id="cardShadow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="3" stdDeviation="5" floodColor="#0f172a" floodOpacity="0.14" />
            </filter>
          </defs>

          <rect x="0" y="0" width={layout.width} height={layout.height} fill="#f8fafc" />
          <rect x="0" y="0" width={layout.width} height={layout.height} fill="url(#grid)" opacity="0.65" />
          <line x1={layout.centerX} x2={layout.centerX} y1="24" y2={layout.height - 24} stroke="#cbd5e1" strokeDasharray="8 8" />
          <text x={layout.centerX} y="42" textAnchor="middle" className="svg-muted">routing center</text>

          <g className="routes-layer">
            {routes.routes.map((route) => {
              const d = routePath(route.points);
              const label = midpoint(route.points);
              return (
                <g key={route.id} className="route-group" onClick={() => toggleProtected(route.connectionId)}>
                  <path d={d} fill="none" stroke="#f8fafc" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
                  <path
                    d={d}
                    fill="none"
                    stroke={route.protected ? "#64748b" : route.color}
                    strokeWidth={route.protected ? 3.5 : 3}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeDasharray={route.protected ? "8 6" : undefined}
                  />
                  <rect x={label.x - 5} y={label.y - 5} width="10" height="10" rx="2" fill="#fff" stroke={route.color} strokeWidth="2" />
                  <title>{`${route.connectionId}${route.circuitName ? ` - ${route.circuitName}` : ""}. Click to toggle protected/existing.`}</title>
                </g>
              );
            })}
          </g>

          <g className="cables-layer">
            {layout.cables.map((cable) => {
              const selected = selectedCableId === cable.id;
              return (
                <g
                  key={cable.id}
                  transform={`translate(${cable.x}, ${cable.y})`}
                  className={selected ? "cable-card cable-card--selected" : "cable-card"}
                  onPointerDown={(event: PointerEvent<SVGGElement>) => {
                    event.stopPropagation();
                    const point = svgPoint(event);
                    setSelectedCableId(cable.id);
                    setDrag({ cableId: cable.id, offset: { x: point.x - cable.x, y: point.y - cable.y } });
                  }}
                >
                  <rect width={cable.width} height={cable.height} rx="14" fill="#ffffff" stroke={selected ? "#2563eb" : "#cbd5e1"} strokeWidth={selected ? 3 : 1.5} filter="url(#cardShadow)" />
                  <rect width={cable.width} height="44" rx="14" fill="#0f172a" />
                  <rect y="28" width={cable.width} height="16" fill="#0f172a" />
                  <text x="14" y="27" className="cable-title">{cable.name}</text>
                  <text x={cable.width - 12} y="27" textAnchor="end" className="cable-side">{sideLabel(cable.side)}</text>

                  {cable.anchors.map((anchor) => {
                    const swatch = fiberColorHex[anchor.fiberColor];
                    const text = fiberTextColor[anchor.fiberColor];
                    const handleX = cable.side === "left" ? cable.width : 0;
                    const labelX = 52;
                    const tubeX = 84;
                    const numberX = 136;
                    return (
                      <g key={`${anchor.connectionId}-${anchor.role}`}>
                        <line x1="12" x2={cable.width - 12} y1={anchor.localY} y2={anchor.localY} stroke="#e2e8f0" />
                        <circle cx={handleX} cy={anchor.localY} r="5" fill={swatch} stroke="#0f172a" strokeWidth="1.3" />
                        <rect x={cable.side === "left" ? 16 : 16} y={anchor.localY - 9} width="26" height="18" rx="5" fill={swatch} stroke="#0f172a" strokeWidth="0.5" />
                        <text x={29} y={anchor.localY + 4} textAnchor="middle" fill={text} className="fiber-chip-text">{anchor.fiberColor}</text>
                        <text x={labelX} y={anchor.localY + 4} className="fiber-row-label">{anchor.role === "source" ? "OUT" : "IN"}</text>
                        <text x={tubeX} y={anchor.localY + 4} className="fiber-row-meta">Tube {anchor.tubeColor}</text>
                        <text x={numberX} y={anchor.localY + 4} className="fiber-row-meta">#{anchor.fiberNumber}</text>
                        {anchor.circuitName ? (
                          <text x={cable.width - 14} y={anchor.localY + 4} textAnchor="end" className="fiber-circuit">{anchor.circuitName}</text>
                        ) : null}
                      </g>
                    );
                  })}
                </g>
              );
            })}
          </g>
        </svg>
      </div>
    </div>
  );
}
