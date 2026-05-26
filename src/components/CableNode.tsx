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

const BODY_WIDTH = 138;
const BODY_HEIGHT = 52;
const BODY_MARGIN = 10;
const BODY_RADIUS = 10;
const TUBE_HUB_OFFSET = 66;
const TUBE_HUB_MIN_GAP = 112;
const FIBER_FAN_LENGTH = 72;
const LABEL_LANE_MIN = 92;

function fmt(value: number): string {
  return value.toFixed(1);
}

function shortLabel(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, Math.max(1, maxLength - 3))}...` : value;
}

function cableNameFontSize(value: string): number {
  if (value.length > 22) return 10.5;
  if (value.length > 17) return 11.5;
  return 13;
}

function fittedCableName(value: string): string {
  const fontSize = cableNameFontSize(value);
  const maxChars = Math.max(8, Math.floor((BODY_WIDTH - 20) / (fontSize * 0.58)));
  return shortLabel(value, maxChars);
}

function circuitLabel(value?: string): string {
  if (!value) return "";
  const clean = value.trim();
  if (!clean) return "";
  return `(${shortLabel(clean, 13)})`;
}

function fanPath(source: Point, target: Point, leftSide: boolean): string {
  const direction = leftSide ? 1 : -1;
  const dx = Math.abs(target.x - source.x);
  const sourceHandle = Math.max(18, Math.min(62, dx * 0.65));
  const targetHandle = Math.max(12, Math.min(34, dx * 0.32));

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
  const tubeSource = { x: frontFaceX, y: bodyCenter.y };
  const tubeHubX = leftSide
    ? Math.min(cable.width - TUBE_HUB_MIN_GAP, frontFaceX + TUBE_HUB_OFFSET)
    : Math.max(TUBE_HUB_MIN_GAP, frontFaceX - TUBE_HUB_OFFSET);
  const fiberTipX = leftSide ? cable.width : 0;
  const fiberFanEndX = leftSide
    ? Math.min(fiberTipX - LABEL_LANE_MIN, tubeHubX + FIBER_FAN_LENGTH)
    : Math.max(fiberTipX + LABEL_LANE_MIN, tubeHubX - FIBER_FAN_LENGTH);
  const fiberTextAnchor = leftSide ? "start" : "end";
  const osTextAnchor = leftSide ? "start" : "end";
  const tubeTextAnchor = leftSide ? "end" : "start";
  const tubeLabelOffset = leftSide ? -8 : 8;
  const colorLabelX = leftSide ? fiberFanEndX + 8 : fiberFanEndX - 8;
  const osLabelX = leftSide ? colorLabelX + 31 : colorLabelX - 31;
  const countLabel = `${cable.anchors.length}F`;
  const bodyStroke = selected ? "#2563eb" : "#0f172a";
  const bodyStrokeWidth = selected ? 3 : 1.8;
  const nameFontSize = cableNameFontSize(cable.name);

  return (
    <svg className="cable-node-svg" width={cable.width} height={cable.height} viewBox={`0 0 ${cable.width} ${cable.height}`}>
      <rect x="0" y="0" width={cable.width} height={cable.height} rx="10" fill="transparent" />

      <g className="cable-body">
        <rect
          x={bodyX}
          y={bodyY}
          width={BODY_WIDTH}
          height={BODY_HEIGHT}
          rx={BODY_RADIUS}
          fill="transparent"
          stroke={bodyStroke}
          strokeWidth={bodyStrokeWidth}
        />
        <text x={bodyCenter.x} y={bodyCenter.y - 3} textAnchor="middle" className="cable-cylinder-title" style={{ fontSize: nameFontSize }}>{fittedCableName(cable.name)}</text>
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
              strokeWidth="5.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray={tube.dash}
            />
            <circle cx={tubeEnd.x} cy={tubeEnd.y} r="3.2" fill={tube.color} stroke="#0f172a" strokeWidth="1" />
            <text x={tubeEnd.x + tubeLabelOffset} y={tubeEnd.y - 8} textAnchor={tubeTextAnchor} className="tube-label">{group.tubeColor}</text>
          </g>
        );
      })}

      {cable.anchors.map((anchor) => {
        const color = fiberColorHex[anchor.fiberColor];
        const group = groupByTube.get(String(anchor.tubeColor));
        const fiberStart = { x: tubeHubX, y: group?.centerY ?? anchor.localY };
        const fanEnd = { x: fiberFanEndX, y: anchor.localY };
        const d = fanPath(fiberStart, fanEnd, leftSide);
        const horizontalD = `M ${fmt(fanEnd.x)} ${fmt(anchor.localY)} L ${fmt(fiberTipX)} ${fmt(anchor.localY)}`;
        const os = circuitLabel(anchor.circuitName);

        return (
          <g key={`${anchor.connectionId}-${anchor.role}`}>
            <path d={d} fill="none" stroke={color} strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
            <path d={horizontalD} fill="none" stroke={color} strokeWidth="2.1" strokeLinecap="round" />
            <text x={colorLabelX} y={anchor.localY + 3.2} textAnchor={fiberTextAnchor} className="fiber-label">{anchor.fiberColor}</text>
            {os ? <text x={osLabelX} y={anchor.localY + 3.2} textAnchor={osTextAnchor} className="fiber-os-label">{os}</text> : null}
          </g>
        );
      })}
    </svg>
  );
}
