# SEAT ORDERS — PERMISSIONS + TRACEABILITY · 2026-09-01 02:00Z
Law: `LAW-EDITABLE-BY-PERMISSION-ALWAYS-TRACEABLE-2026-09-01.md` (f165754).

## NEW LAW — applies to every module, shipped and unshipped
Everything is **editable by permission**. **Owner and accountant are always authorized.** Every such
edit is **traceable**: actor, timestamp, before, after, reason. **Traceable ≠ erasable — reverse,
never delete.** A hard "cannot be mutated" with **no authorized path is a DEFECT**, not a safety
feature.

## CLOSED / WITHDRAWN — remove from all queues
- `ACCT-F10162` — **WITHDRAWN.** My claim that `mdata.assets` has no FKs was false; it has five.
  **CC-1's #18928 was COMPLETE — all three FKs + `equipment_id`. Credit CC-1.**
- `BANK-RECON-ACCEPT-MATCH-500` — **CLOSED.** Confirm now returns a canonical conflict, not a 500.
- `DISPATCH-NO-1500-MILE-MEXICO-RADIUS-BLOCK` — **CLOSED.** No mileage restriction exists.

## STANDING
Fast merge · **red required check = STOP** (Cursor overrides in writing only) · LIVE CHROME to
create, Neon to verify · TEST-FREEZE on proven hops · **a fix is not done until its guard is NAMED
IN A WORKFLOW AND RUNNING** · **selftests never mutate tracked source** · **FK/constraint claims use
`pg_constraint`, never the information_schema three-way join** · **search the locked decisions
before asking the owner anything financial** · never idle.

---

**CC-1** — driver account PAIR (86 active: 14 advance, 2 escrow, **73 with neither**) auto-create +
backfill + backfill the 12 at original August dates, guard named in CI. Then
`RECON-CLOSED-SESSION-NO-AUTHORIZED-PATH`: owner/accountant get a reopen-or-adjust path, confirmed
and **logged**. Then pay-rate **resolution** (94 rates exist, not resolving), L-0017/L-0002/L-0003,
one real chain to PAID, factoring 97/1.50/1.50/$10 → **92,102.74**. Low priority: drop the duplicate
`mdata_assets_tenant_id_fkey` / `mdata_assets_unit_id_fkey`, keep `mdata_assets_equipment_id_fkey`.

**CC-2** — P-B reporting fix; P-A guard table; **NEW: the locked-state audit** — for every lock/close
/post in the app, does an authorized owner/accountant path exist, and is it logged? Publish it; it
ranks with the posting trace. Verify 4,680/190/4,490/844 and challenge. Grade CC-1's pair build and
the 421-row void list before it runs.

**CC-3** — insurance request build (COI for customer · driver-add to insurer), reuse
`insurance.coi_request` + the existing email pipeline, **no second table, no second sender**,
**COI attaches at POLICY level, not ×14 units** (Cursor's correction — right). Then the ID-card 404,
the 3 Inactive scheduled drivers, coverage-status flag.

**CODEX** — **re-check `banking.reconciliation_sessions`: which are OPEN?** Correction to your report:
posted bill_payments **DO exist — 9 posted, 14 void**, several real: **$1,200.00 (Aug 27)**, $123.45,
$64.80, $60.00 (Aug 22). What is missing is one linked to a settlement in an **open** session. That
may unblock you without waiting on CC-1. Your conduct was the standard — you reported the wall
instead of walking around it. Do not reopen a period yourself; that is CC-1's authorized-path fix.

**DEVIN-A** — dispatcher WARN + CONFIRM on policy-schedule membership (**not** `assigned_driver_id`),
logged: who, when, driver, load, truck. 1,500-mile item is CLOSED. Settlement hop stays OPEN —
$0.00 shells prove nothing.

**CASCADE** — navy on the dropdown unlock · publish the REAL route list · guard with selftest **named
in CI** · monthly insurance reporting job that alarms.

**CURSOR** — enforce the permissions law on every review: any lock without an authorized path is a
defect. Delete the three closed items above from all queues. Nothing voids until CC-2 says P-A+P-B
green.
