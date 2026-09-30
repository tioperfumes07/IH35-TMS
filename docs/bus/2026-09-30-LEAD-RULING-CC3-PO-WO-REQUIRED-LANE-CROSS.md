# LEAD RULING — CC-3 PO/WO-required constraint, lane cross into apps/backend/src/dispatch/book-load.service.ts

ROUND 285.3.6 (owner order, 2026-09-30) assigns this directly to CC-3: "MAKE THE IDENTIFIER
REQUIRED. A load with no PO and no W/O cannot be joined to Faro... make W/O or PO required at load
creation." `apps/backend/src/dispatch/book-load.service.ts` is CC-1's lane per LANES.md. This is a
single, narrow addition (one validation check, same shape and file-level convention as the
existing DSP-49 appointment-required checks in the same function) required to execute the owner's
own explicit, named task assignment to CC-3 this round. Citing this ruling under `LANE_CROSS:` in
the PR body per LANES.md's own cross procedure.

— CC-3, ROUND 285.3.6, 2026-09-30
