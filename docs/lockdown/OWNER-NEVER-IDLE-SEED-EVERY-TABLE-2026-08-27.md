# OWNER LAW — NEVER IDLE · SEED GATED TABLES (BOUNDED) · KEEP TEST
**Locked 2026-08-27 23:15 CT. Amended GO-2340 23:40 CT. Answered = closed.**

Owner chat (verbatim intent): a coder must **always be working**. If their lane is drained they **share with another coder**. There is no luxury of waiting 30–40 minutes for Cursor instructions. If a path needs data, **create labeled TEST** (including a TEST **asset** at a placeholder price and finance cost) and **create bank transactions** so match / bills / expenses / payments can run. **Do not delete.**

**GO-2340 amendment (Claude, owner-adopted):** steal instead of idle; **do not seed POD to fire Event 2**; `is_sample_data` on the whole TEST asset/JE chain; seed ~25 tables not ~700; steal needs a claim.

This **supersedes** GO-2310 “KEEP GATE · N/A” for Faro / equipment loans / RP schedule / tax (those still get TEST rows when the poster is launch-owed), and **supersedes** “idle while named-blocked = correct” as a reason to sit.

Canonical amendment: `docs/lockdown/GO-2320-AMENDMENT-POD-SEED-STEAL-CLAIM-2026-08-27.md`.

## 1. Idle

- **Unverified work = defect.** Stamping PASS without SHA + row/JE is still forbidden.
- **Waiting for Cursor / a GO packet while any unblocked work exists = defect.**
- If your NOW is blocked: **claim then steal** (`docs/bus/STEAL-CLAIMS.json`). Do not sit. Do not stamp a green cell to look busy.
- Cursor lead writes GOs **without** becoming the clock.

## 2. Keep TEST — do not delete, do not void for proof

- CREATE labeled TEST (`TEST` / `USMCA-TEST` in name/memo). **Keep it.** Owner voids at operational 100%, not seats.
- Do not DELETE fixture rows. Do not void the central fixture set to “clean up.”
- CREATE-TEST-THEN-VOID law still means **owner** voids at launch — seats **stop voiding evidence**.

## 3. Zero rows — bounded (~25, not ~700)

Seed the **7 gate-backing tables Claude verified** (**except `dispatch.pod_documents` until after B**) plus each module’s **C31** living-doc need.

**Do not seed:** `accounting.periods` (closed), reversal tables, anomaly tables for defects that do not exist.

**Rule:** seed to **exercise a code path**, never to satisfy a check.

If you hit 0 rows on a launch-owed hop: **create the TEST document that turn** (wizard, not SQL dump unless CC-1 money requires poster). CC-2 extends `docs/specs/scoreboard/posting-gate-tables.json` by tracing posters. Seats do not wait for a complete inventory.

## 4. TEST asset on USMCA

Standing chart law: PP&E exists **when a purchase is recorded**. Owner authorized **one labeled TEST asset purchase** (placeholder price + finance cost) so equipment-loan posting, bank match, bills, expenses, and payments can be exercised. That purchase is TEST, not “USMCA is now the fleet owner.” One TEST unit + one TEST loan + bank txns is enough unless a second type unblocks a distinct poster.

**`is_sample_data` must be set on the asset, the note payable, and every auto-generated depreciation / interest JE.** Depreciation autopost is unattended (ACCT-F210 class).

## 5. Bank side

Create TEST bank transactions so **match / categorize / pay bill / receive payment** can run. Empty bank feed is not a stop. Sample-tag the chain.

## 6. POD

**Do not seed `dispatch.pod_documents` until B is live on healthz.** A TEST approved POD is per-load; it makes Event 2 fire for one load and leaves the gate in code for every other. That hides that B never shipped. Factoring still needs `has_approved_pod` — seed POD for that path **only after B**.

USMCA only. No TMS→QBO write-back. No U14 restamp.

GO: `docs/lockdown/PASTE-ALL-SEATS-GO-2026-08-27-2320.md` as amended by `…-2340.md`.
