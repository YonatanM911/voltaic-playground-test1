// Voltica Laboratories — units & SI prefix system.
// Every quantity (V, A, Ω) can be displayed using one of the SI prefixes
// below. A "unit override" on a placed component (or a default in the
// settings store) is a string like "mV" / "kΩ" / "μA" / "A" — i.e. a
// prefix concatenated with the base symbol. We always store the *raw*
// numeric value in SI base units; rendering and parsing convert to/from
// the chosen display unit on the fly.

export type Quantity = "voltage" | "current" | "resistance";

export const BASE_UNIT: Record<Quantity, string> = {
  voltage: "V",
  current: "A",
  resistance: "Ω",
};

export const QUANTITY_LABEL_HE: Record<Quantity, string> = {
  voltage: "מתח",
  current: "זרם",
  resistance: "התנגדות",
};

// SI prefix scale factors (multiply prefixed value by factor → SI base).
// e.g. "mV" → factor 1e-3 → 5 mV * 1e-3 = 0.005 V
export const PREFIXES: { symbol: string; he: string; factor: number }[] = [
  { symbol: "n", he: "ננו", factor: 1e-9 },
  { symbol: "μ", he: "מיקרו", factor: 1e-6 },
  { symbol: "m", he: "מילי", factor: 1e-3 },
  { symbol: "c", he: "סנטי", factor: 1e-2 },
  { symbol: "d", he: "דצי", factor: 1e-1 },
  { symbol: "", he: "", factor: 1 },
  { symbol: "k", he: "קילו", factor: 1e3 },
  { symbol: "M", he: "מגה", factor: 1e6 },
  { symbol: "G", he: "גיגה", factor: 1e9 },
  { symbol: "T", he: "טרה", factor: 1e12 },
];

export function prefixedUnits(q: Quantity): string[] {
  return PREFIXES.map((p) => p.symbol + BASE_UNIT[q]);
}

// Get the factor for a unit string like "mV". Returns 1 when not recognized.
export function unitFactor(unit: string, q: Quantity): number {
  const base = BASE_UNIT[q];
  if (!unit.endsWith(base)) return 1;
  const pref = unit.slice(0, unit.length - base.length);
  const p = PREFIXES.find((x) => x.symbol === pref);
  return p ? p.factor : 1;
}

// Convert a value stored in SI base units → display number using `unit`.
export function fromBase(siValue: number, unit: string, q: Quantity): number {
  return siValue / unitFactor(unit, q);
}

// Convert a user-typed display number using `unit` → SI base value stored.
export function toBase(displayValue: number, unit: string, q: Quantity): number {
  return displayValue * unitFactor(unit, q);
}

// Auto-pick a "nice" unit for an SI value: smallest prefix where |val| >= 1.
export function autoUnit(siValue: number, q: Quantity): string {
  const base = BASE_UNIT[q];
  if (!isFinite(siValue) || siValue === 0) return base;
  const abs = Math.abs(siValue);
  // walk prefixes from largest to smallest factor
  const ordered = [...PREFIXES].sort((a, b) => b.factor - a.factor);
  for (const p of ordered) {
    if (abs >= p.factor) return p.symbol + base;
  }
  return ordered[ordered.length - 1].symbol + base;
}

// Format an SI value using a chosen unit (or auto if "").
export function formatValue(
  siValue: number | null,
  unit: string | undefined,
  q: Quantity
): string {
  if (siValue == null || !isFinite(siValue)) return "—";
  const u = unit && unit !== "auto" && unit !== "" ? unit : autoUnit(siValue, q);
  const v = fromBase(siValue, u, q);
  const abs = Math.abs(v);
  let str: string;
  if (abs === 0) str = "0";
  else if (abs >= 100) str = v.toFixed(0);
  else if (abs >= 10) str = v.toFixed(1);
  else if (abs >= 1) str = v.toFixed(2);
  else str = v.toFixed(3);
  return `${str} ${u}`;
}
