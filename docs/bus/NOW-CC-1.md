# NOW-CC-1 — 2026-09-28 ROUND 210

Archived (bus cap): `docs/bus/archive/NOW-CC-1-2026-09-28-r208.3-plus-cc3-deadhead-superseded.md`.

## DONE THIS WINDOW
- **Item 1 (guard narrowing): merged, in batch** — `verify-driver-bill-settlement-link.mjs` was
  actively LIVE FAILING with 12 false positives before the fix (confirmed live, not assumed).
  Narrowed to require the linked settlement `status='closed'`. Zero new exclusions. Rule written
  down in the guard's own header with all 10 live row ids (2 real NULL-on-closed, already named/
  expiring ROUND 23.3 debt; 8 set-while-open, expected, including 2 from my own ROUND 207 fix).
- **Item 3 (bypassrls self-check helper): merged, in batch** — `scripts/lib/require-non-bypass-rls.mjs`,
  real mutation-proof `--selftest`. **Major finding while building it, corrects my own ROUND 205.5/206
  claim**: the pooled connection's "reliable downgrade to ih35_app" is FALSE as a blanket statement —
  measured live, 1 of 8 rapid clean connections landed on a raw, undowngraded `neondb_owner` backend.
  Root cause: the real production app's own pool explicitly does `SET ROLE ih35_app`, and that state
  persists on shared PgBouncer-style backends with no reset between different logical clients. Impact
  is narrow: ordinary money guards that SET `app.bypass_rls='lucia'` are unaffected (separate app-level
  mechanism); only guards that CLEAR it to test real enforcement are at risk (my B3 guard, Devin-B's
  workflow_requests guard). Re-audited the "11 guards" from ROUND 205.5 by hand: only those 2 do
  genuine live enforcement testing; the other 9 are static source-scanners, helper doesn't apply.
- **Item 4 (gate repoint): merged, in batch** — `resolveGuardDatabaseUrl()` now reads the owner's
  master keys file's own dedicated section instead of the silently-mutable dotfile. Rotated
  `ih35_ci_readonly`'s password as part of this and recorded it there with the required stamp.
- **Item 2 (Neon ticket): submitted, no ticket number exists to give you.** Wrote and submitted the
  full technical request (project/branch, exact ask, all 5 pieces of evidence, the 836-grant safety
  argument) through Neon's AI Assistant — confirmed via Neon's own official docs
  (neon.com/docs/introduction/support) that on our Launch plan, formal support tickets with a ticket
  number exist **only for billing issues**; Discord and AI chat are explicitly documented as "not an
  official Neon Support channel," with no ticket system for a technical request like this one short
  of upgrading to Scale. Did get one real, useful answer: the documented self-service path to delete
  the orphaned `ih35_ci_readonly_v2` role (Postgres database > Roles > Delete role). Not fabricating a
  ticket number. If this needs to actually get fixed, the real options are: upgrade to Scale plan, or
  accept the interim self-check helper (item 3) as the standing mitigation.
- **Item 5 (standing rule): saved.** Caught myself mid-turn about to `rm scripts/ops/*.mjs` again in
  spirit — corrected to named-file deletes with git status before/after, per the exact order. Also
  saved as a durable memory for future sessions.

## ROUND 213 (owner, verify-purge-era-closures-still-hold no longer a gate) — acknowledged
Not my guard to touch. My line item ("Faro invoice 87 — unchanged, still the P0") reflects ROUND
207's already-closed status: the row was never missing, root-caused to the voided/reinstated
`voided_at` blind spot, re-diffed correctly at 0 real gaps. Nothing new to do here unless told
otherwise — flagging this reading rather than silently redoing already-closed work.

## OPEN
- CC-3's deadhead-miles backfill (13 of 16 live loads missing `miles_deadhead`) — I own the backfill
  per ROUND 210 item 2's routing. Next up.
- AUTH-121 OPEN — resync 6 driver_bills.settled_in_settlement_id
- The 253 expenses: DROPPED per owner's final ruling. Not opened.

## HARD LINE
STOP FACTORING. USMCA only. No QBO write-back.
