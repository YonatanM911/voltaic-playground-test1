// Voltica Laboratories — core types for the circuit lab.
// Numeric values are stored in SI base units (V, A, Ω); per-component
// `unitOverrides` selects how a quantity is displayed/edited.

export type ComponentType =
  | "wire"
  | "battery"
  | "resistor"
  | "bulb"
  | "switch"
  | "diode"
  | "ammeter"
  | "voltmeter"
  | "ohmmeter"
  | "multimeter";

export interface CapabilityFlags {
  voltage: boolean;
  current: boolean;
  resistance: boolean;
}

// Which quantities the user is allowed to *edit* on each type.
// All other quantities still get *displayed* (read-only) in the edit dialog.
export const CAPABILITIES: Record<ComponentType, CapabilityFlags> = {
  wire: { voltage: false, current: false, resistance: false },
  battery: { voltage: true, current: false, resistance: false },
  resistor: { voltage: false, current: false, resistance: true },
  bulb: { voltage: false, current: false, resistance: true },
  switch: { voltage: false, current: false, resistance: false },
  diode: { voltage: true, current: false, resistance: false },
  ammeter: { voltage: false, current: false, resistance: false },
  voltmeter: { voltage: false, current: false, resistance: false },
  ohmmeter: { voltage: false, current: false, resistance: false },
  multimeter: { voltage: false, current: false, resistance: false },
};

export const COMPONENT_LABEL_HE: Record<ComponentType, string> = {
  wire: "תיל חשמלי",
  battery: "סוללה",
  resistor: "נגד",
  bulb: "נורה",
  switch: "מפסק",
  diode: "דיודה",
  ammeter: "אמפרמטר",
  voltmeter: "וולטמטר",
  ohmmeter: "אוהמטר",
  multimeter: "מולטימטר",
};

// Creative default name prefixes (auto-incremented).
export const NAME_PREFIX: Record<ComponentType, string> = {
  wire: "wire",
  battery: "battery",
  resistor: "resistor",
  bulb: "bulb",
  switch: "switch",
  diode: "diode",
  ammeter: "amp",
  voltmeter: "volt",
  ohmmeter: "ohm",
  multimeter: "multi",
};

import type { Quantity } from "./units";

export interface PlacedComponent {
  id: string;
  name: string;
  type: ComponentType;
  x: number;
  y: number;
  rotation: 0 | 90 | 180 | 270;
  voltage: number | string | null;   // SI value, or unknown name, or null
  current: number | string | null;
  resistance: number | string | null;
  closed?: boolean;                  // for switch
  unitOverrides?: Partial<Record<Quantity, string>>;
}

export interface Terminal {
  componentId: string;
  index: 0 | 1;
  x: number;
  y: number;
}

export const COMPONENT_LENGTH = 80; // distance between two terminals
export const GRID = 20;

export function snap(v: number): number {
  return Math.round(v / GRID) * GRID;
}

// World-space terminal positions of a placed component.
export function terminalPositions(c: PlacedComponent): [Terminal, Terminal] {
  const half = COMPONENT_LENGTH / 2;
  const rad = (c.rotation * Math.PI) / 180;
  const dx = Math.cos(rad) * half;
  const dy = Math.sin(rad) * half;
  return [
    { componentId: c.id, index: 0, x: c.x - dx, y: c.y - dy },
    { componentId: c.id, index: 1, x: c.x + dx, y: c.y + dy },
  ];
}

export function isValidUnknownName(name: string): boolean {
  return /^[A-Za-z][A-Za-z0-9_]*$/.test(name);
}

export type FieldParse =
  | { kind: "number"; value: number }
  | { kind: "unknown"; name: string }
  | { kind: "empty" }
  | { kind: "error"; message: string };

export function parseField(raw: string): FieldParse {
  const v = raw.trim();
  if (v === "") return { kind: "empty" };
  // allow unicode minus and decimal comma
  const norm = v.replace(",", ".");
  if (!Number.isNaN(Number(norm))) {
    const n = Number(norm);
    if (!Number.isFinite(n)) return { kind: "error", message: "ערך לא חוקי" };
    return { kind: "number", value: n };
  }
  if (isValidUnknownName(v)) return { kind: "unknown", name: v };
  return {
    kind: "error",
    message: "נעלם חייב להתחיל באות באנגלית, ואז אותיות/ספרות בלבד",
  };
}

// pick a unique creative name for a new component
export function nextComponentName(
  type: ComponentType,
  existing: PlacedComponent[]
): string {
  const prefix = NAME_PREFIX[type];
  let i = 1;
  const used = new Set(existing.map((c) => c.name));
  while (used.has(`${prefix}${i}`)) i++;
  return `${prefix}${i}`;
}
