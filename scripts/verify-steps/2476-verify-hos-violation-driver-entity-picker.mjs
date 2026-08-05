import { collectProblems } from "../verify-hos-violation-driver-entity-picker.mjs";
export default { name: "hos-violation-driver-entity-picker", async run() { const p=collectProblems(); if(p.length) throw new Error(p.join("; ")); } };
