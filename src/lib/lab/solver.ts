// Voltica Laboratories — circuit solver (Modified Nodal Analysis).
//
// Replaces the previous loop-based solver with MNA so that parallel,
// series, and combined topologies all produce correct readings for
// resistors, ammeters, voltmeters, ohmmeters and multimeters.
//
// All quantities are SI (V, A, Ω). Display formatting lives in units.ts.

import type { PlacedComponent, ComponentType } from "./types";
import {
  COMPONENT_LENGTH,
  terminalPositions,
  allTerminalPositions,
  isConnector,
  isLogicGate,
  gateInputCount,
} from "./types";

export interface SolvedComponent {
  id: string;
  voltage: number | null;
  current: number | null;
  resistance: number | null;
  inActiveLoop: boolean;
  loopId: number | null;
  openCircuit: boolean;
  flowDirection: 0 | 1 | -1;
  measurementClosed: boolean;
  measurementPowered: boolean;
}

export interface UnknownSolution {
  name: string;
  value: number;
  unit: string;
}

export interface SolveResult {
  components: Record<string, SolvedComponent>;
  loopColors: Record<number, string>;
  unknowns: UnknownSolution[];
  errors: string[];
  openWarnings: {
    centerX: number;
    centerY: number;
    ids: string[];
    reason: "open" | "missing_consumer" | "missing_source" | "switch_open";
  }[];
}

const LOOP_COLORS = [
  "oklch(0.75 0.18 30)",
  "oklch(0.78 0.16 145)",
  "oklch(0.72 0.16 250)",
  "oklch(0.78 0.18 80)",
  "oklch(0.7 0.2 320)",
  "oklch(0.78 0.16 200)",
];

const DIODE_DROP_DEFAULT = 0.7;
const BATTERY_DEFAULT_V = 9;
const BATTERY_DEFAULT_R = 1;
// Ideal ammeter ≈ very small resistance. Modeling it as a tiny resistor
// (instead of a 0 V source) keeps the MNA matrix well-conditioned even when
// the user accidentally places the ammeter in parallel with another element.
const AMMETER_R = 1e-6;

const num = (v: number | string | null): number | null => (typeof v === "number" ? v : null);

// ---------- Union-find ----------
class UF {
  p: number[] = [];
  r: number[] = [];
  add() {
    this.p.push(this.p.length);
    this.r.push(0);
    return this.p.length - 1;
  }
  find(i: number): number {
    while (this.p[i] !== i) {
      this.p[i] = this.p[this.p[i]];
      i = this.p[i];
    }
    return i;
  }
  union(a: number, b: number) {
    const ra = this.find(a),
      rb = this.find(b);
    if (ra === rb) return;
    if (this.r[ra] < this.r[rb]) this.p[ra] = rb;
    else if (this.r[ra] > this.r[rb]) this.p[rb] = ra;
    else {
      this.p[rb] = ra;
      this.r[ra]++;
    }
  }
}

// ---------- Linear system ----------
function solveLinear(A: number[][], b: number[]): number[] | null {
  const n = b.length;
  if (n === 0) return [];
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
    if (Math.abs(M[piv][col]) < 1e-12) return null;
    [M[col], M[piv]] = [M[piv], M[col]];
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = M[r][col] / M[col][col];
      if (f === 0) continue;
      for (let cc = col; cc <= n; cc++) M[r][cc] -= f * M[col][cc];
    }
  }
  const x = new Array<number>(n);
  for (let i = 0; i < n; i++) x[i] = M[i][n] / M[i][i];
  return x;
}

// ---------- Geometry ----------
function pointOnSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  tol = 2,
): boolean {
  const dx = bx - ax,
    dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return false;
  const t = ((px - ax) * dx + (py - ay) * dy) / len2;
  if (t <= 0.05 || t >= 0.95) return false;
  const cx = ax + t * dx,
    cy = ay + t * dy;
  return (px - cx) ** 2 + (py - cy) ** 2 <= tol * tol;
}

// ---------- Component classification ----------
type Kind =
  | "wire" // zero R bridge: wire / connector / closed switch / gates
  | "ammeter" // zero-volt voltage source (gives true branch current via MNA)
  | "switch_open"
  | "battery"
  | "resistor" // resistor or bulb with finite R
  | "diode"
  | "voltmeter"
  | "ohmmeter"
  | "multimeter"
  | "logic_gate"
  | "open"; // unknown/zero-R consumer that can't be solved

function kindOf(c: PlacedComponent): Kind {
  const t = c.type;
  if (t === "wire" || isConnector(t)) return "wire";
  if (isLogicGate(t)) return "logic_gate";
  if (t === "ammeter") return "ammeter";
  if (t === "switch") return c.closed ? "wire" : "switch_open";
  if (t === "battery") return c.closed === false ? "switch_open" : "battery";
  if (t === "diode") return "diode";
  if (t === "voltmeter") return "voltmeter";
  if (t === "ohmmeter") return "ohmmeter";
  if (t === "multimeter") {
    if (c.meterMode === "current") return "ammeter";
    if (c.meterMode === "resistance") return "ohmmeter";
    return "voltmeter";
  }
  if (t === "resistor" || t === "bulb") {
    const r = num(c.resistance);
    if (r != null && r > 0) return "resistor";
    return "open";
  }
  return "open";
}

// ---------- Main solve ----------
interface Endpoint {
  c: PlacedComponent;
  nodes: number[];
}

export function solve(components: PlacedComponent[]): SolveResult {
  const result: SolveResult = {
    components: {},
    loopColors: {},
    unknowns: [],
    errors: [],
    openWarnings: [],
  };
  for (const c of components) {
    result.components[c.id] = {
      id: c.id,
      voltage: num(c.voltage),
      current: null,
      resistance: num(c.resistance),
      inActiveLoop: false,
      loopId: null,
      openCircuit: false,
      flowDirection: 0,
      measurementClosed: false,
      measurementPowered: false,
    };
  }
  if (components.length === 0) return result;

  // ----- 1. Build nodes + endpoints -----
  const uf = new UF();
  const nodeMap = new Map<string, number>();
  const keyOf = (x: number, y: number) => `${Math.round(x)}:${Math.round(y)}`;
  const nodeId = (x: number, y: number): number => {
    const k = keyOf(x, y);
    let id = nodeMap.get(k);
    if (id == null) {
      id = uf.add();
      nodeMap.set(k, id);
    }
    return id;
  };

  const eps: Endpoint[] = [];
  for (const c of components) {
    if (isConnector(c.type) || isLogicGate(c.type)) {
      const pts = allTerminalPositions(c);
      const ids = pts.map((p) => nodeId(p.x, p.y));
      if (isConnector(c.type)) {
        for (let i = 1; i < ids.length; i++) uf.union(ids[0], ids[i]);
      }
      eps.push({ c, nodes: ids });
    } else {
      const [t0, t1] = terminalPositions(c);
      eps.push({ c, nodes: [nodeId(t0.x, t0.y), nodeId(t1.x, t1.y)] });
    }
  }

  // T-junction merging via wires
  for (const we of eps) {
    if (we.c.type !== "wire") continue;
    const [wa, wb] = terminalPositions(we.c);
    for (const ce of eps) {
      if (ce.c.id === we.c.id) continue;
      const positions = isConnector(ce.c.type)
        ? allTerminalPositions(ce.c)
        : isLogicGate(ce.c.type)
          ? allTerminalPositions(ce.c)
          : terminalPositions(ce.c);
      for (const p of positions) {
        if (pointOnSegment(p.x, p.y, wa.x, wa.y, wb.x, wb.y)) {
          uf.union(nodeId(p.x, p.y), nodeId(wa.x, wa.y));
        }
      }
    }
  }

  // Merge zero-R bridges (wires, gates, closed switches, connectors handled above, ammeter)
  for (const ce of eps) {
    if (kindOf(ce.c) === "wire") {
      for (let i = 1; i < ce.nodes.length; i++) uf.union(ce.nodes[0], ce.nodes[i]);
    }
  }

  // ----- 2. Build conducting adjacency (for warnings + loop grouping) -----
  // A component "conducts" if it can carry current: wire/battery/resistor/diode.
  // Voltmeters/ohmmeters/multimeters/open switches do NOT conduct.
  const adj = new Map<number, Set<number>>();
  const externalAdj = new Map<number, Set<number>>();
  const linkAdj = (a: number, b: number) => {
    if (a === b) return;
    if (!adj.has(a)) adj.set(a, new Set());
    if (!adj.has(b)) adj.set(b, new Set());
    adj.get(a)!.add(b);
    adj.get(b)!.add(a);
  };
  const linkExternalAdj = (a: number, b: number) => {
    if (a === b) return;
    if (!externalAdj.has(a)) externalAdj.set(a, new Set());
    if (!externalAdj.has(b)) externalAdj.set(b, new Set());
    externalAdj.get(a)!.add(b);
    externalAdj.get(b)!.add(a);
  };
  for (const ce of eps) {
    const k = kindOf(ce.c);
    if (
      k === "voltmeter" ||
      k === "ohmmeter" ||
      k === "multimeter" ||
      k === "logic_gate" ||
      k === "switch_open" ||
      k === "open"
    )
      continue;
    const a = uf.find(ce.nodes[0]);
    for (let i = 1; i < ce.nodes.length; i++) {
      const b = uf.find(ce.nodes[i]);
      linkAdj(a, b);
      if (k !== "battery") linkExternalAdj(a, b);
    }
  }

  // Connected components of the conducting graph
  const compOfNode = new Map<number, number>();
  let ncc = 0;
  for (const start of adj.keys()) {
    if (compOfNode.has(start)) continue;
    const id = ncc++;
    const q = [start];
    while (q.length) {
      const u = q.shift()!;
      if (compOfNode.has(u)) continue;
      compOfNode.set(u, id);
      adj.get(u)?.forEach((v) => {
        if (!compOfNode.has(v)) q.push(v);
      });
    }
  }

  // ----- 3. Identify "active" connected components: those containing a source -----
  const compHasSource = new Set<number>();
  const compHasConsumer = new Set<number>();
  const compHasOpenSwitch = new Set<number>();
  // Track open-switch components separately (an open switch cuts the path).
  for (const ce of eps) {
    const cc = compOfNode.get(uf.find(ce.nodes[0]));
    if (cc == null) continue;
    const k = kindOf(ce.c);
    if (k === "battery") {
      compHasSource.add(cc);
      if (hasExternalPath(uf.find(ce.nodes[0]), uf.find(ce.nodes[1]), externalAdj)) {
        compHasConsumer.add(cc);
      }
    }
    if (k === "resistor") compHasConsumer.add(cc);
    if (ce.c.type === "switch" && !ce.c.closed) {
      // If the switch were closed, would it bridge two nodes that otherwise
      // aren't connected? We don't know without re-running CC; cheaply mark
      // every neighbor component with "has open switch nearby".
      const a = uf.find(ce.nodes[0]);
      const b = uf.find(ce.nodes[1]);
      const ca = compOfNode.get(a);
      const cb = compOfNode.get(b);
      if (ca != null) compHasOpenSwitch.add(ca);
      if (cb != null && cb !== ca) compHasOpenSwitch.add(cb);
    }
  }

  // ----- 4. MNA per active component -----
  const groundOf = new Map<number, number>(); // ccId -> ground node
  const nodeIdx = new Map<number, number>(); // node -> matrix row
  const vSourceList: {
    ce: Endpoint;
    v: number;
    nA: number;
    nB: number;
    idx: number;
    cc: number;
  }[] = [];
  const ccActiveNodes = new Map<number, Set<number>>();

  for (const cc of compHasSource) {
    const nodes: number[] = [];
    for (const [n, c] of compOfNode) if (c === cc) nodes.push(n);
    if (nodes.length === 0) continue;
    ccActiveNodes.set(cc, new Set(nodes));
    groundOf.set(cc, nodes[0]);
    for (let i = 1; i < nodes.length; i++) nodeIdx.set(nodes[i], 0); // placeholder
  }
  // Re-index linearly
  let nIdx = 0;
  const nodeIdxFinal = new Map<number, number>();
  for (const n of nodeIdx.keys()) nodeIdxFinal.set(n, nIdx++);

  // Voltage sources (diodes only). Batteries with internal resistance are
  // stamped below as Norton equivalents, and ammeters are stamped as tiny
  // resistors.
  for (const ce of eps) {
    const k = kindOf(ce.c);
    if (k !== "diode") continue;
    const a = uf.find(ce.nodes[0]);
    const b = uf.find(ce.nodes[1]);
    const cc = compOfNode.get(a);
    if (cc == null || !compHasSource.has(cc)) continue;
    // Diode: forward direction = a→b (terminal 0 → terminal 1).
    const v = num(ce.c.voltage) ?? DIODE_DROP_DEFAULT;
    vSourceList.push({ ce, v, nA: a, nB: b, idx: vSourceList.length, cc });
  }

  const N = nIdx + vSourceList.length;
  let xSol: number[] | null = null;
  if (N > 0) {
    const A: number[][] = Array.from({ length: N }, () => new Array(N).fill(0));
    const bv: number[] = new Array(N).fill(0);
    // Resistor, ammeter and battery internal-resistance stamps.
    for (const ce of eps) {
      const kk = kindOf(ce.c);
      let r: number | null = null;
      if (kk === "resistor") r = num(ce.c.resistance);
      else if (kk === "ammeter") r = AMMETER_R;
      else if (kk === "battery") r = num(ce.c.resistance) ?? BATTERY_DEFAULT_R;
      else continue;
      if (r == null || r <= 0) continue;
      const a = uf.find(ce.nodes[0]);
      const b = uf.find(ce.nodes[1]);
      const cc = compOfNode.get(a);
      if (cc == null || !compHasSource.has(cc)) continue;
      const g = 1 / r;
      const ia = nodeIdxFinal.get(a);
      const ib = nodeIdxFinal.get(b);
      if (ia != null) A[ia][ia] += g;
      if (ib != null) A[ib][ib] += g;
      if (ia != null && ib != null) {
        A[ia][ib] -= g;
        A[ib][ia] -= g;
      }
      if (kk === "battery") {
        const sourceCurrent = (num(ce.c.voltage) ?? BATTERY_DEFAULT_V) / r;
        if (ia != null) bv[ia] += sourceCurrent;
        if (ib != null) bv[ib] -= sourceCurrent;
      }
    }
    // Voltage source stamps
    vSourceList.forEach((vs, k) => {
      const ia = nodeIdxFinal.get(vs.nA);
      const ib = nodeIdxFinal.get(vs.nB);
      const row = nIdx + k;
      if (ia != null) {
        A[ia][row] += 1;
        A[row][ia] += 1;
      }
      if (ib != null) {
        A[ib][row] -= 1;
        A[row][ib] -= 1;
      }
      bv[row] = vs.v;
    });
    xSol = solveLinear(A, bv);
  }

  const Vnode = (n: number): number => {
    const f = uf.find(n);
    const idx = nodeIdxFinal.get(f);
    if (idx == null || !xSol) return 0;
    return xSol[idx];
  };

  // ----- 5. Loop coloring per active component -----
  const ccLoopId = new Map<number, number>();
  let nextLoop = 0;
  for (const cc of compHasSource) {
    if (!compHasConsumer.has(cc)) continue; // skip "missing_consumer" comps
    if (compHasOpenSwitch.has(cc)) continue; // skip "switch_open" comps
    ccLoopId.set(cc, nextLoop);
    result.loopColors[nextLoop] = LOOP_COLORS[nextLoop % LOOP_COLORS.length];
    nextLoop++;
  }

  // ----- 6. Per-component readings -----
  for (const ce of eps) {
    const sc = result.components[ce.c.id];
    const a = uf.find(ce.nodes[0]);
    const b = uf.find(ce.nodes[ce.nodes.length > 1 ? 1 : 0]);
    const cc = compOfNode.get(a);
    if (cc != null && ccLoopId.has(cc)) {
      sc.inActiveLoop = true;
      sc.loopId = ccLoopId.get(cc)!;
    }

    if (
      ce.c.type === "ohmmeter" ||
      (ce.c.type === "multimeter" && ce.c.meterMode === "resistance")
    ) {
      const passive = computeEquivRWithComponents(ce, eps, uf);
      sc.measurementPowered = isResistanceMeasurementPowered(ce, eps, uf);
      sc.resistance = sc.measurementPowered ? null : passive.resistance;
      if (sc.resistance != null) {
        sc.measurementClosed = true;
        for (const id of passive.componentIds) {
          const measured = result.components[id];
          measured.inActiveLoop = true;
          measured.loopId = measured.loopId ?? nextLoop;
        }
        result.loopColors[nextLoop] = LOOP_COLORS[nextLoop % LOOP_COLORS.length];
        nextLoop++;
      }
    }

    if (xSol == null) continue;

    const Va = Vnode(a);
    const Vb = Vnode(b);
    const dV = Va - Vb;
    const k = kindOf(ce.c);
    const isPoweredCc = cc != null && compHasSource.has(cc);

    if (k === "resistor") {
      if (!isPoweredCc) continue;
      const r = num(ce.c.resistance);
      if (r != null && r > 0) {
        sc.voltage = Math.abs(dV);
        sc.current = Math.abs(dV) / r;
        sc.resistance = r;
      }
    } else if (k === "battery") {
      if (!isPoweredCc) continue;
      const nominalVoltage = num(ce.c.voltage) ?? BATTERY_DEFAULT_V;
      const internalResistance = num(ce.c.resistance) ?? BATTERY_DEFAULT_R;
      if (internalResistance != null && internalResistance > 0) {
        sc.voltage = Math.abs(dV);
        sc.current = Math.abs((nominalVoltage - dV) / internalResistance);
        sc.resistance = internalResistance;
      } else {
        sc.current = num(ce.c.current);
        sc.voltage = nominalVoltage;
      }
    } else if (k === "diode") {
      if (!isPoweredCc) continue;
      const vs = vSourceList.find((v) => v.ce.c.id === ce.c.id);
      if (vs) sc.current = Math.abs(xSol[nIdx + vs.idx]);
      sc.voltage = num(ce.c.voltage) ?? DIODE_DROP_DEFAULT;
    } else if (
      ce.c.type === "ammeter" ||
      (ce.c.type === "multimeter" && ce.c.meterMode === "current")
    ) {
      if (!sc.inActiveLoop) continue;
      // Ammeter is stamped as a tiny resistor; its current = ΔV / R_tiny.
      sc.current = Math.abs(dV) / AMMETER_R;
    } else if (
      ce.c.type === "voltmeter" ||
      (ce.c.type === "multimeter" && (ce.c.meterMode == null || ce.c.meterMode === "voltage"))
    ) {
      if (!isPoweredCc) continue;
      sc.voltage = Math.abs(dV);
    } else if (ce.c.type === "ohmmeter") {
      const passive = computeEquivRWithComponents(ce, eps, uf);
      sc.measurementPowered = isResistanceMeasurementPowered(ce, eps, uf);
      sc.resistance = sc.measurementPowered ? null : passive.resistance;
      if (sc.resistance != null) sc.measurementClosed = true;
    } else if (ce.c.type === "wire") {
      if (!sc.inActiveLoop) continue;
      sc.flowDirection = dV >= 0 ? 1 : -1;
    }
  }

  computeLogicGateReadings(eps, uf, result, Vnode, xSol != null);

  // ----- 7. Open warnings -----
  for (const cc of compHasSource) {
    if (ccLoopId.has(cc)) continue;
    // Pick representative center: average of battery components' positions.
    const ids: string[] = [];
    let cx = 0,
      cy = 0,
      n = 0;
    for (const ce of eps) {
      const a = uf.find(ce.nodes[0]);
      if (compOfNode.get(a) !== cc) continue;
      ids.push(ce.c.id);
      cx += ce.c.x;
      cy += ce.c.y;
      n++;
    }
    if (n === 0) continue;
    let reason: "missing_consumer" | "switch_open" = "missing_consumer";
    if (compHasOpenSwitch.has(cc)) reason = "switch_open";
    else if (!compHasConsumer.has(cc)) reason = "missing_consumer";
    result.openWarnings.push({
      centerX: cx / n,
      centerY: cy / n - COMPONENT_LENGTH / 2,
      ids,
      reason,
    });
  }
  // Lone battery (not in any conducting CC, e.g. floating)
  for (const ce of eps) {
    if (ce.c.type !== "battery") continue;
    const a = uf.find(ce.nodes[0]);
    if (compOfNode.has(a)) continue;
    result.openWarnings.push({
      centerX: ce.c.x,
      centerY: ce.c.y - 36,
      ids: [ce.c.id],
      reason: "open",
    });
  }
  // Lone consumers (no battery anywhere → "חסר ספק")
  const anyBattery = components.some((c) => c.type === "battery" && c.closed !== false);
  if (!anyBattery) {
    for (const ce of eps) {
      const t = ce.c.type;
      if (t !== "resistor" && t !== "bulb" && t !== "diode") continue;
      result.openWarnings.push({
        centerX: ce.c.x,
        centerY: ce.c.y - 36,
        ids: [ce.c.id],
        reason: "missing_source",
      });
    }
  }

  return result;
}

// Branch-current heuristic for ammeters: ammeter is a wire (zero R) that
// merges its two terminals into one node. To recover the branch current,
// pick the resistor or voltage source whose current we know AND whose path
// uniquely traverses the ammeter. For typical student circuits (ammeter in
// series with a single branch), this works correctly.
function computeAmmeterCurrent(
  ammeter: { c: PlacedComponent; nodes: number[] },
  eps: { c: PlacedComponent; nodes: number[] }[],
  uf: UF,
  Vnode: (n: number) => number,
  vSources: { ce: { c: PlacedComponent }; idx: number; v: number }[],
  xSol: number[],
  nIdx: number,
): number {
  // The ammeter's terminals are merged in node-space, so we look at the
  // ORIGINAL terminal positions to identify "neighbor" components attached
  // at exactly one of the ammeter's two physical terminals.
  const [t0, t1] = terminalPositions(ammeter.c);
  const hits = (px: number, py: number) =>
    eps.filter(
      (e) =>
        e.c.id !== ammeter.c.id &&
        (isConnector(e.c.type) ? allTerminalPositions(e.c) : terminalPositions(e.c)).some(
          (p) => Math.abs(p.x - px) < 1 && Math.abs(p.y - py) < 1,
        ),
    );
  const candidates = [...hits(t0.x, t0.y), ...hits(t1.x, t1.y)];
  // Prefer a resistor neighbor (well-defined current).
  for (const e of candidates) {
    const k = kindOf(e.c);
    if (k === "resistor") {
      const r = num(e.c.resistance);
      if (r == null || r <= 0) continue;
      const a = uf.find(e.nodes[0]);
      const b = uf.find(e.nodes[1]);
      return Math.abs((Vnode(a) - Vnode(b)) / r);
    }
  }
  for (const e of candidates) {
    const k = kindOf(e.c);
    if (k === "battery" || k === "diode") {
      const vs = vSources.find((v) => v.ce.c.id === e.c.id);
      if (vs) return Math.abs(xSol[nIdx + vs.idx]);
    }
  }
  return 0;
}

function isResistanceMeasurementPowered(
  meter: { c: PlacedComponent; nodes: number[] },
  eps: { c: PlacedComponent; nodes: number[] }[],
  uf: UF,
): boolean {
  const start = new Set(meter.nodes.map((n) => uf.find(n)));
  const seen = new Set<number>();
  const q = [...start];

  while (q.length) {
    const n = q.shift()!;
    if (seen.has(n)) continue;
    seen.add(n);

    for (const ce of eps) {
      if (ce.c.id === meter.c.id) continue;
      const roots = ce.nodes.map((node) => uf.find(node));
      if (!roots.includes(n)) continue;
      const k = kindOf(ce.c);
      if (k === "battery" || k === "diode") return true;
      if (k !== "wire" && k !== "ammeter" && k !== "resistor") continue;
      for (const next of roots) {
        if (!seen.has(next)) q.push(next);
      }
    }
  }

  return false;
}

function hasExternalPath(start: number, end: number, adj: Map<number, Set<number>>): boolean {
  if (start === end) return true;
  const seen = new Set<number>();
  const q = [start];
  while (q.length) {
    const n = q.shift()!;
    if (n === end) return true;
    if (seen.has(n)) continue;
    seen.add(n);
    adj.get(n)?.forEach((next) => {
      if (!seen.has(next)) q.push(next);
    });
  }
  return false;
}

function computeLogicGateReadings(
  eps: { c: PlacedComponent; nodes: number[] }[],
  uf: UF,
  result: SolveResult,
  Vnode: (n: number) => number,
  hasAnalogSolution: boolean,
) {
  const nodeLogic = new Map<number, 0 | 1>();
  for (const ce of eps) {
    if (ce.c.type !== "battery" || ce.c.closed === false) continue;
    const v = num(ce.c.voltage);
    if (v == null) continue;
    const highNode = uf.find(ce.nodes[1]);
    const lowNode = uf.find(ce.nodes[0]);
    nodeLogic.set(highNode, v >= 0.5 ? 1 : 0);
    nodeLogic.set(lowNode, 0);
  }
  if (hasAnalogSolution) {
    for (const ce of eps) {
      for (const node of ce.nodes) {
        const root = uf.find(node);
        nodeLogic.set(root, Vnode(root) >= 0.5 ? 1 : 0);
      }
    }
  }

  const gates = eps.filter((ce) => isLogicGate(ce.c.type));
  for (let pass = 0; pass < Math.max(1, gates.length); pass++) {
    let changed = false;
    for (const gate of gates) {
      const inputCount = gateInputCount(gate.c.type);
      const inputNodes = gate.nodes.slice(0, inputCount);
      const output = evaluateGate(
        gate.c.type,
        inputNodes.map((n) => nodeLogic.get(uf.find(n)) ?? 0),
      );
      const outputNode = uf.find(gate.nodes[gate.nodes.length - 1]);
      if (nodeLogic.get(outputNode) !== output) {
        nodeLogic.set(outputNode, output);
        changed = true;
      }
      const sc = result.components[gate.c.id];
      sc.voltage = output;
      sc.current = null;
      sc.resistance = null;
    }
    if (!changed) break;
  }
}

function evaluateGate(t: ComponentType, values: (0 | 1)[]): 0 | 1 {
  const inputCount = gateInputCount(t);
  const a = values[0] ?? 0;
  const b = inputCount === 2 ? (values[1] ?? 0) : 0;
  switch (t) {
    case "gate_and":
      return a === 1 && b === 1 ? 1 : 0;
    case "gate_or":
      return a === 1 || b === 1 ? 1 : 0;
    case "gate_xor":
      return a !== b ? 1 : 0;
    case "gate_not":
      return a === 1 ? 0 : 1;
    case "gate_buffer":
      return a === 1 ? 1 : 0;
    case "gate_nand":
      return a === 1 && b === 1 ? 0 : 1;
    case "gate_nor":
      return a === 1 || b === 1 ? 0 : 1;
    case "gate_xnor":
      return a !== b ? 0 : 1;
    default:
      return 0;
  }
}

// Equivalent resistance between an ohmmeter's two terminals. Following the
// physical procedure for measuring resistance, voltage sources are removed
// from the circuit (treated as OPEN — i.e. ignored entirely), so a battery
// in series with the resistor under test does not short it out. Wires,
// connectors, closed switches and ammeters are treated as ideal conductors.
function computeEquivR(
  meter: { c: PlacedComponent; nodes: number[] },
  eps: { c: PlacedComponent; nodes: number[] }[],
  uf: UF,
): number | null {
  return computeEquivRWithComponents(meter, eps, uf).resistance;
}

function computeEquivRWithComponents(
  meter: { c: PlacedComponent; nodes: number[] },
  eps: { c: PlacedComponent; nodes: number[] }[],
  uf: UF,
): { resistance: number | null; componentIds: string[] } {
  const sub = new UF();
  const remap = new Map<number, number>();

  // Collect all canonical nodes. Disconnected passive islands are filtered out
  // below before solving, so they cannot make the matrix singular.
  const allNodes = new Set<number>();
  for (const ce of eps) {
    for (const n of ce.nodes) allNodes.add(uf.find(n));
  }
  allNodes.add(uf.find(meter.nodes[0]));
  allNodes.add(uf.find(meter.nodes[1]));

  for (const n of allNodes) remap.set(n, sub.add());
  const subOf = (n: number): number => remap.get(uf.find(n))!;

  // Merge for every wire-equivalent edge (wires + ammeters act as ideal
  // conductors). Batteries and diodes are deliberately omitted: an ohmmeter
  // assumes the device under test is de-energised.
  for (const ce of eps) {
    const k = kindOf(ce.c);
    if (k === "wire" || k === "ammeter") {
      const a0 = uf.find(ce.nodes[0]);
      if (!allNodes.has(a0)) continue;
      for (let i = 1; i < ce.nodes.length; i++) {
        const ai = uf.find(ce.nodes[i]);
        if (!allNodes.has(ai)) continue;
        sub.union(subOf(a0), subOf(ai));
      }
    }
  }

  const subA = uf.find(meter.nodes[0]);
  const subB = uf.find(meter.nodes[1]);
  const subA2 = subOf(subA);
  const subB2 = subOf(subB);
  if (sub.find(subA2) === sub.find(subB2)) return { resistance: 0, componentIds: [meter.c.id] };

  const resistorEdges: { a: number; b: number; r: number; id: string }[] = [];
  for (const ce of eps) {
    if (kindOf(ce.c) !== "resistor") continue;
    const r = num(ce.c.resistance);
    if (r == null || r <= 0) continue;
    resistorEdges.push({
      a: sub.find(subOf(ce.nodes[0])),
      b: sub.find(subOf(ce.nodes[1])),
      r,
      id: ce.c.id,
    });
  }

  // Keep only the passive network reachable from the meter's first terminal.
  const passiveAdj = new Map<number, Set<number>>();
  const linkPassive = (a: number, b: number) => {
    if (!passiveAdj.has(a)) passiveAdj.set(a, new Set());
    if (!passiveAdj.has(b)) passiveAdj.set(b, new Set());
    passiveAdj.get(a)!.add(b);
    passiveAdj.get(b)!.add(a);
  };
  remap.forEach((s) => {
    const root = sub.find(s);
    if (!passiveAdj.has(root)) passiveAdj.set(root, new Set());
  });
  for (const edge of resistorEdges) {
    if (edge.a !== edge.b) linkPassive(edge.a, edge.b);
  }

  const rootA = sub.find(subA2);
  const rootB = sub.find(subB2);
  const reachable = new Set<number>();
  const q = [rootA];
  while (q.length) {
    const n = q.shift()!;
    if (reachable.has(n)) continue;
    reachable.add(n);
    passiveAdj.get(n)?.forEach((next) => {
      if (!reachable.has(next)) q.push(next);
    });
  }
  if (!reachable.has(rootB)) return { resistance: null, componentIds: [] };

  // Build node index excluding ground = subB2.
  const subNodes = new Set(reachable);
  subNodes.delete(rootB);
  const idxMap = new Map<number, number>();
  let i = 0;
  for (const n of subNodes) idxMap.set(n, i++);
  const N = i;
  if (N === 0) return { resistance: null, componentIds: [] };
  const A: number[][] = Array.from({ length: N }, () => new Array(N).fill(0));
  const bv: number[] = new Array(N).fill(0);
  for (const edge of resistorEdges) {
    if (!reachable.has(edge.a) || !reachable.has(edge.b)) continue;
    const g = 1 / edge.r;
    const a = edge.a;
    const b = edge.b;
    if (a === b) continue;
    const ia = idxMap.get(a);
    const ib = idxMap.get(b);
    if (ia != null) A[ia][ia] += g;
    if (ib != null) A[ib][ib] += g;
    if (ia != null && ib != null) {
      A[ia][ib] -= g;
      A[ib][ia] -= g;
    }
  }
  // Inject +1A at subA2's representative
  const inj = idxMap.get(rootA);
  if (inj == null) return { resistance: null, componentIds: [] };
  bv[inj] = 1;
  const x = solveLinear(A, bv);
  if (!x) return { resistance: null, componentIds: [] };
  const V = x[inj];
  if (!Number.isFinite(V)) return { resistance: null, componentIds: [] };
  const componentIds = new Set<string>([meter.c.id]);
  for (const edge of resistorEdges) {
    if (reachable.has(edge.a) && reachable.has(edge.b)) componentIds.add(edge.id);
  }
  for (const ce of eps) {
    const k = kindOf(ce.c);
    if (k !== "wire" && k !== "ammeter") continue;
    const roots = ce.nodes.map((node) => sub.find(subOf(node)));
    if (roots.some((root) => reachable.has(root))) componentIds.add(ce.c.id);
  }
  return { resistance: Math.max(0, V), componentIds: Array.from(componentIds) };
}
