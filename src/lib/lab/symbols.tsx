// SVG renderings for each component type.
// Each symbol is drawn inside a 80x40 box centered at (0,0) with terminals
// at (-40, 0) and (+40, 0). Rotation is applied at the group level by
// PlacedSymbol so that the entire shape rotates as a rigid body.
import type { ComponentType, PlacedComponent } from "./types";

interface Props {
  type: ComponentType;
  active?: boolean;
  closed?: boolean;
  bulbLit?: boolean;
  color?: string;
  rotation?: number; // for symbols that need internal counter-rotation (none currently)
}

export function ComponentSymbol({ type, closed, bulbLit, color }: Props) {
  const stroke = color ?? "currentColor";
  switch (type) {
    case "wire":
      return (
        <g>
          <line x1={-40} y1={0} x2={40} y2={0} stroke={stroke} strokeWidth={3} />
        </g>
      );
    case "wire_corner":
      return (
        <g>
          <line x1={-40} y1={0} x2={0} y2={0} stroke={stroke} strokeWidth={3} />
          <line x1={0} y1={0} x2={0} y2={-40} stroke={stroke} strokeWidth={3} />
          <circle cx={0} cy={0} r={3.5} fill={stroke} />
        </g>
      );
    case "wire_t":
      return (
        <g>
          <line x1={-40} y1={0} x2={40} y2={0} stroke={stroke} strokeWidth={3} />
          <line x1={0} y1={0} x2={0} y2={-40} stroke={stroke} strokeWidth={3} />
          <circle cx={0} cy={0} r={3.5} fill={stroke} />
        </g>
      );
    case "wire_plus":
      return (
        <g>
          <line x1={-40} y1={0} x2={40} y2={0} stroke={stroke} strokeWidth={3} />
          <line x1={0} y1={-40} x2={0} y2={40} stroke={stroke} strokeWidth={3} />
          <circle cx={0} cy={0} r={3.5} fill={stroke} />
        </g>
      );
    case "battery":
      return (
        <g>
          <line x1={-40} y1={0} x2={-6} y2={0} stroke={stroke} strokeWidth={3} />
          <line x1={6} y1={0} x2={40} y2={0} stroke={stroke} strokeWidth={3} />
          <line x1={-6} y1={-14} x2={-6} y2={14} stroke={stroke} strokeWidth={3} />
          <line x1={6} y1={-8} x2={6} y2={8} stroke={stroke} strokeWidth={5} />
          <text x={-14} y={-18} textAnchor="middle" fontSize={14} fontWeight={700} fill={stroke}>−</text>
          <text x={14} y={-18} textAnchor="middle" fontSize={14} fontWeight={700} fill={stroke}>+</text>
        </g>
      );
    case "resistor":
      // IEC zigzag (קווקוו) symbol.
      return (
        <g>
          <line x1={-40} y1={0} x2={-22} y2={0} stroke={stroke} strokeWidth={3} />
          <polyline
            points="-22,0 -18,-9 -12,9 -6,-9 0,9 6,-9 12,9 18,-9 22,0"
            fill="none"
            stroke={stroke}
            strokeWidth={3}
            strokeLinejoin="round"
          />
          <line x1={22} y1={0} x2={40} y2={0} stroke={stroke} strokeWidth={3} />
        </g>
      );
    case "bulb":
      return (
        <g>
          <line x1={-40} y1={0} x2={-14} y2={0} stroke={stroke} strokeWidth={3} />
          <circle
            cx={0}
            cy={0}
            r={14}
            fill={bulbLit ? "oklch(0.85 0.18 90)" : "transparent"}
            stroke={stroke}
            strokeWidth={3}
          />
          <line x1={-10} y1={-10} x2={10} y2={10} stroke={stroke} strokeWidth={2} />
          <line x1={-10} y1={10} x2={10} y2={-10} stroke={stroke} strokeWidth={2} />
          <line x1={14} y1={0} x2={40} y2={0} stroke={stroke} strokeWidth={3} />
        </g>
      );
    case "switch":
      return (
        <g>
          <line x1={-40} y1={0} x2={-14} y2={0} stroke={stroke} strokeWidth={3} />
          <circle cx={-14} cy={0} r={3} fill={stroke} />
          <circle cx={14} cy={0} r={3} fill={stroke} />
          {closed ? (
            <line x1={-14} y1={0} x2={14} y2={0} stroke={stroke} strokeWidth={3} />
          ) : (
            <line x1={-14} y1={0} x2={12} y2={-14} stroke={stroke} strokeWidth={3} />
          )}
          <line x1={14} y1={0} x2={40} y2={0} stroke={stroke} strokeWidth={3} />
        </g>
      );
    case "diode":
      return (
        <g>
          <line x1={-40} y1={0} x2={-10} y2={0} stroke={stroke} strokeWidth={3} />
          <polygon
            points="-10,-10 -10,10 10,0"
            fill={stroke}
            stroke={stroke}
            strokeWidth={2}
          />
          <line x1={10} y1={-10} x2={10} y2={10} stroke={stroke} strokeWidth={3} />
          <line x1={10} y1={0} x2={40} y2={0} stroke={stroke} strokeWidth={3} />
        </g>
      );
    case "ammeter":
      return meterSymbol("A", stroke);
    case "voltmeter":
      return meterSymbol("V", stroke);
    case "ohmmeter":
      return meterSymbol("Ω", stroke);
    case "multimeter":
      return meterSymbol("M", stroke);
    case "gate_and":
      return gateSymbol("and", stroke);
    case "gate_or":
      return gateSymbol("or", stroke);
    case "gate_not":
      return gateSymbol("not", stroke);
    case "gate_xor":
      return gateSymbol("xor", stroke);
    case "gate_nand":
      return gateSymbol("nand", stroke);
    case "gate_nor":
      return gateSymbol("nor", stroke);
    case "gate_buffer":
      return gateSymbol("buffer", stroke);
    case "gate_xnor":
      return gateSymbol("xnor", stroke);
  }
  return null;
}

type GateKind = "and" | "or" | "not" | "xor" | "nand" | "nor" | "buffer" | "xnor";

// Universal (ANSI/IEEE distinctive shape) logic-gate symbols.
// All centered in the standard 80×40 box with terminals at (-40,0) and (+40,0).
function gateSymbol(kind: GateKind, stroke: string) {
  // Body geometry: x ∈ [-22, 22], outer terminal stubs reach to ±40.
  const inverted = kind === "nand" || kind === "nor" || kind === "not" || kind === "xnor";
  const bodyEnd = 22;
  const tipX = inverted ? bodyEnd - 4 : bodyEnd; // dot sits past the body
  const dot = inverted ? (
    <circle cx={bodyEnd + 2} cy={0} r={3.2} fill="none" stroke={stroke} strokeWidth={2} />
  ) : null;
  // Right-side stub from end of body (or after dot) to +40
  const rightStubStart = inverted ? bodyEnd + 5 : bodyEnd;
  const rightStub = (
    <line x1={rightStubStart} y1={0} x2={40} y2={0} stroke={stroke} strokeWidth={3} />
  );

  if (kind === "not" || kind === "buffer") {
    // Triangle (single input): -22..18 body, tip at 18 (or 18+dot for NOT)
    const tip = inverted ? 14 : 18;
    return (
      <g>
        <line x1={-40} y1={0} x2={-22} y2={0} stroke={stroke} strokeWidth={3} />
        <polygon
          points={`-22,-16 -22,16 ${tip},0`}
          fill="none"
          stroke={stroke}
          strokeWidth={3}
          strokeLinejoin="round"
        />
        {inverted && (
          <circle cx={tip + 4} cy={0} r={3.2} fill="none" stroke={stroke} strokeWidth={2} />
        )}
        <line x1={inverted ? tip + 7 : tip} y1={0} x2={40} y2={0} stroke={stroke} strokeWidth={3} />
      </g>
    );
  }

  // Two-input style. Inputs at left, output at right tip.
  const inputStubsTop = (
    <>
      <line x1={-40} y1={-10} x2={-22} y2={-10} stroke={stroke} strokeWidth={3} />
      <line x1={-40} y1={10} x2={-22} y2={10} stroke={stroke} strokeWidth={3} />
      {/* For circuit continuity: tie both inputs into the single left terminal at (-40,0) */}
      <line x1={-40} y1={-10} x2={-40} y2={10} stroke={stroke} strokeWidth={3} />
    </>
  );

  if (kind === "and" || kind === "nand") {
    // D-shape: rectangle from -22..0, semicircle from 0..tipX
    const r = 16;
    return (
      <g>
        {inputStubsTop}
        <path
          d={`M -22 -16 L 0 -16 A ${r} ${r} 0 0 1 0 16 L -22 16 Z`}
          fill="none"
          stroke={stroke}
          strokeWidth={3}
          strokeLinejoin="round"
        />
        {dot}
        {rightStub}
      </g>
    );
  }

  if (kind === "or" || kind === "nor" || kind === "xor" || kind === "xnor") {
    // OR-shape: curved back, two side curves meeting at tip on right.
    const back = "M -22 -16 Q -10 0 -22 16";
    const top = `M -22 -16 Q 6 -16 ${tipX} 0`;
    const bot = `M -22 16 Q 6 16 ${tipX} 0`;
    const xorBack = (kind === "xor" || kind === "xnor") ? (
      <path d="M -28 -16 Q -16 0 -28 16" fill="none" stroke={stroke} strokeWidth={3} />
    ) : null;
    return (
      <g>
        {inputStubsTop}
        {xorBack}
        <path d={back} fill="none" stroke={stroke} strokeWidth={3} />
        <path d={top} fill="none" stroke={stroke} strokeWidth={3} />
        <path d={bot} fill="none" stroke={stroke} strokeWidth={3} />
        {dot}
        {rightStub}
      </g>
    );
  }

  return null;
}

function meterSymbol(letter: string, stroke: string) {
  return (
    <g>
      <line x1={-40} y1={0} x2={-18} y2={0} stroke={stroke} strokeWidth={3} />
      <circle cx={0} cy={0} r={16} fill="transparent" stroke={stroke} strokeWidth={3} />
      <text x={0} y={6} textAnchor="middle" fontSize={14} fontWeight={700} fill={stroke}>
        {letter}
      </text>
      <line x1={18} y1={0} x2={40} y2={0} stroke={stroke} strokeWidth={3} />
    </g>
  );
}

// Small symbol for the bottom palette (no rotation).
export function PaletteSymbol({ type }: { type: ComponentType }) {
  // Connectors (corner / T / +) extend upward to y=-40 from the (0,0) terminal,
  // so we use a taller viewBox and translate them down so the geometry sits
  // visually centered inside the palette tile.
  if (type === "wire_corner" || type === "wire_t" || type === "wire_plus") {
    if (type === "wire_plus") {
      // + junction is symmetric — square viewBox so the center dot sits centered.
      return (
        <svg viewBox="-44 -44 88 88" width={56} height={56}>
          <ComponentSymbol type={type} />
        </svg>
      );
    }
    return (
      <svg viewBox="-44 -44 88 64" width={70} height={48}>
        <g transform="translate(0, 6)">
          <ComponentSymbol type={type} />
        </g>
      </svg>
    );
  }
  return (
    <svg viewBox="-44 -22 88 44" width={70} height={36}>
      <ComponentSymbol type={type} />
    </svg>
  );
}

// Place a component at its world position and rotate the entire shape.
export function PlacedSymbol({
  c,
  color,
  bulbLit,
}: {
  c: PlacedComponent;
  color?: string;
  bulbLit?: boolean;
}) {
  return (
    <g transform={`translate(${c.x}, ${c.y}) rotate(${c.rotation})`}>
      <ComponentSymbol
        type={c.type}
        color={color}
        closed={c.closed}
        bulbLit={bulbLit}
      />
    </g>
  );
}
