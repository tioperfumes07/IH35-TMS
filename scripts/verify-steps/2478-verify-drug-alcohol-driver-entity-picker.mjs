import { collectProblems } from "../verify-drug-alcohol-driver-entity-picker.mjs";
export default { name: "drug-alcohol-driver-entity-picker", async run(){ const p=collectProblems(); if(p.length) throw new Error(p.join("; ")); } };
