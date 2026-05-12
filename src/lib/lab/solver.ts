// Voltica Laboratories — circuit solver.
//
// Approach (deliberately educational and pragmatic):
//   1. Build a graph whose *nodes* are coalesced terminal positions.
//      In addition, any terminal that lies on the open segment of a wire
//      counts as connected to that wire's two endpoints (T-junction
//      support — how parallel branches are wired in this app).
//   2. Find fundamental loops via a spanning-tree / chord-edge analysis.
//   3. For each loop:
//        - if any switch in the loop is open → dead (open circuit)
//        - if no battery → skip
//        - if no consumer (resistor, bulb, voltmeter, multimeter, diode) → skip
//        - I = ΣV / ΣR (voltmeter / multimeter contribute a 1MΩ resistance)
//        - propagate the current to each component for color, glow,
//          ammeter / voltmeter / ohmmeter / multimeter readings.
//   4. Components in a loop that contains a battery but is open (or
//      missing a return path) are flagged with `openCircuit = true` so the
//      canvas can render a "מעגל פתוח" warning near them.
//
// All quantities are in SI base units (V, A, Ω). Display formatting and
// SI-prefix conversion lives in `units.ts`, never in the solver.

import type { PlacedComponent } from "./types";
import { COMPONENT_LENGTH, terminalPositions } from "./types";

export interface SolvedComponent {
  id: string;
  voltage: number | null;
  current: number | null;
  resistance: number | null;
  inActiveLoop: boolean;
  loopId: number | null;
  openCircuit: boolean;
  // For wires: direction of conventional current flow as +1 (a→b), -1 (b→a) or 0.
  flowDirection: 0 | 1 | -1;
}

export interface UnknownSolution {
  name: string;
  value: number;
  unit: string; // V, A, Ω
}

export interface SolveResult {
  components: Record<string, SolvedComponent>;
  loopColors: Record<number, string>;
  unknowns: UnknownSolution[];
  errors: string[];
  // groups of components that contain a battery but failed to form a closed loop
  openWarnings: { centerX: number; centerY: number; ids: string[] }[];
}

const LOOP_COLORS = [
  "oklch(0.75 0.18 30)",
  "oklch(0.78 0.16 145)",
  "oklch(0.72 0.16 250)",
  "oklch(0.78 0.18 80)",
  "oklch(0.7 0.2 320)",
  "oklch(0.78 0.16 200)",
];

// Resistance modeling for "ideal" meters (still small enough to be practical).
const VOLTMETER_R = 1e6;
const MULTIMETER_R = 1e6;
const DIODE_DROP_DEFAULT = 0.7;

interface Edge {
  comp: PlacedComponent;
  a: number;
  b: number;
}

function num(v: number | string | null): number | null {
  return typeof v === "number" ? v : null;
}

function unknownName(v: number | string | null): string | null {
  return typeof v === "string" ? v : null;
}

// Returns true if (px,py) lies on the open segment between (ax,ay)-(bx,by)
// within the given tolerance. Open = strictly between the endpoints.
function pointOnSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  tol = 2
): boolean {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return false;
  const t = ((px - ax) * dx + (py - ay) * dy) / len2;
  if (t <= 0.05 || t >= 0.95) return false;
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  const ddx = px - cx;
  const ddy = py - cy;
  return ddx * ddx + ddy * ddy <= tol * tol;
}

function buildGraph(components: PlacedComponent[]): {
  edges: Edge[];
  nodeCount: number;
  nodeOf: (x: number, y: number) => number;
  uf: (id: number) => number;
} {
  // First, give every distinct snapped point a node id.
  const nodeMap = new Map<string, number>();
  let nextNode = 0;
  const nodeId = (x: number, y: number): number => {
    const k = `${Math.round(x)}:${Math.round(y)}`;
    let id = nodeMap.get(k);
    if (id === undefined) {
      id = nextNode++;
      nodeMap.set(k, id);
    }
    return id;
  };
  const edges: Edge[] = [];
  for (const c of components) {
    const [t0, t1] = terminalPositions(c);
    edges.push({ comp: c, a: nodeId(t0.x, t0.y), b: nodeId(t1.x, t1.y) });
  }
  // Union-find for T-junction merges.
  const parent = Array.from({ length: nextNode }, (_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };
  const unite = (i: number, j: number) => {
    const a = find(i);
    const b = find(j);
    if (a !== b) parent[a] = b;
  };
  // For every wire edge, check every other terminal. If it falls on the
  // wire's segment, merge its node with the wire's two endpoints.
  for (const w of components) {
    if (w.type !== "wire") continue;
    const [wa, wb] = terminalPositions(w);
    for (const c of components) {
      if (c.id === w.id) continue;
      const [ta, tb] = terminalPositions(c);
      for (const t of [ta, tb]) {
        if (pointOnSegment(t.x, t.y, wa.x, wa.y, wb.x, wb.y)) {
          unite(nodeId(t.x, t.y), nodeId(wa.x, wa.y));
          unite(nodeId(t.x, t.y), nodeId(wb.x, wb.y));
        }
      }
    }
  }
  return { edges, nodeCount: nextNode, nodeOf: nodeId, uf: find };
}

function findFundamentalLoops(
  edges: Edge[],
  nodeCount: number,
  uf: (i: number) => number
): Edge[][] {
  // Use *post-union* node ids so T-junctions collapse.
  const adj: { to: number; edgeIdx: number }[][] = Array.from(
    { length: nodeCount },
    () => []
  );
  edges.forEach((e, i) => {
    const a = uf(e.a);
    const b = uf(e.b);
    adj[a].push({ to: b, edgeIdx: i });
    adj[b].push({ to: a, edgeIdx: i });
  });
  const parent = new Array<number>(nodeCount).fill(-1);
  const parentEdge = new Array<number>(nodeCount).fill(-1);
  const visited = new Array<boolean>(nodeCount).fill(false);
  const treeEdges = new Set<number>();
  const stack: number[] = [];
  for (let start = 0; start < nodeCount; start++) {
    if (uf(start) !== start) continue;
    if (visited[start]) continue;
    visited[start] = true;
    stack.push(start);
    while (stack.length) {
      const u = stack.pop()!;
      for (const { to, edgeIdx } of adj[u]) {
        if (!visited[to]) {
          visited[to] = true;
          parent[to] = u;
          parentEdge[to] = edgeIdx;
          treeEdges.add(edgeIdx);
          stack.push(to);
        }
      }
    }
  }
  const loops: Edge[][] = [];
  for (let i = 0; i < edges.length; i++) {
    if (treeEdges.has(i)) continue;
    const e = edges[i];
    const ea = uf(e.a);
    const eb = uf(e.b);
    const ancA = new Map<number, number>();
    let cur = ea;
    ancA.set(cur, -1);
    while (parent[cur] !== -1) {
      ancA.set(parent[cur], parentEdge[cur]);
      cur = parent[cur];
    }
    let lca = -1;
    cur = eb;
    const pathBEdges: number[] = [];
    while (cur !== -1) {
      if (ancA.has(cur)) {
        lca = cur;
        break;
      }
      pathBEdges.push(parentEdge[cur]);
      cur = parent[cur];
    }
    if (lca === -1) continue;
    const pathAEdges: number[] = [];
    cur = ea;
    while (cur !== lca) {
      pathAEdges.push(parentEdge[cur]);
      cur = parent[cur];
    }
    const loopEdgeIdxs = [i, ...pathAEdges, ...pathBEdges];
    loops.push(loopEdgeIdxs.map((idx) => edges[idx]));
  }
  return loops;
}

function loopHasOpenSwitch(loop: Edge[]): boolean {
  return loop.some((e) => e.comp.type === "switch" && !e.comp.closed);
}
function loopHasBattery(loop: Edge[]): boolean {
  return loop.some((e) => e.comp.type === "battery");
}
function loopHasConsumer(loop: Edge[]): boolean {
  return loop.some(
    (e) =>
      e.comp.type === "resistor" ||
      e.comp.type === "bulb" ||
      e.comp.type === "voltmeter" ||
      e.comp.type === "multimeter" ||
      e.comp.type === "diode"
  );
}

function consumerResistance(comp: PlacedComponent): number {
  if (comp.type === "resistor" || comp.type === "bulb") {
    const r = num(comp.resistance);
    return r ?? 0;
  }
  if (comp.type === "voltmeter") return VOLTMETER_R;
  if (comp.type === "multimeter") return MULTIMETER_R;
  return 0;
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
    };
  }
  if (components.length === 0) return result;

  const { edges, nodeCount, uf } = buildGraph(components);
  const loops = findFundamentalLoops(edges, nodeCount, uf);

  const unknownsByName = new Map<string, UnknownSolution>();
  let loopId = 0;

  for (const loop of loops) {
    if (!loopHasBattery(loop)) continue;
    if (!loopHasConsumer(loop)) continue;
    if (loopHasOpenSwitch(loop)) {
      // mark as open circuit warning group
      const ids = loop.map((e) => e.comp.id);
      let cx = 0,
        cy = 0;
      loop.forEach((e) => {
        cx += e.comp.x;
        cy += e.comp.y;
      });
      result.openWarnings.push({
        centerX: cx / loop.length,
        centerY: cy / loop.length - COMPONENT_LENGTH / 2,
        ids,
      });
      continue;
    }
    let voltageSum = 0;
    let resistanceSum = 0;
    let knownAll = true;
    for (const e of loop) {
      const c = e.comp;
      if (c.type === "battery") {
        const v = num(c.voltage);
        if (v != null) voltageSum += v;
        else knownAll = false;
      } else if (c.type === "diode") {
        const v = num(c.voltage);
        voltageSum -= v ?? DIODE_DROP_DEFAULT;
      } else {
        resistanceSum += consumerResistance(c);
      }
    }
    const colorIdx = loopId % LOOP_COLORS.length;
    result.loopColors[loopId] = LOOP_COLORS[colorIdx];

    let current: number | null = null;
    if (knownAll && resistanceSum > 0) {
      current = voltageSum / resistanceSum;
    }
    for (const e of loop) {
      const sc = result.components[e.comp.id];
      sc.inActiveLoop = true;
      sc.loopId = loopId;
      if (current != null) {
        sc.current = current;
        if (e.comp.type === "resistor" || e.comp.type === "bulb") {
          const r = num(e.comp.resistance);
          if (r != null) sc.voltage = current * r;
          sc.resistance = r ?? sc.resistance;
        } else if (e.comp.type === "voltmeter") {
          sc.voltage = current * VOLTMETER_R;
          sc.resistance = VOLTMETER_R;
        } else if (e.comp.type === "ohmmeter") {
          // Ohmmeter reads the total external resistance of its loop.
          sc.resistance = resistanceSum;
        } else if (e.comp.type === "multimeter") {
          sc.voltage = current * MULTIMETER_R;
          sc.resistance = MULTIMETER_R;
        } else if (e.comp.type === "wire") {
          sc.flowDirection = current >= 0 ? 1 : -1;
        }
      }
    }
    loopId++;
  }

  // Open-circuit warnings for batteries that never appeared in any solved loop.
  const seenBatteries = new Set<string>();
  for (const c of components) {
    if (c.type !== "battery") continue;
    if (result.components[c.id].inActiveLoop) seenBatteries.add(c.id);
  }
  for (const c of components) {
    if (c.type !== "battery") continue;
    if (seenBatteries.has(c.id)) continue;
    if (result.openWarnings.some((w) => w.ids.includes(c.id))) continue;
    result.openWarnings.push({
      centerX: c.x,
      centerY: c.y - 36,
      ids: [c.id],
    });
  }

  // Collect declared unknowns whose loop solution gave them a value.
  for (const c of components) {
    const fields: { val: number | string | null; unit: string; solved: number | null }[] = [
      { val: c.voltage, unit: "V", solved: result.components[c.id].voltage },
      { val: c.current, unit: "A", solved: result.components[c.id].current },
      { val: c.resistance, unit: "Ω", solved: result.components[c.id].resistance },
    ];
    for (const f of fields) {
      const name = unknownName(f.val);
      if (!name) continue;
      if (f.solved != null && !unknownsByName.has(name)) {
        unknownsByName.set(name, { name, value: f.solved, unit: f.unit });
      }
    }
  }
  result.unknowns = [...unknownsByName.values()];
  return result;
}
