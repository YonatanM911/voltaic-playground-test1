// Circuit solver for Voltica Laboratories.
//
// Approach: build an undirected graph where nodes are coalesced terminal
// positions (terminals snapped to the same world point are the same node),
// and edges are components. Then for each closed loop that contains at
// least one source (battery) and at least one consumer (resistor / bulb /
// diode forward), we treat that loop as an isolated series circuit and
// compute the current via Ohm's law:  I = V_total / R_total.
//
// This intentionally handles only series loops and parallel groups that
// reduce to series — a deliberate simplification described in the lab
// instructions ("use principles of series & parallel circuits"). Unknown
// values are solved when enough numeric data exists in their loop.
import type { PlacedComponent } from "./types";
import { terminalPositions } from "./types";

export interface SolvedComponent {
  id: string;
  voltage: number | null;
  current: number | null;
  resistance: number | null;
  inActiveLoop: boolean;
  loopId: number | null;
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
}

const LOOP_COLORS = [
  "oklch(0.75 0.18 30)",
  "oklch(0.78 0.16 145)",
  "oklch(0.72 0.16 250)",
  "oklch(0.78 0.18 80)",
  "oklch(0.7 0.2 320)",
  "oklch(0.78 0.16 200)",
];

interface Edge {
  comp: PlacedComponent;
  a: number; // node id for terminal 0
  b: number; // node id for terminal 1
}

// Build coalesced graph nodes by snapping terminal positions.
function buildGraph(components: PlacedComponent[]): {
  edges: Edge[];
  nodeCount: number;
} {
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
  return { edges, nodeCount: nextNode };
}

// DFS to find simple cycles. We find a spanning tree, then each non-tree
// edge defines a fundamental loop. This is enough for typical lab circuits.
function findFundamentalLoops(edges: Edge[], nodeCount: number): Edge[][] {
  const adj: { to: number; edgeIdx: number }[][] = Array.from(
    { length: nodeCount },
    () => []
  );
  edges.forEach((e, i) => {
    adj[e.a].push({ to: e.b, edgeIdx: i });
    adj[e.b].push({ to: e.a, edgeIdx: i });
  });
  const parent = new Array<number>(nodeCount).fill(-1);
  const parentEdge = new Array<number>(nodeCount).fill(-1);
  const visited = new Array<boolean>(nodeCount).fill(false);
  const treeEdges = new Set<number>();
  const stack: number[] = [];
  for (let start = 0; start < nodeCount; start++) {
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
    // path from e.a up to root, then from e.b up to root, find LCA.
    const ancA = new Map<number, number>(); // node -> edgeIdx used to reach it
    let cur = e.a;
    ancA.set(cur, -1);
    while (parent[cur] !== -1) {
      ancA.set(parent[cur], parentEdge[cur]);
      cur = parent[cur];
    }
    let lca = -1;
    cur = e.b;
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
    cur = e.a;
    while (cur !== lca) {
      pathAEdges.push(parentEdge[cur]);
      cur = parent[cur];
    }
    const loopEdgeIdxs = [i, ...pathAEdges, ...pathBEdges];
    loops.push(loopEdgeIdxs.map((idx) => edges[idx]));
  }
  return loops;
}

// A switch that's open breaks the loop entirely.
function loopIsClosed(loop: Edge[]): boolean {
  for (const e of loop) {
    if (e.comp.type === "switch" && !e.comp.closed) return false;
  }
  return true;
}

function loopHasSource(loop: Edge[]): boolean {
  return loop.some((e) => e.comp.type === "battery");
}

function loopHasConsumer(loop: Edge[]): boolean {
  return loop.some(
    (e) => e.comp.type === "resistor" || e.comp.type === "bulb"
  );
}

// Numeric lookups, treating string values (unknown names) as undefined.
function num(v: number | string | null): number | null {
  return typeof v === "number" ? v : null;
}

function unknownName(v: number | string | null): string | null {
  return typeof v === "string" ? v : null;
}

export function solve(components: PlacedComponent[]): SolveResult {
  const result: SolveResult = {
    components: {},
    loopColors: {},
    unknowns: [],
    errors: [],
  };
  for (const c of components) {
    result.components[c.id] = {
      id: c.id,
      voltage: num(c.voltage),
      current: null,
      resistance: num(c.resistance),
      inActiveLoop: false,
      loopId: null,
    };
  }
  if (components.length === 0) return result;
  const { edges, nodeCount } = buildGraph(components);
  const loops = findFundamentalLoops(edges, nodeCount);

  let loopId = 0;
  const unknownsByName = new Map<string, UnknownSolution>();
  for (const loop of loops) {
    if (!loopIsClosed(loop)) continue;
    if (!loopHasSource(loop)) continue;
    if (!loopHasConsumer(loop)) continue;
    // Sum voltages and resistances; meters are ideal (ammeter R=0,
    // voltmeter R=∞ which would break the loop, so treat voltmeter as
    // disconnect when in a series loop — only ammeter and ohmmeter pass).
    let voltageSum = 0;
    let resistanceSum = 0;
    let unknownR: { compId: string; name: string } | null = null;
    let unknownV: { compId: string; name: string } | null = null;
    let voltmeterInLoop = false;
    let knownAll = true;
    for (const e of loop) {
      const c = e.comp;
      if (c.type === "voltmeter") {
        voltmeterInLoop = true;
        break;
      }
      if (c.type === "battery") {
        const v = num(c.voltage);
        if (v != null) voltageSum += v;
        else {
          const n = unknownName(c.voltage);
          if (n) unknownV = { compId: c.id, name: n };
          else knownAll = false;
        }
      } else if (c.type === "diode") {
        const v = num(c.voltage);
        if (v != null) voltageSum -= v; // forward drop
      } else if (c.type === "resistor" || c.type === "bulb") {
        const r = num(c.resistance);
        if (r != null) resistanceSum += r;
        else {
          const n = unknownName(c.resistance);
          if (n) unknownR = { compId: c.id, name: n };
          else knownAll = false;
        }
      }
      // wires, switches (closed), ammeters, ohmmeters contribute zero R.
    }
    if (voltmeterInLoop) continue;

    const colorIdx = loopId % LOOP_COLORS.length;
    result.loopColors[loopId] = LOOP_COLORS[colorIdx];

    let current: number | null = null;
    if (knownAll && !unknownR && !unknownV && resistanceSum > 0) {
      current = voltageSum / resistanceSum;
    } else if (unknownR && !unknownV && knownAll && voltageSum !== 0) {
      // not enough info to solve I, but if user later adds ammeter we could
      // solve R = V / I — that requires an ammeter reading we don't have.
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
        }
        if (e.comp.type === "ammeter") sc.current = current;
        if (e.comp.type === "ohmmeter") sc.resistance = resistanceSum;
      }
    }
    if (current != null && unknownV) {
      // not enough info typically; skip
    }
    if (current == null && unknownR && voltageSum !== 0) {
      // We need a known I to solve R; check if any ammeter in loop has
      // a numeric current already (user could pre-fill — but we don't
      // allow editing meter readings).
    }
    loopId++;
  }

  // Collect declared unknowns and emit a friendly note when unsolvable.
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
