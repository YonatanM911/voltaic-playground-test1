import { useEffect } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Settings, Zap } from "lucide-react";
import { applyTheme, getInitialTheme } from "@/lib/theme";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Voltica Laboratories" },
      {
        name: "description",
        content:
          "מעבדת מעגלים חשמליים אינטראקטיבית. בנה, נתח ופתור מעגלים בעצמך.",
      },
      { property: "og:title", content: "Voltica Laboratories" },
      {
        property: "og:description",
        content: "מעבדת מעגלים חשמליים אינטראקטיבית.",
      },
    ],
  }),
  component: HomePage,
});

function HomePage() {
  useEffect(() => {
    applyTheme(getInitialTheme());
  }, []);
  return (
    <div
      dir="rtl"
      className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-background px-6 text-foreground"
    >
      {/* settings button - top left */}
      <Link to="/settings" className="absolute start-4 top-4">
        <Button variant="ghost" size="icon">
          <Settings className="size-5" />
        </Button>
      </Link>

      {/* Background gradient circles for atmosphere */}
      <div
        aria-hidden
        className="pointer-events-none absolute -left-32 top-1/4 h-[420px] w-[420px] rounded-full opacity-30 blur-3xl"
        style={{ background: "radial-gradient(circle, var(--accent), transparent 60%)" }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-32 bottom-1/4 h-[420px] w-[420px] rounded-full opacity-30 blur-3xl"
        style={{ background: "radial-gradient(circle, var(--primary), transparent 60%)" }}
      />

      <div className="relative z-10 w-full max-w-2xl text-center">
        <div className="mx-auto mb-6 inline-flex items-center justify-center rounded-full border border-border bg-card/60 px-4 py-1.5 text-xs font-medium tracking-wider backdrop-blur">
          <Zap className="me-1 size-3.5" /> מעבדת חשמל אינטראקטיבית
        </div>
        <h1 className="text-balance text-5xl font-bold tracking-tight md:text-7xl">
          Voltica <span className="text-primary">Laboratories</span>
        </h1>
        <p className="mx-auto mt-5 max-w-lg text-balance text-base text-muted-foreground md:text-lg">
          בנה מעגלים חשמליים על קנבס אינסופי, חבר רכיבים, פתור נעלמים, וצפה
          במעגלים נצבעים בזמן אמת.
        </p>

        <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <Link to="/lab">
            <Button size="lg" className="px-10 text-base">
              כניסה למעבדה
            </Button>
          </Link>
        </div>

        <Link to="/settings" className="mx-auto mt-10 flex max-w-sm items-center justify-between rounded-lg border border-border bg-card/60 p-4 backdrop-blur transition hover:border-primary hover:bg-card">
          <span className="text-sm">הגדרות (מצב לילה / בוקר ועוד)</span>
          <Settings className="size-5 text-muted-foreground" />
        </Link>
      </div>
    </div>
  );
}
