import { colorSortIndex } from "./colors";
import type { CableLayout, DiagramOverrides, FiberAnchor, FiberEndpoint, LayoutPlan, Point, Side, SpliceConnection, SpliceModel } from "./types";

export const FIBER_ROW_PITCH = 24;
export const TUBE_GROUP_GAP = 8;
export const SAME_SIDE_CABLE_GAP = 32;

const CANVAS_MIN_WIDTH = 1240;
const TOP_PADDING = 64;
const SIDE_X = 54;
const CABLE_WIDTH = 172;
const HEADER_HEIGHT = 34;
const BOTTOM_PADDING = 86;

function compareFiber(a: FiberEndpoint, b: FiberEndpoint): number {
  return colorSortIndex(String(a.tubeColor)) - colorSortIndex(String(b.tubeColor)) || a.fiberNumber - b.fiberNumber || colorSortIndex(a.fiberColor) - colorSortIndex(b.fiberColor);
}

function cableHeight(fibers: FiberEndpoint[]): number {
  const tubeCount = new Set(fibers.map((fiber) => fiber.tubeColor)).size || 1;
  return HEADER_HEIGHT + fibers.length * FIBER_ROW_PITCH + Math.max(0, tubeCount - 1) * TUBE_GROUP_GAP + 24;
}

function sideFromOverrideOrHint(modelSide: Side, override?: { side?: Side; position?: Point }): Side {
  return override?.side ?? modelSide;
}

function sortedCableIdsForSide(model: SpliceModel, side: Side, overrides: DiagramOverrides): string[] {
  return model.cables
    .filter((cable) => sideFromOverrideOrHint(cable.sideHint, overrides.cableOverrides[cable.id]) === side)
    .sort((a, b) => {
      const ao = overrides.cableOverrides[a.id]?.order;
      const bo = overrides.cableOverrides[b.id]?.order;
      if (ao !== undefined || bo !== undefined) return (ao ?? 0) - (bo ?? 0);
      return a.name.localeCompare(b.name);
    })
    .map((cable) => cable.id);
}

function connectionForFiber(fiber: FiberEndpoint, connections: SpliceConnection[]): SpliceConnection | undefined {
  return connections.find((conn) =>
    (conn.source.cableId === fiber.cableId && conn.source.tubeColor === fiber.tubeColor && conn.source.fiberNumber === fiber.fiberNumber && conn.source.fiberColor === fiber.fiberColor && conn.source.role === fiber.role) ||
    (conn.target.cableId === fiber.cableId && conn.target.tubeColor === fiber.tubeColor && conn.target.fiberNumber === fiber.fiberNumber && conn.target.fiberColor === fiber.fiberColor && conn.target.role === fiber.role),
  );
}

function buildCableLayout(args: { model: SpliceModel; cableId: string; side: Side; x: number; y: number; connections: SpliceConnection[] }): CableLayout {
  const cable = args.model.cables.find((item) => item.id === args.cableId);
  if (!cable) throw new Error(`Unknown cable ${args.cableId}`);

  const uniqueFibers = new Map<string, FiberEndpoint>();
  for (const fiber of cable.fibers) uniqueFibers.set(`${fiber.tubeColor}:${fiber.fiberNumber}:${fiber.fiberColor}:${fiber.role}`, fiber);
  const fibers = [...uniqueFibers.values()].sort(compareFiber);
  const tubeCounts = new Map<string, number>();
  const tubeOrder = [...new Set(fibers.map((fiber) => String(fiber.tubeColor)))].sort((a, b) => colorSortIndex(a) - colorSortIndex(b));
  for (const tube of tubeOrder) tubeCounts.set(tube, 0);

  const anchors: FiberAnchor[] = [];
  for (const fiber of fibers) {
    const tubeIndex = tubeOrder.indexOf(String(fiber.tubeColor));
    const withinTubeIndex = tubeCounts.get(String(fiber.tubeColor)) ?? 0;
    tubeCounts.set(String(fiber.tubeColor), withinTubeIndex + 1);
    const priorFibers = [...tubeCounts.entries()]
      .filter(([tube]) => tubeOrder.indexOf(tube) < tubeIndex)
      .reduce((sum, [, count]) => sum + count, 0);
    const localY = HEADER_HEIGHT + tubeIndex * TUBE_GROUP_GAP + (priorFibers + withinTubeIndex) * FIBER_ROW_PITCH + FIBER_ROW_PITCH / 2;
    const connection = connectionForFiber(fiber, args.connections);
    if (!connection) continue;
    const handleX = args.side === "left" ? args.x + CABLE_WIDTH : args.x;
    anchors.push({ ...fiber, connectionId: connection.id, circuitName: connection.circuitName, localY, absolute: { x: handleX, y: args.y + localY } });
  }

  return { id: cable.id, name: cable.name, side: args.side, x: args.x, y: args.y, width: CABLE_WIDTH, height: cableHeight(fibers), anchors };
}

function placeSide(model: SpliceModel, side: Side, overrides: DiagramOverrides, canvasWidth: number): CableLayout[] {
  const ids = sortedCableIdsForSide(model, side, overrides);
  const x = side === "left" ? SIDE_X : canvasWidth - SIDE_X - CABLE_WIDTH;
  let cursorY = TOP_PADDING;
  const layouts: CableLayout[] = [];
  for (const cableId of ids) {
    const override = overrides.cableOverrides[cableId];
    const baseY = override?.position?.y ?? cursorY;
    const baseX = override?.position?.x ?? x;
    const layout = buildCableLayout({ model, cableId, side, x: baseX, y: baseY, connections: model.connections });
    layouts.push(layout);
    cursorY = Math.max(cursorY, baseY + layout.height + SAME_SIDE_CABLE_GAP);
  }
  return layouts;
}

export function createLayoutPlan(model: SpliceModel, overrides: DiagramOverrides): LayoutPlan {
  const maxCableCount = Math.max(sortedCableIdsForSide(model, "left", overrides).length, sortedCableIdsForSide(model, "right", overrides).length, 1);
  const canvasWidth = Math.max(CANVAS_MIN_WIDTH, 900 + maxCableCount * 52);
  const cables = [...placeSide(model, "left", overrides, canvasWidth), ...placeSide(model, "right", overrides, canvasWidth)];
  const anchorsByConnection: LayoutPlan["anchorsByConnection"] = {};
  for (const conn of model.connections) {
    const sourceCable = cables.find((cable) => cable.id === conn.source.cableId);
    const targetCable = cables.find((cable) => cable.id === conn.target.cableId);
    const source = sourceCable?.anchors.find((anchor) => anchor.connectionId === conn.id && anchor.role === "source");
    const target = targetCable?.anchors.find((anchor) => anchor.connectionId === conn.id && anchor.role === "target");
    if (source && target) anchorsByConnection[conn.id] = { source, target };
  }
  const height = Math.max(660, ...cables.map((cable) => cable.y + cable.height + BOTTOM_PADDING));
  return { width: canvasWidth, height, centerX: canvasWidth / 2, cables, anchorsByConnection };
}

export function sideForCanvasX(x: number, centerX: number): Side {
  return x < centerX ? "left" : "right";
}
