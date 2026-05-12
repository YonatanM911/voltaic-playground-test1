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
    case "battery":
      return (
        <g>
          <line x1={-40} y1={0} x2={-6} y2={0} stroke={stroke} strokeWidth={3} />
          <line x1={6} y1={0} x2={40} y2={0} stroke={stroke} strokeWidth={3} />
          <line x1={-6} y1={-14} x2={-6} y2={14} stroke={stroke} strokeWidth={3} />
          <line x1={6} y1={-8} x2={6} y2={8} stroke={stroke} strokeWidth={5} />
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
  }
  return null;
}

function meterSymbol(letter: string, stroke: string) {
  // The "display bar" (needle/face line) sits along the wire axis so when
  // the meter rotates the bar rotates with it.
  return (
    <g>
      <line x1={-40} y1={0} x2={-16} y2={0} stroke={stroke} strokeWidth={3} />
      <circle cx={0} cy={0} r={16} fill="transparent" stroke={stroke} strokeWidth={3} />
      {/* Internal display bar — rotates together with the body */}
      <line x1={-10} y1={-7} x2={10} y2={-7} stroke={stroke} strokeWidth={1.5} opacity={0.6} />
      <text x={0} y={6} textAnchor="middle" fontSize={14} fontWeight={700} fill={stroke}>
        {letter}
      </text>
      <line x1={16} y1={0} x2={40} y2={0} stroke={stroke} strokeWidth={3} />
    </g>
  );
}

// Small symbol for the bottom palette (no rotation).
export function PaletteSymbol({ type }: { type: ComponentType }) {
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
