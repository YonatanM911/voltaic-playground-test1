import { useEffect, useState } from "react";
import {
  CAPABILITIES,
  COMPONENT_LABEL_HE,
  parseField,
  type PlacedComponent,
} from "@/lib/lab/types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";

interface Props {
  component: PlacedComponent | null;
  onClose: () => void;
  onSave: (next: PlacedComponent) => void;
  onUpdate: (next: PlacedComponent) => void;
  onDelete: (id: string) => void;
}

interface FieldState {
  raw: string;
  error: string | null;
}

function toRaw(v: number | string | null): string {
  if (v == null) return "";
  return String(v);
}

export function EditDialog({ component, onClose, onSave, onDelete }: Props) {
  const [voltage, setVoltage] = useState<FieldState>({ raw: "", error: null });
  const [current, setCurrent] = useState<FieldState>({ raw: "", error: null });
  const [resistance, setResistance] = useState<FieldState>({ raw: "", error: null });

  useEffect(() => {
    if (!component) return;
    setVoltage({ raw: toRaw(component.voltage), error: null });
    setCurrent({ raw: toRaw(component.current), error: null });
    setResistance({ raw: toRaw(component.resistance), error: null });
  }, [component]);

  if (!component) return null;
  const caps = CAPABILITIES[component.type];

  const validateAndCommit = () => {
    const fields: [FieldState, (s: FieldState) => void, boolean][] = [
      [voltage, setVoltage, caps.voltage],
      [current, setCurrent, caps.current],
      [resistance, setResistance, caps.resistance],
    ];
    let ok = true;
    const parsed: (number | string | null)[] = [null, null, null];
    fields.forEach(([f, set, enabled], i) => {
      if (!enabled) return;
      const r = parseField(f.raw);
      if (r.kind === "error") {
        set({ ...f, error: r.message });
        ok = false;
      } else {
        set({ ...f, error: null });
        parsed[i] =
          r.kind === "number" ? r.value : r.kind === "unknown" ? r.name : null;
      }
    });
    if (!ok) return;
    onSave({
      ...component,
      voltage: caps.voltage ? parsed[0] : null,
      current: caps.current ? parsed[1] : null,
      resistance: caps.resistance ? parsed[2] : null,
    });
  };

  return (
    <Dialog open={!!component} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle>עריכת {COMPONENT_LABEL_HE[component.type]}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <FieldBox
            label="מתח (V)"
            disabled={!caps.voltage}
            state={voltage}
            onChange={(raw) => setVoltage({ raw, error: null })}
          />
          <FieldBox
            label="זרם (A)"
            disabled={!caps.current}
            state={current}
            onChange={(raw) => setCurrent({ raw, error: null })}
          />
          <FieldBox
            label="התנגדות (Ω)"
            disabled={!caps.resistance}
            state={resistance}
            onChange={(raw) => setResistance({ raw, error: null })}
          />
          {component.type === "switch" && (
            <div className="flex items-center justify-between rounded-md border border-border p-3">
              <Label>מצב המפסק (סגור = מוליך)</Label>
              <Switch
                checked={!!component.closed}
                onCheckedChange={(v) =>
                  onSave({ ...component, closed: v })
                }
              />
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            הקלד מספר לערך קבוע, או שם נעלם המתחיל באות באנגלית (לדוגמה t1).
          </p>
        </div>
        <DialogFooter className="flex-row-reverse gap-2 sm:justify-start">
          <Button onClick={validateAndCommit}>שמור</Button>
          <Button variant="ghost" onClick={onClose}>
            ביטול
          </Button>
          <Button
            variant="destructive"
            className="me-auto"
            onClick={() => onDelete(component.id)}
          >
            <Trash2 className="size-4" /> מחק רכיב
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FieldBox({
  label,
  state,
  onChange,
  disabled,
}: {
  label: string;
  state: FieldState;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <div>
      <Label className="mb-1 block">{label}</Label>
      <Input
        value={state.raw}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder={disabled ? "לא רלוונטי לרכיב זה" : "ערך או שם נעלם"}
      />
      {state.error && (
        <p className="mt-1 text-xs text-destructive">{state.error}</p>
      )}
    </div>
  );
}
