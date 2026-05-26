import type { Node, NodeProps } from "@xyflow/react";
import { fiberColorHex } from "../engine/colors";
import type { CableLayout, FiberAnchor, Point } from "../engine/types";

export type CableFlowNodeData = {
  cable: CableLayout;
} & Record<string, unknown>;

export type CableFlowNode = Node<CableFlowNodeData, "cable">;

type TubeGroup = {
  tubeColor: string;
  anchors: FiberAnchor[];
  centerY: number;
};

const BODY_WIDTH = 128;
const BODY_HEIGHT = 54;
const BODY_MARGIN = 8;
const BODY_FACE_RX = 9;
const TUBE_HUB_OFFSET = 54;
const TUBE_HUB_MIN_GAP = 78;

function fmt(value: number): string {
  return value.toFixed(1);
}

function shortLabel(value: string, maxLength = 18): string {
  return value.length > maxLength ? `${value.slice(0, maxLength - 3)}...` : value;
}

function fanPath(source: Point, target: Point, leftSide: boolean): string {
  const direction = leftSide ? 1 : -1;
  const dx = Math.abs(target.x - source.x);
  const sourceHandle = Math.max(20, Math.min(70, dx * 0.7));
  const targetHandle = Math.max(14, Math.min(42, dx * 0.35));

  return [
    `M ${fmt(source.x)} ${fmt(source.y)}`,
    `C ${fmt(source.x + direction * sourceHandle)} ${fmt(source.y)},`,
    `${fmt(target.x - direction * targetHandle)} ${fmt(target.y)},`,
    `${fmt(target.x)} ${fmt(target.y)}`,
  ].join(" ");
}

function tubeGroups(cable: CableLayout): TubeGroup[] {
  const map = new Map<string, FiberAnchor[]>();
  for (const anchor of cable.anchors) {
    const key = String(anchor.tubeColor);
    const list = map.get(key) ?? [];
    list.push(anchor);
    map.set(key, list);
  }

  return [...map.entries()].map(([tubeColor, anchors]) => {
    const sorted = [...anchors].sort((a, b) => a.localY - b.localY);
    return {
      tubeColor,
      anchors: sorted,
      centerY: sorted.reduce((sum, anchor) => sum + anchor.localY, 0) / Math.max(1, sorted.length),
    };
  });
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
  const groupByTube = new Map(groups.map((group) => [group.tubeColor, group]));
  const leftSide = cable.side === "left";
  const bodyX = leftSide ? BODY_MARGIN : cable.width - BODY_WIDTH - BODY_MARGIN;
  const bodyY = Math.max(12, cable.height / 2 - BODY_HEIGHT / 2);
  const bodyCenter = { x: bodyX + BODY_WIDTH / 2, y: bodyY + BODY_HEIGHT / 2 };
  const frontFaceX = leftSide ? bodyX + BODY_WIDTH : bodyX;
  const rearFaceX = leftSide ? bodyX : bodyX + BODY_WIDTH;
  const tubeSource = { x: frontFaceX, y: bodyCenter.y };
  const tubeHubX = leftSide
    ? Math.min(cable.width - TUBE_HUB_MIN_GAP, frontFaceX + TUBE_HUB_OFFSET)
    : Math.max(TUBE_HUB_MIN_GAP, frontFaceX - TUBE_HUB_OFFSET);
  const fiberTipX = leftSide ? cable.width : 0;
  const fiberLabelX = leftSide ? cable.width - 34 : 34;
  const fiberTextAnchor = leftSide ? "end" : "start";
  const tubeTextAnchor = leftSide ? "end" : "start";
  const tubeLabelOffset = leftSide ? -8 : 8;
  const countLabel = `${cable.anchors.length}F`;
  const cylinderStroke = selected ? "#2563eb" : "#0f172a";
  const cylinderStrokeWidth = selected ? 3 : 1.8;

  return (
    <svg className="cable-node-svg" width={cable.width} height={cable.height} viewBox={`0 0 ${cable.width} ${cable.height}`}>
      <rect x="0" y="0" width={cable.width} height={cable.height} rx="10" fill="transparent" />

      <g className="cable-cylinder">
        <rect
          x={bodyX}
          y={bodyY}
          width={BODY_WIDTH}
          height={BODY_HEIGHT}
          rx={BODY_HEIGHT / 2}
          fill="transparent"
          stroke={cylinderStroke}
          strokeWidth={cylinderStrokeWidth}
        />
        <ellipse
          cx={frontFaceX}
          cy={bodyCenter.y}
          rx={BODY_FACE_RX}
          ry={BODY_HEIGHT / 2}
          fill="transparent"
          stroke={cylinderStroke}
          strokeWidth={cylinderStrokeWidth}
        />
        <ellipse
          cx={rearFaceX}
          cy={bodyCenter.y}
          rx={BODY_FACE_RX}
          ry={BODY_HEIGHT / 2}
          fill="transparent"
          stroke="#0f172a"
          strokeWidth="1.2"
          opacity="0.45"
        />
        <text x={bodyCenter.x} y={bodyCenter.y - 3} textAnchor="middle" className="cable-cylinder-title">{shortLabel(cable.name)}</text>
        <text x={bodyCenter.x} y={bodyCenter.y + 14} textAnchor="middle" className="cable-cylinder-subtitle">{countLabel}</text>
        <title>{cable.name}</title>
      </g>

      {groups.map((group) => {
        const tube = tubeStroke(group.tubeColor);
        const tubeEnd = { x: tubeHubX, y: group.centerY };
        const d = fanPath(tubeSource, tubeEnd, leftSide);
        return (
          <g key={group.tubeColor}>
            <path d={d} fill="none" stroke="#ffffff" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" opacity="0.82" />
            <path
              d={d}
              fill="none"
              stroke={tube.color}
              strokeWidth="5.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray={tube.dash}
            />
            <circle cx={tubeEnd.x} cy={tubeEnd.y} r="3.6" fill={tube.color} stroke="#0f172a" strokeWidth="1" />
            <text x={tubeEnd.x + tubeLabelOffset} y={tubeEnd.y - 8} textAnchor={tubeTextAnchor} className="tube-label">{group.tubeColor}</text>
          </g>
        );
      })}

      {cable.anchors.map((anchor) => {
        const color = fiberColorHex[anchor.fiberColor];
        const group = groupByTube.get(String(anchor.tubeColor));
        const fiberStart = { x: tubeHubX, y: group?.centerY ?? anchor.localY };
        const fiberEnd = { x: fiberTipX, y: anchor.localY };
        const d = fanPath(fiberStart, fiberEnd, leftSide);

        return (
          <g key={`${anchor.connectionId}-${anchor.role}`}>
            <path d={d} fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            <text x={fiberLabelX} y={anchor.localY + 3.5} textAnchor={fiberTextAnchor} className="fiber-label">{anchor.fiberColor}</text>
          </g>
        );
      })}
    </svg>
  );
}
