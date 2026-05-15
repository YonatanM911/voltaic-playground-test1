// Edit dialog. Shows component values, solved readings, unit overrides,
// and value toggles for parts whose physical values can be derived.
import { useEffect, useRef, useState } from "react";
import {
  CAPABILITIES,
  COMPONENT_LABEL_HE,
  parseField,
  type PlacedComponent,
} from "@/lib/lab/types";
import { BASE_UNIT, fromBase, prefixedUnits, toBase, type Quantity } from "@/lib/lab/units";
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

type EnabledMap = Record<Quantity, boolean>;

const QUANTITIES: Quantity[] = ["voltage", "current", "resistance"];
const EPS = 1e-12;

function toRaw(siValue: number | string | null, unit: string, q: Quantity): string {
  if (siValue == null) return "";
  if (typeof siValue === "string") return siValue;
  return String(fromBase(siValue, unit, q));
}

export function EditDialog({ component, solve, onClose, onSave, onUpdate, onDelete }: Props) {
  const [settings] = useAppSettings();
  const loadedComponentId = useRef<string | null>(null);
  const [name, setName] = useState("");
  const [voltage, setVoltage] = useState<FieldState>({ raw: "", error: null });
  const [current, setCurrent] = useState<FieldState>({ raw: "", error: null });
  const [resistance, setResistance] = useState<FieldState>({ raw: "", error: null });
  const [enabled, setEnabled] = useState<EnabledMap>({
    voltage: true,
    current: true,
    resistance: true,
  });
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
    const nextEnabled = inferValueEnabled(component);
    setEnabled(nextEnabled);

    const vU = component.unitOverrides?.voltage ?? settings.defaultUnit.voltage;
    const cU = component.unitOverrides?.current ?? settings.defaultUnit.current;
    const rU = component.unitOverrides?.resistance ?? settings.defaultUnit.resistance;
    setVoltUnit(vU);
    setCurrUnit(cU);
    setResUnit(rU);
    setMeterMode(component.meterMode ?? "voltage");

    const defaultVoltage =
      component.type === "battery" || component.type === "diode"
        ? component.voltage == null
          ? component.type === "battery"
            ? 9
            : 0.7
          : component.voltage
        : component.constraints?.voltage ?? null;
    const defaultResistance =
      component.type === "battery"
        ? component.resistance
        : hasPhysicalResistance(component)
          ? component.resistance
          : component.constraints?.resistance ?? null;
    const defaultCurrent =
      component.type === "battery" ? component.current : component.constraints?.current ?? null;
    setVoltage({ raw: toRaw(defaultVoltage, vU, "voltage"), error: null });
    setCurrent({ raw: toRaw(defaultCurrent, cU, "current"), error: null });
    setResistance({ raw: toRaw(defaultResistance, rU, "resistance"), error: null });
  }, [component, settings]);

  if (!component) return null;
  const caps = CAPABILITIES[component.type];
  const sc = solve.components[component.id];
  const existingConstraintError = solve.constraintErrors.find((e) => e.componentId === component.id);

  const canToggleField = (q: Quantity): boolean => {
    if (component.type === "battery") return caps[q];
    return hasPhysicalResistance(component);
  };

  const fieldEditable = (q: Quantity): boolean => {
    if (isMeter(component)) return false;
    if (canToggleField(q)) return enabled[q];
    if (component.type === "diode") return q === "voltage";
    return true;
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

  const setQuantityError = (q: Quantity, error: string | null) => {
    const state = currentFieldState(q);
    setFieldState(q, { ...state, error });
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

  const handleToggle = (q: Quantity, checked: boolean) => {
    setFormError(null);
    setEnabled((prev) => ({ ...prev, [q]: checked }));
    setQuantityError(q, null);
  };

  const handleBatteryFieldChange = (q: Quantity, raw: string) => {
    setFormError(null);
    const unit = currentUnit(q);
    const parsed = parseField(raw);
    setFieldState(q, { raw, error: parsed.kind === "error" ? parsed.message : null });
    if (parsed.kind !== "number") return;

    const editedValue = toBase(parsed.value, unit, q);
    let nextVoltage =
      q === "voltage"
        ? editedValue
        : parseBaseNumber(voltage.raw, voltUnit, "voltage") ?? numOrNull(component.voltage);
    let nextCurrent =
      q === "current"
        ? editedValue
        : parseBaseNumber(current.raw, currUnit, "current") ?? numOrNull(component.current);
    let nextResistance =
      q === "resistance"
        ? editedValue
        : parseBaseNumber(resistance.raw, resUnit, "resistance") ?? numOrNull(component.resistance);

    if (q === "voltage" && enabled.current && enabled.resistance && nextResistance != null) {
      if (nextResistance > EPS) {
        nextCurrent = nextVoltage / nextResistance;
        setCurrent({ raw: toRaw(nextCurrent, currUnit, "current"), error: null });
      }
    } else if (q === "current" && enabled.voltage && enabled.resistance) {
      if (nextCurrent > EPS && nextVoltage != null) {
        nextResistance = nextVoltage / nextCurrent;
        setResistance({ raw: toRaw(nextResistance, resUnit, "resistance"), error: null });
      }
    } else if (q === "resistance" && enabled.voltage && enabled.current) {
      if (nextResistance > EPS && nextVoltage != null) {
        nextCurrent = nextVoltage / nextResistance;
        setCurrent({ raw: toRaw(nextCurrent, currUnit, "current"), error: null });
      }
    }
  };

  const validateAndCommit = () => {
    setFormError(null);
    let ok = true;
    const parsed: Partial<Record<Quantity, number>> = {};

    for (const q of QUANTITIES) {
      const state = currentFieldState(q);
      if (!fieldEditable(q)) {
        setFieldState(q, { ...state, error: null });
        continue;
      }
      const r = parseField(state.raw);
      if (r.kind === "error") {
        setFieldState(q, { ...state, error: r.message });
        ok = false;
        continue;
      }
      setFieldState(q, { ...state, error: null });
      if (r.kind === "number") parsed[q] = toBase(r.value, currentUnit(q), q);
    }
    if (!ok) return;

    const constraints = { ...(component.constraints ?? {}) };
    let nextVoltage: number | string | null = component.voltage;
    let nextCurrent: number | string | null = component.current;
    let nextResistance: number | string | null = component.resistance;
    let nextValueEnabled: PlacedComponent["valueEnabled"] = component.valueEnabled;

    if (component.type === "battery") {
      const derived = validateBatteryValues(parsed, enabled, setQuantityError);
      if (!derived) return;
      nextVoltage = derived.voltage;
      nextCurrent = derived.current;
      nextResistance = derived.resistance;
      nextValueEnabled = { ...enabled };
    } else if (hasPhysicalResistance(component)) {
      const derived = validateLoadValues(parsed, enabled, setQuantityError);
      if (!derived) return;
      nextVoltage = component.voltage;
      nextCurrent = component.current;
      nextResistance = derived.resistance;
      nextValueEnabled = { ...enabled };
      if (enabled.voltage && typeof parsed.voltage === "number") constraints.voltage = parsed.voltage;
      else delete constraints.voltage;
      if (enabled.current && typeof parsed.current === "number") constraints.current = parsed.current;
      else delete constraints.current;
      delete constraints.resistance;
    } else if (component.type === "diode") {
      if (typeof parsed.voltage !== "number") {
        setQuantityError("voltage", "Value is required");
        return;
      }
      if (parsed.voltage < 0) {
        setQuantityError("voltage", "Value must be non-negative");
        return;
      }
      nextVoltage = parsed.voltage;
      delete constraints.voltage;
      delete constraints.current;
      delete constraints.resistance;
      nextValueEnabled = { voltage: true, current: false, resistance: false };
    } else if (!isMeter(component)) {
      for (const q of QUANTITIES) {
        if (typeof parsed[q] === "number") constraints[q] = parsed[q];
        else delete constraints[q];
      }
    }

    const next: PlacedComponent = {
      ...component,
      name: name.trim() || component.name,
      voltage: nextVoltage,
      current: nextCurrent,
      resistance: nextResistance,
      meterMode: component.type === "multimeter" ? meterMode : component.meterMode,
      unitOverrides: { voltage: voltUnit, current: currUnit, resistance: resUnit },
      constraints: Object.keys(constraints).length > 0 ? constraints : undefined,
      valueEnabled: nextValueEnabled,
    };
    const saveError = onSave(next);
    if (saveError) setFormError(saveError);
  };

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
            toggleChecked={canToggleField("voltage") ? enabled.voltage : undefined}
            onToggle={canToggleField("voltage") ? (v) => handleToggle("voltage", v) : undefined}
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
            toggleChecked={canToggleField("current") ? enabled.current : undefined}
            onToggle={canToggleField("current") ? (v) => handleToggle("current", v) : undefined}
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
            toggleChecked={canToggleField("resistance") ? enabled.resistance : undefined}
            onToggle={
              canToggleField("resistance") ? (v) => handleToggle("resistance", v) : undefined
            }
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

function validateBatteryValues(
  parsed: Partial<Record<Quantity, number>>,
  enabled: EnabledMap,
  setError: (q: Quantity, message: string | null) => void,
): { voltage: number | null; current: number | null; resistance: number | null } | null {
  const requireNumber = (q: Quantity): number | null => {
    if (!enabled[q]) return null;
    const value = parsed[q];
    if (typeof value !== "number") {
      setError(q, "Value is required");
      return null;
    }
    return value;
  };

  const v = requireNumber("voltage");
  const i = requireNumber("current");
  const r = requireNumber("resistance");
  if (
    (enabled.voltage && v == null) ||
    (enabled.current && i == null) ||
    (enabled.resistance && r == null)
  ) {
    return null;
  }

  if (!enabled.voltage && !(enabled.current && enabled.resistance)) {
    setError("voltage", "Enter voltage or current and resistance");
    return null;
  }
  if (enabled.voltage && v != null && v < 0) {
    setError("voltage", "Value must be non-negative");
    return null;
  }
  if (enabled.current && i != null && i < 0) {
    setError("current", "Value must be non-negative");
    return null;
  }
  if (enabled.resistance && (r == null || r <= EPS)) {
    setError("resistance", "Value must be greater than zero");
    return null;
  }

  let voltage = enabled.voltage ? v! : null;
  let current = enabled.current ? i! : null;
  let resistance = enabled.resistance ? r! : null;

  if (enabled.voltage && enabled.current && enabled.resistance) {
    if (!nearlyEqual(voltage!, current! * resistance!)) {
      setError("voltage", "Values do not match V = I × R");
      return null;
    }
  } else if (enabled.current && enabled.resistance && !enabled.voltage) {
    voltage = current! * resistance!;
  } else if (enabled.voltage && enabled.resistance && !enabled.current) {
    current = voltage! / resistance!;
  } else if (enabled.voltage && enabled.current && !enabled.resistance) {
    if (current! <= EPS) {
      setError("current", "Current must be greater than zero to calculate resistance");
      return null;
    }
    resistance = voltage! / current!;
  } else if (!enabled.voltage) {
    setError("voltage", "Enter voltage or current and resistance");
    return null;
  }

  return { voltage, current, resistance };
}

function validateLoadValues(
  parsed: Partial<Record<Quantity, number>>,
  enabled: EnabledMap,
  setError: (q: Quantity, message: string | null) => void,
): { resistance: number } | null {
  const hasR = enabled.resistance && typeof parsed.resistance === "number";
  const hasV = enabled.voltage && typeof parsed.voltage === "number";
  const hasI = enabled.current && typeof parsed.current === "number";

  if (enabled.resistance && !hasR) {
    setError("resistance", "Value is required");
    return null;
  }
  if (enabled.voltage && !hasV) {
    setError("voltage", "Value is required");
    return null;
  }
  if (enabled.current && !hasI) {
    setError("current", "Value is required");
    return null;
  }
  if (hasV && parsed.voltage! < 0) {
    setError("voltage", "Value must be non-negative");
    return null;
  }
  if (hasI && parsed.current! < 0) {
    setError("current", "Value must be non-negative");
    return null;
  }
  if (hasR && parsed.resistance! <= EPS) {
    setError("resistance", "Value must be greater than zero");
    return null;
  }

  let resistance = hasR ? parsed.resistance! : null;
  if (resistance == null) {
    if (!hasV || !hasI) {
      setError("resistance", "Enter resistance or voltage and current");
      return null;
    }
    if (parsed.current! <= EPS) {
      setError("current", "Current must be greater than zero to calculate resistance");
      return null;
    }
    resistance = parsed.voltage! / parsed.current!;
  }

  if (hasV && hasI && !nearlyEqual(parsed.voltage!, parsed.current! * resistance)) {
    setError("voltage", "Values do not match V = I × R");
    return null;
  }

  return { resistance };
}

function inferValueEnabled(component: PlacedComponent): EnabledMap {
  if (component.valueEnabled) {
    return {
      voltage: !!component.valueEnabled.voltage,
      current: !!component.valueEnabled.current,
      resistance: !!component.valueEnabled.resistance,
    };
  }
  if (component.type === "battery") {
    return {
      voltage: component.voltage != null,
      current: component.current != null,
      resistance: component.resistance != null,
    };
  }
  if (hasPhysicalResistance(component)) {
    return {
      voltage: component.constraints?.voltage != null,
      current: component.constraints?.current != null,
      resistance: component.resistance != null,
    };
  }
  if (component.type === "diode") {
    return { voltage: true, current: false, resistance: false };
  }
  return {
    voltage: component.constraints?.voltage != null,
    current: component.constraints?.current != null,
    resistance: component.constraints?.resistance != null,
  };
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

function hasFieldErrors(...fields: FieldState[]): boolean {
  return fields.some((field) => field.error != null);
}

function nearlyEqual(a: number, b: number, tolerance = 1e-6): boolean {
  return Math.abs(a - b) <= tolerance * Math.max(1, Math.abs(a), Math.abs(b));
}

function FieldBox({
  label,
  state,
  onChange,
  disabled,
  unit,
  q,
  onUnitChange,
  reading,
  toggleChecked,
  onToggle,
}: {
  label: string;
  state: FieldState;
  onChange: (v: string) => void;
  disabled?: boolean;
  unit: string;
  q: Quantity;
  onUnitChange: (u: string) => void;
  reading: string;
  toggleChecked?: boolean;
  onToggle?: (checked: boolean) => void;
}) {
  const units = prefixedUnits(q);
  const hasToggle = toggleChecked != null && onToggle != null;
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {hasToggle && <Switch checked={toggleChecked} onCheckedChange={onToggle} />}
          <Label>
            {label} ({BASE_UNIT[q]})
          </Label>
        </div>
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
          disabled={disabled}
          className="w-20 shrink-0 rounded-md border border-input bg-background px-2 pe-6 text-sm disabled:opacity-60"
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
