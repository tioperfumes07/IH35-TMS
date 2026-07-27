# IH35-TMS QUALITY STANDARD — LOCKED (Rule #0, supersedes on conflict)

Owner: Jorge Pablo Munoz. This is the first standing law of IH35-TMS. Every agent, every session, every block, every recommendation is bound by it. On any conflict with another doc, THIS wins on the hardline. Cursor's permanent operating charter is `docs/specs/CURSOR-OPERATING-CONSTITUTION.md` (auto-loaded via `.cursor/rules/00`–`07` + `10`–`16`); when instructions conflict, the **more conservative / more protective** reading wins. **Rule 16** (`.cursor/rules/16-fix-not-patch-evidence-law.mdc`): fix root cause, never patch, never defer without written tracker entry, evidence before done.

## The hardline rule
We never take the short or easy way if it creates risk, weak architecture, confusion, future bugs, financial mistakes, or unfinished work. We do not patch over problems. We do not defer important issues just because they are complicated. We do not guess. We fix the root cause correctly.

The goal is to create trustworthy, honest, efficient, professional software of the highest standard in the market, built to reach and eventually surpass the quality, integrity, reliability, and operational seriousness of QuickBooks, NetSuite, McLeod, Alvys, and any serious TMS / ERP / accounting software in the market anywhere in the world.

## Evidence before recommendation
For every recommendation, decision, block, audit, migration, accounting function, dispatch function, finance workflow, report, or operational feature, the recommendation must be based on real evidence: current repo state, current branch, current production state, current database state, current PR state, live data when applicable, accepted accounting principles, transportation-industry standards, and professional software practices. Do not recommend from memory alone when the answer requires current verification. Investigate first. Get up to date.

## The bar to measure against
- QuickBooks-level accounting trust
- NetSuite-level structure and controls
- McLeod-level trucking operational seriousness
- Alvys-level modern transportation workflow
- professional ERP/TMS/accounting software standards
- accepted accounting principles and financial controls
- security, auditability, integrity, and production reliability standards

For financial/accounting/reconciliation work, always do a deep-dive of these providers' actual behavior and accepted accounting principles before designing — never from memory alone.

## What is required of every agent
- Be honest. Be professional. Investigate before recommending.
- Do not guess. Do not assume. Do not defer root problems.
- Do not create temporary patches that will cause future conflicts.
- Do not say something is done unless it is verified.
- Do not hide uncertainty; state it plainly.
- Do not make financial, accounting, QBO, RLS, migration, role-mapping, period-close, production, or security decisions without proof.
- Always think about long-term consequences and recommend the correct professional path, even if it takes more time.
- Tell Jorge when you are not performing at optimal quality so he can open a new chat.

## Tie-breakers
- Speed vs trust → choose trust.
- Easy vs correct → choose correct.
- Guessing vs verifying → verify.
- Moving forward vs protecting the company → protect the company.

Every recommendation must be made as if the software may later be reviewed by a CPA, auditor, attorney, insurance company, lender, customer, DOT/FMCSA reviewer, software architect, or court.

## Quality means, concretely
correct accounting; honest financial reporting; traceable numbers; reliable dispatch operations; strong audit trails; no silent failures; no skipped migrations; no fake green checks; no unverified production claims; no unsafe financial writes; no guessed mappings; no hidden assumptions; no shortcuts that reduce trust; no design changes without approval; no "done" without proof.

This software is being built for a real trucking company. It must protect money, trucks, drivers, customers, insurance, taxes, settlements, QuickBooks accounting, compliance, and company reputation. The goal is not to move fast and create problems later; it is to build this correctly, with integrity, from the foundation up, until the software stands at the level of QuickBooks, NetSuite, McLeod, Alvys, and surpasses them where possible.

## Enforcement clauses earned 2026-07-27 (evidence, not theory)

Everything below happened WHILE this standard was in force and auto-loaded. The prose did not catch any
of it; running the thing and reading the result did. These two clauses are the mechanical residue.

### 1. The denominator rule — a zero is not an answer until you can say "zero out of what"

Live evidence from a single day:

| Surface | Reported | Reality |
|---|---|---|
| Fuel GL | — | 1,531 transactions / $620,263.88, **8 journal entries in all of prod** |
| Layover detector | `tick complete { total: 0 }` | **never executed** — three independent silent failures |
| Severe-repair cost | (nothing) | 42703 every run; the **$7,000 capitalize threshold was never evaluated** |
| Fixed-asset register | empty | **no create path existed at all** |

Any surface reporting a count MUST report the population it counted over, or surface **cannot run** /
**partial** / **no evaluable data** as states distinct from a genuine zero. A zero that means *broken*
must never be indistinguishable from a zero that means *clean*. This is the single highest-yield check
in this repo — it would have caught every item in the table above, years earlier than the audits did.

### 2. The allowlist rule — never silence a guard that found a real defect

`verify-sql-column-existence` covered `maintenance.work_order_lines`, DETECTED a live 42703
(`work_order_id`, a column that does not exist on that table), and the finding was frozen in
`verify-sql-column-existence.allowlist.json` as an "accepted false positive". The guard worked; it was
switched off.

An allowlist entry is **a claim that the guard is wrong**. It must be provable against prod and carry a
removal condition. Prove it, or fix the bug.

Corollary, equally binding: verify each entry **individually** before removing. Of three entries on that
table, two were genuine false positives — `w.id` and `w.operating_company_id` belong to
`maintenance.work_orders` and are misattributed by the guard's `DELETE ... USING` alias handling.
Removing all three would have been the same failure inverted.

