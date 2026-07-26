# ACCT-DOM-01 — JE approval + segregation of duties (DESIGN)

**Status:** OWNER DECISIONS LOCKED 2026-07-26 — implement allowed (FINANCIAL-HOLD, flag OFF).  
**Module:** accounting · **Lane:** FINANCIAL-HOLD (control)  
**Standard:** SOX 404 / NetSuite maker-checker · WF-064 high-risk notify · Rule 15  
**Authority:** `/Users/jorgemunoz/Downloads/FOR-CURSOR 4/BLOCKS-ACCOUNTING.txt` (ACCT-DOM-01)

## Prod truth (GUARD @ 5ce94c8 / main after #3577)

- `journal-entries.service.ts` hard-codes `status='posted'` on create — preparer = poster.
- `role-home/pending-approvals-gl.service.ts` treats JE status as `posted|voided` only → `control_available=false`.
- No maker≠checker gate; `posted_by_user_id` is stored but not enforced as separation.

## Non-goals

- No new GL math. Reuse existing poster / `createJournalEntry`.
- No QBO write-back. Parallel books unchanged.
- Money-posting flags stay default **OFF** until Jorge flips per entity.
- Automated / system-generated JEs are SOD-exempt (D3).

## Locked control model (Jorge 2026-07-26)

```
Privileged preparer (Owner | Administrator | Accountant)
  → may post direct (no second-person approval)

Non-privileged preparer (any other role)
  → draft → pending_approval → posted
                  ↘ reject → draft (D5)
                  ↘ voided (existing void path)
```

1. **Owner, Administrator, Accountant** preparing a manual JE: **no approval required** from anyone else (D1 + D2).
2. **Any other role** preparing a manual JE: must go to `pending_approval`; approver must be **Owner, Administrator, or Accountant** and **≠ preparer**.
3. **Approve** calls existing post path (no duplicate posting math).
4. **Closed-period corrections:** same rule as D1 (D4) — privileged roles may correct without dual control; non-privileged still need approval.
5. **Append-only audit** on submit / approve / reject / void.
6. **Feature flag** `JE_APPROVAL_SOD_ENABLED` default OFF, per-entity kill switch.
7. **UI (D6):** JE detail **and** pending-approvals queue.

### Schema (implement mig — reserved `202609120000`)

Additive only, void-not-delete:

- Widen `accounting.journal_entries.status` CHECK: `draft`, `pending_approval`, `posted`, `voided`.
- Columns: `prepared_by_user_id`, `approved_by_user_id`, `approved_at` (no dollar-threshold column required — control is **role-based**).
- App gate: when flag ON, refuse direct `posted` for non-privileged preparers; refuse approve when preparer = approver or approver not in privileged set.
- System/cron/import actor → SOD-exempt (D3).
- **Do not** drop columns; direct-post path preserved when flag OFF.

### Guard (when implemented)

`verify-steps` FAILS if (flag ON) a non-privileged user can self-post or self-approve a manual JE.

## Owner decision table — LOCKED

| ID | Decision | Jorge answer (2026-07-26) |
|----|----------|---------------------------|
| D1 | When is approval required? | **Not required** if preparer is **Owner, Administrator, or Accountant**. Required for all other roles. (Role-based — not a $ threshold.) |
| D2 | Who may approve / who is exempt? | **Owner, Administrator, Accountant** do not need anyone else’s approval. They are also the approver set for non-privileged preparers. |
| D3 | SOD-exempt classes | **A** — system / cron / import only (not bank-rule-as-human). |
| D4 | Closed-period corrections | **Same as D1** — privileged roles direct; others need approval. |
| D5 | Reject path | **A** — return to **draft**. |
| D6 | UI surface | **A** — JE detail **+** pending-approvals queue. |

## Acceptance (after build + Neon + flag)

- Non-privileged manual JE cannot self-approve / self-post while flag ON (live both entities).
- Owner/Admin/Accountant can post direct while flag ON.
- Audit row per approval decision.
- Flag OFF → current direct-post behavior preserved (no regression).

## Linkage

- JE → `catalogs.accounts` lines (existing) + `identity.users` preparer/approver + `org.companies` scope.
- Reverse drill: pending-approvals queue → JE detail → lines → source docs when present.
