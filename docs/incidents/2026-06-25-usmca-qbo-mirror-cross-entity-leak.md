# INCIDENT — TRANSP's chart of accounts written under USMCA in the QBO mirror

**Status:** OPEN · evidence preserved · neutralization designed, owner-gated
**Recorded:** 2026-07-28 · **Append-only.** Do not rewrite entries; add new dated sections below.
**Surface:** `mdata.qbo_accounts` · **Affected entity:** USMCA Freight Solutions Inc
(`5c854333-6ea5-4faa-af31-67cb272fef80`)

---

## 1. What happened

**365 rows carrying IH 35 Transportation's chart of accounts are stored in the QBO mirror under
USMCA's `operating_company_id`.** USMCA is a clean entity with **no QuickBooks connection at all**, so
it should have **zero** rows in a QBO mirror.

Until PR #3717, `GET /api/v1/accounting/categories` read that mirror. A USMCA operator opening an
expense-category picker was therefore being offered **another legal entity's general-ledger accounts**,
including accounts named after individual people and accounts QuickBooks had already deleted.

## 2. Evidence (Neon prod `br-fancy-credit-akjnd07a`)

Every figure below comes from a read whose completeness was proven in the same result
(`visible == pg_stat_all_tables.n_live_tup`, i.e. `1654 == 1654`). A first attempt returned all-zeros
and was DISCARDED as a masked `ih35_app` read — the discriminator is what caught it.

| fact | value |
|---|---|
| rows under USMCA | **365** (198 active / 167 named `(deleted)`) |
| `qbo_id` populated on those rows | **0 of 365** — all NULL |
| `qbo_id` populated on TRANSP's rows | 372 of 372 |
| names matching **TRANSP's canonical** chart (`catalogs.accounts`) | **364 of 365** |
| names matching **USMCA's own** canonical chart | 6 |
| USMCA `integrations.qbo_connections` | **0** (TRANSP 2, TRK 2) |
| `created_at` window | **2026-06-25 14:24:46 → 14:28:56 UTC** |
| `mirrored_at` window | **2026-07-16 05:11:55 → 05:16:50 UTC** |
| mirror totals reconcile | TRANSP 372 + TRK 917 + USMCA 365 = **1,654** = physical |

Sample names: `5231 (deleted)`, `ADAN GUTIERREZ RAMIREZ (deleted)`,
`AFLAC - ISAAC MARTINEZ GONZALEZ (deleted)`, `Loan Lease/Ignacio Munoz- T-07`.

## 3. What the evidence rules OUT

**This was not a QuickBooks pull.** A QBO pull always writes a `qbo_id`; all 365 rows have none. An
earlier reading of mine — "zero `qbo_id` overlap with TRANSP/TRK, therefore a distinct set" — was
WRONG: the non-overlap is an artifact of NULL never matching `IN`, not evidence of distinct records.
Corrected here so the record is not built on it.

With `qbo_id` NULL and 364/365 names matching TRANSP's canonical chart, the rows are a **copy of
TRANSP's chart of accounts inserted under USMCA's id**, by something other than the QBO puller.

## 4. Contributing defect (fixed in code, data never cleaned)

`resolveDefaultOperatingCompanyId` previously resolved an unspecified company as
`SELECT default … UNION SELECT any accessible … ORDER BY id LIMIT 1` — the minimum UUID. USMCA
(`5c854333…`) sorts **below** TRANSP (`91e0bf0a…`) and TRK (`b49a737b…`), so any company-omitting write
landed on USMCA. That is documented in the resolver's own comment today.

- **2026-06-25** — rows created under USMCA.
- **2026-07-16** — the same rows re-touched (`mirrored_at`), so the condition persisted three weeks.
- **2026-07-25** — lowest-UUID hijack fixed in 5 places (LST-F05, PR #3480).

The code path is fixed. **The contaminated rows were never removed**, which is why this is still live.

**Not yet proven:** exactly which job performed the 2026-06-25 insert. The lowest-UUID resolver is the
mechanism that would explain it, but attributing the specific writer requires more than the row
contents, and this record will not assert it without proof.

## 5. Exposure and containment

- **Picker-level exposure CLOSED by #3717** — `/accounting/categories` now reads canonical
  `catalogs.accounts`, so USMCA sees its own 53 postable accounts instead of TRANSP's 365.
- **Source-level exposure OPEN** — the rows remain in the mirror and can reach any other consumer.
- **No money moved.** This is a picker/read exposure. No journal entry, bill or payment references
  these rows; the mirror is a read-only projection, not a book of record.

## 6. Neutralization — designed, NOT executed (owner-gated)

Archive, never hard-delete (Rule 07): move the rows to `mdata.qbo_accounts_quarantine`, preserving
every column plus the reason and timestamp. Self-limiting predicate — moves a row ONLY when
`operating_company_id` has **zero** `integrations.qbo_connections` rows — so it is structurally
incapable of touching a connected entity.

Ships via `db:migrate` on deploy. No hand-application: the MCP prod connection alternates roles and
DDL through it is a coin flip.

## 7. Prevention

`verify-qbo-mirror-requires-connection` — no `mdata.qbo_accounts` row may exist for an entity with no
`integrations.qbo_connections` row. Had it existed on 2026-06-25 it would have failed the next CI run
after the insert.

---

### Appendix — corrections made while compiling this record

1. Original timeline said the rows were created **2026-07-16**. That was `mirrored_at`. Creation is
   **2026-06-25**; both timestamps are real and describe different events.
2. "Zero `qbo_id` overlap ⇒ a distinct set of QBO records" was wrong — all `qbo_id` are NULL.
3. "USMCA understated by ~70%" (an earlier PR body) was an all-entity total mislabelled as one
   entity's. USMCA canonical is 58 total / 53 active.
