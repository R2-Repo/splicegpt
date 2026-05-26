import { useMemo, useRef, useState, type PointerEvent } from "react";
import { fiberColorHex, fiberTextColor } from "../engine/colors";
import { sideForCanvasX } from "../engine/layout";
import { routePath } from "../engine/routing";
import type { CableLayout, DiagramOverrides, FiberAnchor, LayoutPlan, Point, RoutePlan, Side } from "../engine/types";

type Props = {
  layout: LayoutPlan;
  routes: RoutePlan;
  overrides: DiagramOverrides;
  onOverridesChange: (next: DiagramOverrides) => void;
};

type DragState = { cableId: string; offset: Point };
type TubeGroup = { tubeColor: string; anchors: FiberAnchor[]; centerY: number };

function sideLabel(side: Side): string {
  return side === "left" ? "LEFT" : "RIGHT";
}

function routeMidpoint(points: Point[]): Point {
  return points[Math.floor(points.length / 2)] ?? { x: 0, y: 0 };
}

function tubeGroups(cable: CableLayout): TubeGroup[] {
  const map = new Map<string, FiberAnchor[]>();
  for (const anchor of cable.anchors) {
    const key = String(anchor.tubeColor);
    const list = map.get(key) ?? [];
    list.push(anchor);
    map.set(key, list);
  }
  return [...map.entries()].map(([tubeColor, anchors]) => ({
    tubeColor,
    anchors,
    centerY: anchors.reduce((sum, anchor) => sum + anchor.localY, 0) / Math.max(1, anchors.length),
  }));
}

export function SpliceCanvas({ layout, routes, overrides, onOverridesChange }: Props) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [selectedCableId, setSelectedCableId] = useState<string | null>(null);
  const selectedCable = useMemo(() => layout.cables.find((cable) => cable.id === selectedCableId) ?? null, [layout.cables, selectedCableId]);

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

  const updateCablePosition = (cable: CableLayout, position: Point) => {
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
      <svg
        ref={svgRef}
        className="splice-svg"
        viewBox={`0 0 ${layout.width} ${layout.height}`}
        width={layout.width}
        height={layout.height}
        onPointerMove={(event) => {
          if (!drag) return;
          const cable = layout.cables.find((item) => item.id === drag.cableId);
          if (!cable) return;
          const point = svgPoint(event);
          updateCablePosition(cable, {
            x: Math.max(24, Math.min(layout.width - cable.width - 24, point.x - drag.offset.x)),
            y: Math.max(36, point.y - drag.offset.y),
          });
        }}
        onPointerUp={() => setDrag(null)}
        onPointerLeave={() => setDrag(null)}
      >
        <defs>
          <pattern id="grid" width="32" height="32" patternUnits="userSpaceOnUse">
            <path d="M 32 0 L 0 0 0 32" fill="none" stroke="#e5e7eb" strokeWidth="1" />
          </pattern>
          <filter id="softShadow" x="-30%" y="-40%" width="160%" height="180%">
            <feDropShadow dx="0" dy="3" stdDeviation="4" floodColor="#0f172a" floodOpacity="0.16" />
          </filter>
        </defs>

        <rect x="0" y="0" width={layout.width} height={layout.height} fill="#f8fafc" />
        <rect x="0" y="0" width={layout.width} height={layout.height} fill="url(#grid)" opacity="0.55" />
        <line x1={layout.centerX} x2={layout.centerX} y1="28" y2={layout.height - 28} stroke="#cbd5e1" strokeDasharray="9 10" />
        <text x={layout.centerX} y="38" textAnchor="middle" className="center-label">splice routing center</text>

        <g className="routes-layer">
          {routes.routes.map((route) => {
            const d = routePath(route.points);
            const label = routeMidpoint(route.points);
            return (
              <g key={route.id} onClick={() => toggleProtected(route.connectionId)} className="route-group">
                <path d={d} fill="none" stroke="#f8fafc" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
                <path d={d} fill="none" stroke={route.protected ? "#64748b" : route.color} strokeWidth={route.protected ? 3.8 : 3} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={route.protected ? "8 6" : undefined} />
                <rect x={label.x - 5} y={label.y - 5} width="10" height="10" rx="2" fill="#fff" stroke={route.color} strokeWidth="2" />
                <title>{`${route.connectionId}${route.circuitName ? ` - ${route.circuitName}` : ""}. Click to toggle protect/existing.`}</title>
              </g>
            );
          })}
        </g>

        <g className="cables-layer">
          {layout.cables.map((cable) => {
            const selected = selectedCable?.id === cable.id;
            const groups = tubeGroups(cable);
            const leftSide = cable.side === "left";
            const sheathX = leftSide ? 12 : cable.width - 58;
            const sheathY = Math.max(18, cable.height / 2 - 42);
            const sheathW = 46;
            const sheathH = 84;
            const sheathCenter = { x: sheathX + sheathW / 2, y: sheathY + sheathH / 2 };
            const fanStartX = leftSide ? sheathX + sheathW : sheathX;
            const tubeTipX = leftSide ? 88 : cable.width - 88;
            const fiberTipX = leftSide ? cable.width - 5 : 5;
            const labelX = leftSide ? 14 : cable.width - 14;

            return (
              <g
                key={cable.id}
                transform={`translate(${cable.x}, ${cable.y})`}
                className={selected ? "cable-unit cable-unit--selected" : "cable-unit"}
                onPointerDown={(event) => {
                  event.stopPropagation();
                  const point = svgPoint(event);
                  setSelectedCableId(cable.id);
                  setDrag({ cableId: cable.id, offset: { x: point.x - cable.x, y: point.y - cable.y } });
                }}
              >
                <rect x="0" y="0" width={cable.width} height={cable.height} rx="10" fill="transparent" />
                <text x={labelX} y="15" textAnchor={leftSide ? "start" : "end"} className="cable-name">{cable.name}</text>
                <text x={labelX} y="31" textAnchor={leftSide ? "start" : "end"} className="cable-side">{sideLabel(cable.side)}</text>

                <rect x={sheathX} y={sheathY} width={sheathW} height={sheathH} rx="22" fill="#1e293b" stroke={selected ? "#2563eb" : "#0f172a"} strokeWidth={selected ? 3 : 1.5} filter="url(#softShadow)" />
                <ellipse cx={sheathX + sheathW / 2} cy={sheathY + 13} rx={sheathW / 2} ry="13" fill="#334155" />
                <ellipse cx={sheathX + sheathW / 2} cy={sheathY + sheathH - 13} rx={sheathW / 2} ry="13" fill="#0f172a" opacity="0.5" />

                {groups.map((group) => {
                  const tubeColor = group.tubeColor.split("-")[0];
                  const tubeFill = fiberColorHex[tubeColor as keyof typeof fiberColorHex] ?? "#94a3b8";
                  return (
                    <g key={group.tubeColor}>
                      <path d={`M ${sheathCenter.x} ${sheathCenter.y} L ${fanStartX} ${group.centerY} L ${tubeTipX} ${group.centerY}`} fill="none" stroke={tubeFill} strokeWidth="5" strokeLinecap="round" opacity="0.95" />
                      <text x={leftSide ? tubeTipX - 4 : tubeTipX + 4} y={group.centerY - 7} textAnchor={leftSide ? "end" : "start"} className="tube-label">{group.tubeColor}</text>
                    </g>
                  );
                })}

                {cable.anchors.map((anchor) => {
                  const color = fiberColorHex[anchor.fiberColor];
                  const textColor = fiberTextColor[anchor.fiberColor];
                  const chipX = leftSide ? cable.width - 43 : 17;
                  const chipLabelX = leftSide ? cable.width - 30 : 30;
                  return (
                    <g key={`${anchor.connectionId}-${anchor.role}`}>
                      <path d={`M ${tubeTipX} ${anchor.localY} L ${fiberTipX} ${anchor.localY}`} fill="none" stroke={color} strokeWidth="2.4" strokeLinecap="round" />
                      <circle cx={fiberTipX} cy={anchor.localY} r="5" fill={color} stroke="#0f172a" strokeWidth="1.2" />
                      <rect x={chipX} y={anchor.localY - 9} width="26" height="18" rx="5" fill={color} stroke="#0f172a" strokeWidth="0.5" />
                      <text x={chipLabelX} y={anchor.localY + 4} textAnchor="middle" fill={textColor} className="fiber-chip-text">{anchor.fiberColor}</text>
                    </g>
                  );
                })}
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}
