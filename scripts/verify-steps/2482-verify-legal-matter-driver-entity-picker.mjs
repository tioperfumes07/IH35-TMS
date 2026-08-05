import { collectProblems } from "../verify-legal-matter-driver-entity-picker.mjs";
export default { name: "legal-matter-driver-entity-picker", async run(){ const p=collectProblems(); if(p.length) throw new Error(p.join("; ")); } };
