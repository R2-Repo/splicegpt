import type { Node, NodeProps } from "@xyflow/react";
import { fiberColorHex, fiberTextColor } from "../engine/colors";
import type { CableLayout, FiberAnchor } from "../engine/types";

export type CableFlowNodeData = {
  cable: CableLayout;
} & Record<string, unknown>;

export type CableFlowNode = Node<CableFlowNodeData, "cable">;

type TubeGroup = {
  tubeColor: string;
  anchors: FiberAnchor[];
  centerY: number;
};

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

function tubeStroke(tubeColor: string): { color: string; dash?: string } {
  const tubeBase = tubeColor.split("-")[0];
  return {
    color: fiberColorHex[tubeBase as keyof typeof fiberColorHex] ?? "#94a3b8",
    dash: tubeColor.includes("-") ? "7 4" : undefined,
  };
}

export function CableNode({ data, selected }: NodeProps<CableFlowNode>) {
  const cable = data.cable;
  const groups = tubeGroups(cable);
  const leftSide = cable.side === "left";
  const sheathW = 42;
  const sheathH = Math.min(86, Math.max(44, cable.height - 42));
  const sheathX = leftSide ? 8 : cable.width - sheathW - 8;
  const sheathY = Math.max(22, cable.height / 2 - sheathH / 2);
  const sheathCenter = { x: sheathX + sheathW / 2, y: sheathY + sheathH / 2 };
  const sheathFaceX = leftSide ? sheathX + sheathW : sheathX;
  const tubeTipX = leftSide ? 78 : cable.width - 78;
  const fiberTipX = leftSide ? cable.width : 0;
  const labelX = leftSide ? 10 : cable.width - 10;
  const countLabel = `${cable.anchors.length}F`;

  return (
    <svg className="cable-node-svg" width={cable.width} height={cable.height} viewBox={`0 0 ${cable.width} ${cable.height}`}>
      <rect x="0" y="0" width={cable.width} height={cable.height} rx="10" fill="transparent" />
      <text x={labelX} y="14" textAnchor={leftSide ? "start" : "end"} className="cable-name">{cable.name}</text>
      <text x={labelX} y="28" textAnchor={leftSide ? "start" : "end"} className="cable-side">{countLabel}</text>

      <rect x={sheathX} y={sheathY} width={sheathW} height={sheathH} rx="20" fill="#111827" stroke={selected ? "#2563eb" : "#0f172a"} strokeWidth={selected ? 3 : 1.5} />
      <ellipse cx={sheathX + sheathW / 2} cy={sheathY + 12} rx={sheathW / 2} ry="12" fill="#334155" />
      <ellipse cx={sheathX + sheathW / 2} cy={sheathY + sheathH - 12} rx={sheathW / 2} ry="12" fill="#020617" opacity="0.65" />

      {groups.map((group) => {
        const tube = tubeStroke(group.tubeColor);
        const controlX = leftSide ? sheathFaceX + 18 : sheathFaceX - 18;
        return (
          <g key={group.tubeColor}>
            <path
              d={`M ${sheathCenter.x} ${sheathCenter.y} C ${controlX} ${sheathCenter.y}, ${controlX} ${group.centerY}, ${tubeTipX} ${group.centerY}`}
              fill="none"
              stroke={tube.color}
              strokeWidth="7"
              strokeLinecap="round"
              strokeDasharray={tube.dash}
              opacity="0.96"
            />
            <text x={leftSide ? tubeTipX - 5 : tubeTipX + 5} y={group.centerY - 8} textAnchor={leftSide ? "end" : "start"} className="tube-label">{group.tubeColor}</text>
          </g>
        );
      })}

      {cable.anchors.map((anchor) => {
        const color = fiberColorHex[anchor.fiberColor];
        const textColor = fiberTextColor[anchor.fiberColor];
        const chipX = leftSide ? cable.width - 38 : 12;
        const chipLabelX = leftSide ? cable.width - 26 : 24;
        return (
          <g key={`${anchor.connectionId}-${anchor.role}`}>
            <path d={`M ${tubeTipX} ${anchor.localY} L ${fiberTipX} ${anchor.localY}`} fill="none" stroke={color} strokeWidth="2.6" strokeLinecap="round" />
            <circle cx={fiberTipX} cy={anchor.localY} r="4.5" fill={color} stroke="#0f172a" strokeWidth="1" />
            <rect x={chipX} y={anchor.localY - 8} width="24" height="16" rx="4" fill={color} stroke="#0f172a" strokeWidth="0.5" />
            <text x={chipLabelX} y={anchor.localY + 3.5} textAnchor="middle" fill={textColor} className="fiber-chip-text">{anchor.fiberColor}</text>
          </g>
        );
      })}
    </svg>
  );
}
