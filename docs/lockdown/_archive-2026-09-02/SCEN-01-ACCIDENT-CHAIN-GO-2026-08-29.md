# SCEN-01 — CLOSE ZERO-COVERAGE SCENARIOS (GO 2026-08-29)

**Lead: Cursor. Do not design a new tracker.** Registry + live probes already exist.

Live at send: API `healthz` **`5063761`**. SPA `/version.json` **`18e4784`**. Hard-reload before judging Program scenario dots.

---

## FLAGS ARE ON — DO NOT STOP FOR AN OWNER GATE

`PARALLEL-BOOKS-CUTOVER-LOCKED`: *all GL_POSTING flags enabled on all entities is CORRECT, not a misconfiguration. Never raise it as a red flag again.*

Defaults in `lib.feature_flags` are `false`. **Overrides** on USMCA / TRANSP / TRK are `true` for the accident-chain flags (GL, BILL, EXPENSE, SAFETY_FINE, INSURANCE_CLAIM_RECOVERY, DRIVER_ESCROW_FORFEIT, SETTLEMENT, PARTS_PURCHASE, WARRANTY_REIMBURSE, DRIVER_ADVANCE). TONU AR is USMCA-only.

**CC-1 first action (mandatory):** re-run the flag+override join as **`ih35_app`** (not `neondb_owner`). Same transaction: `current_user`, entity, a known-nonempty control. If `ih35_app` disagrees with the owner-role read, **stop posting hops and file the discrepancy** — do not guess.

TEST documents **will post**. KEEP TEST. Do not void until launch.

---

## BOARD vs DONE

`audit.scenario_status` / tracker greens on probe **`n > 0`** (fat joins). That proves **the chain connected**. It does **not** prove the **designed accounts**.

**CC-1 must not accept n > 0 as done.** For every money hop, assert the **account codes and signs** named in `apps/backend/src/home/scenario-registry.ts` `je:` (e.g. accident `DR Accident Loss / CR A/P or Escrow`; insurance `DR Cash / CR Insurance Recovery`; roadside_ap `DR Repair / CR A/P`; deductions `DR Net Pay Clearing / CR the deduction account`; settlement `DR Driver Pay / CR Net Pay Clearing`). DR = CR. Named accounts, not “a JE exists.”

A green dot over a wrong posting is the class we spent the day killing.

Six scenarios = **six different joins**. Several sittings. One accident does not green all six.

Entity: owner 2026-08-29 — **whichever entity already has the data**. Record the entity. USMCA-only still governs launch leftover; it does **not** govern this scenario proof.

---

## ZERO BOARD (do these)

| key | Who | Notes |
|---|---|---|
| `scenario.accident` | CC-3 create hops 1–3,5,7 · CC-1 hops 4,6 + GL codes | Probe already requires claim + AC WO + TMS bill + **posted** JE + cost lines + driver liability |
| `scenario.insurance` | CC-3 claim · CC-1 recovery posting + codes | |
| `scenario.deductions` | CC-3 hop 10 · CC-1 settlement deduction + codes | |
| `scenario.settlement` | CC-1 | Money hop |
| `scenario.roadside_ap` | CC-3 WO/in-transit if needed · CC-1 bill+JE codes | |
| `hop.assign` | **CC-1 (money), not Codex** | Probe = non-void **driver bill** on load, rate-card miles **≠** customer rate, assignment history. UI assign alone stays red |

**Codex:** do **not** own `hop.assign`. Stay on leftover unique `/dispatch` `/fuel` unless CC-1 asks for a load that already has a bill.

**CC-2 / Cascade GUARD:** do not stamp scenario done on a screenshot. Close only when **linkage query + GL account-code assertion** both pass live. Do not flip `prod_verified` on module-completion from this GO.

**CC-3:** hops 1 accident (driver, **unit**, **trailer → `mdata.equipment`**, load), 2 fault, 3 insurance claim, 5 repair WO, 7 legal matter, 10 driver deduction row. Labeled TEST. Screenshot is evidence of **create**, not of GL.

Extend existing tests: `accident-dire-scenario.db.test.ts`, `insurance-claim-recovery-scenario.db.test.ts`, `abandonment-escrow-forfeit-scenario.db.test.ts` — do not rewrite.

---

## TRAILERS

Canonical trailer FK = **`mdata.equipment`**. Do **not** rewrite DVIR/`mdata.units` hubs without a **new owner pick**. Dual hub stays OPEN as owner decision, not a silent code “fix.”

---

MIGRATE: N/A · nobody but Cursor `trigger_deploy` (5–10) · KEEP TEST · U14 never restamp

---

## SUBSCRIPTION-GRADE DONE (owner 2026-08-29)

Canonical: `docs/lockdown/SUBSCRIPTION-GRADE-DEFINITION-OF-DONE-2026-08-29.md`.
If the owner has to open A/R / GL / the matrix to see whether the action took, the hop is not done.

Every SCEN-01 money hop: **PROVES-IT-WORKS** = live JE **account codes** from `scenario-registry.ts` `je:`.
**KEEPS-IT-TRUE** = probes derived at request time (`scenario-tracker.service.ts`); V1–V6 on the matrix are **request-time** `verifierRollup`, not `verifier-rollup.json`.
Stored boards: `docs/specs/DERIVED-ARTIFACTS.json` + `scripts/verify-derived-artifact-freshness.mjs`.
