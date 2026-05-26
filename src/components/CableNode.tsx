import type { Node, NodeProps } from "@xyflow/react";
import { fiberColorHex, fiberTextColor } from "../engine/colors";
import type { CableLayout, FiberAnchor, Side } from "../engine/types";

export type CableFlowNodeData = {
  cable: CableLayout;
} & Record<string, unknown>;

export type CableFlowNode = Node<CableFlowNodeData, "cable">;

type TubeGroup = {
  tubeColor: string;
  anchors: FiberAnchor[];
  centerY: number;
};

function sideLabel(side: Side): string {
  return side === "left" ? "LEFT" : "RIGHT";
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

export function CableNode({ data, selected }: NodeProps<CableFlowNode>) {
  const cable = data.cable;
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
    <svg className="cable-node-svg" width={cable.width} height={cable.height} viewBox={`0 0 ${cable.width} ${cable.height}`}>
      <rect x="0" y="0" width={cable.width} height={cable.height} rx="10" fill="transparent" />
      <text x={labelX} y="15" textAnchor={leftSide ? "start" : "end"} className="cable-name">{cable.name}</text>
      <text x={labelX} y="31" textAnchor={leftSide ? "start" : "end"} className="cable-side">{sideLabel(cable.side)}</text>

      <rect x={sheathX} y={sheathY} width={sheathW} height={sheathH} rx="22" fill="#1e293b" stroke={selected ? "#2563eb" : "#0f172a"} strokeWidth={selected ? 3 : 1.5} />
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
    </svg>
  );
}
