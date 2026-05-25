import type { FiberColor } from "./types";

export const TIA_COLORS: FiberColor[] = [
  "BL",
  "OR",
  "GR",
  "BR",
  "SL",
  "WH",
  "RD",
  "BK",
  "YL",
  "VI",
  "RO",
  "AQ",
];

export const fiberColorHex: Record<FiberColor, string> = {
  BL: "#2563eb",
  OR: "#f97316",
  GR: "#16a34a",
  BR: "#92400e",
  SL: "#94a3b8",
  WH: "#f8fafc",
  RD: "#dc2626",
  BK: "#111827",
  YL: "#eab308",
  VI: "#7c3aed",
  RO: "#ec4899",
  AQ: "#06b6d4",
};

export const fiberTextColor: Record<FiberColor, string> = {
  BL: "#ffffff",
  OR: "#111827",
  GR: "#ffffff",
  BR: "#ffffff",
  SL: "#111827",
  WH: "#111827",
  RD: "#ffffff",
  BK: "#ffffff",
  YL: "#111827",
  VI: "#ffffff",
  RO: "#111827",
  AQ: "#111827",
};

export function normalizeFiberColor(input: string): FiberColor | null {
  const raw = input.trim().toUpperCase();
  const aliases: Record<string, FiberColor> = {
    BLUE: "BL",
    BLU: "BL",
    BL: "BL",
    ORANGE: "OR",
    ORG: "OR",
    OR: "OR",
    GREEN: "GR",
    GRN: "GR",
    GR: "GR",
    BROWN: "BR",
    BRN: "BR",
    BR: "BR",
    SLATE: "SL",
    SL: "SL",
    WHITE: "WH",
    WHT: "WH",
    WH: "WH",
    RED: "RD",
    RD: "RD",
    BLACK: "BK",
    BLK: "BK",
    BK: "BK",
    YELLOW: "YL",
    YL: "YL",
    VIOLET: "VI",
    VIO: "VI",
    VI: "VI",
    ROSE: "RO",
    RO: "RO",
    AQUA: "AQ",
    AQ: "AQ",
  };
  return aliases[raw] ?? null;
}

export function normalizeTubeColor(input: string): string {
  const raw = input.trim().toUpperCase();
  const parts = raw.split(/[-/ ]+/).filter(Boolean);
  const first = normalizeFiberColor(parts[0] ?? raw);
  if (!first) return raw || "UNK";
  if (parts.some((part) => normalizeFiberColor(part) === "BK") && first !== "BK") {
    return `${first}-BK`;
  }
  return first;
}

export function colorSortIndex(color: string): number {
  const base = color.split("-")[0] as FiberColor;
  const baseIndex = TIA_COLORS.indexOf(base);
  if (baseIndex < 0) return 999;
  return baseIndex + (color.includes("-BK") ? 0.5 : 0);
}
