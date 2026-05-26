import { colorSortIndex, normalizeFiberColor, normalizeTubeColor } from "./colors";
import type { FiberColor, FiberEndpoint, Side, SpliceConnection, SpliceModel } from "./types";

type DraftEndpoint = FiberEndpoint & { explicitFiberNumber: boolean };
type BentleyRow = { lineNumber: number; section: Side | null; from: DraftEndpoint; to: DraftEndpoint; os?: string; raw: string };

function splitCsv(line: string): string[] {
  const cells: string[] = [];
  let value = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"' && quoted && line[i + 1] === '"') {
      value += '"';
      i += 1;
    } else if (ch === '"') {
      quoted = !quoted;
    } else if (ch === "," && !quoted) {
      cells.push(value.trim());
      value = "";
    } else {
      value += ch;
    }
  }
  cells.push(value.trim());
  return cells;
}

function headerKey(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function slug(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function cableId(cable: string, role?: "source" | "target", splitLegs = false): string {
  const base = `cable:${slug(cable)}`;
  return splitLegs && role ? `${base}:${role}` : base;
}

function parseFiberNumber(raw: string): number | null {
  const n = Number.parseInt(raw.trim(), 10);
  return Number.isFinite(n) ? n : null;
}

function inferredFiberNumber(raw: string, tube: string, fiber: string, fallback: number): { value: number; explicit: boolean } {
  const parsed = parseFiberNumber(raw);
  if (parsed !== null) return { value: parsed, explicit: true };
  const tubeIndex = colorSortIndex(normalizeTubeColor(tube).split("-")[0]);
  const fiberColor = normalizeFiberColor(fiber);
  const fiberIndex = fiberColor ? colorSortIndex(fiberColor) : 999;
  if (tubeIndex < 999 && fiberIndex < 999) return { value: Math.floor(tubeIndex) * 12 + Math.floor(fiberIndex) + 1, explicit: false };
  return { value: fallback, explicit: false };
}

function endpoint(args: {
  role: "source" | "target";
  cable: string;
  fiberNumber: string;
  tube: string;
  fiberColor: string;
  device?: string;
  fallback: number;
  splitLegs?: boolean;
}): DraftEndpoint | null {
  const cable = args.cable.trim();
  const color = normalizeFiberColor(args.fiberColor) as FiberColor | null;
  if (!cable || !color) return null;
  const number = inferredFiberNumber(args.fiberNumber, args.tube, args.fiberColor, args.fallback);
  const device = args.device?.trim() || undefined;
  return {
    role: args.role,
    cableName: cable,
    cableId: cableId(cable, args.role, args.splitLegs),
    tubeColor: normalizeTubeColor(args.tube),
    fiberNumber: number.value,
    fiberColor: color,
    device,
    explicitFiberNumber: number.explicit,
  };
}

function asEndpoint(ep: DraftEndpoint, role: "source" | "target"): FiberEndpoint {
  return {
    role,
    cableName: ep.cableName,
    cableId: ep.cableId,
    tubeColor: ep.tubeColor,
    fiberNumber: ep.fiberNumber,
    fiberColor: ep.fiberColor,
    device: ep.device,
  };
}

function physicalKey(ep: Pick<FiberEndpoint, "cableId" | "fiberNumber" | "tubeColor" | "fiberColor">): string {
  return [ep.cableId, ep.fiberNumber, ep.tubeColor, ep.fiberColor].join("|");
}

function pairKey(a: FiberEndpoint, b: FiberEndpoint): string {
  return [physicalKey(a), physicalKey(b)].sort().join("<->");
}

function isOs(value: string): boolean {
  const v = value.trim();
  return /^CH\s+\d+/i.test(v) || /^EL-\d+/i.test(v) || v.startsWith("[");
}

function trimFrom(parts: string[]): string[] {
  const p = parts.map((x) => x.trim());
  while (p.length > 0 && p[p.length - 1] === "") p.pop();
  return p;
}

function trimTo(parts: string[]): string[] {
  const p = parts.map((x) => x.trim());
  while (p.length > 0 && p[0] === "") p.shift();
  while (p.length > 6 && p[p.length - 1] === p[p.length - 2]) p.pop();
  while (p.length > 0 && p[p.length - 1] === "") {
    const next = p.slice(0, -1);
    const lastNonEmpty = [...next].reverse().find((x) => x !== "") ?? "";
    const minLength = isOs(lastNonEmpty) ? 6 : 5;
    if (next.length < minLength) break;
    p.pop();
  }
  return p;
}

function parseBentleyFrom(parts: string[], fallback: number): DraftEndpoint | null {
  const p = trimFrom(parts);
  if (p.length < 5) return null;
  return endpoint({
    role: "source",
    device: p[0],
    cable: p.slice(1, p.length - 3).join(", "),
    fiberNumber: p[p.length - 3] ?? "",
    tube: p[p.length - 2] ?? "",
    fiberColor: p[p.length - 1] ?? "",
    fallback,
    splitLegs: true,
  });
}

function parseBentleyTo(parts: string[], fallback: number): DraftEndpoint | null {
  const p = trimTo(parts);
  const tail = isOs(p[p.length - 1] ?? "") ? 5 : 4;
  if (p.length < tail + 1) return null;
  const cableEnd = p.length - tail;
  return endpoint({
    role: "target",
    cable: p.slice(0, cableEnd).join(", "),
    fiberNumber: p[cableEnd] ?? "",
    tube: p[cableEnd + 1] ?? "",
    fiberColor: p[cableEnd + 2] ?? "",
    device: p[cableEnd + 3],
    fallback,
    splitLegs: true,
  });
}

function normalizeBentleyPair(from: DraftEndpoint, to: DraftEndpoint): { from: DraftEndpoint; to: DraftEndpoint } {
  if (!to.explicitFiberNumber && from.explicitFiberNumber && from.tubeColor === to.tubeColor) return { from, to: { ...to, fiberNumber: from.fiberNumber } };
  if (!from.explicitFiberNumber && to.explicitFiberNumber && from.tubeColor === to.tubeColor) return { from: { ...from, fiberNumber: to.fiberNumber }, to };
  return { from, to };
}

function circuitFromRight(parts: string[]): string | undefined {
  const p = trimTo(parts);
  const last = p[p.length - 1] ?? "";
  return isOs(last) ? last : undefined;
}

function buildModel(connections: SpliceConnection[], warnings: string[], title: string): SpliceModel {
  const cables = new Map<string, { id: string; name: string; sideHint: Side; fibers: FiberEndpoint[] }>();
  for (const conn of connections) {
    for (const [sideHint, ep] of [["left", conn.source], ["right", conn.target]] as const) {
      const existing = cables.get(ep.cableId);
      if (existing) existing.fibers.push(ep);
      else cables.set(ep.cableId, { id: ep.cableId, name: ep.cableName, sideHint, fibers: [ep] });
    }
  }
  return {
    id: `splice-${connections.length}-${cables.size}`,
    title,
    connections,
    cables: [...cables.values()].sort((a, b) => a.sideHint === b.sideHint ? a.name.localeCompare(b.name) : a.sideHint === "left" ? -1 : 1),
    warnings,
  };
}

function parseNormalizedCsv(text: string): SpliceModel | null {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith("#"));
  if (lines.length < 2) return null;
  const header = splitCsv(lines[0]!).map(headerKey);
  const find = (names: string[]) => names.map((name) => header.indexOf(name)).find((idx) => idx >= 0) ?? -1;
  const sourceCable = find(["sourcecable", "fromcable", "leftcable", "acable"]);
  const targetCable = find(["targetcable", "tocable", "rightcable", "bcable"]);
  if (sourceCable < 0 || targetCable < 0) return null;
  const sourceTube = find(["sourcetube", "fromtube", "lefttube", "atube"]);
  const targetTube = find(["targettube", "totube", "righttube", "btube"]);
  const sourceFiber = find(["sourcefiber", "fromfiber", "leftfiber", "afiber", "sourcefibernumber"]);
  const targetFiber = find(["targetfiber", "tofiber", "rightfiber", "bfiber", "targetfibernumber"]);
  const sourceColor = find(["sourcefibercolor", "fromfibercolor", "leftfibercolor", "acolor"]);
  const targetColor = find(["targetfibercolor", "tofibercolor", "rightfibercolor", "bcolor"]);
  const circuit = find(["circuit", "circuitname", "os", "label"]);
  const warnings: string[] = [];
  const connections: SpliceConnection[] = [];
  for (const [rowIndex, line] of lines.slice(1).entries()) {
    const cells = splitCsv(line);
    const fallback = rowIndex + 1;
    const source = endpoint({
      role: "source",
      cable: cells[sourceCable] ?? "",
      tube: sourceTube >= 0 ? cells[sourceTube] ?? "" : "BL",
      fiberNumber: sourceFiber >= 0 ? cells[sourceFiber] ?? "" : String(fallback),
      fiberColor: sourceColor >= 0 ? cells[sourceColor] ?? "" : cells[sourceFiber] ?? "",
      fallback,
    });
    const target = endpoint({
      role: "target",
      cable: cells[targetCable] ?? "",
      tube: targetTube >= 0 ? cells[targetTube] ?? "" : "BL",
      fiberNumber: targetFiber >= 0 ? cells[targetFiber] ?? "" : String(fallback),
      fiberColor: targetColor >= 0 ? cells[targetColor] ?? "" : cells[targetFiber] ?? "",
      fallback,
    });
    if (!source || !target) {
      warnings.push(`Skipped row ${rowIndex + 2}: invalid endpoint.`);
      continue;
    }
    connections.push({
      id: `conn-${connections.length + 1}`,
      source: asEndpoint(source, "source"),
      target: asEndpoint(target, "target"),
      circuitName: circuit >= 0 ? cells[circuit]?.trim() || undefined : undefined,
      raw: line,
    });
  }
  return buildModel(connections, warnings, "Normalized CSV import");
}

function parseBentleyCsv(text: string): SpliceModel {
  const warnings: string[] = [];
  const rows: BentleyRow[] = [];
  let section: Side | null = null;
  for (const [lineIndex, raw] of text.split(/\r?\n/).entries()) {
    const line = raw.trim();
    if (!line) continue;
    const marker = line.toLowerCase().replace(/\s+/g, " ");
    if (marker === "left ---") { section = "left"; continue; }
    if (marker === "right ---") { section = "right"; continue; }
    if (!line.includes("<->")) continue;
    const [leftRaw, rightRaw] = line.split("<->");
    const fromRaw = parseBentleyFrom(splitCsv(leftRaw ?? ""), rows.length + 1);
    const toRaw = parseBentleyTo(splitCsv(rightRaw ?? ""), rows.length + 1);
    if (!fromRaw || !toRaw) {
      warnings.push(`Skipped Bentley row ${lineIndex + 1}: invalid endpoint.`);
      continue;
    }
    const { from, to } = normalizeBentleyPair(fromRaw, toRaw);
    rows.push({ lineNumber: lineIndex + 1, section, from, to, os: circuitFromRight(splitCsv(rightRaw ?? "")), raw: line });
  }
  const leftRows = rows.filter((row) => row.section === "left");
  const rightRows = rows.filter((row) => row.section === "right");
  const authoritativeRows = leftRows.length > 0 ? leftRows : rows;
  if (leftRows.length > 0 && rightRows.length > 0) warnings.push(`Used ${leftRows.length} Left row(s); ${rightRows.length} Right row(s) were treated as mirror/hint rows only.`);
  if (leftRows.length === 0 && rightRows.length > 0) warnings.push("No Left section rows were found; using all parsed Bentley rows as fallback.");
  const seen = new Set<string>();
  const connections: SpliceConnection[] = [];
  for (const row of authoritativeRows.sort((a, b) => a.lineNumber - b.lineNumber)) {
    const key = pairKey(row.from, row.to);
    if (seen.has(key)) continue;
    seen.add(key);
    connections.push({
      id: `conn-${connections.length + 1}`,
      source: asEndpoint(row.from, "source"),
      target: asEndpoint(row.to, "target"),
      circuitName: row.os,
      raw: row.raw,
    });
  }
  if (connections.length === 0) warnings.push("No splice rows were found.");
  return buildModel(connections, warnings, "Bentley Splice Report import");
}

export function parseSpliceCsv(text: string): SpliceModel {
  return parseNormalizedCsv(text) ?? parseBentleyCsv(text);
}
