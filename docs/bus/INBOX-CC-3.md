# ★ NOTICE 2026-09-04 — THREE TELEMATICS DEFECTS (YOUR LANE · FILE, THEN FIX)
`git pull --ff-only origin main`

Found while verifying settlement trucks. **Do not block CC-1 data entry.** File + fix in your telematics lane:

1. `telematics.vehicle_latest_position` — **two rows per unit** for most units (should be one “latest”).
2. `city` / `state` / `formatted_location` **NULL on every row captured 2026-09-04** — reverse geocode not populating; only stale rows have a place name.
3. **T144** last report **2025-07-09** yet ran settlement **5760** in July 2026 — dead Samsara link or unit gone.

Settlement entry itself is **CC-1 + Cursor only** — do not create/edit settlements `5753` / `5760`–`5795`.

ACK `CC-3 | ACK | TELEMATICS 3 DEFECTS FILED · SETTLEMENT-ENTRY NOT MINE | GO`

---
# ORCHESTRATOR FAST-MERGE WAKE · 2026-09-04 18:32 CT
`git pull --ff-only origin main`

## FAST-MERGE 4-MINUTE LAW (ON — permanent weekend method)
Canonical: `docs/bus/FAST-MERGE-4MIN-LAW.md`

1. Gate: `node scripts/money-pr-local-gate.mjs` (Cursor: `node scripts/ops/cursor-ship-preflight.mjs --body-file …`) → **exit 0 = merge proof**
2. Push → open **ready** PR (never draft) → **same 15s** squash:
   `gh api --method PUT repos/tioperfumes07/IH35-TMS/pulls/N/merge -f merge_method=squash`
3. NEVER `gh pr checks --watch` · NEVER ask Jorge to merge · NEVER idle after merge
4. `--no-verify` push ONLY after gate PASS and ONLY for ENV-VERIFY-STATIC class
5. One vertical at a time · FINISH before next · Never POST Book Load
6. Deploy is batched 5–10 merges — **Cursor/CC-1 only** — do not per-merge deploy

Tip `526e392d74`. FE+API deploy kicked to tip (batch of 4 undeployed). Pull. ACK. CODE NOW.

## SEAT NOTE
DRV-03 finish · FAST-MERGE · push --no-verify authorized after gate PASS (ENV-VERIFY-STATIC).

ACK `CC-3 | ACK | FAST-MERGE 4min · NEVER POST | GO`

---
## PRIOR (still valid under ORDER-2026-09-04)

# ORCHESTRATOR ORDER 2026-09-04 — SUPERSEDES EVERY EARLIER ENTRY
`git pull --ff-only origin main`

Canonical full text (LAW + all seats): `docs/bus/ORDER-2026-09-04-ALL-SEATS.md`
ACK one line to your OUTBOX, then EXECUTE your section. Never POST Book Load. Only Cursor deploys.

## YOUR SECTION

================= CC-3 — DRIVERS AND COMPLIANCE =================
1. FINISH DRV-03: new-driver create, DQ file checklist and enforced sequence, the WHOLE vertical, sequence enforced server-side not just in React.
2. SAMSARA ONE-TO-MANY. Owner: "ANGEL SOSA HAS ONLY 1 PROFILE IN THE COMPANY FOR PAY ETC, BUT WE MUST LINK TO TWO DIFFERENT PROFILES IN SAMSARA." mdata.driver_samsara_links is the right shape. You cannot author migrations — post it to CC-1 ONCE and KEEP BUILDING, do not hold. The 19 NULL driver_id rows in telematics.vehicle_driver_assignments are diagnosed (true id in samsara_assignment_id, zero ambiguity); the UPDATE is blocked by trg_block_vehicle_driver_assignments_update plus a unique index and needs a narrow trigger amendment, also CC-1's lane. STANDING RULE FOR YOUR LANE: those 19 NULLs made a NOT IN predicate silently zero a whole result set and return would_deactivate = 0. USE NOT EXISTS, NEVER NOT IN, against any nullable column. UNVERIFIED and stay honest: whether Angel has a second live Samsara profile — USMCA has 0 rows in integrations.samsara_drivers and there is no API access. DO NOT FABRICATE AN ID.
3. ACCIDENT-LIABILITIES VOID HAS NO UI. /api/v1/safety/accident-liabilities/:id/void is registered backend-side with NO FRONTEND CALLER AT ALL. Wire the FE caller as a complete vertical. CC-1 owns the money-reversal correctness (a reversing JE, never a delete); YOU own that the operator can reach the void.
4. THE ROSTER. The owner was right and deactivated_at was wrong — it is unmaintained. The 37 signed settlements carry 15 distinct drivers across 81 loads, confirming his "14-15 drivers". Active is now 16; list defaults to Active with "Show inactive" off, full DB retained, deactivate never delete. Still open: mdata.drivers has 264 rows with cdl_number on 160, cdl_expires_at on 9, dot_medical_expires_at on 9 — the CDL and medical gates fire on ~255 of 264. Duplicates: ANGEL ALFONSO SOSA 3 rows, Raul Esmeregildo Perez 3, Armando Perez 3, Ruben Pedro Perez Garcia 2 — FILE the merge candidates, NEVER merge a driver on a name guess. 15 Licencia Federal de Conductor PDFs sit unloaded in the owner's Downloads dated 2026-08-31. Drivers are Mexican B1, W-8BEN yearly, no withholding, no 1099 or 1042-S. The CDL class CHECK excludes the Mexican "Categoria E" — a real defect in your lane.
5. GUARD DEBT: your guards land in scripts/verify-*.mjs plus .guard-exempt.json rather than scripts/verify-steps/. Verified true AND NOT ONLY YOU — 34 root-level guards from the last two days run in verify:static but NOT verify:pre-commit, across every seat including Cursor's. Wire yours, file the rest as one line. GLB-08 shipped three-letter "SEP" — ask in one line if he meant "SEPT".


---
## HISTORY (superseded — keep for audit, do not execute)

# INBOX-CC-3 · HARD WAKE · 2026-09-04 18:16 CT
`git pull --ff-only origin main`

FAST-MERGE. Never POST. Jorge AWAY.

## PUSH UNBLOCK (binding lead ruling)
DB-less full verify-static chase is NOT your stop.
After `node scripts/money-pr-local-gate.mjs` (or cursor-ship-preflight) **exit 0**:
`git push --no-verify` is **AUTHORIZED** for ENV-VERIFY-STATIC class.
Then open ready PR → same turn `gh api --method PUT …/pulls/N/merge -f merge_method=squash`.
Do not sit on un-pushed local work.

## NOW
1. **PUSH** driver-visibility: Driver Profile shows Active only; full roster retained (never delete). Neon proof in OUTBOX.
2. Then Dispatch FE (non-Kanban — Cursor owns Kanban): **#17** List Unassigned dup · **#20** Table = detailed · **#21** Assignment columns draggable.
3. Continue GLB queue only after (1)–(2) are merged or blocked with a named SHA.

ACK `CC-3 | ACK | push driver-visibility then #17/#20/#21 · NEVER POST | GO`
