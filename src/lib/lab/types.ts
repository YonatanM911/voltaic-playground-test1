// Voltica Laboratories - core types for the circuit lab
// All physical components placed on the infinite canvas implement this shape.

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

// Which physical quantities can be edited per component type.
// A "true" means the user can supply a value or declare an unknown for it.
export interface CapabilityFlags {
  voltage: boolean;
  current: boolean;
  resistance: boolean;
}

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

// One component lives at (x,y), rotated by `rotation` degrees, with two
// terminals offset symmetrically on either side. The visible shape is drawn
// inside a 80x40 box around (x,y).
export interface PlacedComponent {
  id: string;
  type: ComponentType;
  x: number;
  y: number;
  rotation: 0 | 90 | 180 | 270;
  // user-supplied values; null means "no value", a string starting with a
  // letter means an unknown name (e.g. "t1").
  voltage: number | string | null;
  current: number | string | null;
  resistance: number | string | null;
  // for switches: open / closed
  closed?: boolean;
}

export interface Terminal {
  componentId: string;
  index: 0 | 1;
  x: number;
  y: number;
}

export const COMPONENT_LENGTH = 80; // distance between the two terminals
export const GRID = 20;

export function snap(v: number): number {
  return Math.round(v / GRID) * GRID;
}

// Returns the world-space positions of the two terminals of a component.
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
  // must start with English letter, then any english letters or digits
  return /^[A-Za-z][A-Za-z0-9_]*$/.test(name);
}

// Parse user input for a quantity field. Returns:
//  - number if numeric
//  - string if it's a valid unknown name
//  - null if empty
//  - { error } if invalid
export type FieldParse =
  | { kind: "number"; value: number }
  | { kind: "unknown"; name: string }
  | { kind: "empty" }
  | { kind: "error"; message: string };

export function parseField(raw: string): FieldParse {
  const v = raw.trim();
  if (v === "") return { kind: "empty" };
  if (!Number.isNaN(Number(v))) {
    const n = Number(v);
    if (!Number.isFinite(n)) return { kind: "error", message: "ערך לא חוקי" };
    return { kind: "number", value: n };
  }
  if (isValidUnknownName(v)) return { kind: "unknown", name: v };
  return {
    kind: "error",
    message: "נעלם חייב להתחיל באות באנגלית, ואז אותיות/ספרות בלבד",
  };
}
