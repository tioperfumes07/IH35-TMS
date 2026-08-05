import { collectProblems } from "../verify-dispatch-quick-assign-driver-entity-picker.mjs";
export default { name: "dispatch-quick-assign-driver-entity-picker", async run() { const p=collectProblems(); if(p.length) throw new Error(p.join("; ")); } };
