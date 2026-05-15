// Voltica Laboratories — core types for the circuit lab.
// Numeric values are stored in SI base units (V, A, Ω); per-component
// `unitOverrides` selects how a quantity is displayed/edited.

export type ComponentType =
  | "wire"
  | "wire_corner"
  | "wire_t"
  | "wire_plus"
  | "battery"
  | "resistor"
  | "bulb"
  | "switch"
  | "diode"
  | "ammeter"
  | "voltmeter"
  | "ohmmeter"
  | "multimeter"
  | "gate_and"
  | "gate_or"
  | "gate_not"
  | "gate_xor"
  | "gate_nand"
  | "gate_nor"
  | "gate_buffer"
  | "gate_xnor";

export interface CapabilityFlags {
  voltage: boolean;
  current: boolean;
  resistance: boolean;
}

// Which quantities the user is allowed to *edit* on each type.
// All other quantities still get *displayed* (read-only) in the edit dialog.
export const CAPABILITIES: Record<ComponentType, CapabilityFlags> = {
  wire: { voltage: false, current: false, resistance: false },
  wire_corner: { voltage: false, current: false, resistance: false },
  wire_t: { voltage: false, current: false, resistance: false },
  wire_plus: { voltage: false, current: false, resistance: false },
  battery: { voltage: true, current: true, resistance: true },
  resistor: { voltage: false, current: false, resistance: true },
  bulb: { voltage: false, current: false, resistance: true },
  switch: { voltage: false, current: false, resistance: false },
  diode: { voltage: true, current: false, resistance: false },
  ammeter: { voltage: false, current: false, resistance: false },
  voltmeter: { voltage: false, current: false, resistance: false },
  ohmmeter: { voltage: false, current: false, resistance: false },
  multimeter: { voltage: false, current: false, resistance: false },
  gate_and: { voltage: false, current: false, resistance: false },
  gate_or: { voltage: false, current: false, resistance: false },
  gate_not: { voltage: false, current: false, resistance: false },
  gate_xor: { voltage: false, current: false, resistance: false },
  gate_nand: { voltage: false, current: false, resistance: false },
  gate_nor: { voltage: false, current: false, resistance: false },
  gate_buffer: { voltage: false, current: false, resistance: false },
  gate_xnor: { voltage: false, current: false, resistance: false },
};

export const COMPONENT_LABEL_HE: Record<ComponentType, string> = {
  wire: "תיל חשמלי",
  wire_corner: "תיל פינה",
  wire_t: "צומת T",
  wire_plus: "צומת +",
  battery: "סוללה",
  resistor: "נגד",
  bulb: "נורה",
  switch: "מפסק",
  diode: "דיודה",
  ammeter: "אמפרמטר",
  voltmeter: "וולטמטר",
  ohmmeter: "אוהמטר",
  multimeter: "מולטימטר",
  gate_and: "AND",
  gate_or: "OR",
  gate_not: "NOT",
  gate_xor: "XOR",
  gate_nand: "NAND",
  gate_nor: "NOR",
  gate_buffer: "BUFFER",
  gate_xnor: "XNOR",
};

// Creative default name prefixes (auto-incremented).
export const NAME_PREFIX: Record<ComponentType, string> = {
  wire: "wire",
  wire_corner: "corner",
  wire_t: "tjoint",
  wire_plus: "joint+",
  battery: "battery",
  resistor: "resistor",
  bulb: "bulb",
  switch: "switch",
  diode: "diode",
  ammeter: "amp",
  voltmeter: "volt",
  ohmmeter: "ohm",
  multimeter: "multi",
  gate_and: "AND",
  gate_or: "OR",
  gate_not: "NOT",
  gate_xor: "XOR",
  gate_nand: "NAND",
  gate_nor: "NOR",
  gate_buffer: "BUFFER",
  gate_xnor: "XNOR",
};

import type { Quantity } from "./units";

export interface PlacedComponent {
  id: string;
  name: string;
  type: ComponentType;
  x: number;
  y: number;
  rotation: 0 | 90 | 180 | 270;
  voltage: number | string | null; // SI value, or unknown name, or null
  current: number | string | null;
  resistance: number | string | null;
  closed?: boolean; // for switch and battery on/off state
  meterMode?: "voltage" | "current" | "resistance";
  unitOverrides?: Partial<Record<Quantity, string>>;
  constraints?: Partial<Record<Quantity, number>>;
  valueEnabled?: Partial<Record<Quantity, boolean>>;
}

export interface Terminal {
  componentId: string;
  index: number;
  x: number;
  y: number;
}

export const COMPONENT_LENGTH = 80; // distance between two terminals
export const GRID = 20;
export const GATE_LENGTH = 160;
export const CONNECTION_SNAP_DISTANCE = GRID * 1.5;

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

// Multi-terminal connectors (junction nodes). All terminals share a node
// (no resistance). Used for L corners, T-joints and + crossings.
const CONNECTOR_OFFSETS: Partial<Record<ComponentType, { x: number; y: number }[]>> = {
  wire_corner: [
    { x: -40, y: 0 },
    { x: 0, y: -40 },
  ],
  wire_t: [
    { x: -40, y: 0 },
    { x: 40, y: 0 },
    { x: 0, y: -40 },
  ],
  wire_plus: [
    { x: -40, y: 0 },
    { x: 40, y: 0 },
    { x: 0, y: -40 },
    { x: 0, y: 40 },
  ],
};

export function isConnector(t: ComponentType): boolean {
  return t === "wire_corner" || t === "wire_t" || t === "wire_plus";
}

export function isLogicGate(t: ComponentType): boolean {
  return (
    t === "gate_and" ||
    t === "gate_or" ||
    t === "gate_not" ||
    t === "gate_xor" ||
    t === "gate_nand" ||
    t === "gate_nor" ||
    t === "gate_buffer" ||
    t === "gate_xnor"
  );
}

export function gateInputCount(t: ComponentType): 1 | 2 {
  return t === "gate_not" || t === "gate_buffer" ? 1 : 2;
}

export function allTerminalPositions(c: PlacedComponent): { x: number; y: number }[] {
  const offs = CONNECTOR_OFFSETS[c.type];
  if (offs) {
    const rad = (c.rotation * Math.PI) / 180;
    const cos = Math.cos(rad),
      sin = Math.sin(rad);
    return offs.map((o) => ({ x: c.x + o.x * cos - o.y * sin, y: c.y + o.x * sin + o.y * cos }));
  }
  if (isLogicGate(c.type)) {
    const half = GATE_LENGTH / 2;
    const gateOffs =
      gateInputCount(c.type) === 1
        ? [
            { x: -half, y: 0 },
            { x: half, y: 0 },
          ]
        : [
            { x: -half, y: -COMPONENT_LENGTH / 2 },
            { x: -half, y: COMPONENT_LENGTH / 2 },
            { x: half, y: 0 },
          ];
    const rad = (c.rotation * Math.PI) / 180;
    const cos = Math.cos(rad),
      sin = Math.sin(rad);
    return gateOffs.map((o) => ({
      x: c.x + o.x * cos - o.y * sin,
      y: c.y + o.x * sin + o.y * cos,
    }));
  }
  const [t0, t1] = terminalPositions(c);
  return [
    { x: t0.x, y: t0.y },
    { x: t1.x, y: t1.y },
  ];
}

export function connectionSnapDelta(
  moving: PlacedComponent[],
  stationary: PlacedComponent[],
  maxDistance = CONNECTION_SNAP_DISTANCE,
): { x: number; y: number } | null {
  if (moving.length === 0 || stationary.length === 0) return null;
  const movingIds = new Set(moving.map((c) => c.id));
  const movingTerminals = moving.flatMap((c) => allTerminalPositions(c));
  const stationaryTerminals = stationary
    .filter((c) => !movingIds.has(c.id))
    .flatMap((c) => allTerminalPositions(c));
  let best: { x: number; y: number; d2: number } | null = null;
  const maxD2 = maxDistance * maxDistance;

  for (const movingTerminal of movingTerminals) {
    for (const stationaryTerminal of stationaryTerminals) {
      const dx = stationaryTerminal.x - movingTerminal.x;
      const dy = stationaryTerminal.y - movingTerminal.y;
      const d2 = dx * dx + dy * dy;
      if (d2 > maxD2 || (best && d2 >= best.d2)) continue;
      best = { x: dx, y: dy, d2 };
    }
  }

  return best ? { x: best.x, y: best.y } : null;
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
  if (isValidUnknownName(v)) return { kind: "error", message: "יש להזין מספר בלבד" };
  return {
    kind: "error",
    message: "יש להזין מספר בלבד",
  };
}

// pick a unique creative name for a new component
export function nextComponentName(type: ComponentType, existing: PlacedComponent[]): string {
  const prefix = NAME_PREFIX[type];
  let i = 1;
  const used = new Set(existing.map((c) => c.name));
  while (used.has(`${prefix}${i}`)) i++;
  return `${prefix}${i}`;
}
