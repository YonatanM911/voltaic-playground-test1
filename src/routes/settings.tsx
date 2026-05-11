import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ArrowRight } from "lucide-react";
import { applyTheme, getInitialTheme, type Theme } from "@/lib/theme";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "הגדרות — Voltica Laboratories" },
      { name: "description", content: "הגדרות מצב לילה ותצוגה." },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const [theme, setTheme] = useState<Theme>("dark");
  useEffect(() => {
    const t = getInitialTheme();
    setTheme(t);
    applyTheme(t);
  }, []);
  const set = (t: Theme) => {
    setTheme(t);
    applyTheme(t);
  };
  return (
    <div
      dir="rtl"
      className="min-h-screen bg-background px-6 py-10 text-foreground"
    >
      <div className="mx-auto max-w-xl">
        <Link to="/">
          <Button variant="ghost" size="sm" className="mb-6">
            <ArrowRight className="me-1 size-4" /> חזרה לדף הבית
          </Button>
        </Link>
        <h1 className="mb-6 text-3xl font-bold">הגדרות</h1>

        <section className="rounded-lg border border-border bg-card p-5">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <Label className="text-base">מצב לילה</Label>
              <p className="text-xs text-muted-foreground">
                החלף בין מצב בוקר (בהיר) למצב לילה (כהה).
              </p>
            </div>
            <Switch
              checked={theme === "dark"}
              onCheckedChange={(v) => set(v ? "dark" : "light")}
            />
          </div>
          <div className="mt-3 flex gap-2">
            <Button
              variant={theme === "light" ? "default" : "outline"}
              size="sm"
              onClick={() => set("light")}
            >
              מצב בוקר
            </Button>
            <Button
              variant={theme === "dark" ? "default" : "outline"}
              size="sm"
              onClick={() => set("dark")}
            >
              מצב לילה
            </Button>
          </div>
        </section>
      </div>
    </div>
  );
}
