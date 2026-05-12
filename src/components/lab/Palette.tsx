// Bottom palette of draggable components.
// Uses pointer events (works on both desktop mice and touch devices,
// unlike the HTML5 drag API which is unreliable on mobile). While
// dragging, pressing "R" / "ר" rotates the ghost so the component is
// placed in the chosen orientation as soon as it's released over the
// canvas.
import { useEffect, useRef, useState } from "react";
import type { ComponentType, PlacedComponent } from "@/lib/lab/types";
import { COMPONENT_LABEL_HE } from "@/lib/lab/types";
import { ComponentSymbol, PaletteSymbol } from "@/lib/lab/symbols";

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
  // The lab page subscribes to drops via a global event so the canvas
  // (which knows view/zoom) can convert client coords to world coords.
  onDrop: (p: DropPayload) => void;
}

export function Palette({ onDrop }: Props) {
  const [drag, setDrag] = useState<{
    type: ComponentType;
    rotation: PlacedComponent["rotation"];
    x: number;
    y: number;
  } | null>(null);
  const dragRef = useRef(drag);
  dragRef.current = drag;

  useEffect(() => {
    if (!drag) return;
    const move = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      setDrag({ ...d, x: e.clientX, y: e.clientY });
    };
    const up = (e: PointerEvent) => {
      const d = dragRef.current;
      setDrag(null);
      if (d) onDrop({ type: d.type, rotation: d.rotation, clientX: e.clientX, clientY: e.clientY });
    };
    const key = (e: KeyboardEvent) => {
      // R / ר rotate ghost while dragging
      if (e.code === "KeyR" || e.key === "r" || e.key === "R" || e.key === "ר") {
        const d = dragRef.current;
        if (!d) return;
        const order: PlacedComponent["rotation"][] = [0, 90, 180, 270];
        setDrag({ ...d, rotation: order[(order.indexOf(d.rotation) + 1) % 4] });
        e.preventDefault();
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      window.removeEventListener("keydown", key);
    };
  }, [drag, onDrop]);

  return (
    <>
      <div
        dir="rtl"
        className="pointer-events-auto fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/90 backdrop-blur"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="mx-auto flex max-w-screen-xl items-stretch gap-2 overflow-x-auto px-3 py-2">
          {PALETTE_ITEMS.map((t) => (
            <button
              key={t}
              type="button"
              onPointerDown={(e) => {
                e.preventDefault();
                setDrag({ type: t, rotation: 0, x: e.clientX, y: e.clientY });
              }}
              className="flex min-w-[96px] cursor-grab touch-none select-none flex-col items-center justify-center gap-1 rounded-md border border-border bg-background px-3 py-2 text-foreground transition hover:border-primary hover:bg-accent active:cursor-grabbing"
              title="גרור אל הלוח (R לסיבוב בזמן גרירה)"
            >
              <div className="flex h-9 items-center justify-center">
                <PaletteSymbol type={t} />
              </div>
              <div className="text-[11px] font-medium">{COMPONENT_LABEL_HE[t]}</div>
            </button>
          ))}
        </div>
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
