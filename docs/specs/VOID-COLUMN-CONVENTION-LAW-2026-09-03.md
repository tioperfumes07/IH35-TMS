# VOID-COLUMN CONVENTION — OWNER RULING, 2026-09-03. PERMANENT LAW. ALL SEATS.

> Filed into `docs/` per the owner's instruction: "you raised it, you own recording it."
> Source: `REFERENCE/VOID-COLUMN-CONVENTION-LAW-2026-09-03.txt` (verbatim below), raised by
> CC-2 after refusing to unilaterally rename 350 migration files' worth of void-marker columns
> without an owner ruling. Enforced by `scripts/verify-no-new-deleted-at-columns.mjs`
> (`LAW-2026-09-03-VOID-COLUMN-CONVENTION` in `docs/law/LAW.json`).

## THE PROBLEM CC-2 MEASURED

Four different columns mean "this record is turned off", used interchangeably:

| Column | Migration files |
|---|---:|
| `deactivated_at` | 189 |
| `voided_at` | 107 |
| `deleted_at` | 36 |
| `revoked_at` | 18 |

Nothing said which to use, so each was chosen by whoever wrote the table.

## WHAT IT COST, TONIGHT, LIVE

NCC Logistics Mexico vanished from the Book Load customer picker. Root cause: the customer list
filters on one column, the status badge reads a different one. 14 USMCA customers currently carry
`status='active'` AND `deactivated_at` SET at the same time. They read as active and still do not
appear. That is this defect, in the owner's hands.

## THE RULING — THREE CONVENTIONS, EACH WITH ONE MEANING. NEVER A FOURTH.

- **`voided_at`** — MONEY WAS REVERSED. A reversing journal entry was posted. Invoices, bills,
  expenses, payments, journal entries, settlements, driver bills, bank transactions. This is the
  WORM concept: void, never delete.
- **`deactivated_at`** — STILL REAL, NO LONGER SELECTABLE. Nothing is reversed, nothing is denied.
  Customers, vendors, drivers, units, trailers, catalog rows.
- **`revoked_at`** — ACCESS WITHDRAWN. Something that was issued and taken back. API keys,
  permissions, tokens, signed acknowledgments.
- **`deleted_at`** — RETIRED. DOES NOT EXIST GOING FORWARD. "Nothing is ever permanently deleted"
  is standing law. On a financial table `deleted_at` is a WORM violation in a soft-delete costume;
  on master data it is `deactivated_at` under another name. Every one of the 36 is really one of
  the three above, mislabelled.

## HOW IT GETS FIXED — NO BIG-BANG RENAME

- NEVER add `deleted_at` to a new table. NEVER add a fifth column of this kind.
- A new table picks exactly one of the three, by meaning, and states which in the migration header.
- The 36 existing `deleted_at` tables convert OPPORTUNISTICALLY: when a seat touches one of those
  tables for any other reason, it converts it in the SAME PR. Not as a separate project, not all
  at once, never on a table nobody is otherwise working in.
- A conversion is additive and idempotent: add the correct column, backfill from `deleted_at`,
  repoint every reader AND writer, leave the old column in place unused. Never DROP.
- Owner law unchanged: nothing is destroyed, ever. This is about NAMING, not deletion.

## ONE PREDICATE PER SURFACE — THE PART THAT ACTUALLY BIT US

A list filter, its status badge, its search endpoint and its count MUST all read the SAME column.
If a surface shows a status somewhere and filters somewhere else, they are the same predicate or
it is a defect. Cursor's customer-picker fix (2 mojibake names + 14 status/`deactivated_at`
contradictions) is the first application of this rule.

---

OWNER: Jorge Pablo Munoz, 2026-09-03. Raised by CC-2, who correctly refused to rename
unilaterally. Recorded by orch.
