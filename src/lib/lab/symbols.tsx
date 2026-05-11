// SVG renderings for each component type.
// Each symbol is drawn inside an 80x40 box centered at (0,0) with terminals
// at (-40, 0) and (+40, 0) so rotation works uniformly.
import type { ComponentType, PlacedComponent } from "./types";

interface Props {
  type: ComponentType;
  active?: boolean; // currently in a closed circuit
  closed?: boolean; // for switch
  bulbLit?: boolean;
  color?: string;
}

export function ComponentSymbol({ type, active, closed, bulbLit, color }: Props) {
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
      return (
        <g>
          <line x1={-40} y1={0} x2={-22} y2={0} stroke={stroke} strokeWidth={3} />
          <rect
            x={-22}
            y={-9}
            width={44}
            height={18}
            fill="transparent"
            stroke={stroke}
            strokeWidth={3}
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
            points={`-10,-10 -10,10 10,0`}
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
  return (
    <g>
      <line x1={-40} y1={0} x2={-16} y2={0} stroke={stroke} strokeWidth={3} />
      <circle
        cx={0}
        cy={0}
        r={16}
        fill="transparent"
        stroke={stroke}
        strokeWidth={3}
      />
      <text
        x={0}
        y={5}
        textAnchor="middle"
        fontSize={16}
        fontWeight={700}
        fill={stroke}
      >
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

// Wrap a placed component in a translated/rotated <g>.
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
