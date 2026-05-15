// Floating top toolbar for the lab — navigation, tool toggle, rotate,
// zoom, focus (recenter), clear, and the live search field.
import { Link } from "@tanstack/react-router";
import {
  Home, Settings, Hand, MousePointer2, Trash2, RotateCw, ZoomIn, ZoomOut, Crosshair, Search, BookOpen, Undo2, Redo2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Tool } from "./LabCanvas";

interface Props {
  tool: Tool;
  setTool: (t: Tool) => void;
  onClear: () => void;
  onGoHome: () => void;
  onRotateSelected: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFocus: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  search: string;
  setSearch: (s: string) => void;
  searchCount: number;
}

export function LabToolbar({
  tool, setTool, onClear, onGoHome, onRotateSelected, onZoomIn, onZoomOut, onFocus, onUndo, onRedo, canUndo, canRedo, search, setSearch, searchCount,
}: Props) {
  return (
    <div
      dir="rtl"
      className="pointer-events-auto fixed start-2 top-2 z-30 flex max-w-[calc(100vw-1rem)] flex-wrap items-center gap-1 rounded-lg border border-border bg-card/90 p-2 shadow-lg backdrop-blur"
      style={{ paddingTop: "max(0.5rem, env(safe-area-inset-top))" }}
    >
      <Button size="icon" variant="ghost" title="דף הבית" onClick={onGoHome}>
        <Home className="size-5" />
      </Button>
      <Link to="/settings">
        <Button size="icon" variant="ghost" title="הגדרות"><Settings className="size-5" /></Button>
      </Link>
      <span className="mx-1 h-6 w-px bg-border" />
      <Button size="icon" variant={tool === "select" ? "default" : "ghost"} onClick={() => setTool("select")} title="בחירה">
        <MousePointer2 className="size-5" />
      </Button>
      <Button size="icon" variant={tool === "pan" ? "default" : "ghost"} onClick={() => setTool("pan")} title="הזזת מסך">
        <Hand className="size-5" />
      </Button>
      <span className="mx-1 h-6 w-px bg-border" />
      <Link to="/guide">
        <Button size="icon" variant="ghost" title="הדרכה"><BookOpen className="size-5" /></Button>
      </Link>
      <span className="mx-1 h-6 w-px bg-border" />
      <Button size="icon" variant="ghost" onClick={onRotateSelected} title="סובב (R / ר)">
        <RotateCw className="size-5" />
      </Button>
      <Button size="icon" variant="ghost" onClick={onZoomIn} title="זום אין"><ZoomIn className="size-5" /></Button>
      <Button size="icon" variant="ghost" onClick={onZoomOut} title="זום אאוט"><ZoomOut className="size-5" /></Button>
      <Button size="icon" variant="ghost" onClick={onFocus} title="מקד מצלמה (F)"><Crosshair className="size-5" /></Button>
      <span className="mx-1 h-6 w-px bg-border" />
      <Button size="icon" variant="ghost" onClick={onUndo} disabled={!canUndo} title="בטל (Ctrl+Z)"><Undo2 className="size-5" /></Button>
      <Button size="icon" variant="ghost" onClick={onRedo} disabled={!canRedo} title="בצע שוב (Ctrl+Y / Ctrl+Shift+Z)"><Redo2 className="size-5" /></Button>
      <Button size="icon" variant="ghost" onClick={onClear} title="נקה לוח"><Trash2 className="size-5" /></Button>
      <div className="relative ms-1 flex items-center">
        <Search className="pointer-events-none absolute end-2 size-3.5 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="חיפוש לפי שם..."
          className="h-8 w-32 pe-7 text-xs"
        />
      </div>
      {search && (
        <span className="text-[11px] text-muted-foreground">
          {searchCount > 0 ? `${searchCount} תוצאות` : "אין תוצאות לחיפוש המתבקש"}
        </span>
      )}
    </div>
  );
}
