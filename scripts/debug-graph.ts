import { buildNavGraph } from "../src/lib/world/graph";
import { buildDemoWorld } from "../src/lib/world/demo";

const world = buildDemoWorld();
const g = buildNavGraph(world);
const comp = new Array(g.nodes.length).fill(-1);
let c = 0;
for (const n of g.nodes) {
  if (comp[n.id] !== -1) continue;
  const stack = [n.id];
  comp[n.id] = c;
  while (stack.length) {
    const cur = g.nodes[stack.pop()!];
    for (const e of cur.edges) if (comp[e.to] === -1) { comp[e.to] = c; stack.push(e.to); }
  }
  c += 1;
}
const sizes = new Array(c).fill(0);
for (const v of comp) sizes[v] += 1;
console.log("components:", c, "sizes:", sizes.slice(0, 10));
for (let k = 0; k < c; k++) {
  if (sizes[k] < 100) {
    const members = g.nodes.filter((n) => comp[n.id] === k);
    console.log(`comp ${k} (${members.length}):`, members.map((n) => `(${n.x.toFixed(0)},${n.z.toFixed(0)}${n.connector ? ",conn:" + n.refId : ""})`).join(" "));
  }
}
