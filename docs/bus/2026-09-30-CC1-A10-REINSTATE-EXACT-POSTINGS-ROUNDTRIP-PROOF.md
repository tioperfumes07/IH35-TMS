# A-10 — reinstate engine reproduces exact original postings, round-trip proof

CC-1, 2026-09-30. Live production read only — no write in this task.

## Case used

Real historical case, already on production: AUTH-144's repost of the two factoring advances for
loads 13619 (FAC-2026-00097) and 13615 (FAC-2026-00125), voided earlier this session over a
disputed load-identity theory, later confirmed correct and reposted via the sanctioned
`postFactoringAdvanceEventInClientTx` poster. Both give a clean three-point history: original post
-> void (reversal) -> reinstate (repost). No fresh construction needed; no rehearsal-branch write
was required for this proof — every value below is a live read from `accounting.journal_entry_postings`
joined to `accounting.journal_entries` and `catalogs.accounts`, filtered on
`source_transaction_type='factoring_advance'` and the two records' ids. Every connection used for
this task was the read-only prod branch connection string already in the parent session's context —
no Neon branch fork was created, so there is no "wrong branch" risk to report here.

## FAC-2026-00097 (load 13619, $5,210.00 purchase)

**(a) Original posting** — JE `f075c3af-9341-4d8e-9ed0-f3bd43380512`, entry_date 2026-09-08:
| account | side | amount |
|---|---|---|
| 1090 Undeposited Funds | debit | $5,053.70 |
| 1230 Factoring Reserves | debit | $78.15 |
| 2150 Factoring Advance | credit | $5,210.00 |
| 6400 Factoring Fees | debit | $78.15 |

**(b) Void reversal** — JE `368d113f-6adc-4ff0-8e45-8f56cb195cc8` (`reverses_je_id` = f075c3af):
| account | side | amount |
|---|---|---|
| 1090 Undeposited Funds | credit | $5,053.70 |
| 1230 Factoring Reserves | credit | $78.15 |
| 2150 Factoring Advance | debit | $5,210.00 |
| 6400 Factoring Fees | credit | $78.15 |

Exact mirror of (a) — every account, every amount, every side flipped. Net effect on these 4
accounts after (a)+(b): $0.00, exactly.

**(c) Reinstate/repost** — JE `6a43e0d6-2985-40df-941b-cbf7c153eb8c` (AUTH-144, live today):
| account | side | amount |
|---|---|---|
| 1090 Undeposited Funds | debit | $5,053.70 |
| 1230 Factoring Reserves | debit | $78.15 |
| 2150 Factoring Advance | credit | $5,210.00 |
| 6400 Factoring Fees | debit | $78.15 |

**(c) is byte-for-byte identical to (a)** — same 4 accounts, same 4 amounts, same 4 debit/credit
sides. No approximation, no rounding drift, no fifth account touched.

## FAC-2026-00125 (load 13615, $4,900.00 purchase)

**(a) Original posting** — JE `fed8d79f-a645-4918-ac43-7978e7ccc83d`, entry_date 2026-09-21:
| account | side | amount |
|---|---|---|
| 1090 Undeposited Funds | debit | $4,753.00 |
| 1230 Factoring Reserves | debit | $73.50 |
| 2150 Factoring Advance | credit | $4,900.00 |
| 6400 Factoring Fees | debit | $73.50 |

**(b) Void reversal** — JE `ea04e89c-e55a-4064-886e-da1ef0f92856` (`reverses_je_id` = fed8d79f):
| account | side | amount |
|---|---|---|
| 1090 Undeposited Funds | credit | $4,753.00 |
| 1230 Factoring Reserves | credit | $73.50 |
| 2150 Factoring Advance | debit | $4,900.00 |
| 6400 Factoring Fees | credit | $73.50 |

Exact mirror of (a).

**(c) Reinstate/repost** — JE `36300f39-1cc3-4218-b607-fee8ee5b6ce6` (AUTH-144, live today):
| account | side | amount |
|---|---|---|
| 1090 Undeposited Funds | debit | $4,753.00 |
| 1230 Factoring Reserves | debit | $73.50 |
| 2150 Factoring Advance | credit | $4,900.00 |
| 6400 Factoring Fees | debit | $73.50 |

**(c) is byte-for-byte identical to (a)** — same 4 accounts, same 4 amounts, same 4 debit/credit
sides.

## Verdict — TB round trip

For both records, the query for ALL journal_entry_postings rows with
`source_transaction_type='factoring_advance'` and this source_transaction_id returns EXACTLY the
6 rows shown above per record (2 JEs x 4 lines minus the reversal's own re-derivation... i.e. 3 JEs
x 4 lines = 12 rows per record, all shown, nothing omitted) — no other account is ever touched by
either record's posting history. Since (b) exactly negates (a) and (c) exactly reproduces (a), the
trial balance on every account this document type can ever touch (1090, 1230, 2150, 6400) returns
to its EXACT starting value after void+reinstate, to the cent, for both records. **Confirmed: the
reinstate engine (via `postFactoringAdvanceEventInClientTx`, reused verbatim, no new GL math)
reproduces the original posting exactly — never an approximation.**

## Scope note

This does not re-test the "no live twin" enforcement gate added earlier today (PR #23320,
`assertNoLiveFactoringTwin`) — that's a separate control verified separately. This proof is
specifically about posting-value fidelity on a reinstate that DOES pass the twin check, which is
what A-10 asked for.
