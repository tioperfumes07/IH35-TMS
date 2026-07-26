# ACCT-DOM-01 — JE approval + segregation of duties (DESIGN)

**Status:** DESIGN ONLY — do **not** implement until Jorge answers D1–D6 below.  
**Module:** accounting · **Lane:** FINANCIAL-HOLD (control)  
**Standard:** SOX 404 / NetSuite maker-checker · WF-064 high-risk notify · Rule 15  
**Authority:** `/Users/jorgemunoz/Downloads/FOR-CURSOR 4/BLOCKS-ACCOUNTING.txt` (ACCT-DOM-01)

## Prod truth (GUARD @ 5ce94c8 / main after #3577)

- `journal-entries.service.ts` hard-codes `status='posted'` on create — preparer = poster.
- `role-home/pending-approvals-gl.service.ts` treats JE status as `posted|voided` only → `control_available=false`.
- No maker≠checker gate; `posted_by_user_id` is stored but not enforced as separation.

## Non-goals (this design)

- No new GL math. Reuse existing poster / `createJournalEntry`.
- No QBO write-back. Parallel books unchanged.
- Money-posting flags stay default **OFF**.
- Automated / system-generated JEs remain SOD-exempt (owner confirms D3).

## Proposed control model (owner-gated)

```
draft → pending_approval → posted
                ↘ voided (existing void path)
```

1. **Manual JE** above threshold enters `pending_approval` (not posted).
2. **Approver** must be a different user than preparer (maker≠checker).
3. **Approve** calls existing post path (no duplicate posting math).
4. **Below threshold** (or Owner override — D2) may still post direct when flag allows.
5. **Append-only audit** on submit / approve / reject / void.
6. **Feature flag** `JE_APPROVAL_SOD_ENABLED` default OFF, per-entity kill switch.

### Suggested schema (future mig — reserved number `202609120000`)

Additive only, void-not-delete:

- Widen `accounting.journal_entries.status` CHECK to include `draft`, `pending_approval` (keep `posted`, `voided`).
- Columns: `prepared_by_user_id`, `approved_by_user_id`, `approved_at`, `approval_threshold_cents_snapshot`.
- Trigger / app gate: refuse `posted` transition when preparer = approver and amount ≥ threshold (unless system JE).
- **Do not** drop columns; archive old direct-post path behind flag.

### Guard (when implemented)

`verify-steps` FAILS if a manual JE above threshold can self-approve while the flag is ON for that entity.

## Owner decision table (REQUIRED before build)

| ID | Decision | Options | Jorge |
|----|----------|---------|-------|
| D1 | Approval threshold (cents) | fixed $ / by role / entity-config | |
| D2 | Who may approve | Accountant+ / Admin+ / Owner-only / CoA role | |
| D3 | SOD-exempt classes | system/cron/import only? include bank-rule? | |
| D4 | Closed-period corrections | always dual-control? | |
| D5 | Reject path | return to draft vs void | |
| D6 | UI surface | JE detail + pending-approvals queue | |

## Acceptance (after build + Neon + flags)

- Manual JE above threshold cannot self-approve (live both entities).
- Audit row per approval decision.
- Flag OFF → current direct-post behavior preserved (no regression).

## Linkage

- JE → `catalogs.accounts` lines (existing) + `identity.users` preparer/approver + `org.companies` scope.
- Reverse drill: pending-approvals queue → JE detail → lines → source docs when present.
