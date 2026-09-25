# DEVIN-B · ROUND 181 · DRIVER IDENTITY, DRIVER SUB-ACCOUNTS, AUTO-NUMBER GENERATOR
Issued 09-25-2026 04:24 PM CT (21:24Z) by Claude-Lead. **Deadline: 09-26-2026 14:00 UTC.** If missed, Codex takes it.

**Read first:**
- Project doc `claude/00-USMCA-RECONCILIATION-CLOSED-NEVER-ASK-AGAIN.md` §7, the source of every rule below.
- `docs/bus/09-25-26-handoff-READ-FIRST.md` §0, the laws.

USMCA `5c854333-6ea5-4faa-af31-67cb272fef80` only. Branch prefix `devin-b/`. FAST-MERGE with the DoD template.

Your seat does NOT write production. For each step, ship the code, the guard and the dry-run proof (read-only SQL output). The Lead issues the AUTH and runs the production write.

## Steps, in order. Paste the proof for each.

**1. Kill the auto-number generator.**
- Find the code that mints account numbers such as `DRIVERCASHAD896665-NNN`, `DRIVERTRIPLU056412`, `DRIVERRECOVE488409` and `TMS-INC-DRIVER-ABANDON`.
- Make it stop. A new driver sub-account gets NO auto-generated number (owner law: no auto numbers without written owner approval), and its name is the driver's name, in English.
- Guard: `scripts/verify-no-auto-generated-account-numbers.mjs` (static + live count).

**2. Build the missing parent: `Driver Settlements Payable`** (Liability), with one child per driver named `<DRIVER NAME>`. Siblings exist as models:
- `Driver Advances Receivable` (Asset), one child per driver;
- `Driver Escrow - Held in Trust` (Liability, 2100-00-NNN), keep.

Deliver a migration or seed script. Dry run only. List the 22 real drivers (20 Active + 2 Probation) that get a child.

**3. Pollution report (read-only).** Measured in the doc: 22 real drivers vs 41 escrow and 47 advance sub-accounts. Test rows include:
- CODEX FLEET TEST, ZZTEST AUTOACCT PROBE, TESTCC3, CC3TEST, TEST CODEX ×5, SAMPLE Cascade ×2, TEST DRIVER-USMCA, Juan USMCA-Battery, TEST Autoprovisionwalk-void, "Safety —".

For each account, report: its postings count, its balance, and whether it is safe to deactivate (0 postings and 0 balance). Deliver it as a table. **Never delete. Deactivate only, through the Lead's AUTH.**

**4. Duplicate drivers (evidence first, then a merge tool).**
- **The pairs:**
  - `fba21d80` "ANGEL ALFONSO SOSA" vs `52037e93` "ANGEL ALFONSO SOSA PEREZ". The Lead moved advance CA-2026-0007 to 52037e93 today.
  - Leonel Antonio Morales Noguez / Leonel Antonio Morales.
  - Carlos Mauricio Carvallo / CARLOS MAURICIO PENA CARVALLO. AlwaysTrack confirms the full name.
  - Juan USMCA-Battery ×2.
- **Evidence per pair:** every row pointing at each id — loads, driver_bills, settlements, advances, escrow, expenses, fuel, Samsara ids.
- **Merge tool:** `scripts/ops/…-merge-driver.ts`. It repoints every FK to the survivor, deactivates the loser (never deletes), and writes an `appendCrudAudit` row per repoint. Dry run only.
- **One human may have 2–3 Samsara users:** model one `mdata.drivers` row with many Samsara ids. Never resolve by name at query time.

**5. FAST-MERGE the code and guards.** Paste:
- the PR numbers;
- the dry-run outputs;
- the exact AUTH text the Lead must issue for steps 2–4.
