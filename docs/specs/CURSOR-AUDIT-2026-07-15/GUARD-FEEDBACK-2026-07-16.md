# GUARD FEEDBACK on the IH35-CURSOR-AUDIT pack — 2026-07-16

Independent GUARD (Cowork) review of the Cursor audit. Verdict: **this is a strong, honest, well-structured audit — accept it as the standing system-level backlog.** Its highest-cost financial and legal claims are verifiable against the repo. Below: what I re-verified, where to apply caution, and the one ranking I'd change.

## 1. Claims GUARD re-verified TRUE (repo @ main 756b7a61)
- **#3 Fuel GL poster zero callers** — `postFuelExpenseFromEvent` (fuel-posting/poster.service.ts:223) has no production caller. CONFIRMED.
- **Relay silo** — relay ingest writes only `integrations.relay_fuel_transactions` (posted_to_gl=false), never `fuel.fuel_transactions`. CONFIRMED.
- **#7 Dual settlement engines** — live `payroll.*` writes remain in settlements/team-splits/apply.ts, settlements/auto-deductions/apply.ts, payroll/driver-settlement.service.ts. CONFIRMED.
- **#17 425C hardcoded petition_date** — `Form425CHome.tsx:209: petition_date: "2025-02-03"` hardcoded on create. CONFIRMED — and see §4, I'd rank this far higher.
- **#4 Fine→deduction gap** — the auto-deduction applier seeds settlement_lines from `auto_deduction_policies`, not from fines; no fine→deduction seed path found. Consistent with the claim.

## 2. What the pack does right (keep this discipline)
- Honest completeness table (live-smoke PARTIAL, screenshots EMPTY, worktree fixes "not production") — that's exactly the court/CPA-grade honesty the hardline demands.
- Evidence as file:line, not vibes. Ranked gaps + AGREE/DISAGREE/HOLD/BUILD SOP. Never-delete/only-add ruled throughout.
- Correct root-cause ordering instinct (connectivity → EntityLink → shared creators → banking chrome → claim graph).

## 3. Where to apply GUARD caution before anything is called "done"
- **Repo-only ≠ verified.** Many module verdicts are repo-read, not live-smoked (their own note). Hold every fix to the definition of done: file + route mounted + (migration on prod) + live endpoint/browser proof. CI-green is not done.
- **Tab-count "drift" is a design decision, not automatically a bug.** Banking 12-vs-5, Accounting ~12-vs-57 subnav — these need an **owner ruling on which count is canonical** before any code change. Do not let "drift" be treated as a defect to fix without your call (and never delete tabs to "match design").
- **Gaps #9 and #11 are fixed only in a Cursor worktree (`feat/audit-connectivity-url-fixes`), NOT in production.** Do not mark them done until merged, deployed, and live-verified. The pack says this — enforce it.
- **QBO write-back stays OFF; opening-balance/GL flags stay OFF until CPA sign-off + Neon tie-out.** Any "build" from this audit that touches posting is build-and-HOLD.

## 4. The one ranking I'd change (GUARD)
**#17 (425C hardcoded `petition_date`) is under-ranked.** It is a *court-filing correctness* defect on an **active Chapter 11** — legal exposure, not a UX nicety. It should sit near the top with the financial-integrity gaps, not at #17. Fix: bind petition_date from the case record (a single source), never a literal. Low effort, high legal risk-reduction.

## 5. Build-order recommendation (financial/legal integrity before UX chrome)
The pack's #1 is Expense/Bill *chrome* (side panels). By the money-protection law, sequence the integrity items first:
1. **425C petition_date** (legal, tiny fix) — #17.
2. **Fuel bridge + poster** (books/IFTA lie today) — #3. *(Spec delivered: RELAY-BOOKING-EXECUTION-SPEC.)*
3. **QBO collapse Step-2** (unblocks opening balances) — *(columns applied 2026-07-16; spec delivered.)*
4. **Settlement writer collapse** (kill dual engines) — #7 / #16 driver-profile-on-RETIRE-payroll.
5. **Fine→liability→deduction** seeding — #4.
6. **Claim → expense → WO → receivable → settlement graph** (owner-gated held FKs) — #2.
7. THEN the UX/nav/EntityLink layer (#1, #5 Bank Register, #6 dead links, chrome, side panels, tab-count rulings).

## 6. Fit with work already in flight (no conflict)
The financial items above are already speced or moving: migrations 52 (settlement linkage) + 56 (QBO sync cols) applied on prod 2026-07-16; QBO Step-2 + Relay execution specs delivered. This audit's UX/nav/EntityLink/claim-graph gaps are the go-forward backlog for Cursor. Adopt it; verify each against prod before build; keep posting flags OFF until the CPA/tie-out gate.

*GUARD, 2026-07-16 — re-provable against main @756b7a61.*
