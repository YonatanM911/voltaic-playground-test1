import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Settings, Sun, Moon, BookOpen } from "lucide-react";
import { applyTheme, getInitialTheme, setTheme as persistTheme, type Theme } from "@/lib/theme";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Voltica Laboratories" },
      { name: "description", content: "מעבדת מעגלים חשמליים אינטראקטיבית." },
      { property: "og:title", content: "Voltica Laboratories" },
      { property: "og:description", content: "מעבדת מעגלים חשמליים אינטראקטיבית." },
    ],
  }),
  component: HomePage,
});

function HomePage() {
  const [theme, setTh] = useState<Theme>("dark");
  useEffect(() => { const t = getInitialTheme(); setTh(t); applyTheme(t); }, []);
  const toggleTheme = () => { const n = theme === "dark" ? "light" : "dark"; setTh(n); persistTheme(n); };
  return (
    <div dir="rtl" className="relative flex min-h-screen flex-col items-center overflow-hidden bg-background px-6 pt-[18vh] text-foreground">
      <Button variant="ghost" size="icon" onClick={toggleTheme} className="absolute start-4 top-4" title="מצב לילה / יום">
        {theme === "dark" ? <Sun className="size-5" /> : <Moon className="size-5" />}
      </Button>

      <div aria-hidden className="pointer-events-none absolute -left-32 top-1/4 h-[420px] w-[420px] rounded-full opacity-30 blur-3xl"
        style={{ background: "radial-gradient(circle, var(--accent), transparent 60%)" }} />
      <div aria-hidden className="pointer-events-none absolute -right-32 bottom-1/4 h-[420px] w-[420px] rounded-full opacity-30 blur-3xl"
        style={{ background: "radial-gradient(circle, var(--primary), transparent 60%)" }} />

      <div className="relative z-10 w-full max-w-2xl text-center">
        <h1 className="text-balance text-6xl font-bold tracking-tight md:text-8xl">
          Voltica <span className="text-primary">Laboratories</span>
        </h1>

        <div className="mt-12 flex flex-col items-center justify-center gap-4">
          <Link to="/lab">
            <Button size="lg" className="px-12 py-6 text-lg">כניסה למעבדה</Button>
          </Link>
          <Link to="/settings">
            <Button size="lg" variant="outline" className="px-12 py-6 text-lg">
              <Settings className="me-2 size-5" /> הגדרות
            </Button>
          </Link>
        </div>
      </div>

      <div className="absolute inset-x-0 bottom-4 text-center text-xs text-muted-foreground" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        <a href="#" className="font-semibold tracking-wide text-foreground/80 hover:text-primary">SHAYS Studios</a>
        <span className="mx-2 opacity-50">·</span>
        <span>Voltica Laboratories</span>
      </div>
    </div>
  );
}
