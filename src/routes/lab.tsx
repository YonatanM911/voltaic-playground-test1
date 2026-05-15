import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useNavigate } from "@tanstack/react-router";
import { LabCanvas, type Tool } from "@/components/lab/LabCanvas";
import { LabToolbar } from "@/components/lab/LabToolbar";
import { Palette } from "@/components/lab/Palette";
import { EditDialog } from "@/components/lab/EditDialog";
import { ImportDialog, type SavedStructure } from "@/components/lab/ImportDialog";
import {
  type ComponentType,
  type PlacedComponent,
  CAPABILITIES,
  GRID,
  snap,
  nextComponentName,
} from "@/lib/lab/types";
import { solve } from "@/lib/lab/solver";
import { applyTheme, getInitialTheme } from "@/lib/theme";
import { useAppSettings } from "@/lib/lab/settingsStore";
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
      { name: "description", content: "מעבדת מעגלים חשמליים אינטראקטיבית." },
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
    current: type === "battery" ? 9 : null,
    resistance: type === "battery" ? 1 : caps.resistance ? 100 : null,
    closed: type === "switch" || type === "battery" ? true : undefined,
    meterMode: type === "multimeter" ? "voltage" : undefined,
  };
}

function LabPage() {
  const navigate = useNavigate();
  const [components, setComponents] = useState<PlacedComponent[]>([]);
  const [tool, setTool] = useState<Tool>("select");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [confirmHome, setConfirmHome] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [view, setView] = useState({ x: 200, y: 200, zoom: 1 });
  const [search, setSearch] = useState("");
  const [clipboard, setClipboard] = useState<PlacedComponent[]>([]);
  const [importOpen, setImportOpen] = useState(false);
  const [savedStructures, setSavedStructures] = useState<SavedStructure[]>([]);
  const [saveNameOpen, setSaveNameOpen] = useState(false);
  const [saveNameValue, setSaveNameValue] = useState("");
  const [settings] = useAppSettings();
  const [paletteCollapsed, setPaletteCollapsed] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // --- Undo / Redo history (debounced snapshots of components) ---
  const pastRef = useRef<PlacedComponent[][]>([]);
  const futureRef = useRef<PlacedComponent[][]>([]);
  const lastCommittedRef = useRef<PlacedComponent[]>(components);
  const applyingHistoryRef = useRef(false);
  const commitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [, setHistoryTick] = useState(0);
  const HISTORY_LIMIT = 100;

  useEffect(() => {
    if (applyingHistoryRef.current) {
      applyingHistoryRef.current = false;
      lastCommittedRef.current = components;
      return;
    }
    if (commitTimerRef.current) clearTimeout(commitTimerRef.current);
    commitTimerRef.current = setTimeout(() => {
      const prev = lastCommittedRef.current;
      if (prev === components) return;
      pastRef.current.push(prev);
      if (pastRef.current.length > HISTORY_LIMIT) pastRef.current.shift();
      futureRef.current = [];
      lastCommittedRef.current = components;
      setHistoryTick((t) => t + 1);
    }, 250);
    return () => {
      if (commitTimerRef.current) clearTimeout(commitTimerRef.current);
    };
  }, [components]);

  const undo = useCallback(() => {
    if (commitTimerRef.current) {
      clearTimeout(commitTimerRef.current);
      commitTimerRef.current = null;
      if (lastCommittedRef.current !== components) {
        pastRef.current.push(lastCommittedRef.current);
        lastCommittedRef.current = components;
      }
    }
    const prev = pastRef.current.pop();
    if (!prev) return;
    futureRef.current.push(components);
    applyingHistoryRef.current = true;
    setComponents(prev);
    setHistoryTick((t) => t + 1);
  }, [components]);

  const redo = useCallback(() => {
    const next = futureRef.current.pop();
    if (!next) return;
    pastRef.current.push(components);
    applyingHistoryRef.current = true;
    setComponents(next);
    setHistoryTick((t) => t + 1);
  }, [components]);

  const canUndo = pastRef.current.length > 0;
  const canRedo = futureRef.current.length > 0;

  useEffect(() => {
    applyTheme(getInitialTheme());
  }, []);
  useEffect(() => {
    try {
      const raw = window.sessionStorage.getItem("voltica-session-structures");
      if (raw) setSavedStructures(JSON.parse(raw));
    } catch {
      /* ignore */
    }
  }, []);

  // --- Lab state persistence (survives navigation to /settings or /guide) ---
  // Restore on mount.
  const restoredRef = useRef(false);
  useEffect(() => {
    try {
      const raw = window.sessionStorage.getItem("voltica-lab-state");
      if (raw) {
        const parsed = JSON.parse(raw) as {
          components?: PlacedComponent[];
          view?: { x: number; y: number; zoom: number };
        };
        if (parsed.components) setComponents(parsed.components);
        if (parsed.view) setView(parsed.view);
      }
    } catch {
      /* ignore */
    }
    restoredRef.current = true;
  }, []);
  // Persist on change (after first restore).
  useEffect(() => {
    if (!restoredRef.current) return;
    try {
      window.sessionStorage.setItem("voltica-lab-state", JSON.stringify({ components, view }));
    } catch {
      /* ignore */
    }
  }, [components, view]);

  const solved = useMemo(() => solve(components), [components]);

  const searchHits = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return new Set<string>();
    return new Set(components.filter((c) => c.name.toLowerCase().includes(q)).map((c) => c.id));
  }, [search, components]);

  const handleDrop = useCallback(
    (
      type: ComponentType,
      rotation: PlacedComponent["rotation"],
      world: { x: number; y: number },
    ) => {
      const id = newId();
      setComponents((prev) => {
        const c: PlacedComponent = {
          id,
          name: nextComponentName(type, prev),
          type,
          x: world.x,
          y: world.y,
          rotation,
          voltage: null,
          current: null,
          resistance: null,
          ...defaultsFor(type),
        } as PlacedComponent;
        return [...prev, c];
      });
      setSelectedIds(new Set([id]));
    },
    [],
  );

  // Convert client coords (from palette drop) to world coords using current view+zoom.
  const onPaletteDrop = useCallback(
    (p: {
      type: ComponentType;
      rotation: PlacedComponent["rotation"];
      clientX: number;
      clientY: number;
    }) => {
      const r = wrapperRef.current?.getBoundingClientRect();
      const ox = r?.left ?? 0;
      const oy = r?.top ?? 0;
      const wx = (p.clientX - ox - view.x) / view.zoom;
      const wy = (p.clientY - oy - view.y) / view.zoom;
      handleDrop(p.type, p.rotation, { x: snap(wx), y: snap(wy) });
    },
    [view, handleDrop],
  );

  const persistStructures = useCallback((next: SavedStructure[]) => {
    setSavedStructures(next);
    try {
      window.sessionStorage.setItem("voltica-session-structures", JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }, []);

  const insertComponentFromImport = useCallback(
    (type: ComponentType) => {
      const r = wrapperRef.current?.getBoundingClientRect();
      const wx = ((r?.width ?? 800) / 2 - view.x) / view.zoom;
      const wy = ((r?.height ?? 600) / 2 - view.y) / view.zoom;
      handleDrop(type, 0, { x: snap(wx), y: snap(wy) });
      setImportOpen(false);
    },
    [handleDrop, view],
  );

  const defaultSaveName = useCallback(() => {
    const used = new Set(savedStructures.map((s) => s.name));
    let i = 1;
    while (used.has(`שמירה ${i}`)) i++;
    return `שמירה ${i}`;
  }, [savedStructures]);

  const saveSelectedStructure = useCallback(() => {
    if (selectedIds.size === 0) return;
    setSaveNameValue(defaultSaveName());
    setSaveNameOpen(true);
  }, [selectedIds, defaultSaveName]);

  const confirmSaveStructure = useCallback(() => {
    const selected = components.filter((c) => selectedIds.has(c.id));
    if (selected.length === 0) {
      setSaveNameOpen(false);
      return;
    }
    const name = saveNameValue.trim() || defaultSaveName();
    const next: SavedStructure[] = [
      ...savedStructures,
      { id: `s_${Date.now().toString(36)}`, name, components: selected.map((c) => ({ ...c })) },
    ];
    persistStructures(next);
    setSaveNameOpen(false);
  }, [components, selectedIds, savedStructures, persistStructures, saveNameValue, defaultSaveName]);

  const insertStructure = useCallback(
    (structure: SavedStructure) => {
      if (structure.components.length === 0) return;
      const r = wrapperRef.current?.getBoundingClientRect();
      const wx = ((r?.width ?? 800) / 2 - view.x) / view.zoom;
      const wy = ((r?.height ?? 600) / 2 - view.y) / view.zoom;
      const cx = structure.components.reduce((s, c) => s + c.x, 0) / structure.components.length;
      const cy = structure.components.reduce((s, c) => s + c.y, 0) / structure.components.length;
      setComponents((prev) => {
        const created: PlacedComponent[] = [];
        const ids: string[] = [];
        const all = [...prev];
        for (const c of structure.components) {
          const id = newId();
          ids.push(id);
          created.push({
            ...c,
            id,
            name: nextComponentName(c.type, all.concat(created)),
            x: snap(wx + (c.x - cx)),
            y: snap(wy + (c.y - cy)),
          });
        }
        queueMicrotask(() => setSelectedIds(new Set(ids)));
        return [...prev, ...created];
      });
      setImportOpen(false);
    },
    [view],
  );

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
      const ids =
        selectedIds.size > 0
          ? selectedIds
          : prev.length > 0
            ? new Set([prev[prev.length - 1].id])
            : new Set<string>();
      if (ids.size === 0) return prev;
      const order: PlacedComponent["rotation"][] = [0, 90, 180, 270];
      // Rotate the entire selected structure 90° clockwise around its centroid:
      // both the position of every member AND each member's own orientation.
      const sel = prev.filter((c) => ids.has(c.id));
      if (sel.length === 1) {
        return prev.map((c) =>
          ids.has(c.id) ? { ...c, rotation: order[(order.indexOf(c.rotation) + 1) % 4] } : c,
        );
      }
      const cx = sel.reduce((s, c) => s + c.x, 0) / sel.length;
      const cy = sel.reduce((s, c) => s + c.y, 0) / sel.length;
      // 90° CW: (x,y) → (cx - (y-cy), cy + (x-cx))
      return prev.map((c) => {
        if (!ids.has(c.id)) return c;
        const nx = snap(cx - (c.y - cy));
        const ny = snap(cy + (c.x - cx));
        return { ...c, x: nx, y: ny, rotation: order[(order.indexOf(c.rotation) + 1) % 4] };
      });
    });
  }, [selectedIds]);

  const deleteSelected = useCallback(() => {
    if (selectedIds.size === 0) return;
    setComponents((prev) => prev.filter((c) => !selectedIds.has(c.id)));
    setSelectedIds(new Set());
  }, [selectedIds]);

  const copyToClipboard = useCallback(() => {
    if (selectedIds.size === 0) return;
    setClipboard(components.filter((c) => selectedIds.has(c.id)).map((c) => ({ ...c })));
  }, [selectedIds, components]);

  const cutToClipboard = useCallback(() => {
    if (selectedIds.size === 0) return;
    setClipboard(components.filter((c) => selectedIds.has(c.id)).map((c) => ({ ...c })));
    deleteSelected();
  }, [selectedIds, components, deleteSelected]);

  const pasteFromClipboard = useCallback(() => {
    if (clipboard.length === 0) return;
    setComponents((prev) => {
      const created: PlacedComponent[] = [];
      const ids: string[] = [];
      const all = [...prev];
      for (const c of clipboard) {
        const id = newId();
        ids.push(id);
        const cn = {
          ...c,
          id,
          name: nextComponentName(c.type, all.concat(created)),
          x: c.x + GRID * 2,
          y: c.y + GRID * 2,
        };
        created.push(cn);
      }
      queueMicrotask(() => setSelectedIds(new Set(ids)));
      return [...prev, ...created];
    });
  }, [clipboard]);

  // duplicate-in-place (used by canvas action bar)
  const copySelected = useCallback(() => {
    if (selectedIds.size === 0) return;
    setComponents((prev) => {
      const created: PlacedComponent[] = [];
      const ids: string[] = [];
      const all = [...prev];
      for (const c of prev.filter((c) => selectedIds.has(c.id))) {
        const id = newId();
        ids.push(id);
        created.push({
          ...c,
          id,
          name: nextComponentName(c.type, all.concat(created)),
          x: c.x + GRID * 2,
          y: c.y + GRID * 2,
        });
      }
      queueMicrotask(() => setSelectedIds(new Set(ids)));
      return [...prev, ...created];
    });
  }, [selectedIds]);

  const focusCamera = useCallback(() => {
    const wrap = wrapperRef.current;
    if (!wrap) return;
    const r = wrap.getBoundingClientRect();
    if (components.length === 0) {
      setView({ x: r.width / 2, y: r.height / 2, zoom: 1 });
      return;
    }
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    components.forEach((c) => {
      minX = Math.min(minX, c.x - 50);
      maxX = Math.max(maxX, c.x + 50);
      minY = Math.min(minY, c.y - 30);
      maxY = Math.max(maxY, c.y + 30);
    });
    const w = maxX - minX,
      h = maxY - minY;
    const zoom = Math.min(r.width / w, r.height / h, 1.5) * 0.9;
    setView({
      x: r.width / 2 - ((minX + maxX) / 2) * zoom,
      y: r.height / 2 - ((minY + maxY) / 2) * zoom,
      zoom,
    });
  }, [components]);

  const zoomBy = (factor: number) => {
    const wrap = wrapperRef.current;
    if (!wrap) return;
    const r = wrap.getBoundingClientRect();
    const cx = r.width / 2,
      cy = r.height / 2;
    const wx = (cx - view.x) / view.zoom;
    const wy = (cy - view.y) / view.zoom;
    const nz = Math.max(0.2, Math.min(4, view.zoom * factor));
    setView({ x: cx - wx * nz, y: cy - wy * nz, zoom: nz });
  };

  // keyboard handling — supports both English and Hebrew layout via e.code
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        (e.target as HTMLElement | null)?.isContentEditable
      )
        return;
      const isR = e.code === "KeyR" || e.key === "r" || e.key === "R" || e.key === "ר";
      const isC = e.code === "KeyC" || e.key === "c" || e.key === "C" || e.key === "ב";
      const isV = e.code === "KeyV" || e.key === "v" || e.key === "V" || e.key === "ה";
      const isX = e.code === "KeyX" || e.key === "x" || e.key === "X" || e.key === "ס";
      const isD = e.code === "KeyD" || e.key === "d" || e.key === "D" || e.key === "ג";
      const isF = e.code === "KeyF" || e.key === "f" || e.key === "F" || e.key === "כ";
      const isZ = e.code === "KeyZ" || e.key === "z" || e.key === "Z" || e.key === "ז";
      const isY = e.code === "KeyY" || e.key === "y" || e.key === "Y" || e.key === "ט";
      const ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && isZ) {
        if (e.shiftKey) redo();
        else undo();
        e.preventDefault();
        return;
      }
      if (ctrl && isY) {
        redo();
        e.preventDefault();
        return;
      }
      if (isR && !ctrl) {
        rotateSelected();
        e.preventDefault();
        return;
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedIds.size > 0) {
          deleteSelected();
          e.preventDefault();
        }
        return;
      }
      if (ctrl && isC) {
        copyToClipboard();
        e.preventDefault();
        return;
      }
      if (ctrl && isV) {
        pasteFromClipboard();
        e.preventDefault();
        return;
      }
      if (ctrl && isX) {
        cutToClipboard();
        e.preventDefault();
        return;
      }
      if (ctrl && isD) {
        copySelected();
        e.preventDefault();
        return;
      }
      if (isF && !ctrl) {
        focusCamera();
        e.preventDefault();
        return;
      }
      if (e.key === "Escape") {
        setSelectedIds(new Set());
        setSearch("");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    rotateSelected,
    deleteSelected,
    copyToClipboard,
    pasteFromClipboard,
    cutToClipboard,
    copySelected,
    focusCamera,
    selectedIds,
  ]);

  const editing = components.find((c) => c.id === editingId) ?? null;

  return (
    <div
      ref={wrapperRef}
      className="relative h-screen w-screen overflow-hidden bg-background text-foreground"
    >
      <LabCanvas
        components={components}
        setComponents={setComponents}
        tool={tool}
        solve={solved}
        onQuickClick={(id) => setEditingId(id)}
        selectedIds={selectedIds}
        setSelectedIds={setSelectedIds}
        onCopySelected={copySelected}
        onDeleteSelected={deleteSelected}
        onRotateSelected={rotateSelected}
        onSaveSelected={saveSelectedStructure}
        view={view}
        setView={setView}
        searchHits={searchHits}
        settings={settings}
      />
      <LabToolbar
        tool={tool}
        setTool={setTool}
        onClear={() => setConfirmClear(true)}
        onGoHome={() => setConfirmHome(true)}
        onRotateSelected={rotateSelected}
        onZoomIn={() => zoomBy(1.25)}
        onZoomOut={() => zoomBy(1 / 1.25)}
        onFocus={focusCamera}
        onUndo={undo}
        onRedo={redo}
        canUndo={canUndo}
        canRedo={canRedo}
        search={search}
        setSearch={setSearch}
        searchCount={searchHits.size}
      />

      <Palette
        onDrop={onPaletteDrop}
        onOpenImport={() => setImportOpen(true)}
        collapsed={paletteCollapsed}
        setCollapsed={setPaletteCollapsed}
      />

      <ImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        savedStructures={savedStructures}
        canSaveSelection={selectedIds.size > 0}
        isLoggedIn={true}
        onSaveSelection={saveSelectedStructure}
        onInsertComponent={insertComponentFromImport}
        onInsertStructure={insertStructure}
      />

      <EditDialog
        component={editing}
        solve={solved}
        onClose={() => setEditingId(null)}
        onSave={handleSave}
        onUpdate={(next) => setComponents((prev) => prev.map((c) => (c.id === next.id ? next : c)))}
        onDelete={handleDelete}
      />

      <AlertDialog open={confirmClear} onOpenChange={setConfirmClear}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>לנקות את הלוח?</AlertDialogTitle>
            <AlertDialogDescription>כל הרכיבים יוסרו. הפעולה אינה הפיכה.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ביטול</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setComponents([]);
                setSelectedIds(new Set());
                setConfirmClear(false);
                try {
                  window.sessionStorage.removeItem("voltica-lab-state");
                } catch {
                  /* ignore */
                }
              }}
            >
              נקה
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmHome} onOpenChange={setConfirmHome}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>חזרה לדף הבית?</AlertDialogTitle>
            <AlertDialogDescription>
              כל הרכיבים שעל הלוח ימחקו. הפעולה אינה הפיכה.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ביטול</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                try {
                  window.sessionStorage.removeItem("voltica-lab-state");
                } catch {
                  /* ignore */
                }
                setConfirmHome(false);
                navigate({ to: "/" });
              }}
            >
              חזור
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={saveNameOpen} onOpenChange={setSaveNameOpen}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>שמירת מבנה</AlertDialogTitle>
            <AlertDialogDescription>בחר שם למבנה השמור.</AlertDialogDescription>
          </AlertDialogHeader>
          <input
            type="text"
            value={saveNameValue}
            onChange={(e) => setSaveNameValue(e.target.value)}
            placeholder={defaultSaveName()}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                confirmSaveStructure();
              }
            }}
            className="mt-2 h-9 w-full rounded-md border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            autoFocus
          />
          <AlertDialogFooter>
            <AlertDialogCancel>ביטול</AlertDialogCancel>
            <AlertDialogAction onClick={confirmSaveStructure}>שמור</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
