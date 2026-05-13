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

const num = (v: number | string | null): number | null =>
  typeof v === "number" ? v : null;

// ---------- Union-find ----------
class UF {
  p: number[] = [];
  r: number[] = [];
  add() { this.p.push(this.p.length); this.r.push(0); return this.p.length - 1; }
  find(i: number): number {
    while (this.p[i] !== i) { this.p[i] = this.p[this.p[i]]; i = this.p[i]; }
    return i;
  }
  union(a: number, b: number) {
    const ra = this.find(a), rb = this.find(b);
    if (ra === rb) return;
    if (this.r[ra] < this.r[rb]) this.p[ra] = rb;
    else if (this.r[ra] > this.r[rb]) this.p[rb] = ra;
    else { this.p[rb] = ra; this.r[ra]++; }
  }
}

// ---------- Linear system ----------
function solveLinear(A: number[][], b: number[]): number[] | null {
  const n = b.length;
  if (n === 0) return [];
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++)
      if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
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
  px: number, py: number, ax: number, ay: number, bx: number, by: number, tol = 2
): boolean {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return false;
  const t = ((px - ax) * dx + (py - ay) * dy) / len2;
  if (t <= 0.05 || t >= 0.95) return false;
  const cx = ax + t * dx, cy = ay + t * dy;
  return (px - cx) ** 2 + (py - cy) ** 2 <= tol * tol;
}

// ---------- Component classification ----------
type Kind =
  | "wire"           // zero R bridge: wire / connector / closed switch / gates
  | "ammeter"        // zero-volt voltage source (gives true branch current via MNA)
  | "switch_open"
  | "battery"
  | "resistor"       // resistor or bulb with finite R
  | "diode"
  | "voltmeter"
  | "ohmmeter"
  | "multimeter"
  | "open";          // unknown/zero-R consumer that can't be solved

function isGate(t: ComponentType): boolean {
  return t === "gate_and" || t === "gate_or" || t === "gate_not" ||
    t === "gate_xor" || t === "gate_nand" || t === "gate_nor" ||
    t === "gate_buffer" || t === "gate_xnor";
}

function kindOf(c: PlacedComponent): Kind {
  const t = c.type;
  if (t === "wire" || isConnector(t) || isGate(t)) return "wire";
  if (t === "ammeter") return "ammeter";
  if (t === "switch") return c.closed ? "wire" : "switch_open";
  if (t === "battery") return "battery";
  if (t === "diode") return "diode";
  if (t === "voltmeter") return "voltmeter";
  if (t === "ohmmeter") return "ohmmeter";
  if (t === "multimeter") return "multimeter";
  if (t === "resistor" || t === "bulb") {
    const r = num(c.resistance);
    if (r != null && r > 0) return "resistor";
    return "open";
  }
  return "open";
}

// ---------- Main solve ----------
interface Endpoint { c: PlacedComponent; nodes: number[]; }

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
    if (id == null) { id = uf.add(); nodeMap.set(k, id); }
    return id;
  };

  const eps: Endpoint[] = [];
  for (const c of components) {
    if (isConnector(c.type)) {
      const pts = allTerminalPositions(c);
      const ids = pts.map((p) => nodeId(p.x, p.y));
      for (let i = 1; i < ids.length; i++) uf.union(ids[0], ids[i]);
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
  const linkAdj = (a: number, b: number) => {
    if (a === b) return;
    if (!adj.has(a)) adj.set(a, new Set());
    if (!adj.has(b)) adj.set(b, new Set());
    adj.get(a)!.add(b); adj.get(b)!.add(a);
  };
  for (const ce of eps) {
    const k = kindOf(ce.c);
    if (k === "voltmeter" || k === "ohmmeter" || k === "multimeter" ||
        k === "switch_open" || k === "open") continue;
    const a = uf.find(ce.nodes[0]);
    for (let i = 1; i < ce.nodes.length; i++) linkAdj(a, uf.find(ce.nodes[i]));
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
      adj.get(u)?.forEach((v) => { if (!compOfNode.has(v)) q.push(v); });
    }
  }

  // ----- 3. Identify "active" connected components: those containing a battery -----
  const compHasBattery = new Set<number>();
  const compHasConsumer = new Set<number>();
  const compHasOpenSwitch = new Set<number>();
  // Track open-switch components separately (an open switch cuts the path).
  for (const ce of eps) {
    const cc = compOfNode.get(uf.find(ce.nodes[0]));
    if (cc == null) continue;
    const k = kindOf(ce.c);
    if (k === "battery") compHasBattery.add(cc);
    if (k === "resistor" || k === "diode") compHasConsumer.add(cc);
    if (ce.c.type === "switch" && !ce.c.closed) {
      // If the switch were closed, would it bridge two nodes that otherwise
      // aren't connected? We don't know without re-running CC; cheaply mark
      // every neighbor component with "has open switch nearby".
      const a = uf.find(ce.nodes[0]); const b = uf.find(ce.nodes[1]);
      const ca = compOfNode.get(a); const cb = compOfNode.get(b);
      if (ca != null) compHasOpenSwitch.add(ca);
      if (cb != null && cb !== ca) compHasOpenSwitch.add(cb);
    }
  }

  // ----- 4. MNA per active component -----
  const groundOf = new Map<number, number>();      // ccId -> ground node
  const nodeIdx = new Map<number, number>();       // node -> matrix row
  const vSourceList: { ce: Endpoint; v: number; nA: number; nB: number; idx: number; cc: number }[] = [];
  const ccActiveNodes = new Map<number, Set<number>>();

  for (const cc of compHasBattery) {
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

  // Voltage sources
  for (const ce of eps) {
    const k = kindOf(ce.c);
    if (k !== "battery" && k !== "diode" && k !== "ammeter") continue;
    const a = uf.find(ce.nodes[0]); const b = uf.find(ce.nodes[1]);
    const cc = compOfNode.get(a);
    if (cc == null || !compHasBattery.has(cc)) continue;
    let v: number;
    if (k === "battery") {
      v = num(ce.c.voltage) ?? 0;
    } else if (k === "diode") {
      // Diode: forward direction = a→b (terminal 0 → terminal 1).
      // Forward bias: V(a) - V(b) = drop. We'll assume forward; if current
      // ends up negative, that's reverse and ideally would be open — for
      // now we accept the linear approximation.
      v = num(ce.c.voltage) ?? DIODE_DROP_DEFAULT;
    } else {
      // Ammeter: ideal — zero voltage drop, current is the unknown.
      v = 0;
    }
    vSourceList.push({ ce, v, nA: a, nB: b, idx: vSourceList.length, cc });
  }

  const N = nIdx + vSourceList.length;
  let xSol: number[] | null = null;
  if (N > 0) {
    const A: number[][] = Array.from({ length: N }, () => new Array(N).fill(0));
    const bv: number[] = new Array(N).fill(0);
    // Resistor stamps
    for (const ce of eps) {
      if (kindOf(ce.c) !== "resistor") continue;
      const a = uf.find(ce.nodes[0]); const b = uf.find(ce.nodes[1]);
      const cc = compOfNode.get(a);
      if (cc == null || !compHasBattery.has(cc)) continue;
      const r = num(ce.c.resistance);
      if (r == null || r <= 0) continue;
      const g = 1 / r;
      const ia = nodeIdxFinal.get(a); const ib = nodeIdxFinal.get(b);
      if (ia != null) A[ia][ia] += g;
      if (ib != null) A[ib][ib] += g;
      if (ia != null && ib != null) { A[ia][ib] -= g; A[ib][ia] -= g; }
    }
    // Voltage source stamps
    vSourceList.forEach((vs, k) => {
      const ia = nodeIdxFinal.get(vs.nA); const ib = nodeIdxFinal.get(vs.nB);
      const row = nIdx + k;
      if (ia != null) { A[ia][row] += 1; A[row][ia] += 1; }
      if (ib != null) { A[ib][row] -= 1; A[row][ib] -= 1; }
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
  for (const cc of compHasBattery) {
    if (!compHasConsumer.has(cc)) continue;       // skip "missing_consumer" comps
    if (compHasOpenSwitch.has(cc)) continue;      // skip "switch_open" comps
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
    if (!sc.inActiveLoop) continue;
    if (xSol == null) continue;

    const Va = Vnode(a); const Vb = Vnode(b);
    const dV = Va - Vb;
    const k = kindOf(ce.c);

    if (k === "resistor") {
      const r = num(ce.c.resistance);
      if (r != null && r > 0) {
        sc.voltage = Math.abs(dV);
        sc.current = Math.abs(dV) / r;
        sc.resistance = r;
      }
    } else if (k === "battery") {
      const vs = vSourceList.find((v) => v.ce.c.id === ce.c.id);
      if (vs) sc.current = Math.abs(xSol[nIdx + vs.idx]);
      sc.voltage = num(ce.c.voltage);
    } else if (k === "diode") {
      const vs = vSourceList.find((v) => v.ce.c.id === ce.c.id);
      if (vs) sc.current = Math.abs(xSol[nIdx + vs.idx]);
      sc.voltage = num(ce.c.voltage) ?? DIODE_DROP_DEFAULT;
    } else if (ce.c.type === "ammeter") {
      // Ammeter is a 0V voltage source — current is in the MNA solution.
      const vs = vSourceList.find((v) => v.ce.c.id === ce.c.id);
      if (vs) sc.current = Math.abs(xSol[nIdx + vs.idx]);
    } else if (ce.c.type === "voltmeter") {
      sc.voltage = Math.abs(dV);
    } else if (ce.c.type === "ohmmeter") {
      // Equivalent resistance between its two nodes, sources zeroed.
      sc.resistance = computeEquivR(ce, eps, uf, compOfNode, cc!);
    } else if (ce.c.type === "multimeter") {
      sc.voltage = Math.abs(dV);
    } else if (ce.c.type === "wire") {
      sc.flowDirection = dV >= 0 ? 1 : -1;
    }
  }

  // ----- 7. Open warnings -----
  for (const cc of compHasBattery) {
    if (ccLoopId.has(cc)) continue;
    // Pick representative center: average of battery components' positions.
    const ids: string[] = [];
    let cx = 0, cy = 0, n = 0;
    for (const ce of eps) {
      const a = uf.find(ce.nodes[0]);
      if (compOfNode.get(a) !== cc) continue;
      ids.push(ce.c.id);
      cx += ce.c.x; cy += ce.c.y; n++;
    }
    if (n === 0) continue;
    let reason: "missing_consumer" | "switch_open" = "missing_consumer";
    if (compHasOpenSwitch.has(cc)) reason = "switch_open";
    else if (!compHasConsumer.has(cc)) reason = "missing_consumer";
    result.openWarnings.push({
      centerX: cx / n, centerY: cy / n - COMPONENT_LENGTH / 2, ids, reason,
    });
  }
  // Lone battery (not in any conducting CC, e.g. floating)
  for (const ce of eps) {
    if (ce.c.type !== "battery") continue;
    const a = uf.find(ce.nodes[0]);
    if (compOfNode.has(a)) continue;
    result.openWarnings.push({
      centerX: ce.c.x, centerY: ce.c.y - 36, ids: [ce.c.id], reason: "open",
    });
  }
  // Lone consumers (no battery anywhere → "חסר ספק")
  const anyBattery = components.some((c) => c.type === "battery");
  if (!anyBattery) {
    for (const ce of eps) {
      const t = ce.c.type;
      if (t !== "resistor" && t !== "bulb" && t !== "diode") continue;
      result.openWarnings.push({
        centerX: ce.c.x, centerY: ce.c.y - 36, ids: [ce.c.id], reason: "missing_source",
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
  nIdx: number
): number {
  // The ammeter's terminals are merged in node-space, so we look at the
  // ORIGINAL terminal positions to identify "neighbor" components attached
  // at exactly one of the ammeter's two physical terminals.
  const [t0, t1] = terminalPositions(ammeter.c);
  const hits = (px: number, py: number) =>
    eps.filter((e) =>
      e.c.id !== ammeter.c.id &&
      (isConnector(e.c.type)
        ? allTerminalPositions(e.c)
        : terminalPositions(e.c)
      ).some((p) => Math.abs(p.x - px) < 1 && Math.abs(p.y - py) < 1)
    );
  const candidates = [...hits(t0.x, t0.y), ...hits(t1.x, t1.y)];
  // Prefer a resistor neighbor (well-defined current).
  for (const e of candidates) {
    const k = kindOf(e.c);
    if (k === "resistor") {
      const r = num(e.c.resistance);
      if (r == null || r <= 0) continue;
      const a = uf.find(e.nodes[0]); const b = uf.find(e.nodes[1]);
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

// Equivalent resistance between an ohmmeter's two terminals, with all
// sources zeroed (batteries → wire, diodes → wire). Solved by injecting
// 1A at terminal A and grounding terminal B, then R = V(A).
function computeEquivR(
  meter: { c: PlacedComponent; nodes: number[] },
  eps: { c: PlacedComponent; nodes: number[] }[],
  uf: UF,
  compOfNode: Map<number, number>,
  cc: number
): number | null {
  // Build a sub-UF that mirrors the live one but additionally treats
  // batteries and diodes as wires (zero R).
  const sub = new UF();
  const remap = new Map<number, number>();
  // Collect all original-canonical nodes in this CC
  const allNodes = new Set<number>();
  for (const [n, id] of compOfNode) if (id === cc) allNodes.add(n);
  // Always include the ohmmeter's own terminals (they may not be in CC if isolated).
  allNodes.add(uf.find(meter.nodes[0]));
  allNodes.add(uf.find(meter.nodes[1]));
  for (const n of allNodes) remap.set(n, sub.add());
  const subOf = (n: number): number => remap.get(uf.find(n))!;
  // Merge for every wire-equivalent edge, INCLUDING batteries/diodes.
  for (const ce of eps) {
    const k = kindOf(ce.c);
    if (k === "wire" || k === "battery" || k === "diode") {
      const a0 = uf.find(ce.nodes[0]);
      if (!allNodes.has(a0)) continue;
      for (let i = 1; i < ce.nodes.length; i++) {
        const ai = uf.find(ce.nodes[i]);
        if (!allNodes.has(ai)) continue;
        sub.union(subOf(a0), subOf(ai));
      }
    }
  }
  // Resistor edges in the sub-network.
  const subA = uf.find(meter.nodes[0]); const subB = uf.find(meter.nodes[1]);
  const subA2 = subOf(subA); const subB2 = subOf(subB);
  if (sub.find(subA2) === sub.find(subB2)) return 0;
  // Build node index excluding ground = subB2.
  const subNodes = new Set<number>();
  remap.forEach((s) => subNodes.add(sub.find(s)));
  subNodes.delete(sub.find(subB2));
  const idxMap = new Map<number, number>();
  let i = 0;
  for (const n of subNodes) idxMap.set(n, i++);
  const N = i;
  if (N === 0) return null;
  const A: number[][] = Array.from({ length: N }, () => new Array(N).fill(0));
  const bv: number[] = new Array(N).fill(0);
  for (const ce of eps) {
    if (kindOf(ce.c) !== "resistor") continue;
    const a0 = uf.find(ce.nodes[0]); const b0 = uf.find(ce.nodes[1]);
    if (!allNodes.has(a0) || !allNodes.has(b0)) continue;
    const r = num(ce.c.resistance);
    if (r == null || r <= 0) continue;
    const g = 1 / r;
    const a = sub.find(subOf(a0)); const b = sub.find(subOf(b0));
    if (a === b) continue;
    const ia = idxMap.get(a); const ib = idxMap.get(b);
    if (ia != null) A[ia][ia] += g;
    if (ib != null) A[ib][ib] += g;
    if (ia != null && ib != null) { A[ia][ib] -= g; A[ib][ia] -= g; }
  }
  // Inject +1A at subA2's representative
  const inj = idxMap.get(sub.find(subA2));
  if (inj == null) return null;
  bv[inj] = 1;
  const x = solveLinear(A, bv);
  if (!x) return null;
  const V = x[inj];
  if (!Number.isFinite(V)) return null;
  return Math.max(0, V);
}
