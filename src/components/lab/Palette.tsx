import type { ComponentType } from "@/lib/lab/types";
import { COMPONENT_LABEL_HE } from "@/lib/lab/types";
import { PaletteSymbol } from "@/lib/lab/symbols";

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

export const PALETTE_DND_TYPE = "application/x-voltica-component";

export function Palette() {
  return (
    <div
      dir="rtl"
      className="pointer-events-auto fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/90 backdrop-blur"
    >
      <div className="mx-auto flex max-w-screen-xl items-stretch gap-3 overflow-x-auto px-4 py-3">
        {PALETTE_ITEMS.map((t) => (
          <div
            key={t}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData(PALETTE_DND_TYPE, t);
              e.dataTransfer.effectAllowed = "copy";
            }}
            className="flex min-w-[110px] cursor-grab flex-col items-center justify-center gap-1 rounded-md border border-border bg-background px-3 py-2 text-foreground transition hover:border-primary hover:bg-accent active:cursor-grabbing"
            title="גרור אל הלוח"
          >
            <div className="flex h-10 items-center justify-center">
              <PaletteSymbol type={t} />
            </div>
            <div className="text-xs font-medium">{COMPONENT_LABEL_HE[t]}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
