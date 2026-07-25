# Scoreboard dispatch blocks (supplement to the 47 pile)

These are **module-completion** FINDING blocks shipped with the remaining packet so Claude/Cursor
can dispatch without chat-only scope. They do **not** change the pile count of **47**.

| FINDING | Lane | File | Note |
|---|---|---|---|
| `ACCT-ECON-05` | FINANCIAL-HOLD | `ACCT-ECON-05-vendor-credits-canonical-qbo-vendors.md` | LINKAGE: canonical `accounting.qbo_vendors` + one live credit; flags OFF |
| `BANK-F08` | NON-FINANCIAL | `BANK-F08-categorization-rules-automatch-depth.md` | Rules + automatch deep-wizard |
| `BANK-F09` | NON-FINANCIAL | `BANK-F09-settings-reports-email-queue-deep-wizard.md` | Settings / reports / email-queue deep-wizard |
| `BANK-ECON-04` | NON-FINANCIAL | `BANK-ECON-04-recon-sessions-ops-density.md` | **REWRITE:** `202608030000` APPLIED — ops/browser only |
| `BANK-SURF-04` | NON-FINANCIAL | `BANK-SURF-04-recon-workspace-ops-browser.md` | **REWRITE:** same mig — browser DoD |
| `BANK-LINK-01` | NON-FINANCIAL | `BANK-LINK-01-counterparty-fk-ops-browser.md` | **REWRITE:** `202608050000` APPLIED — ops/browser only |

**Standing owner law for this packet**
- Parallel posting / `QBO_*_PROJECTION_ENABLED` stay **OFF** until final cutover — do not flip.
- **OWNER** decides (no third-party gate language).
- Fine GL is decided (Safety) — do not re-ask.
- Packet path must exist on `main`: `docs/trackers/acct-bank-remaining-blocks-2026-07-25/` (guarded).
