import { useMemo, useState, type ReactNode } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { ComponentType, PlacedComponent } from "@/lib/lab/types";
import { COMPONENT_LABEL_HE } from "@/lib/lab/types";
import { Cpu, FolderOpen, X } from "lucide-react";
import { PaletteSymbol } from "@/lib/lab/symbols";

export interface SavedStructure {
  id: string;
  name: string;
  components: PlacedComponent[];
}

const GATE_TYPES: ComponentType[] = [
  "gate_and",
  "gate_or",
  "gate_not",
  "gate_buffer",
  "gate_xor",
  "gate_nand",
  "gate_nor",
  "gate_xnor",
];

const GATE_DESCRIPTIONS: Partial<Record<ComponentType, string>> = {
  gate_and: "שער AND — פלט גבוה כששתי הכניסות גבוהות",
  gate_or: "שער OR — פלט גבוה כשאחת הכניסות גבוהה",
  gate_not: "שער NOT — היפוך הקלט",
  gate_buffer: "שער BUFFER — מעביר את הקלט כפי שהוא",
  gate_xor: "שער XOR — פלט גבוה כשהכניסות שונות",
  gate_nand: "שער NAND — היפוך של AND",
  gate_nor: "שער NOR — היפוך של OR",
  gate_xnor: "שער XNOR — היפוך של XOR",
};

const SPECIAL_PARTS: { type: ComponentType; label: string; description: string; icon: ReactNode }[] =
  GATE_TYPES.map((t) => ({
    type: t,
    label: COMPONENT_LABEL_HE[t],
    description: GATE_DESCRIPTIONS[t] ?? "",
    icon: <PaletteSymbol type={t} />,
  }));

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  savedStructures: SavedStructure[];
  canSaveSelection: boolean;
  isLoggedIn?: boolean;
  onSaveSelection: () => void;
  onInsertComponent: (type: ComponentType) => void;
  onInsertStructure: (structure: SavedStructure) => void;
}

export function ImportDialog({
  open,
  onOpenChange,
  savedStructures,
  isLoggedIn = false,
  onInsertComponent,
  onInsertStructure,
}: Props) {
  const [tab, setTab] = useState("special");
  const savedLabel = useMemo(() => `שמירות${savedStructures.length ? ` (${savedStructures.length})` : ""}`, [savedStructures.length]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        dir="rtl"
        className="max-h-[86vh] w-[min(92vw,760px)] max-w-none gap-3 p-4 sm:p-5 [&>button.absolute]:hidden"
      >
        <DialogHeader className="sr-only">
          <DialogTitle>ייבוא רכיבים ומבנים</DialogTitle>
        </DialogHeader>
        <Tabs value={tab} onValueChange={setTab} className="min-h-0">
          <div dir="ltr" className="flex items-center gap-2 border-b border-border pb-3">
            <TabsList className="h-auto flex-wrap justify-start me-auto">
              <TabsTrigger value="special" className="gap-1.5"><Cpu className="size-4" /> חלקים מיוחדים</TabsTrigger>
              <TabsTrigger value="saved" className="gap-1.5"><FolderOpen className="size-4" /> {savedLabel}</TabsTrigger>
            </TabsList>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              aria-label="סגירה"
              title="סגירה"
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition hover:bg-accent hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          </div>

          <TabsContent value="special" className="mt-3">
            <ScrollArea className="h-[min(58vh,460px)] pe-2">
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {SPECIAL_PARTS.map((part) => (
                  <button
                    key={`${part.label}-${part.type}`}
                    type="button"
                    onClick={() => onInsertComponent(part.type)}
                    className="flex min-h-24 items-center gap-3 rounded-md border border-border bg-card p-3 text-start transition hover:border-primary hover:bg-accent"
                  >
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-background text-primary">
                      {part.icon}
                    </span>
                    <span className="min-w-0">
                      <span className="block font-semibold text-foreground">{part.label}</span>
                      <span className="block text-xs text-muted-foreground">{part.description}</span>
                      <span className="block pt-1 text-[11px] text-muted-foreground">{COMPONENT_LABEL_HE[part.type]}</span>
                    </span>
                  </button>
                ))}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="saved" className="mt-3">
            <ScrollArea className="h-[min(58vh,460px)] pe-2">
              {!isLoggedIn ? (
                <div className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                  צריך להתחבר כדי להכנס למקום הזה
                </div>
              ) : savedStructures.length === 0 ? (
                <div className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                  אין קבצים עדיין
                </div>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  {savedStructures.map((structure) => (
                    <button
                      key={structure.id}
                      type="button"
                      onClick={() => onInsertStructure(structure)}
                      className="rounded-md border border-border bg-card p-4 text-start transition hover:border-primary hover:bg-accent"
                    >
                      <span className="block font-semibold text-foreground">{structure.name}</span>
                      <span className="text-xs text-muted-foreground">{structure.components.length} רכיבים</span>
                    </button>
                  ))}
                </div>
              )}
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}