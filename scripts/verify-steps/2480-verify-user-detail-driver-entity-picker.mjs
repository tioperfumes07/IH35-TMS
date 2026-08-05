import { collectProblems } from "../verify-user-detail-driver-entity-picker.mjs";
export default { name: "user-detail-driver-entity-picker", async run(){ const p=collectProblems(); if(p.length) throw new Error(p.join("; ")); } };
