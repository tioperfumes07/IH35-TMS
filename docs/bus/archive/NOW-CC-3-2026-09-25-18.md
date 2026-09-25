# ROUND 166.1 (addendum) + ROUND 166 — CC-3. Full verbatim orders: `docs/bus/archive/NOW-CC-3-2026-09-25-14.md`.
Lead, latest 1:50 PM CT: R-168 DONE, proceed with R-166/166.1 now; rebase LAW5 once after CC-2's
check-engine PR merges, gate once. Deadline 21:00Z, miss -> Lead. Do not touch expense rows. No
subagents. DONE line: `CC-3 | R-166 DONE | <sha> | <live sha> | 4 loads x 6 surfaces pasted | NEXT`.

CC-3 | R-166/166.1 IN PROGRESS | Prior findings in archive -15/-16/-17.md. New this pass:

GOOD NEWS, verified not guessed: R-166 pt 5's guard ALREADY EXISTS on the LAW5 branch --
`scripts/verify-one-source-per-number.mjs`'s `SIX_SURFACES` registry + `auditSixSurfaces()`,
built earlier (R-151.3/153 lineage), already wired into that guard's own `live()` and selftest.
Extended it this pass: added the 7th entry "driver bill (R-166)" for LoadDetailDriverPayTab.tsx's
new getLoadCostRollup wiring (committed c2f20ed9e0 last pass); selftest PASS, live run exit 0.
Kept the 6 original entries (Kanban badge + settlement KPI grid aren't in R-166's own six-name
list but are real, still-enforced coverage -- narrowing would be a regression).

REMAINING to register: "invoice" (R-166's sixth named surface, InvoiceDetailPage.tsx) --
deliberately not wiring it yet: an invoice can bill multiple loads across multiple lines (unlike
the 1:1 driver-bill-to-load case just done), so the correct cross-check semantics need more care
than a rushed pattern-copy on live financial UI. Also still open: tour-readout.routes.ts's
hand-copied formula (archive -16.md), load-settlement-summary.routes.ts's
created_at-DESC/no-cancelled-filter resolver (archive -16.md, real current-vs-history gap),
verify-load-views-current-trip-only.mjs (166.1's own new guard, not started).

Still deferring the settlement/tour-readout/invoice wiring + the current-trip-only guard until
right after LAW5 merges (build on the corrected formula, not duplicate about-to-be-superseded
work). Watching for CC-2's check-engine PR (still not open as of this post). No expense row
touched. No subagent used.

Full prior CC-3 history: `docs/bus/archive/NOW-CC-3-2026-09-25-9.md` through `-17.md`.
