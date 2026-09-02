# PASTE ALL SEATS — GO-0013 (USMCA-only redo)

Live API `069d531` · FE `9835206`. Canonical one page: `docs/bus/FEED/NOW-<SEAT>.md`. U14 never restamp. One Devin. Nobody `trigger_deploy`. Jorge is not the messenger — INBOX + FEED is the instruction.

**Scope ruling (owner):** TRANSP, TRK, QuickBooks sync = parked until USMCA operates. Do not re-auth QBO. Do not verify `ih35trucking.net`. Do not work `qbo_sync.*` / `reconciliation.qbo_*` / CSA pull / TRK token.

**Proven Neon (not a comment):** `ledger.integrity_cron` last_success `2026-08-28 14:20:12Z`, last_failure still `finding_type_check`. Live CHECK admits 8 types. `ledger-integrity-detectors.service.ts` writes 5 more: `subledger_tie_out_diff`, `ask_my_accountant_suspense_nonzero`, `unbalanced_journal_entry`, `document_no_gl_delta`, `future_dated_journal_entry`. Detector 2 INSERT aborts the tick; 3–6 never run. BILL-2026-00018/19 are `is_sample_data=true` — do not treat them as real unpaid bills.

**No prod-only ALTER.** Repo max on `origin/main` includes `202613250100`. Live ledger max applied = `202613241200`. Next number **`202613260000`** (CC-1 morning HH 00–11) if still free at push. Confirm no colliding unapplied file on main at author time.

FAST-MERGE = local gate then `gh api` squash. Never `gh pr checks --watch`.
