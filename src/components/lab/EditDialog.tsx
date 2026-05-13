// Edit dialog. Shows the rename field, all three quantities (V/I/R) and
// — even when a quantity is not editable for this component type — its
// solved reading from the simulation. Each quantity also has a unit
// picker that overrides the global default.
import { useEffect, useState } from "react";
import {
  CAPABILITIES,
  COMPONENT_LABEL_HE,
  parseField,
  type PlacedComponent,
} from "@/lib/lab/types";
import { BASE_UNIT, fromBase, prefixedUnits, toBase, unitFactor, type Quantity } from "@/lib/lab/units";
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
import { useAppSettings } from "@/lib/lab/settingsStore";
import type { SolveResult } from "@/lib/lab/solver";

interface Props {
  component: PlacedComponent | null;
  solve: SolveResult;
  onClose: () => void;
  onSave: (next: PlacedComponent) => void;
  onUpdate: (next: PlacedComponent) => void;
  onDelete: (id: string) => void;
}

interface FieldState {
  raw: string;
  error: string | null;
}

function toRaw(siValue: number | string | null, unit: string, q: Quantity): string {
  if (siValue == null) return "";
  if (typeof siValue === "string") return siValue; // unknown name
  return String(fromBase(siValue, unit, q));
}

export function EditDialog({ component, solve, onClose, onSave, onUpdate, onDelete }: Props) {
  const [settings] = useAppSettings();
  const [name, setName] = useState("");
  const [voltage, setVoltage] = useState<FieldState>({ raw: "", error: null });
  const [current, setCurrent] = useState<FieldState>({ raw: "", error: null });
  const [resistance, setResistance] = useState<FieldState>({ raw: "", error: null });
  const [voltUnit, setVoltUnit] = useState("V");
  const [currUnit, setCurrUnit] = useState("A");
  const [resUnit, setResUnit] = useState("Ω");

  useEffect(() => {
    if (!component) return;
    setName(component.name);
    const vU = component.unitOverrides?.voltage ?? settings.defaultUnit.voltage;
    const cU = component.unitOverrides?.current ?? settings.defaultUnit.current;
    const rU = component.unitOverrides?.resistance ?? settings.defaultUnit.resistance;
    setVoltUnit(vU); setCurrUnit(cU); setResUnit(rU);
    setVoltage({ raw: toRaw(component.voltage, vU, "voltage"), error: null });
    setCurrent({ raw: toRaw(component.current, cU, "current"), error: null });
    setResistance({ raw: toRaw(component.resistance, rU, "resistance"), error: null });
  }, [component, settings]);

  if (!component) return null;
  const caps = CAPABILITIES[component.type];
  const sc = solve.components[component.id];

  const validateAndCommit = () => {
    const items: { state: FieldState; setter: (s: FieldState) => void; enabled: boolean; unit: string; q: Quantity }[] = [
      { state: voltage, setter: setVoltage, enabled: caps.voltage, unit: voltUnit, q: "voltage" },
      { state: current, setter: setCurrent, enabled: caps.current, unit: currUnit, q: "current" },
      { state: resistance, setter: setResistance, enabled: caps.resistance, unit: resUnit, q: "resistance" },
    ];
    let ok = true;
    const parsed: (number | string | null)[] = [null, null, null];
    items.forEach((it, i) => {
      if (!it.enabled) return;
      const r = parseField(it.state.raw);
      if (r.kind === "error") {
        it.setter({ ...it.state, error: r.message });
        ok = false;
      } else {
        it.setter({ ...it.state, error: null });
        parsed[i] =
          r.kind === "number" ? toBase(r.value, it.unit, it.q)
            : r.kind === "unknown" ? null
            : null;
      }
    });
    if (!ok) return;
    onSave({
      ...component,
      name: name.trim() || component.name,
      voltage: caps.voltage ? parsed[0] : component.voltage,
      current: caps.current ? parsed[1] : component.current,
      resistance: caps.resistance ? parsed[2] : component.resistance,
      unitOverrides: { voltage: voltUnit, current: currUnit, resistance: resUnit },
    });
  };

  const formatReading = (v: number | null, unit: string): string => {
    if (v == null) return "—";
    const display = v / unitFactor(unit, "voltage" as Quantity); // factor only depends on prefix length
    void display;
    // proper unit-aware display
    return formatWithUnit(v, unit);
  };
  void formatReading;

  function formatWithUnit(siValue: number | null, unit: string): string {
    if (siValue == null) return "—";
    const base = unit.slice(-1);
    const q: Quantity =
      base === "V" ? "voltage" : base === "A" ? "current" : "resistance";
    const v = fromBase(siValue, unit, q);
    const abs = Math.abs(v);
    const str =
      abs >= 100 ? v.toFixed(0) :
      abs >= 10 ? v.toFixed(1) :
      abs >= 1 ? v.toFixed(2) :
      v.toFixed(3);
    return `${str} ${unit}`;
  }

  return (
    <Dialog open={!!component} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle>עריכת {COMPONENT_LABEL_HE[component.type]}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="mb-1 block">שם הרכיב</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          <FieldBox
            label="מתח"
            disabled={!caps.voltage}
            state={voltage}
            unit={voltUnit}
            q="voltage"
            onUnitChange={setVoltUnit}
            reading={formatWithUnit(sc?.voltage ?? null, voltUnit)}
            onChange={(raw) => setVoltage({ raw, error: null })}
          />
          <FieldBox
            label="זרם"
            disabled={!caps.current}
            state={current}
            unit={currUnit}
            q="current"
            onUnitChange={setCurrUnit}
            reading={formatWithUnit(sc?.current ?? null, currUnit)}
            onChange={(raw) => setCurrent({ raw, error: null })}
          />
          <FieldBox
            label="התנגדות"
            disabled={!caps.resistance}
            state={resistance}
            unit={resUnit}
            q="resistance"
            onUnitChange={setResUnit}
            reading={formatWithUnit(sc?.resistance ?? null, resUnit)}
            onChange={(raw) => setResistance({ raw, error: null })}
          />
          {component.type === "switch" && (
            <div className="flex items-center justify-between rounded-md border border-border p-3">
              <Label>מצב המפסק (סגור = מוליך)</Label>
              <Switch
                checked={!!component.closed}
                onCheckedChange={(v) => onUpdate({ ...component, closed: v })}
              />
            </div>
          )}
        </div>
        <DialogFooter className="flex-row-reverse gap-2 sm:justify-start">
          <Button onClick={validateAndCommit}>שמור</Button>
          <Button variant="ghost" onClick={onClose}>ביטול</Button>
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
  label, state, onChange, disabled, unit, q, onUnitChange, reading,
}: {
  label: string;
  state: FieldState;
  onChange: (v: string) => void;
  disabled?: boolean;
  unit: string;
  q: Quantity;
  onUnitChange: (u: string) => void;
  reading: string;
}) {
  const units = prefixedUnits(q);
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <Label>{label} ({BASE_UNIT[q]})</Label>
        <span className="text-[11px] text-muted-foreground">{reading}</span>
      </div>
      <div className="flex gap-2 px-1">
        <Input
          value={state.raw}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          placeholder={disabled ? "לא ניתן לעריכה ברכיב זה" : "ערך מספרי"}
          className="flex-1 min-w-0"
        />
        <select
          value={unit}
          onChange={(e) => onUnitChange(e.target.value)}
          className="w-20 shrink-0 rounded-md border border-input bg-background px-2 pe-6 text-sm"
        >
          {units.map((u) => (
            <option key={u} value={u}>{u}</option>
          ))}
        </select>
      </div>
      {state.error && <p className="mt-1 text-xs text-destructive">{state.error}</p>}
    </div>
  );
}
