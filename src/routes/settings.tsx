import { useEffect, useState } from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ArrowRight } from "lucide-react";
import { applyTheme, getInitialTheme, setTheme as persistTheme, type Theme } from "@/lib/theme";
import { useAppSettings } from "@/lib/lab/settingsStore";
import { prefixedUnits, type Quantity, QUANTITY_LABEL_HE } from "@/lib/lab/units";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "הגדרות — Voltica Laboratories" },
      { name: "description", content: "הגדרות תצוגה ויחידות מידה." },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const [theme, setTh] = useState<Theme>("dark");
  const [settings, updateSettings] = useAppSettings();
  const router = useRouter();

  useEffect(() => {
    const t = getInitialTheme();
    setTh(t);
    applyTheme(t);
  }, []);

  const set = (t: Theme) => { setTh(t); persistTheme(t); };

  return (
    <div dir="rtl" className="min-h-screen bg-background px-6 py-10 text-foreground">
      <div className="mx-auto max-w-xl">
        <Button variant="ghost" size="sm" className="mb-6" onClick={() => router.history.back()}>
          <ArrowRight className="me-1 size-4" /> חזרה
        </Button>
        <h1 className="mb-6 text-3xl font-bold">הגדרות</h1>

        <section className="rounded-lg border border-border bg-card p-5">
          <div className="flex flex-row-reverse items-center justify-between gap-4">
            <Switch
              checked={theme === "dark"}
              onCheckedChange={(v) => set(v ? "dark" : "light")}
            />
            <Label className="text-base">מצב לילה</Label>
          </div>
        </section>

        <section className="mt-4 rounded-lg border border-border bg-card p-5">
          <h2 className="mb-3 text-lg font-semibold">יחידות מידה ברירת מחדל</h2>
          <div className="space-y-3">
            {(["voltage", "current", "resistance"] as Quantity[]).map((q) => (
              <div key={q} className="flex flex-row-reverse items-center justify-between gap-4">
                <select
                  value={settings.defaultUnit[q]}
                  onChange={(e) => updateSettings({ defaultUnit: { ...settings.defaultUnit, [q]: e.target.value } })}
                  className="rounded-md border border-input bg-background px-3 py-1.5 text-sm"
                >
                  {prefixedUnits(q).map((u) => <option key={u} value={u}>{u}</option>)}
                </select>
                <Label>{QUANTITY_LABEL_HE[q]}</Label>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-4 rounded-lg border border-border bg-card p-5">
          <h2 className="mb-3 text-lg font-semibold">תצוגה במעבדה</h2>
          <div className="flex flex-row-reverse items-center justify-between">
            <Switch
              checked={settings.showNames}
              onCheckedChange={(v) => updateSettings({ showNames: v })}
            />
            <Label>הצג שמות רכיבים על הלוח</Label>
          </div>
        </section>
      </div>
    </div>
  );
}
