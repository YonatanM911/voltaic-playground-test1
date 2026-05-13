import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { ArrowRight, BookOpen, PlayCircle } from "lucide-react";
import { applyTheme, getInitialTheme } from "@/lib/theme";
import { useEffect } from "react";

export const Route = createFileRoute("/guide")({
  head: () => ({
    meta: [
      { title: "הדרכה — Voltica Laboratories" },
      { name: "description", content: "מדריך למידה מסודר לחוקי חשמל, חיבורים ורכיבים." },
    ],
  }),
  component: GuidePage,
});

// Hebrew educational videos — opened on YouTube. Order = learning order.
const LESSONS: { title: string; query: string }[] = [
  { title: "1. יסודות המעגל החשמלי", query: "מעגל חשמלי הסבר" },
  { title: "2. חוק אוהם והספק", query: "חוק אוהם בעברית" },
  { title: "3. חיבור טורי", query: "חיבור טורי נגדים" },
  { title: "4. חיבור מקבילי", query: "חיבור מקבילי נגדים" },
  { title: "5. גשרים ומשולשים", query: "גשר ויטסטון" },
  { title: "6. רכיבים ומודדים", query: "וולטמטר ואמפרמטר" },
  { title: "7. דיודות וזרמים", query: "דיודה הסבר" },
  { title: "8. שערים לוגיים AND OR XOR", query: "שערים לוגיים בעברית" },
];

function GuidePage() {
  useEffect(() => { applyTheme(getInitialTheme()); }, []);

  return (
    <main dir="rtl" className="min-h-screen bg-background px-5 py-8 text-foreground">
      <div className="mx-auto max-w-4xl">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-3xl font-bold"><BookOpen className="size-7 text-primary" /> הדרכה</h1>
            <p className="mt-2 text-sm text-muted-foreground">סדר למידה קצר וברור למעגלים חשמליים.</p>
          </div>
          <Link to="/lab">
            <Button variant="outline"><ArrowRight className="size-4" /> חזרה למעבדה</Button>
          </Link>
        </div>

        <p className="mb-4 text-xs text-muted-foreground">
          לחיצה על שיעור תפתח חיפוש סרטונים אמיתיים ביוטיוב בחלון חדש.
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          {LESSONS.map((lesson) => (
            <a
              key={lesson.title}
              href={`https://www.youtube.com/results?search_query=${encodeURIComponent(lesson.query)}`}
              target="_blank"
              rel="noreferrer"
              className="group overflow-hidden rounded-lg border border-border bg-card transition hover:border-primary hover:bg-accent"
            >
              <div className="relative flex aspect-video items-center justify-center bg-gradient-to-br from-primary/10 via-background to-accent">
                <span className="flex size-16 items-center justify-center rounded-full bg-primary/90 text-primary-foreground shadow-lg transition group-hover:scale-110">
                  <PlayCircle className="size-9" />
                </span>
              </div>
              <div className="flex items-center justify-between gap-2 p-4">
                <h2 className="text-base font-semibold">{lesson.title}</h2>
                <span className="text-xs text-muted-foreground">פתח ביוטיוב ↗</span>
              </div>
            </a>
          ))}
        </div>
      </div>
    </main>
  );
}