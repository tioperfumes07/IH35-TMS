# Form 425-C Exhibit F — silent-truncation exposure (owner / attorney decision item)

**Date:** 2026-07-31 · **Raised by:** Claude Coder · **Status:** SURFACED FOR OWNER — not an agent decision
**Related:** PR #3926 (fix) · FINDING `RPT-425C-EXHIBIT-F-SILENT-ZERO`

---

## The one thing to read first

**No Form 425-C has ever been generated or filed through this system.** `compliance.form_425c_reports`
holds **0 rows**, confirmed RLS-immune (`n_live_tup = 0`, not a masked read), as do
`form_425c_exhibit_a_entries` and `form_425c_exhibit_b_entries`.

Therefore the defect below is **exposure that was caught before it produced a filing** — it is *not*
evidence that a filed report was defective. The signed 425-C PDFs held outside this repo were
prepared outside this system and are unaffected by this code path.

**No amended filing is indicated by this defect.** That remains the owner's and the attorney's call,
but the factual basis for one is absent.

---

## The defect

`exhibit-f-supporting-docs.ts` capped both of its queries at `LIMIT 200`, and computed
`document_count` as `documents.length` **after** the cap. A period with more than 200 invoices or
200 bills would therefore have produced a supporting-documents schedule that:

1. omitted every record past the 200th, with no marker anywhere in the document, and
2. reported the truncated number **as the true count**.

Both are fixed in PR #3926: the caps are removed, and completeness is now proven against an
independent database count before the exhibit is returned (`assertComplete`) — the exhibit either
lists every qualifying document or refuses to build.

---

## Affected periods — had a filing been generated

Measured on Neon prod `br-fancy-credit-akjnd07a`, 2026-07-31, `bypass_rls='lucia'`, voided rows
excluded. **51 entity-months** exceed the old cap; **3,031 supporting documents** would have been
omitted in total.

| Source | Entity | Periods over cap | Worst period | Documents omitted |
|---|---|---|---|---|
| Invoices | TRANSP | 29 | 2023-08 (345) | 1,922 |
| Bills | TRK | 22 | 2022-03 (342) | 1,109 |
| **Total** | | **51** | | **3,031** |

### TRANSP — invoices (29 periods)

| Period | True total | Would have reported | Omitted |
|---|---|---|---|
| 2022-05 | 205 | 200 | 5 |
| 2022-06 | 252 | 200 | 52 |
| 2022-07 | 255 | 200 | 55 |
| 2022-08 | 290 | 200 | 90 |
| 2022-09 | 299 | 200 | 99 |
| 2022-10 | 282 | 200 | 82 |
| 2022-11 | 314 | 200 | 114 |
| 2022-12 | 250 | 200 | 50 |
| 2023-01 | 236 | 200 | 36 |
| 2023-02 | 266 | 200 | 66 |
| 2023-03 | 303 | 200 | 103 |
| 2023-04 | 261 | 200 | 61 |
| 2023-05 | 322 | 200 | 122 |
| 2023-06 | 323 | 200 | 123 |
| 2023-07 | 319 | 200 | 119 |
| **2023-08** | **345** | 200 | **145** |
| 2023-09 | 314 | 200 | 114 |
| 2023-10 | 303 | 200 | 103 |
| 2023-11 | 307 | 200 | 107 |
| 2023-12 | 238 | 200 | 38 |
| 2024-02 | 213 | 200 | 13 |
| 2024-03 | 229 | 200 | 29 |
| 2024-04 | 256 | 200 | 56 |
| 2024-05 | 237 | 200 | 37 |
| 2024-06 | 206 | 200 | 6 |
| 2024-07 | 229 | 200 | 29 |
| 2024-08 | 215 | 200 | 15 |
| 2025-03 | 221 | 200 | 21 |
| 2025-06 | 232 | 200 | 32 |

### TRK — bills (22 periods)

| Period | True total | Would have reported | Omitted |
|---|---|---|---|
| 2019-01 | 250 | 200 | 50 |
| 2019-03 | 219 | 200 | 19 |
| 2019-05 | 227 | 200 | 27 |
| 2019-07 | 209 | 200 | 9 |
| 2019-08 | 235 | 200 | 35 |
| 2019-10 | 289 | 200 | 89 |
| 2020-03 | 208 | 200 | 8 |
| 2020-08 | 278 | 200 | 78 |
| 2020-09 | 242 | 200 | 42 |
| 2020-10 | 206 | 200 | 6 |
| 2021-07 | 206 | 200 | 6 |
| 2022-01 | 261 | 200 | 61 |
| 2022-02 | 278 | 200 | 78 |
| **2022-03** | **342** | 200 | **142** |
| 2022-04 | 320 | 200 | 120 |
| 2022-05 | 270 | 200 | 70 |
| 2022-06 | 275 | 200 | 75 |
| 2022-07 | 255 | 200 | 55 |
| 2022-08 | 238 | 200 | 38 |
| 2022-09 | 241 | 200 | 41 |
| 2022-10 | 247 | 200 | 47 |
| 2022-11 | 213 | 200 | 13 |

---

## What is NOT claimed here

- **Not claimed:** that any filed 425-C is defective. This system has filed none.
- **Not claimed:** that the externally-prepared PDFs are correct or incorrect — they are outside this
  code path and were not examined. TRANSP 2025-06 appears in the table above *and* an externally
  prepared June 2025 filing exists; those two facts are unrelated, because this system generated no
  report for that period. Independent review of externally-prepared exhibits is a separate question.
- **UNVERIFIED:** the 425-C document has still not been rendered end-to-end through its endpoint.
  The render gate remains open and 425-C must not be filed from this system until it closes.

## Decision requested

None from engineering. The owner/attorney may wish to note the exposure for the record. If any
externally-prepared exhibit is ever reconciled against this system, the periods above are where the
two would diverge.
