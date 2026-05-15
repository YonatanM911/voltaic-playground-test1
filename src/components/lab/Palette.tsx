// Bottom palette of draggable components.
// On mobile we defer drag start until the pointer has moved a few pixels,
// so a horizontal swipe scrolls the palette instead of accidentally
// picking up a component. Pressing "R" / "ר" rotates the ghost while
// dragging.
import { useEffect, useRef, useState } from "react";
import type { ComponentType, PlacedComponent } from "@/lib/lab/types";
import { COMPONENT_LABEL_HE } from "@/lib/lab/types";
import { ComponentSymbol, PaletteSymbol } from "@/lib/lab/symbols";
import { Plus, GripHorizontal, ChevronDown, ChevronUp } from "lucide-react";

const PALETTE_ITEMS: ComponentType[] = [
  "wire",
  "battery",
  "resistor",
  "bulb",
  "switch",
  "diode",
  "ammeter",
  "voltmeter",
  "ohmmeter",
  "multimeter",
];

interface DropPayload {
  type: ComponentType;
  rotation: PlacedComponent["rotation"];
  clientX: number;
  clientY: number;
}

interface Props {
  onDrop: (p: DropPayload) => void;
  onOpenImport: () => void;
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
}

const DRAG_THRESHOLD = 8; // px before a press becomes a drag

export function Palette({ onDrop, onOpenImport, collapsed, setCollapsed }: Props) {
  const [drag, setDrag] = useState<{
    type: ComponentType;
    rotation: PlacedComponent["rotation"];
    x: number;
    y: number;
  } | null>(null);
  const dragRef = useRef(drag);
  dragRef.current = drag;

  // Pending press: tracks a pointerdown on a palette item that hasn't
  // yet exceeded the drag threshold. While pending, native touch scroll
  // is allowed so horizontal swipes scroll the palette.
  const pending = useRef<{
    type: ComponentType;
    startX: number;
    startY: number;
    pointerId: number;
  } | null>(null);

  useEffect(() => {
    const move = (e: PointerEvent) => {
      const p = pending.current;
      if (p && e.pointerId === p.pointerId) {
        const dx = e.clientX - p.startX;
        const dy = e.clientY - p.startY;
        // If the pointer moves mostly vertically (up off the bar), start
        // a drag. Horizontal motion is treated as scrolling the palette.
        if (Math.abs(dy) > DRAG_THRESHOLD || Math.abs(dy) > Math.abs(dx) * 0.8) {
          if (Math.hypot(dx, dy) > DRAG_THRESHOLD) {
            const type = p.type;
            pending.current = null;
            setDrag({ type, rotation: 0, x: e.clientX, y: e.clientY });
          }
        } else if (Math.abs(dx) > DRAG_THRESHOLD * 3) {
          // Long horizontal swipe — treat as scroll, abandon press.
          pending.current = null;
        }
        return;
      }
      const d = dragRef.current;
      if (!d) return;
      e.preventDefault();
      setDrag({ ...d, x: e.clientX, y: e.clientY });
    };
    const up = (e: PointerEvent) => {
      pending.current = null;
      const d = dragRef.current;
      setDrag(null);
      if (d) onDrop({ type: d.type, rotation: d.rotation, clientX: e.clientX, clientY: e.clientY });
    };
    const key = (e: KeyboardEvent) => {
      if (e.code === "KeyR" || e.key === "r" || e.key === "R" || e.key === "ר") {
        const d = dragRef.current;
        if (!d) return;
        const order: PlacedComponent["rotation"][] = [0, 90, 180, 270];
        setDrag({ ...d, rotation: order[(order.indexOf(d.rotation) + 1) % 4] });
        e.preventDefault();
      }
    };
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      window.removeEventListener("keydown", key);
    };
  }, [onDrop]);

  const beginPress = (e: React.PointerEvent, t: ComponentType) => {
    pending.current = { type: t, startX: e.clientX, startY: e.clientY, pointerId: e.pointerId };
  };

  return (
    <>
      <div
        dir="rtl"
        className="pointer-events-auto fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/90 backdrop-blur"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {collapsed ? (
          <div className="mx-auto flex max-w-screen-xl items-center justify-center px-3 py-2">
            <button
              type="button"
              onClick={() => setCollapsed(false)}
              className="flex items-center gap-2 rounded-full border border-border bg-background px-4 py-1.5 text-xs font-medium text-foreground shadow-sm transition hover:border-primary hover:bg-accent"
              title="הצג סרגל רכיבים"
            >
              <ChevronUp className="size-4" />
              הצג רכיבים
            </button>
          </div>
        ) : (
          <div
            className="mx-auto max-w-screen-xl overflow-x-auto overflow-y-hidden overscroll-contain px-3 py-2 [scrollbar-width:thin] [-webkit-overflow-scrolling:touch]"
            style={{ touchAction: "pan-x" }}
          >
            <div className="mb-2 flex min-w-max items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setCollapsed(true)}
                className="flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-[11px] text-foreground transition hover:border-primary hover:bg-accent"
                title="הסתר סרגל"
              >
                <ChevronDown className="size-3.5" />
                הסתר
              </button>
              <div className="flex h-5 flex-1 items-center justify-center rounded-full bg-primary/25 ring-1 ring-primary/40">
                <GripHorizontal className="size-4 text-primary" />
              </div>
              <span className="w-[64px]" />
            </div>
            <div className="flex min-w-max items-stretch gap-2 pb-1">
              <button
                type="button"
                onClick={onOpenImport}
                className="flex min-w-[104px] select-none flex-col items-center justify-center gap-1 rounded-md border border-border bg-background px-3 py-3 text-foreground transition hover:border-primary hover:bg-accent"
                title="הוספה וייבוא"
              >
                <div className="flex h-10 items-center justify-center">
                  <Plus className="size-7" />
                </div>
                <div className="text-[11px] font-medium">הוספה</div>
              </button>
              {PALETTE_ITEMS.map((t) => (
                <button
                  key={t}
                  type="button"
                  onPointerDown={(e) => beginPress(e, t)}
                  style={{ touchAction: "pan-x" }}
                  className="flex min-w-[104px] cursor-grab select-none flex-col items-center justify-center gap-1 rounded-md border border-border bg-background px-3 py-3 text-foreground transition hover:border-primary hover:bg-accent active:cursor-grabbing"
                  title="גרור מעלה אל הלוח (R לסיבוב בזמן גרירה)"
                >
                  <div className="flex h-10 items-center justify-center">
                    <PaletteSymbol type={t} />
                  </div>
                  <div className="text-[11px] font-medium">{COMPONENT_LABEL_HE[t]}</div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {drag && (
        <div
          className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-1/2 text-foreground"
          style={{ left: drag.x, top: drag.y }}
        >
          <svg width={88} height={88} viewBox="-44 -44 88 88">
            <g transform={`rotate(${drag.rotation})`}>
              <ComponentSymbol type={drag.type} />
            </g>
          </svg>
        </div>
      )}
    </>
  );
}
