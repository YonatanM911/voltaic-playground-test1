// Edit dialog. Shows the rename field, all three quantities (V/I/R) and
// — even when a quantity is not editable for this component type — its
// solved reading from the simulation. Each quantity also has a unit
// picker that overrides the global default.
import { useEffect, useRef, useState } from "react";
import {
  CAPABILITIES,
  COMPONENT_LABEL_HE,
  parseField,
  type PlacedComponent,
} from "@/lib/lab/types";
import {
  BASE_UNIT,
  fromBase,
  prefixedUnits,
  toBase,
  unitFactor,
  type Quantity,
} from "@/lib/lab/units";
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
  onSave: (next: PlacedComponent) => string | null;
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

const EPS = 1e-12;

export function EditDialog({ component, solve, onClose, onSave, onUpdate, onDelete }: Props) {
  const [settings] = useAppSettings();
  const loadedComponentId = useRef<string | null>(null);
  const [name, setName] = useState("");
  const [voltage, setVoltage] = useState<FieldState>({ raw: "", error: null });
  const [current, setCurrent] = useState<FieldState>({ raw: "", error: null });
  const [resistance, setResistance] = useState<FieldState>({ raw: "", error: null });
  const [voltUnit, setVoltUnit] = useState("V");
  const [currUnit, setCurrUnit] = useState("A");
  const [meterMode, setMeterMode] = useState<NonNullable<PlacedComponent["meterMode"]>>("voltage");
  const [formError, setFormError] = useState<string | null>(null);
  const [resUnit, setResUnit] = useState("Ω");

  useEffect(() => {
    if (!component) {
      loadedComponentId.current = null;
      setFormError(null);
      return;
    }
    if (loadedComponentId.current === component.id) return;
    loadedComponentId.current = component.id;
    setFormError(null);
    setName(component.name);
    const vU = component.unitOverrides?.voltage ?? settings.defaultUnit.voltage;
    const cU = component.unitOverrides?.current ?? settings.defaultUnit.current;
    const rU = component.unitOverrides?.resistance ?? settings.defaultUnit.resistance;
    setVoltUnit(vU);
    setCurrUnit(cU);
    setResUnit(rU);
    setMeterMode(component.meterMode ?? "voltage");
    const defaultVoltage =
      component.type === "battery"
        ? component.voltage == null
          ? 9
          : component.voltage
        : component.constraints?.voltage ?? null;
    const defaultResistance =
      component.type === "battery"
        ? component.resistance == null
          ? 1
          : component.resistance
        : hasPhysicalResistance(component)
          ? component.resistance
          : component.constraints?.resistance ?? null;
    const defaultCurrent =
      component.type === "battery"
        ? component.current == null
          ? 9
          : component.current
        : component.constraints?.current ?? null;
    setVoltage({ raw: toRaw(defaultVoltage, vU, "voltage"), error: null });
    setCurrent({ raw: toRaw(defaultCurrent, cU, "current"), error: null });
    setResistance({ raw: toRaw(defaultResistance, rU, "resistance"), error: null });
  }, [component, settings]);

  if (!component) return null;
  const caps = CAPABILITIES[component.type];
  const sc = solve.components[component.id];
  const existingConstraintError = solve.constraintErrors.find((e) => e.componentId === component.id);
  const fieldEditable = (q: Quantity): boolean => {
    if (isMeter(component)) return false;
    if (component.type === "battery") return caps[q];
    if (q === "resistance" && hasPhysicalResistance(component)) return true;
    return true;
  };
  const fieldRole = (q: Quantity): "gives" | "gets" | "carries" | "has" => {
    if (component.type === "battery") return q === "resistance" ? "has" : "gives";
    if (q === "resistance") return "has";
    if (q === "current") return "carries";
    return "gets";
  };

  const parseBaseNumber = (raw: string, unit: string, q: Quantity): number | null => {
    const parsed = parseField(raw);
    return parsed.kind === "number" ? toBase(parsed.value, unit, q) : null;
  };

  const setFieldState = (q: Quantity, state: FieldState) => {
    if (q === "voltage") setVoltage(state);
    else if (q === "current") setCurrent(state);
    else setResistance(state);
  };

  const currentFieldState = (q: Quantity): FieldState => {
    if (q === "voltage") return voltage;
    if (q === "current") return current;
    return resistance;
  };

  const currentUnit = (q: Quantity): string => {
    if (q === "voltage") return voltUnit;
    if (q === "current") return currUnit;
    return resUnit;
  };

  const setUnitForQuantity = (q: Quantity, unit: string) => {
    if (q === "voltage") setVoltUnit(unit);
    else if (q === "current") setCurrUnit(unit);
    else setResUnit(unit);
  };

  const handleUnitChange = (q: Quantity, nextUnit: string) => {
    const prevUnit = currentUnit(q);
    const state = currentFieldState(q);
    const value = parseBaseNumber(state.raw, prevUnit, q);
    setUnitForQuantity(q, nextUnit);
    if (value != null) setFieldState(q, { raw: toRaw(value, nextUnit, q), error: null });
    onUpdate({
      ...component,
      unitOverrides: {
        ...component.unitOverrides,
        voltage: q === "voltage" ? nextUnit : voltUnit,
        current: q === "current" ? nextUnit : currUnit,
        resistance: q === "resistance" ? nextUnit : resUnit,
      },
    });
  };

  const handleBatteryFieldChange = (q: Quantity, raw: string) => {
    setFormError(null);
    const unit = currentUnit(q);
    const parsed = parseField(raw);
    setFieldState(q, { raw, error: parsed.kind === "error" ? parsed.message : null });
    if (parsed.kind !== "number") return;

    const editedValue = toBase(parsed.value, unit, q);
    let nextVoltage =
      parseBaseNumber(voltage.raw, voltUnit, "voltage") ?? numOrNull(component.voltage);
    let nextCurrent =
      parseBaseNumber(current.raw, currUnit, "current") ?? numOrNull(component.current);
    let nextResistance =
      parseBaseNumber(resistance.raw, resUnit, "resistance") ?? numOrNull(component.resistance);

    if (q === "voltage") {
      nextVoltage = editedValue;
      if (nextResistance != null && Math.abs(nextResistance) > EPS) {
        nextCurrent = nextVoltage / nextResistance;
        setCurrent({ raw: toRaw(nextCurrent, currUnit, "current"), error: null });
      }
    } else if (q === "current") {
      nextCurrent = editedValue;
      if (Math.abs(nextCurrent) <= EPS || nextVoltage == null) {
        setCurrent({ raw, error: "Current must not be zero" });
        return;
      }
      nextResistance = nextVoltage / nextCurrent;
      setResistance({ raw: toRaw(nextResistance, resUnit, "resistance"), error: null });
    } else {
      nextResistance = editedValue;
      if (Math.abs(nextResistance) <= EPS || nextVoltage == null) {
        setResistance({ raw, error: "Resistance must not be zero" });
        return;
      }
      nextCurrent = nextVoltage / nextResistance;
      setCurrent({ raw: toRaw(nextCurrent, currUnit, "current"), error: null });
    }

    onUpdate({
      ...component,
      voltage: nextVoltage,
      current: nextCurrent,
      resistance: nextResistance,
      unitOverrides: { voltage: voltUnit, current: currUnit, resistance: resUnit },
    });
  };

  const validateAndCommit = () => {
    const items: {
      state: FieldState;
      setter: (s: FieldState) => void;
      enabled: boolean;
      unit: string;
      q: Quantity;
    }[] = [
      {
        state: voltage,
        setter: setVoltage,
        enabled: fieldEditable("voltage"),
        unit: voltUnit,
        q: "voltage",
      },
      {
        state: current,
        setter: setCurrent,
        enabled: fieldEditable("current"),
        unit: currUnit,
        q: "current",
      },
      {
        state: resistance,
        setter: setResistance,
        enabled: fieldEditable("resistance"),
        unit: resUnit,
        q: "resistance",
      },
    ];
    setFormError(null);
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
        if (r.kind === "number") {
          const baseValue = toBase(r.value, it.unit, it.q);
          if (component.type === "battery" && it.q === "current" && Math.abs(baseValue) <= EPS) {
            it.setter({ ...it.state, error: "Value must not be zero" });
            ok = false;
            return;
          }
          if (
            ((component.type === "battery" && it.q === "resistance") ||
              (it.q === "resistance" && hasPhysicalResistance(component))) &&
            baseValue <= EPS
          ) {
            it.setter({ ...it.state, error: "Value must be greater than zero" });
            ok = false;
            return;
          }
          if (component.type !== "battery" && !hasPhysicalField(component, it.q) && baseValue < 0) {
            it.setter({ ...it.state, error: "Target must be non-negative" });
            ok = false;
            return;
          }
          parsed[i] = baseValue;
        } else {
          parsed[i] = null;
        }
      }
    });
    if (!ok) return;

    const constraints = { ...(component.constraints ?? {}) };
    const assignConstraint = (q: Quantity, value: number | string | null) => {
      if (typeof value === "number") constraints[q] = value;
      else delete constraints[q];
    };

    if (component.type !== "battery") {
      assignConstraint("voltage", parsed[0]);
      assignConstraint("current", parsed[1]);
      if (hasPhysicalResistance(component)) delete constraints.resistance;
      else assignConstraint("resistance", parsed[2]);
    }

    const next: PlacedComponent = {
      ...component,
      name: name.trim() || component.name,
      voltage: component.type === "battery" && caps.voltage ? parsed[0] : component.voltage,
      current: component.type === "battery" && caps.current ? parsed[1] : component.current,
      resistance:
        (component.type === "battery" && caps.resistance) || hasPhysicalResistance(component)
          ? parsed[2]
          : component.resistance,
      meterMode: component.type === "multimeter" ? meterMode : component.meterMode,
      unitOverrides: { voltage: voltUnit, current: currUnit, resistance: resUnit },
      constraints: Object.keys(constraints).length > 0 ? constraints : undefined,
    };
    const saveError = onSave(next);
    if (saveError) setFormError(saveError);
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
    const q: Quantity = base === "V" ? "voltage" : base === "A" ? "current" : "resistance";
    const v = fromBase(siValue, unit, q);
    const abs = Math.abs(v);
    const str =
      abs >= 100 ? v.toFixed(0) : abs >= 10 ? v.toFixed(1) : abs >= 1 ? v.toFixed(2) : v.toFixed(3);
    return `${str} ${unit}`;
  }

  const saveDisabled = hasFieldErrors(voltage, current, resistance) || formError != null;

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
            disabled={!fieldEditable("voltage")}
            role={fieldRole("voltage")}
            state={voltage}
            unit={voltUnit}
            q="voltage"
            onUnitChange={(u) => handleUnitChange("voltage", u)}
            reading={formatWithUnit(sc?.voltage ?? null, voltUnit)}
            onChange={(raw) =>
              component.type === "battery"
                ? handleBatteryFieldChange("voltage", raw)
                : (setFormError(null), setVoltage({ raw, error: null }))
            }
          />
          <FieldBox
            label="זרם"
            disabled={!fieldEditable("current")}
            role={fieldRole("current")}
            state={current}
            unit={currUnit}
            q="current"
            onUnitChange={(u) => handleUnitChange("current", u)}
            reading={formatWithUnit(sc?.current ?? null, currUnit)}
            onChange={(raw) =>
              component.type === "battery"
                ? handleBatteryFieldChange("current", raw)
                : (setFormError(null), setCurrent({ raw, error: null }))
            }
          />
          <FieldBox
            label="התנגדות"
            disabled={!fieldEditable("resistance")}
            role={fieldRole("resistance")}
            state={resistance}
            unit={resUnit}
            q="resistance"
            onUnitChange={(u) => handleUnitChange("resistance", u)}
            reading={formatWithUnit(sc?.resistance ?? null, resUnit)}
            onChange={(raw) =>
              component.type === "battery"
                ? handleBatteryFieldChange("resistance", raw)
                : (setFormError(null), setResistance({ raw, error: null }))
            }
          />
          {component.type === "battery" && (
            <div className="flex items-center justify-between rounded-md border border-border p-3">
              <Label>Battery on</Label>
              <Switch
                checked={component.closed !== false}
                onCheckedChange={(v) => onUpdate({ ...component, closed: v })}
              />
            </div>
          )}
          {component.type === "multimeter" && (
            <div className="rounded-md border border-border p-3">
              <Label className="mb-2 block">מצב מולטימטר</Label>
              <select
                value={meterMode}
                onChange={(e) => {
                  const next = e.target.value as NonNullable<PlacedComponent["meterMode"]>;
                  setMeterMode(next);
                  onUpdate({ ...component, meterMode: next });
                }}
                className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="voltage">מתח (V) - חיבור במקביל</option>
                <option value="current">זרם (A) - חיבור בטור</option>
                <option value="resistance">התנגדות (Ω) - במקביל כשהמעגל כבוי</option>
              </select>
            </div>
          )}
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
        {(formError || existingConstraintError) && (
          <p className="mb-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {formError ?? existingConstraintError?.message}
          </p>
        )}
        <DialogFooter className="flex-row-reverse gap-2 sm:justify-start">
          <Button onClick={validateAndCommit} disabled={saveDisabled}>
            שמור
          </Button>
          <Button variant="ghost" onClick={onClose}>
            ביטול
          </Button>
          <Button variant="destructive" className="me-auto" onClick={() => onDelete(component.id)}>
            <Trash2 className="size-4" /> מחק רכיב
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function numOrNull(value: number | string | null): number | null {
  return typeof value === "number" ? value : null;
}

function isMeter(component: PlacedComponent): boolean {
  return (
    component.type === "ammeter" ||
    component.type === "voltmeter" ||
    component.type === "ohmmeter" ||
    component.type === "multimeter"
  );
}

function hasPhysicalResistance(component: PlacedComponent): boolean {
  return component.type === "resistor" || component.type === "bulb";
}

function hasPhysicalField(component: PlacedComponent, q: Quantity): boolean {
  return component.type === "battery" || (q === "resistance" && hasPhysicalResistance(component));
}

function hasFieldErrors(...fields: FieldState[]): boolean {
  return fields.some((field) => field.error != null);
}

function FieldBox({
  label,
  role,
  state,
  onChange,
  disabled,
  unit,
  q,
  onUnitChange,
  reading,
}: {
  label: string;
  role: "gives" | "gets" | "carries" | "has";
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
        <Label>
          {label} ({BASE_UNIT[q]})
        </Label>
        <div className="flex items-center gap-2">
          <span className="rounded-sm bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            {role}
          </span>
          <span className="text-[11px] text-muted-foreground">{reading}</span>
        </div>
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
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </select>
      </div>
      {state.error && <p className="mt-1 text-xs text-destructive">{state.error}</p>}
    </div>
  );
}
