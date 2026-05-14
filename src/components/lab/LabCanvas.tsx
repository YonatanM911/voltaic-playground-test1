// Voltica Laboratories — infinite canvas with pan, pinch/wheel zoom,
// component placement, marquee selection, search highlighting, and circuit warnings.
//
// Mobile-first: every gesture goes through pointer events with passive
// touch support; pinch zoom is implemented manually (two-finger gesture).

import { useEffect, useRef, useState, useCallback } from "react";
import { COMPONENT_LENGTH, GRID, snap, type PlacedComponent } from "@/lib/lab/types";
import { PlacedSymbol } from "@/lib/lab/symbols";
import type { SolveResult } from "@/lib/lab/solver";
import { Button } from "@/components/ui/button";
import { Copy, Trash2, RotateCw, Save } from "lucide-react";
import type { AppSettings } from "@/lib/lab/settingsStore";

export type Tool = "select" | "pan";

interface Props {
  components: PlacedComponent[];
  setComponents: (
    next: PlacedComponent[] | ((prev: PlacedComponent[]) => PlacedComponent[]),
  ) => void;
  tool: Tool;
  solve: SolveResult;
  onQuickClick: (id: string) => void;
  selectedIds: Set<string>;
  setSelectedIds: (ids: Set<string>) => void;
  onCopySelected: () => void;
  onDeleteSelected: () => void;
  onRotateSelected: () => void;
  onSaveSelected: () => void;
  view: { x: number; y: number; zoom: number };
  setView: (v: { x: number; y: number; zoom: number }) => void;
  // ids that match the current search query (highlighted in a special color)
  searchHits: Set<string>;
  settings: AppSettings;
}

interface DragState {
  kind: "pan" | "comp" | "marquee";
  compId?: string;
  startClient: { x: number; y: number };
  startView: { x: number; y: number };
  startCompPos?: { x: number; y: number };
  startWorld?: { x: number; y: number };
  curWorld?: { x: number; y: number };
  startTime: number;
  moved: boolean;
  groupStart?: Record<string, { x: number; y: number }>;
}

function pickComponent(
  components: PlacedComponent[],
  wx: number,
  wy: number,
): PlacedComponent | null {
  for (let i = components.length - 1; i >= 0; i--) {
    const c = components[i];
    const dx = wx - c.x;
    const dy = wy - c.y;
    const rad = (-c.rotation * Math.PI) / 180;
    const lx = dx * Math.cos(rad) - dy * Math.sin(rad);
    const ly = dx * Math.sin(rad) + dy * Math.cos(rad);
    if (Math.abs(lx) <= COMPONENT_LENGTH / 2 && Math.abs(ly) <= 22) return c;
  }
  return null;
}

export function LabCanvas({
  components,
  setComponents,
  tool,
  solve,
  onQuickClick,
  selectedIds,
  setSelectedIds,
  onCopySelected,
  onDeleteSelected,
  onRotateSelected,
  onSaveSelected,
  view,
  setView,
  searchHits,
  settings,
}: Props) {
  const [size, setSize] = useState({ w: 800, h: 600 });
  const wrapperRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const pinchRef = useRef<{ d: number; cx: number; cy: number; zoom: number } | null>(null);
  const pointers = useRef<Map<number, { x: number; y: number }>>(new Map());
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
      return {
        x: (clientX - ox - view.x) / view.zoom,
        y: (clientY - oy - view.y) / view.zoom,
      };
    },
    [view],
  );

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const pts = Array.from(pointers.current.values());
      const dx = pts[0].x - pts[1].x;
      const dy = pts[0].y - pts[1].y;
      pinchRef.current = {
        d: Math.hypot(dx, dy),
        cx: (pts[0].x + pts[1].x) / 2,
        cy: (pts[0].y + pts[1].y) / 2,
        zoom: view.zoom,
      };
      dragRef.current = null;
      return;
    }
    const { x: wx, y: wy } = toWorld(e.clientX, e.clientY);
    if (tool === "pan") {
      dragRef.current = {
        kind: "pan",
        startClient: { x: e.clientX, y: e.clientY },
        startView: { x: view.x, y: view.y },
        startTime: performance.now(),
        moved: false,
      };
    } else {
      const target = pickComponent(components, wx, wy);
      if (target) {
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
          startView: { x: view.x, y: view.y },
          startCompPos: { x: target.x, y: target.y },
          startTime: performance.now(),
          moved: false,
          groupStart,
        };
      } else {
        setSelectedIds(new Set());
        setMarquee({ x1: wx, y1: wy, x2: wx, y2: wy });
        dragRef.current = {
          kind: "marquee",
          startClient: { x: e.clientX, y: e.clientY },
          startView: { x: view.x, y: view.y },
          startWorld: { x: wx, y: wy },
          curWorld: { x: wx, y: wy },
          startTime: performance.now(),
          moved: false,
        };
      }
    }
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (pointers.current.has(e.pointerId)) {
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }
    // Pinch zoom
    if (pinchRef.current && pointers.current.size === 2) {
      const pts = Array.from(pointers.current.values());
      const dx = pts[0].x - pts[1].x;
      const dy = pts[0].y - pts[1].y;
      const d = Math.hypot(dx, dy);
      const ratio = d / pinchRef.current.d;
      const newZoom = Math.max(0.2, Math.min(4, pinchRef.current.zoom * ratio));
      // zoom around pinch center
      const r = wrapperRef.current?.getBoundingClientRect();
      const ox = r?.left ?? 0;
      const oy = r?.top ?? 0;
      const cx = pinchRef.current.cx - ox;
      const cy = pinchRef.current.cy - oy;
      const wx = (cx - view.x) / view.zoom;
      const wy = (cy - view.y) / view.zoom;
      const nx = cx - wx * newZoom;
      const ny = cy - wy * newZoom;
      setView({ x: nx, y: ny, zoom: newZoom });
      return;
    }
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.startClient.x;
    const dy = e.clientY - d.startClient.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true;
    if (d.kind === "pan") {
      setView({ x: d.startView.x + dx, y: d.startView.y + dy, zoom: view.zoom });
    } else if (d.kind === "comp" && d.startCompPos && d.compId) {
      const wdx = dx / view.zoom;
      const wdy = dy / view.zoom;
      const targetNx = snap(d.startCompPos.x + wdx);
      const targetNy = snap(d.startCompPos.y + wdy);
      const ddx = targetNx - d.startCompPos.x;
      const ddy = targetNy - d.startCompPos.y;
      const gs = d.groupStart;
      setComponents((prev) =>
        prev.map((c) => (gs && gs[c.id] ? { ...c, x: gs[c.id].x + ddx, y: gs[c.id].y + ddy } : c)),
      );
    } else if (d.kind === "marquee" && d.startWorld) {
      const w = toWorld(e.clientX, e.clientY);
      d.curWorld = w;
      setMarquee({ x1: d.startWorld.x, y1: d.startWorld.y, x2: w.x, y2: w.y });
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinchRef.current = null;
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
          if (c.x >= minX && c.x <= maxX && c.y >= minY && c.y <= maxY) ids.add(c.id);
        });
        setSelectedIds(ids);
        setMarquee(null);
      }
    }
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  // Wheel zoom
  const onWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey || Math.abs(e.deltaY) > 0) {
      const r = wrapperRef.current?.getBoundingClientRect();
      const ox = r?.left ?? 0;
      const oy = r?.top ?? 0;
      const cx = e.clientX - ox;
      const cy = e.clientY - oy;
      const wx = (cx - view.x) / view.zoom;
      const wy = (cy - view.y) / view.zoom;
      const factor = Math.exp(-e.deltaY * 0.0015);
      const newZoom = Math.max(0.2, Math.min(4, view.zoom * factor));
      setView({ x: cx - wx * newZoom, y: cy - wy * newZoom, zoom: newZoom });
    }
  };

  // Build grid lines for visible area.
  const gridLines: React.ReactNode[] = [];
  const startX = -view.x / view.zoom - GRID * 20;
  const startY = -view.y / view.zoom - GRID * 20;
  const endX = startX + size.w / view.zoom + GRID * 40;
  const endY = startY + size.h / view.zoom + GRID * 40;
  for (let x = Math.floor(startX / GRID) * GRID; x < endX; x += GRID) {
    gridLines.push(
      <line
        key={`vx${x}`}
        x1={x}
        y1={startY}
        x2={x}
        y2={endY}
        stroke="var(--grid)"
        strokeWidth={(x % (GRID * 5) === 0 ? 0.6 : 0.3) / view.zoom}
      />,
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
        strokeWidth={(y % (GRID * 5) === 0 ? 0.6 : 0.3) / view.zoom}
      />,
    );
  }

  const cursor = tool === "pan" ? "grab" : "default";

  const isMeter = (t: PlacedComponent["type"]) =>
    t === "ammeter" ||
    t === "voltmeter" ||
    t === "ohmmeter" ||
    t === "multimeter" ||
    t.startsWith("gate_");

  // Format a meter reading using settings/per-component unit overrides.
  const meterReading = (c: PlacedComponent): string => {
    const sc = solve.components[c.id];
    if (!sc) return "—";
    const hasReading = sc.voltage != null || sc.current != null || sc.resistance != null;
    if (!hasReading) return "—";
    const pickUnit = (q: "voltage" | "current" | "resistance") =>
      c.unitOverrides?.[q] ?? settings.defaultUnit[q];
    const fmt = (v: number | null, q: "voltage" | "current" | "resistance"): string => {
      if (v == null) return "—";
      const u = pickUnit(q);
      const factor = unitFactor(u, q);
      const display = v / factor;
      const abs = Math.abs(display);
      const str =
        abs >= 100
          ? display.toFixed(0)
          : abs >= 10
            ? display.toFixed(1)
            : abs >= 1
              ? display.toFixed(2)
              : display.toFixed(3);
      return `${str} ${u}`;
    };
    if (c.type === "ammeter") return fmt(sc.current, "current");
    if (c.type === "voltmeter") return fmt(sc.voltage, "voltage");
    if (c.type === "ohmmeter") return fmt(sc.resistance, "resistance");
    if (c.type === "multimeter") {
      if (c.meterMode === "current") return fmt(sc.current, "current");
      if (c.meterMode === "resistance") return fmt(sc.resistance, "resistance");
      return fmt(sc.voltage, "voltage");
    }
    if (c.type.startsWith("gate_"))
      return sc.voltage == null ? "-" : `OUT ${sc.voltage >= 0.5 ? 1 : 0}`;
    return "-";
  };

  // floating action bar position (in screen coords)
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
        left: view.x + ((minX + maxX) / 2) * view.zoom,
        top: view.y + minY * view.zoom - 44,
      };
    }
  }

  return (
    <div
      ref={wrapperRef}
      className="absolute inset-0 select-none overflow-hidden bg-background"
      style={{ cursor, touchAction: "none" }}
      onWheel={onWheel}
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
        <g transform={`translate(${view.x}, ${view.y}) scale(${view.zoom})`}>
          {gridLines}
          {components.map((c) => {
            const sc = solve.components[c.id];
            const baseColor =
              sc?.inActiveLoop && sc.loopId != null ? solve.loopColors[sc.loopId] : undefined;
            const isHit = searchHits.has(c.id);
            const color = isHit ? "oklch(0.85 0.22 60)" : baseColor;
            const lit = c.type === "bulb" && sc?.inActiveLoop && (sc.current ?? 0) !== 0;
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
                {isHit && !selected && (
                  <rect
                    x={c.x - COMPONENT_LENGTH / 2 - 6}
                    y={c.y - 26}
                    width={COMPONENT_LENGTH + 12}
                    height={52}
                    fill="oklch(0.85 0.22 60)"
                    fillOpacity={0.12}
                    stroke="oklch(0.85 0.22 60)"
                    strokeWidth={1.5}
                    rx={6}
                    transform={`rotate(${c.rotation} ${c.x} ${c.y})`}
                  />
                )}
                <PlacedSymbol c={c} color={color} bulbLit={lit} />
                {settings.showNames && (
                  <text
                    x={c.x}
                    y={c.y + 30}
                    textAnchor="middle"
                    fontSize={10}
                    fill="var(--muted-foreground)"
                  >
                    {c.name}
                  </text>
                )}
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

          {/* Open circuit warnings */}
          {solve.openWarnings.map((w, i) => {
            const label =
              w.reason === "missing_consumer"
                ? "חסר צרכן"
                : w.reason === "missing_source"
                  ? "חסר ספק"
                  : w.reason === "switch_open"
                    ? "מפסק פתוח"
                    : "מעגל פתוח";
            const wid = label.length * 8 + 22;
            return (
              <g key={`ow${i}`}>
                <rect
                  x={w.centerX - wid / 2}
                  y={w.centerY - 12}
                  width={wid}
                  height={20}
                  rx={4}
                  fill="var(--destructive)"
                  opacity={0.92}
                />
                <text
                  x={w.centerX}
                  y={w.centerY + 3}
                  textAnchor="middle"
                  fontSize={11}
                  fontWeight={700}
                  fill="var(--destructive-foreground)"
                >
                  {label}
                </text>
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
              strokeWidth={1 / view.zoom}
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
          <Button size="sm" variant="ghost" onClick={onRotateSelected} title="סובב 90° (R)">
            <RotateCw className="size-4" /> סובב
          </Button>
          <Button size="sm" variant="ghost" onClick={onCopySelected} title="העתק (Ctrl+C/D)">
            <Copy className="size-4" /> העתק
          </Button>
          <Button size="sm" variant="ghost" onClick={onSaveSelected} title="שמור מבנה מסומן">
            <Save className="size-4" /> שמור
          </Button>
          <Button size="sm" variant="ghost" onClick={onDeleteSelected} title="מחק (Delete)">
            <Trash2 className="size-4" /> מחק
          </Button>
          <span className="px-2 text-xs text-muted-foreground">{selectedIds.size} נבחרו</span>
        </div>
      )}
    </div>
  );
}

// (re-imported here to avoid a separate file just for unit factor used in formatting)
import { unitFactor } from "@/lib/lab/units";
