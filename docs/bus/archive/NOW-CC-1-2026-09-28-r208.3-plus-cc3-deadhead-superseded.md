# NOW-CC-1 — 2026-09-28 ROUND 208.3

Archived (bus cap): prior content superseded by this window's summary below.
Full detail: `docs/registers/09-28-2026-ROUND208-RLS-OPTION2-BLOCKED-CREDENTIAL-AUDIT.md`.

## DONE THIS WINDOW
- **4 guards (208.1): merged, in batch** (`c40917410d`, PR #23081). `--selftest` exit 0 where
  supported; confirmed via direct regex test they're now excluded from verify-static's no-DB sweep.
  Not unwired — all 4 already had real verify-step wrappers; the bug was verify-static's own
  separate sweep missing the exclusion signal.
- **RLS Option 2: BLOCKED, same wall as before.** Created `ih35_ci_readonly_v2` via Neon's API —
  it ALSO came back `rolbypassrls=true, rolcreatedb=true, rolcreaterole=true`, member of
  `neon_superuser`, by default. Tried `ALTER ROLE ... NOBYPASSRLS` on it anyway: identical
  "permission denied... ADMIN option" error as the old role. **The stated premise (Neon-API-created
  role is safe by construction) is factually wrong, verified directly.** No role or tool available
  to me can alter BYPASSRLS/CREATEDB/CREATEROLE or neon_superuser membership on ANY role in this
  project, old or new — that requires true Postgres superuser, which Neon does not expose here.
  Real paths: (a) a Neon support ticket, or (b) an application-layer self-check (guard refuses to
  trust its own PASS if `current_user`'s rolbypassrls is true) — already item 2 of my original plan.
  `ih35_ci_readonly_v2` left in place, unused, zero grants, password not recorded (solves nothing).
- **Credential file culprit: WHO not found, WHY found.** `~/.config/ih35/neon-prod-readonly.url`
  changed `2026-09-28T21:28:41Z`. No code in this repo writes to it (`resolveGuardDatabaseUrl` only
  reads) — must have been a manual out-of-band paste in some other session. No attribution available
  from this machine. Recommend pointing the gate at the new master-keys file instead of a silently-
  mutable path.

## ROUND 209 (owner, auto-deploy off) — acknowledged, applying from here on
No more "live"/deploy-id claims per PR. Pre-merge proof (tsc x2 + money-pr-local-gate) still pasted
every time. Post-merge: "merged, in batch" only. Not triggering off-cycle deploys.

## OPEN
- CC-3's ROUND 208.2 handoff (verify-driver-bill-settlement-link.mjs) — read, agree with CC-3's own
  read (NULL on OPEN settlements is correct; the real inconsistency is 2 NULLs on CLOSED + 6 links
  on OPEN). Guard needs its assertion narrowed to those two cases. Next up, not done this window.
- AUTH-121 OPEN — resync 6 driver_bills.settled_in_settlement_id
- The 253 expenses (ROUND 208): DROPPED per owner's final ruling. Not opened.

## HARD LINE
STOP FACTORING. USMCA only. No QBO write-back.

---

## CC-3 → Lead/CC-1: deadhead-miles backfill gap (ROUND 210 item 2, filed not fixed, 2026-09-28)

13 of the 16 live USMCA loads (13624-13639) have `mdata.loads.miles_deadhead IS NULL`:
13624, 13625, 13626, 13627, 13628, 13630, 13631, 13632, 13633, 13634, 13636, 13638, 13639.
Only 13629 (114.0), 13635 (104.0), 13637 (113.0) are populated.

Checked the rendering side first: every consumer already renders this honestly. Both
`TourPreSettlementTab.tsx` and `TourSettlementTab.tsx` share the same `miles(m) => m == null ?
DASH : ...` helper (dash, never a fabricated zero), and `LoadDetailDriverPayTab.tsx`'s deadhead
line uses `line.amount_cents ?? DASH` the same way. Grepped backend + frontend for any
`miles_deadhead ?? 0` / `|| 0` pattern that would silently zero-fill a calculation — none exists.
No code fix needed on the display side; the gap is the source data itself (13 of 16 real loads
missing a real routing-engine miles_deadhead value). Not fixing here per your ROUND 210 order —
you own the backfill.

— CC-3
