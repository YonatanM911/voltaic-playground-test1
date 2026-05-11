import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { LabCanvas, type Tool } from "@/components/lab/LabCanvas";
import { LabToolbar } from "@/components/lab/LabToolbar";
import { Palette } from "@/components/lab/Palette";
import { EditDialog } from "@/components/lab/EditDialog";
import {
  type ComponentType,
  type PlacedComponent,
  CAPABILITIES,
  GRID,
  snap,
} from "@/lib/lab/types";
import { solve } from "@/lib/lab/solver";
import { applyTheme, getInitialTheme } from "@/lib/theme";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/lab")({
  head: () => ({
    meta: [
      { title: "מעבדה — Voltica Laboratories" },
      {
        name: "description",
        content:
          "מעבדת מעגלים חשמליים אינטראקטיבית: סוללה, נגד, נורה, מפסק, דיודה, ומודדים.",
      },
    ],
  }),
  component: LabPage,
});

let nextId = 1;
const newId = () => `c${nextId++}_${Date.now().toString(36)}`;

function defaultsFor(type: ComponentType): Partial<PlacedComponent> {
  const caps = CAPABILITIES[type];
  return {
    voltage: caps.voltage ? (type === "battery" ? 9 : 0.7) : null,
    current: null,
    resistance: caps.resistance ? 100 : null,
    closed: type === "switch" ? true : undefined,
  };
}

function LabPage() {
  const [components, setComponents] = useState<PlacedComponent[]>([]);
  const [tool, setTool] = useState<Tool>("select");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  // Apply persisted theme on mount (the home/settings pages own the value).
  useEffect(() => {
    applyTheme(getInitialTheme());
  }, []);

  const solved = useMemo(() => solve(components), [components]);

  const handlePick = (type: ComponentType) => {
    // place new component near center of viewport, snapped to grid.
    const x = snap(window.innerWidth / 2);
    const y = snap(window.innerHeight / 2);
    const id = newId();
    const c: PlacedComponent = {
      id,
      type,
      x,
      y,
      rotation: 0,
      voltage: null,
      current: null,
      resistance: null,
      ...defaultsFor(type),
    } as PlacedComponent;
    setComponents((prev) => [...prev, c]);
  };

  const handleSave = (next: PlacedComponent) => {
    setComponents((prev) => prev.map((c) => (c.id === next.id ? next : c)));
    setEditingId(null);
  };

  const handleDelete = (id: string) => {
    setComponents((prev) => prev.filter((c) => c.id !== id));
    setEditingId(null);
  };

  const editing = components.find((c) => c.id === editingId) ?? null;

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-background text-foreground">
      <LabCanvas
        components={components}
        setComponents={setComponents}
        tool={tool}
        solve={solved}
        onQuickClick={(id) => setEditingId(id)}
      />
      <LabToolbar
        tool={tool}
        setTool={setTool}
        onClear={() => setConfirmClear(true)}
        onRotateSelected={() => {
          setComponents((prev) => {
            if (prev.length === 0) return prev;
            const last = prev[prev.length - 1];
            const rotations: PlacedComponent["rotation"][] = [0, 90, 180, 270];
            const next = rotations[(rotations.indexOf(last.rotation) + 1) % 4];
            return [...prev.slice(0, -1), { ...last, rotation: next }];
          });
        }}
      />

      {/* Unknowns / solution panel */}
      {solved.unknowns.length > 0 && (
        <div
          dir="rtl"
          className="pointer-events-auto fixed end-4 top-4 z-30 max-w-xs rounded-lg border border-border bg-card/90 p-3 shadow-lg backdrop-blur"
        >
          <div className="mb-2 text-sm font-semibold">פתרון נעלמים</div>
          <ul className="space-y-1 text-sm">
            {solved.unknowns.map((u) => (
              <li key={u.name} className="flex justify-between gap-2">
                <span className="font-mono">{u.name}</span>
                <span className="text-muted-foreground">
                  = {Number.isInteger(u.value) ? u.value : u.value.toFixed(3)}{" "}
                  {u.unit}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Palette onPick={handlePick} />

      <EditDialog
        component={editing}
        onClose={() => setEditingId(null)}
        onSave={handleSave}
        onDelete={handleDelete}
      />

      <AlertDialog open={confirmClear} onOpenChange={setConfirmClear}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>לנקות את הלוח?</AlertDialogTitle>
            <AlertDialogDescription>
              כל הרכיבים יוסרו. הפעולה אינה הפיכה.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ביטול</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setComponents([]);
                setConfirmClear(false);
              }}
            >
              נקה
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* unused import guard */}
      <div className="hidden">{GRID}</div>
    </div>
  );
}
