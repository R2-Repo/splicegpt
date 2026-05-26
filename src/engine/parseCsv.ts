import { colorSortIndex, normalizeFiberColor, normalizeTubeColor } from "./colors";
import type { FiberColor, FiberEndpoint, Side, SpliceConnection, SpliceModel } from "./types";

function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    const next = line[i + 1];
    if (ch === '"' && inQuotes && next === '"') {
      current += '"';
      i += 1;
      continue;
    }
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === "," && !inQuotes) {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  cells.push(current.trim());
  return cells;
}

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function slug(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function cableId(cableName: string): string {
  return `cable:${slug(cableName)}`;
}

function parseNumber(raw: string): number | null {
  const n = Number.parseInt(raw.trim(), 10);
  return Number.isFinite(n) ? n : null;
}

function inferFiberNumber(raw: string, tubeColor: string, fiberColor: string, fallback: number): number {
  const parsed = parseNumber(raw);
  if (parsed !== null) return parsed;

  const tubeBase = normalizeTubeColor(tubeColor).split("-")[0];
  const normalizedFiberColor = normalizeFiberColor(fiberColor);
  const tubeIndex = colorSortIndex(tubeBase);
  const fiberIndex = normalizedFiberColor ? colorSortIndex(normalizedFiberColor) : 999;
  if (tubeIndex < 999 && fiberIndex < 999) {
    return Math.floor(tubeIndex) * 12 + Math.floor(fiberIndex) + 1;
  }
  return fallback;
}

function endpointFromCells(args: {
  role: "source" | "target";
  side: Side;
  cableName: string;
  tubeColor: string;
  fiberNumber: string;
  fiberColor: string;
  device?: string;
  fallbackFiberNumber: number;
}): FiberEndpoint | null {
  const cableName = args.cableName.trim();
  if (!cableName) return null;
  const fiberColor = normalizeFiberColor(args.fiberColor) as FiberColor | null;
  if (!fiberColor) return null;
  return {
    role: args.role,
    cableName,
    cableId: cableId(cableName),
    tubeColor: normalizeTubeColor(args.tubeColor),
    fiberNumber: inferFiberNumber(args.fiberNumber, args.tubeColor, args.fiberColor, args.fallbackFiberNumber),
    fiberColor,
    device: args.device?.trim() || undefined,
  };
}

function endpointKey(endpoint: FiberEndpoint): string {
  return [endpoint.cableId, endpoint.fiberNumber, endpoint.tubeColor, endpoint.fiberColor].join("|");
}

function connectionPairKey(source: FiberEndpoint, target: FiberEndpoint): string {
  return [endpointKey(source), endpointKey(target)].sort().join("<->");
}

function dedupeMirroredConnections(connections: SpliceConnection[], warnings: string[]): SpliceConnection[] {
  const seen = new Set<string>();
  const deduped: SpliceConnection[] = [];
  let skipped = 0;

  for (const connection of connections) {
    const key = connectionPairKey(connection.source, connection.target);
    if (seen.has(key)) {
      skipped += 1;
      continue;
    }
    seen.add(key);
    deduped.push({ ...connection, id: `conn-${deduped.length + 1}` });
  }

  if (skipped > 0) {
    warnings.push(`Skipped ${skipped} mirrored Bentley report rows already shown in the opposite Left/Right section.`);
  }

  return deduped;
}

function buildModel(connections: SpliceConnection[], warnings: string[], title = "Imported splice detail"): SpliceModel {
  const cableMap = new Map<string, { id: string; name: string; sideHint: Side; fibers: FiberEndpoint[] }>();
  for (const conn of connections) {
    for (const [sideHint, ep] of [["left", conn.source], ["right", conn.target]] as const) {
      const existing = cableMap.get(ep.cableId);
      if (existing) {
        existing.fibers.push(ep);
      } else {
        cableMap.set(ep.cableId, { id: ep.cableId, name: ep.cableName, sideHint, fibers: [ep] });
      }
    }
  }

  const cables = [...cableMap.values()].sort((a, b) => {
    if (a.sideHint !== b.sideHint) return a.sideHint === "left" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return {
    id: `splice-${connections.length}-${cables.length}`,
    title,
    connections,
    cables,
    warnings,
  };
}

function parseNormalizedCsv(text: string): SpliceModel | null {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith("#"));
  if (lines.length < 2) return null;

  const header = splitCsvLine(lines[0]!).map(normalizeHeader);
  const index = (names: string[]) => names.map((name) => header.indexOf(name)).find((item) => item >= 0) ?? -1;

  const sourceCable = index(["sourcecable", "fromcable", "leftcable", "acable"]);
  const targetCable = index(["targetcable", "tocable", "rightcable", "bcable"]);
  if (sourceCable < 0 || targetCable < 0) return null;

  const sourceTube = index(["sourcetube", "fromtube", "lefttube", "atube"]);
  const targetTube = index(["targettube", "totube", "righttube", "btube"]);
  const sourceFiber = index(["sourcefiber", "fromfiber", "leftfiber", "afiber", "sourcefibernumber"]);
  const targetFiber = index(["targetfiber", "tofiber", "rightfiber", "bfiber", "targetfibernumber"]);
  const sourceColor = index(["sourcefibercolor", "fromfibercolor", "leftfibercolor", "acolor"]);
  const targetColor = index(["targetfibercolor", "tofibercolor", "rightfibercolor", "bcolor"]);
  const circuit = index(["circuit", "circuitname", "os", "label"]);

  const warnings: string[] = [];
  const connections: SpliceConnection[] = [];

  for (const [rowIndex, line] of lines.slice(1).entries()) {
    const cells = splitCsvLine(line);
    const fallbackFiberNumber = rowIndex + 1;
    const source = endpointFromCells({
      role: "source",
      side: "left",
      cableName: cells[sourceCable] ?? "",
      tubeColor: sourceTube >= 0 ? cells[sourceTube] ?? "" : "BL",
      fiberNumber: sourceFiber >= 0 ? cells[sourceFiber] ?? "" : String(fallbackFiberNumber),
      fiberColor: sourceColor >= 0 ? cells[sourceColor] ?? "" : cells[sourceFiber] ?? "",
      fallbackFiberNumber,
    });
    const target = endpointFromCells({
      role: "target",
      side: "right",
      cableName: cells[targetCable] ?? "",
      tubeColor: targetTube >= 0 ? cells[targetTube] ?? "" : "BL",
      fiberNumber: targetFiber >= 0 ? cells[targetFiber] ?? "" : String(fallbackFiberNumber),
      fiberColor: targetColor >= 0 ? cells[targetColor] ?? "" : cells[targetFiber] ?? "",
      fallbackFiberNumber,
    });

    if (!source || !target) {
      warnings.push(`Skipped row ${rowIndex + 2}: missing cable, tube, fiber number, or valid fiber color.`);
      continue;
    }

    connections.push({
      id: `conn-${connections.length + 1}`,
      source,
      target,
      circuitName: circuit >= 0 ? cells[circuit]?.trim() || undefined : undefined,
      raw: line,
    });
  }

  return buildModel(connections, warnings, "Normalized CSV import");
}

function stripDuplicateTrailingFields(parts: string[]): string[] {
  const p = parts.map((item) => item.trim());
  while (p.length > 6 && p[p.length - 1] === p[p.length - 2]) p.pop();
  return p;
}

function isOsField(value: string): boolean {
  const t = value.trim();
  return /^CH\s+\d+/i.test(t) || /^EL-\d+/i.test(t) || t.startsWith("[");
}

function parseBentleyEndpointFromSide(parts: string[], side: Side, fallbackFiberNumber: number): FiberEndpoint | null {
  let p = parts.map((item) => item.trim());
  while (p.length > 0 && p[p.length - 1] === "") p = p.slice(0, -1);
  if (p.length < 5) return null;
  return endpointFromCells({
    role: "source",
    side,
    cableName: p.slice(1, p.length - 3).join(", "),
    tubeColor: p[p.length - 2] ?? "",
    fiberNumber: p[p.length - 3] ?? "",
    fiberColor: p[p.length - 1] ?? "",
    device: p[0],
    fallbackFiberNumber,
  });
}

function parseBentleyEndpointToSide(parts: string[], side: Side, fallbackFiberNumber: number): FiberEndpoint | null {
  let p = stripDuplicateTrailingFields(parts.map((item) => item.trim()));
  while (p.length > 0 && p[0] === "") p = p.slice(1);
  if (p.length === 0) return null;

  const lastNonEmpty = (() => {
    for (let i = p.length - 1; i >= 0; i -= 1) {
      if (p[i] !== "") return i;
    }
    return -1;
  })();

  const hasOs = lastNonEmpty >= 0 && isOsField(p[lastNonEmpty] ?? "");
  if (hasOs) {
    p = p.slice(0, lastNonEmpty + 1);
  } else if (p[p.length - 1] === "") {
    p = p.slice(0, -1);
  }

  const tailLen = hasOs ? 5 : 4;
  if (p.length < tailLen + 1) return null;
  const cableEnd = p.length - tailLen;
  const cableName = p.slice(0, cableEnd).filter(Boolean).join(", ");
  const fiberNumberRaw = p[cableEnd] ?? "";
  const tubeRaw = p[cableEnd + 1] ?? "";
  const fiberColorRaw = p[cableEnd + 2] ?? "";
  const device = p[cableEnd + 3] ?? "";

  return endpointFromCells({
    role: "target",
    side,
    cableName,
    tubeColor: tubeRaw,
    fiberNumber: fiberNumberRaw,
    fiberColor: fiberColorRaw,
    device,
    fallbackFiberNumber,
  });
}

function extractCircuitName(parts: string[]): string | undefined {
  const p = stripDuplicateTrailingFields(parts.map((item) => item.trim())).filter(Boolean);
  const last = p[p.length - 1] ?? "";
  return isOsField(last) ? last : undefined;
}

function parseBentleyLikeCsv(text: string): SpliceModel {
  const warnings: string[] = [];
  const rawConnections: SpliceConnection[] = [];
  let section: Side | null = null;

  for (const [lineIndex, rawLine] of text.split(/\r?\n/).entries()) {
    const line = rawLine.trim();
    if (!line) continue;
    const marker = line.toLowerCase().replace(/\s+/g, " ");
    if (marker === "left ---") {
      section = "left";
      continue;
    }
    if (marker === "right ---") {
      section = "right";
      continue;
    }
    if (!line.includes("<->")) continue;

    const [leftRaw, rightRaw] = line.split("<->");
    const leftParts = splitCsvLine(leftRaw ?? "");
    const rightParts = splitCsvLine(rightRaw ?? "");
    const lineNo = lineIndex + 1;
    const sourceSide: Side = section === "right" ? "right" : "left";
    const targetSide: Side = sourceSide === "left" ? "right" : "left";
    const source = parseBentleyEndpointFromSide(leftParts, sourceSide, rawConnections.length + 1);
    const target = parseBentleyEndpointToSide(rightParts, targetSide, rawConnections.length + 1);

    if (!source || !target) {
      warnings.push(`Skipped Bentley-like row ${lineNo}: could not parse both endpoints.`);
      continue;
    }

    rawConnections.push({
      id: `conn-${rawConnections.length + 1}`,
      source,
      target,
      circuitName: extractCircuitName(rightParts),
      raw: line,
    });
  }

  const connections = dedupeMirroredConnections(rawConnections, warnings);

  if (connections.length === 0) {
    warnings.push("No splice rows were found. Use the sample normalized CSV format or Bentley rows containing <->.");
  }

  return buildModel(connections, warnings, "Bentley Splice Report import");
}

export function parseSpliceCsv(text: string): SpliceModel {
  return parseNormalizedCsv(text) ?? parseBentleyLikeCsv(text);
}
