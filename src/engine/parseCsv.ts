import { colorSortIndex, normalizeFiberColor, normalizeTubeColor } from "./colors";
import type { FiberColor, FiberEndpoint, Side, SpliceConnection, SpliceModel } from "./types";

type ParsedEndpoint = FiberEndpoint & {
  numberExplicit: boolean;
  reportDevices: string[];
};

type BentleyReportRow = {
  lineNumber: number;
  section: Side | null;
  from: ParsedEndpoint;
  to: ParsedEndpoint;
  os?: string;
  raw: string;
};

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

function inferFiberNumber(raw: string, tubeColor: string, fiberColor: string, fallback: number): { value: number; explicit: boolean } {
  const parsed = parseNumber(raw);
  if (parsed !== null) return { value: parsed, explicit: true };

  const tubeBase = normalizeTubeColor(tubeColor).split("-")[0];
  const normalizedFiberColor = normalizeFiberColor(fiberColor);
  const tubeIndex = colorSortIndex(tubeBase);
  const fiberIndex = normalizedFiberColor ? colorSortIndex(normalizedFiberColor) : 999;
  if (tubeIndex < 999 && fiberIndex < 999) {
    return { value: Math.floor(tubeIndex) * 12 + Math.floor(fiberIndex) + 1, explicit: false };
  }
  return { value: fallback, explicit: false };
}

function endpointFromCells(args: {
  role: "source" | "target";
  cableName: string;
  tubeColor: string;
  fiberNumber: string;
  fiberColor: string;
  device?: string;
  fallbackFiberNumber: number;
}): ParsedEndpoint | null {
  const cableName = args.cableName.trim();
  if (!cableName) return null;
  const fiberColor = normalizeFiberColor(args.fiberColor) as FiberColor | null;
  if (!fiberColor) return null;
  const inferred = inferFiberNumber(args.fiberNumber, args.tubeColor, args.fiberColor, args.fallbackFiberNumber);
  const device = args.device?.trim() || undefined;

  return {
    role: args.role,
    cableName,
    cableId: cableId(cableName),
    tubeColor: normalizeTubeColor(args.tubeColor),
    fiberNumber: inferred.value,
    fiberColor,
    device,
    numberExplicit: inferred.explicit,
    reportDevices: device ? [device] : [],
  };
}

function endpointPhysicalKey(endpoint: Pick<FiberEndpoint, "cableId" | "fiberNumber" | "tubeColor" | "fiberColor">): string {
  return [endpoint.cableId, endpoint.fiberNumber, endpoint.tubeColor, endpoint.fiberColor].join("|");
}

function connectionPairKey(a: FiberEndpoint, b: FiberEndpoint): string {
  return [endpointPhysicalKey(a), endpointPhysicalKey(b)].sort().join("<->");
}

function unique(values: Array<string | undefined>): string[] {
  return [...new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))];
}

function compareEndpoints(a: FiberEndpoint, b: FiberEndpoint): number {
  return (
    a.cableName.localeCompare(b.cableName) ||
    a.fiberNumber - b.fiberNumber ||
    String(a.tubeColor).localeCompare(String(b.tubeColor)) ||
    a.fiberColor.localeCompare(b.fiberColor)
  );
}

function asFiberEndpoint(endpoint: ParsedEndpoint, role: "source" | "target"): FiberEndpoint {
  const devices = unique(endpoint.reportDevices);
  return {
    role,
    cableName: endpoint.cableName,
    cableId: endpoint.cableId,
    tubeColor: endpoint.tubeColor,
    fiberNumber: endpoint.fiberNumber,
    fiberColor: endpoint.fiberColor,
    device: devices.length > 0 ? devices.join(" / ") : endpoint.device,
  };
}

function mergeEndpoint(primary: ParsedEndpoint, candidates: ParsedEndpoint[]): ParsedEndpoint {
  const sameEndpoint = candidates.filter((candidate) => endpointPhysicalKey(candidate) === endpointPhysicalKey(primary));
  const preferred = sameEndpoint.find((candidate) => candidate.numberExplicit) ?? primary;
  return {
    ...primary,
    cableName: preferred.cableName || primary.cableName,
    cableId: preferred.cableId || primary.cableId,
    tubeColor: preferred.tubeColor || primary.tubeColor,
    fiberNumber: preferred.fiberNumber || primary.fiberNumber,
    fiberColor: preferred.fiberColor || primary.fiberColor,
    numberExplicit: sameEndpoint.some((candidate) => candidate.numberExplicit),
    reportDevices: unique(sameEndpoint.flatMap((candidate) => candidate.reportDevices)),
    device: unique(sameEndpoint.flatMap((candidate) => candidate.reportDevices)).join(" / ") || primary.device,
  };
}

function mergeBentleyRowGroup(rows: BentleyReportRow[], index: number): SpliceConnection {
  const primary = rows.find((row) => row.section === "left") ?? rows[0]!;
  const endpoints = rows.flatMap((row) => [row.from, row.to]);
  const mergedFrom = mergeEndpoint(primary.from, endpoints);
  const mergedTo = mergeEndpoint(primary.to, endpoints);
  const labels = unique(rows.map((row) => row.os));

  return {
    id: `conn-${index + 1}`,
    source: asFiberEndpoint(mergedFrom, "source"),
    target: asFiberEndpoint(mergedTo, "target"),
    circuitName: labels.length > 0 ? labels.join(" / ") : undefined,
    raw: rows.map((row) => row.raw).join("\n"),
  };
}

function mergeMirroredBentleyRows(rows: BentleyReportRow[], warnings: string[]): SpliceConnection[] {
  const groups = new Map<string, BentleyReportRow[]>();
  for (const row of rows) {
    const key = connectionPairKey(row.from, row.to);
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }

  const orderedGroups = [...groups.values()].sort((a, b) => a[0]!.lineNumber - b[0]!.lineNumber);
  const merged = orderedGroups.map((group, index) => mergeBentleyRowGroup(group, index));
  const mirroredRowCount = rows.length - merged.length;
  const oneSidedCount = orderedGroups.filter((group) => group.length === 1).length;
  const overMergedCount = orderedGroups.filter((group) => group.length > 2).length;

  if (mirroredRowCount > 0) {
    warnings.push(`Merged ${mirroredRowCount} mirrored Bentley report rows into physical splice connections.`);
  }
  if (oneSidedCount > 0) {
    warnings.push(`${oneSidedCount} splice connection(s) appeared only once in the Bentley report. They are still treated as complete from/to pairs.`);
  }
  if (overMergedCount > 0) {
    warnings.push(`${overMergedCount} splice connection key(s) appeared more than twice. Check for duplicate cable names or duplicate fiber usage.`);
  }

  return merged;
}

function addCableReuseWarnings(connections: SpliceConnection[], warnings: string[]): void {
  const uses = new Map<string, string[]>();
  for (const connection of connections) {
    for (const endpoint of [connection.source, connection.target]) {
      const key = endpointPhysicalKey(endpoint);
      const ids = uses.get(key) ?? [];
      ids.push(connection.id);
      uses.set(key, ids);
    }
  }

  for (const [key, ids] of uses) {
    if (ids.length <= 1) continue;
    const [cableId, fiberNumber, tubeColor, fiberColor] = key.split("|");
    warnings.push(
      `Fiber ${fiberNumber} ${tubeColor}/${fiberColor} on ${cableId?.replace(/^cable:/, "")} is used in ${ids.length} connections. This may indicate duplicate cable names that need manual disambiguation.`,
    );
  }
}

function buildModel(connections: SpliceConnection[], warnings: string[], title = "Imported splice detail"): SpliceModel {
  addCableReuseWarnings(connections, warnings);

  const cableMap = new Map<string, { id: string; name: string; sideHint: Side; fibers: FiberEndpoint[] }>();
  for (const conn of connections) {
    for (const [sideHint, ep] of [["left", conn.source], ["right", conn.target]] as const) {
      const existing = cableMap.get(ep.cableId);
      if (existing) {
        existing.fibers.push(ep);
      } else {
        cableMap.set(ep.cableId, {
          id: ep.cableId,
          name: ep.cableName,
          sideHint,
          fibers: [ep],
        });
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
      cableName: cells[sourceCable] ?? "",
      tubeColor: sourceTube >= 0 ? cells[sourceTube] ?? "" : "BL",
      fiberNumber: sourceFiber >= 0 ? cells[sourceFiber] ?? "" : String(fallbackFiberNumber),
      fiberColor: sourceColor >= 0 ? cells[sourceColor] ?? "" : cells[sourceFiber] ?? "",
      fallbackFiberNumber,
    });
    const target = endpointFromCells({
      role: "target",
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
      source: asFiberEndpoint(source, "source"),
      target: asFiberEndpoint(target, "target"),
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

function parseBentleyEndpointFromSide(parts: string[], fallbackFiberNumber: number): ParsedEndpoint | null {
  let p = parts.map((item) => item.trim());
  while (p.length > 0 && p[p.length - 1] === "") p = p.slice(0, -1);
  if (p.length < 5) return null;
  return endpointFromCells({
    role: "source",
    cableName: p.slice(1, p.length - 3).join(", "),
    tubeColor: p[p.length - 2] ?? "",
    fiberNumber: p[p.length - 3] ?? "",
    fiberColor: p[p.length - 1] ?? "",
    device: p[0],
    fallbackFiberNumber,
  });
}

function parseBentleyEndpointToSide(parts: string[], fallbackFiberNumber: number): ParsedEndpoint | null {
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
  const reportRows: BentleyReportRow[] = [];
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
    const lineNumber = lineIndex + 1;
    const from = parseBentleyEndpointFromSide(leftParts, reportRows.length + 1);
    const to = parseBentleyEndpointToSide(rightParts, reportRows.length + 1);

    if (!from || !to) {
      warnings.push(`Skipped Bentley row ${lineNumber}: could not parse both from/to endpoints.`);
      continue;
    }

    reportRows.push({
      lineNumber,
      section,
      from,
      to,
      os: extractCircuitName(rightParts),
      raw: line,
    });
  }

  const connections = mergeMirroredBentleyRows(reportRows, warnings);

  if (connections.length === 0) {
    warnings.push("No splice rows were found. Use the sample normalized CSV format or Bentley rows containing <->.");
  }

  return buildModel(connections, warnings, "Bentley Splice Report import");
}

export function parseSpliceCsv(text: string): SpliceModel {
  return parseNormalizedCsv(text) ?? parseBentleyLikeCsv(text);
}
