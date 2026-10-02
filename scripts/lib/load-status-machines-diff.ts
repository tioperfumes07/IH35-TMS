// Recomputes agreement between the canonical dispatch machine and MDATA_STATUS_TRANSITIONS (both in
// apps/backend/src/dispatch/load-state-machine.ts) for scripts/verify-load-status-machines-agree.mjs. Prints JSON.
import { MDATA_STATUS_TRANSITIONS, dispatchStatusSchema, fromMdataStatus, toMdataStatus, validateLoadStatusTransition } from "../../apps/backend/src/dispatch/load-state-machine.js";

const out: string[] = [];
for (const [m, targets] of Object.entries(MDATA_STATUS_TRANSITIONS)) {
  for (const D2 of dispatchStatusSchema.options) {
    const t = toMdataStatus(D2);
    if (t !== m && validateLoadStatusTransition(m, D2).ok && !targets.includes(t)) out.push(`canonical allows ${m} -> ${t}; MDATA_STATUS_TRANSITIONS does not`);
  }
  for (const t of targets) {
    let D2;
    try { D2 = fromMdataStatus(t); } catch { out.push(`MDATA_STATUS_TRANSITIONS names unknown status ${t}`); continue; }
    if (fromMdataStatus(m) !== D2 && !validateLoadStatusTransition(m, D2).ok) out.push(`MDATA_STATUS_TRANSITIONS allows ${m} -> ${t}; canonical ${fromMdataStatus(m)} -> ${D2} is not an edge`);
  }
}
process.stdout.write(JSON.stringify(out));
