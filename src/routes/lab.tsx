import { useEffect, useMemo, useState, useCallback } from "react";
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
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    applyTheme(getInitialTheme());
  }, []);

  const solved = useMemo(() => solve(components), [components]);

  const handleDrop = (type: ComponentType, world: { x: number; y: number }) => {
    const id = newId();
    const c: PlacedComponent = {
      id,
      type,
      x: world.x,
      y: world.y,
      rotation: 0,
      voltage: null,
      current: null,
      resistance: null,
      ...defaultsFor(type),
    } as PlacedComponent;
    setComponents((prev) => [...prev, c]);
    setSelectedIds(new Set([id]));
  };

  const handleSave = (next: PlacedComponent) => {
    setComponents((prev) => prev.map((c) => (c.id === next.id ? next : c)));
    setEditingId(null);
  };

  const handleDelete = (id: string) => {
    setComponents((prev) => prev.filter((c) => c.id !== id));
    setEditingId(null);
  };

  const rotateSelected = useCallback(() => {
    setComponents((prev) => {
      const ids = selectedIds.size > 0
        ? selectedIds
        : prev.length > 0
        ? new Set([prev[prev.length - 1].id])
        : new Set<string>();
      if (ids.size === 0) return prev;
      const order: PlacedComponent["rotation"][] = [0, 90, 180, 270];
      return prev.map((c) =>
        ids.has(c.id)
          ? { ...c, rotation: order[(order.indexOf(c.rotation) + 1) % 4] }
          : c
      );
    });
  }, [selectedIds]);

  const deleteSelected = useCallback(() => {
    if (selectedIds.size === 0) return;
    setComponents((prev) => prev.filter((c) => !selectedIds.has(c.id)));
    setSelectedIds(new Set());
  }, [selectedIds]);

  const copySelected = useCallback(() => {
    if (selectedIds.size === 0) return;
    setComponents((prev) => {
      const newOnes: PlacedComponent[] = [];
      const newIds: string[] = [];
      prev.forEach((c) => {
        if (selectedIds.has(c.id)) {
          const id = newId();
          newIds.push(id);
          newOnes.push({ ...c, id, x: c.x + GRID * 2, y: c.y + GRID * 2 });
        }
      });
      // shift selection to copies after state commit
      queueMicrotask(() => setSelectedIds(new Set(newIds)));
      return [...prev, ...newOnes];
    });
  }, [selectedIds]);

  // keyboard handling
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "r" || e.key === "R") {
        rotateSelected();
        e.preventDefault();
      } else if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedIds.size > 0) {
          deleteSelected();
          e.preventDefault();
        }
      } else if ((e.ctrlKey || e.metaKey) && (e.key === "d" || e.key === "D")) {
        copySelected();
        e.preventDefault();
      } else if (e.key === "Escape") {
        setSelectedIds(new Set());
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [rotateSelected, deleteSelected, copySelected, selectedIds]);

  const editing = components.find((c) => c.id === editingId) ?? null;

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-background text-foreground">
      <LabCanvas
        components={components}
        setComponents={setComponents}
        tool={tool}
        solve={solved}
        onQuickClick={(id) => setEditingId(id)}
        onDropComponent={handleDrop}
        selectedIds={selectedIds}
        setSelectedIds={setSelectedIds}
        onCopySelected={copySelected}
        onDeleteSelected={deleteSelected}
      />
      <LabToolbar
        tool={tool}
        setTool={setTool}
        onClear={() => setConfirmClear(true)}
        onRotateSelected={rotateSelected}
      />

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

      <Palette />

      <EditDialog
        component={editing}
        onClose={() => setEditingId(null)}
        onSave={handleSave}
        onUpdate={(next) =>
          setComponents((prev) => prev.map((c) => (c.id === next.id ? next : c)))
        }
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
                setSelectedIds(new Set());
                setConfirmClear(false);
              }}
            >
              נקה
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
