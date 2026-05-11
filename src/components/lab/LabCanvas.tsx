import { useEffect, useRef, useState, useCallback } from "react";
import {
  COMPONENT_LENGTH,
  GRID,
  snap,
  type ComponentType,
  type PlacedComponent,
} from "@/lib/lab/types";
import { PlacedSymbol } from "@/lib/lab/symbols";
import type { SolveResult } from "@/lib/lab/solver";
import { PALETTE_DND_TYPE } from "./Palette";
import { Button } from "@/components/ui/button";
import { Copy, Trash2 } from "lucide-react";

export type Tool = "select" | "pan";

interface Props {
  components: PlacedComponent[];
  setComponents: (
    next: PlacedComponent[] | ((prev: PlacedComponent[]) => PlacedComponent[])
  ) => void;
  tool: Tool;
  solve: SolveResult;
  onQuickClick: (id: string) => void;
  onDropComponent: (type: ComponentType, world: { x: number; y: number }) => void;
  selectedIds: Set<string>;
  setSelectedIds: (ids: Set<string>) => void;
  onCopySelected: () => void;
  onDeleteSelected: () => void;
}

interface View {
  x: number;
  y: number;
}

interface DragState {
  kind: "pan" | "comp" | "marquee";
  compId?: string;
  startClient: { x: number; y: number };
  startView: View;
  startCompPos?: { x: number; y: number };
  startWorld?: { x: number; y: number };
  curWorld?: { x: number; y: number };
  startTime: number;
  moved: boolean;
  // for moving multiple selected
  groupStart?: Record<string, { x: number; y: number }>;
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
  onDropComponent,
  selectedIds,
  setSelectedIds,
  onCopySelected,
  onDeleteSelected,
}: Props) {
  const [view, setView] = useState<View>({ x: 0, y: 0 });
  const [size, setSize] = useState({ w: 800, h: 600 });
  const dragRef = useRef<DragState | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [marquee, setMarquee] = useState<{
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  } | null>(null);

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
    if (tool === "pan") {
      dragRef.current = {
        kind: "pan",
        startClient: { x: e.clientX, y: e.clientY },
        startView: view,
        startTime: performance.now(),
        moved: false,
      };
    } else {
      const target = pickComponent(components, wx, wy);
      if (target) {
        // if not in selection, replace selection with this component
        let nextSel = selectedIds;
        if (!selectedIds.has(target.id)) {
          nextSel = new Set([target.id]);
          setSelectedIds(nextSel);
        }
        const groupStart: Record<string, { x: number; y: number }> = {};
        components.forEach((c) => {
          if (nextSel.has(c.id)) groupStart[c.id] = { x: c.x, y: c.y };
        });
        dragRef.current = {
          kind: "comp",
          compId: target.id,
          startClient: { x: e.clientX, y: e.clientY },
          startView: view,
          startCompPos: { x: target.x, y: target.y },
          startTime: performance.now(),
          moved: false,
          groupStart,
        };
      } else {
        // start marquee
        setSelectedIds(new Set());
        setMarquee({ x1: wx, y1: wy, x2: wx, y2: wy });
        dragRef.current = {
          kind: "marquee",
          startClient: { x: e.clientX, y: e.clientY },
          startView: view,
          startWorld: { x: wx, y: wy },
          curWorld: { x: wx, y: wy },
          startTime: performance.now(),
          moved: false,
        };
      }
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
      setView({ x: d.startView.x + dx, y: d.startView.y + dy });
    } else if (d.kind === "comp" && d.startCompPos && d.compId) {
      const targetNx = snap(d.startCompPos.x + dx);
      const targetNy = snap(d.startCompPos.y + dy);
      const ddx = targetNx - d.startCompPos.x;
      const ddy = targetNy - d.startCompPos.y;
      const gs = d.groupStart;
      setComponents((prev) =>
        prev.map((c) => {
          if (gs && gs[c.id]) {
            return { ...c, x: gs[c.id].x + ddx, y: gs[c.id].y + ddy };
          }
          return c;
        })
      );
    } else if (d.kind === "marquee" && d.startWorld) {
      const w = toWorld(e.clientX, e.clientY);
      d.curWorld = w;
      setMarquee({
        x1: d.startWorld.x,
        y1: d.startWorld.y,
        x2: w.x,
        y2: w.y,
      });
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const d = dragRef.current;
    dragRef.current = null;
    if (!d) return;
    const elapsed = performance.now() - d.startTime;
    if (d.kind === "comp" && d.compId && !d.moved && elapsed < 200) {
      onQuickClick(d.compId);
    } else if (d.kind === "marquee" && d.startWorld && d.curWorld) {
      const minX = Math.min(d.startWorld.x, d.curWorld.x);
      const maxX = Math.max(d.startWorld.x, d.curWorld.x);
      const minY = Math.min(d.startWorld.y, d.curWorld.y);
      const maxY = Math.max(d.startWorld.y, d.curWorld.y);
      if (Math.abs(maxX - minX) < 4 && Math.abs(maxY - minY) < 4) {
        setMarquee(null);
        setSelectedIds(new Set());
      } else {
        const ids = new Set<string>();
        components.forEach((c) => {
          if (c.x >= minX && c.x <= maxX && c.y >= minY && c.y <= maxY) {
            ids.add(c.id);
          }
        });
        setSelectedIds(ids);
        // keep marquee rect visible until next action? clear it; selection rectangle will be drawn around items.
        setMarquee(null);
      }
    }
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  // Drop handling for palette drag
  const onDragOver = (e: React.DragEvent) => {
    if (Array.from(e.dataTransfer.types).includes(PALETTE_DND_TYPE)) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    }
  };
  const onDrop = (e: React.DragEvent) => {
    const t = e.dataTransfer.getData(PALETTE_DND_TYPE);
    if (!t) return;
    e.preventDefault();
    const w = toWorld(e.clientX, e.clientY);
    onDropComponent(t as ComponentType, { x: snap(w.x), y: snap(w.y) });
  };

  // grid
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

  // selection bbox for floating action bar
  let actionBar: { left: number; top: number } | null = null;
  if (selectedIds.size > 0) {
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity;
    components.forEach((c) => {
      if (!selectedIds.has(c.id)) return;
      minX = Math.min(minX, c.x - COMPONENT_LENGTH / 2);
      minY = Math.min(minY, c.y - 24);
      maxX = Math.max(maxX, c.x + COMPONENT_LENGTH / 2);
    });
    if (Number.isFinite(minX)) {
      actionBar = {
        left: view.x + (minX + maxX) / 2,
        top: view.y + minY - 44,
      };
    }
  }

  return (
    <div
      ref={wrapperRef}
      className="absolute inset-0 select-none overflow-hidden bg-background"
      style={{ cursor }}
      onDragOver={onDragOver}
      onDrop={onDrop}
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
            const color =
              sc?.inActiveLoop && sc.loopId != null
                ? solve.loopColors[sc.loopId]
                : undefined;
            const lit =
              c.type === "bulb" && sc?.inActiveLoop && (sc.current ?? 0) !== 0;
            const selected = selectedIds.has(c.id);
            return (
              <g key={c.id}>
                {selected && (
                  <rect
                    x={c.x - COMPONENT_LENGTH / 2 - 4}
                    y={c.y - 24}
                    width={COMPONENT_LENGTH + 8}
                    height={48}
                    fill="var(--primary)"
                    fillOpacity={0.08}
                    stroke="var(--primary)"
                    strokeWidth={1.2}
                    strokeDasharray="4 3"
                    rx={4}
                    transform={`rotate(${c.rotation} ${c.x} ${c.y})`}
                  />
                )}
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
          {marquee && (
            <rect
              x={Math.min(marquee.x1, marquee.x2)}
              y={Math.min(marquee.y1, marquee.y2)}
              width={Math.abs(marquee.x2 - marquee.x1)}
              height={Math.abs(marquee.y2 - marquee.y1)}
              fill="var(--primary)"
              fillOpacity={0.1}
              stroke="var(--primary)"
              strokeWidth={1}
              strokeDasharray="5 4"
            />
          )}
        </g>
      </svg>

      {actionBar && (
        <div
          dir="rtl"
          className="pointer-events-auto absolute z-20 flex -translate-x-1/2 items-center gap-1 rounded-md border border-border bg-card/95 p-1 shadow-lg backdrop-blur"
          style={{ left: actionBar.left, top: Math.max(8, actionBar.top) }}
        >
          <Button size="sm" variant="ghost" onClick={onCopySelected} title="העתק (Ctrl+D)">
            <Copy className="size-4" /> העתק
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={onDeleteSelected}
            title="מחק (Delete)"
          >
            <Trash2 className="size-4" /> מחק
          </Button>
          <span className="px-2 text-xs text-muted-foreground">
            {selectedIds.size} נבחרו
          </span>
        </div>
      )}
    </div>
  );
}
