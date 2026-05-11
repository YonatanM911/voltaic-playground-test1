import { Link } from "@tanstack/react-router";
import { Home, Settings, Hand, MousePointer2, Trash2, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Tool } from "./LabCanvas";

interface Props {
  tool: Tool;
  setTool: (t: Tool) => void;
  onClear: () => void;
  onRotateSelected: () => void;
}

export function LabToolbar({ tool, setTool, onClear, onRotateSelected }: Props) {
  return (
    <div
      dir="rtl"
      className="pointer-events-auto fixed start-4 top-4 z-30 flex items-center gap-2 rounded-lg border border-border bg-card/90 p-2 shadow-lg backdrop-blur"
    >
      <Link to="/">
        <Button size="icon" variant="ghost" title="דף הבית">
          <Home className="size-5" />
        </Button>
      </Link>
      <Link to="/settings">
        <Button size="icon" variant="ghost" title="הגדרות">
          <Settings className="size-5" />
        </Button>
      </Link>
      <span className="mx-1 h-6 w-px bg-border" />
      <Button
        size="icon"
        variant={tool === "select" ? "default" : "ghost"}
        onClick={() => setTool("select")}
        title="בחירה / הזזת רכיבים"
      >
        <MousePointer2 className="size-5" />
      </Button>
      <Button
        size="icon"
        variant={tool === "pan" ? "default" : "ghost"}
        onClick={() => setTool("pan")}
        title="הזזת מסך"
      >
        <Hand className="size-5" />
      </Button>
      <span className="mx-1 h-6 w-px bg-border" />
      <Button
        size="icon"
        variant="ghost"
        onClick={onRotateSelected}
        title="סובב רכיב אחרון"
      >
        <RotateCw className="size-5" />
      </Button>
      <Button
        size="icon"
        variant="ghost"
        onClick={onClear}
        title="נקה לוח"
      >
        <Trash2 className="size-5" />
      </Button>
    </div>
  );
}
