import { useEffect, useRef, useState, useCallback } from "react";
import {
  COMPONENT_LENGTH,
  GRID,
  snap,
  type PlacedComponent,
} from "@/lib/lab/types";
import { PlacedSymbol } from "@/lib/lab/symbols";
import type { SolveResult } from "@/lib/lab/solver";

export type Tool = "select" | "pan";

interface Props {
  components: PlacedComponent[];
  setComponents: (
    next: PlacedComponent[] | ((prev: PlacedComponent[]) => PlacedComponent[])
  ) => void;
  tool: Tool;
  solve: SolveResult;
  onQuickClick: (id: string) => void;
}

interface View {
  x: number;
  y: number;
}

interface DragState {
  kind: "pan" | "comp";
  compId?: string;
  startClient: { x: number; y: number };
  startView: View;
  startCompPos?: { x: number; y: number };
  startTime: number;
  moved: boolean;
}

// Returns the topmost component whose body overlaps the world point.
function pickComponent(
  components: PlacedComponent[],
  wx: number,
  wy: number
): PlacedComponent | null {
  for (let i = components.length - 1; i >= 0; i--) {
    const c = components[i];
    const dx = wx - c.x;
    const dy = wy - c.y;
    const rad = (-c.rotation * Math.PI) / 180;
    const lx = dx * Math.cos(rad) - dy * Math.sin(rad);
    const ly = dx * Math.sin(rad) + dy * Math.cos(rad);
    if (Math.abs(lx) <= COMPONENT_LENGTH / 2 && Math.abs(ly) <= 22) {
      return c;
    }
  }
  return null;
}

export function LabCanvas({
  components,
  setComponents,
  tool,
  solve,
  onQuickClick,
}: Props) {
  const [view, setView] = useState<View>({ x: 0, y: 0 });
  const [size, setSize] = useState({ w: 800, h: 600 });
  const dragRef = useRef<DragState | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const update = () => {
      if (!wrapperRef.current) return;
      const r = wrapperRef.current.getBoundingClientRect();
      setSize({ w: r.width, h: r.height });
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const toWorld = useCallback(
    (clientX: number, clientY: number) => {
      const r = wrapperRef.current?.getBoundingClientRect();
      const ox = r?.left ?? 0;
      const oy = r?.top ?? 0;
      return { x: clientX - ox - view.x, y: clientY - oy - view.y };
    },
    [view]
  );

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const { x: wx, y: wy } = toWorld(e.clientX, e.clientY);
    const target = tool === "select" ? pickComponent(components, wx, wy) : null;
    if (target) {
      dragRef.current = {
        kind: "comp",
        compId: target.id,
        startClient: { x: e.clientX, y: e.clientY },
        startView: view,
        startCompPos: { x: target.x, y: target.y },
        startTime: performance.now(),
        moved: false,
      };
    } else {
      dragRef.current = {
        kind: "pan",
        startClient: { x: e.clientX, y: e.clientY },
        startView: view,
        startTime: performance.now(),
        moved: false,
      };
    }
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.startClient.x;
    const dy = e.clientY - d.startClient.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true;
    if (d.kind === "pan") {
      // panning is only allowed in pan mode (per spec, grab tool moves screen)
      if (tool !== "pan") return;
      setView({ x: d.startView.x + dx, y: d.startView.y + dy });
    } else if (d.kind === "comp" && d.startCompPos && d.compId) {
      const nx = snap(d.startCompPos.x + dx);
      const ny = snap(d.startCompPos.y + dy);
      setComponents((prev) =>
        prev.map((c) => (c.id === d.compId ? { ...c, x: nx, y: ny } : c))
      );
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const d = dragRef.current;
    dragRef.current = null;
    if (!d) return;
    const elapsed = performance.now() - d.startTime;
    if (!d.moved && elapsed < 200 && d.kind === "comp" && d.compId) {
      onQuickClick(d.compId);
    }
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  // Background grid extends well beyond the visible area for the illusion of
  // infinity. We render two perpendicular sets of lines based on the current
  // view offset.
  const gridLines: React.ReactNode[] = [];
  const startX = -view.x - GRID * 20;
  const startY = -view.y - GRID * 20;
  const endX = -view.x + size.w + GRID * 20;
  const endY = -view.y + size.h + GRID * 20;
  for (let x = Math.floor(startX / GRID) * GRID; x < endX; x += GRID) {
    gridLines.push(
      <line
        key={`vx${x}`}
        x1={x}
        y1={startY}
        x2={x}
        y2={endY}
        stroke="var(--grid)"
        strokeWidth={x % (GRID * 5) === 0 ? 0.6 : 0.3}
      />
    );
  }
  for (let y = Math.floor(startY / GRID) * GRID; y < endY; y += GRID) {
    gridLines.push(
      <line
        key={`hy${y}`}
        x1={startX}
        y1={y}
        x2={endX}
        y2={y}
        stroke="var(--grid)"
        strokeWidth={y % (GRID * 5) === 0 ? 0.6 : 0.3}
      />
    );
  }

  const cursor = tool === "pan" ? "grab" : "default";

  const isMeter = (t: PlacedComponent["type"]) =>
    t === "ammeter" ||
    t === "voltmeter" ||
    t === "ohmmeter" ||
    t === "multimeter";

  const meterReading = (c: PlacedComponent): string => {
    const sc = solve.components[c.id];
    if (!sc || !sc.inActiveLoop) return "—";
    const fmt = (n: number, u: string) =>
      `${Number.isInteger(n) ? n : n.toFixed(2)} ${u}`;
    if (c.type === "ammeter")
      return sc.current != null ? fmt(sc.current, "A") : "—";
    if (c.type === "voltmeter")
      return sc.voltage != null ? fmt(sc.voltage, "V") : "—";
    if (c.type === "ohmmeter")
      return sc.resistance != null ? fmt(sc.resistance, "Ω") : "—";
    if (c.type === "multimeter") {
      const parts: string[] = [];
      if (sc.voltage != null) parts.push(fmt(sc.voltage, "V"));
      if (sc.current != null) parts.push(fmt(sc.current, "A"));
      if (sc.resistance != null) parts.push(fmt(sc.resistance, "Ω"));
      return parts.length ? parts.join(" / ") : "—";
    }
    return "—";
  };

  return (
    <div
      ref={wrapperRef}
      className="absolute inset-0 select-none overflow-hidden bg-background"
      style={{ cursor }}
    >
      <svg
        width={size.w}
        height={size.h}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={{ touchAction: "none" }}
      >
        <g transform={`translate(${view.x}, ${view.y})`}>
          {gridLines}
          {components.map((c) => {
            const sc = solve.components[c.id];
            const color = sc?.inActiveLoop && sc.loopId != null
              ? solve.loopColors[sc.loopId]
              : undefined;
            const lit = c.type === "bulb" && sc?.inActiveLoop && (sc.current ?? 0) !== 0;
            return (
              <g key={c.id}>
                <PlacedSymbol c={c} color={color} bulbLit={lit} />
                {isMeter(c.type) && (
                  <text
                    x={c.x}
                    y={c.y - 28}
                    textAnchor="middle"
                    fontSize={12}
                    fontWeight={600}
                    fill="var(--foreground)"
                  >
                    {meterReading(c)}
                  </text>
                )}
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}
