# PICK-10 — VOID + RECREATE · 16:30 CT · from #18932
**Source:** `docs/bus/GO-VOID-10-AND-RECREATE-LIVE-NOW-2026-09-01.md` + `docs/audit/VOID-LIST-2026-08-31.md`
**Rule:** `is_sample_data=true` only · UI void by UUID · reverse never delete · never INV-2026-00049..00081 · never real · never trailers/assets

## DEVIN-A (1–5) — proof + broken class first
| # | load_number | UUID | status (live) | why |
|---|-------------|------|---------------|-----|
| 1 | L-20260831-0002 | `36062666-535c-4718-b108-48b77d8ece1d` | completed_docs_received | **REQUIRED** — 0 bills, 0 lines |
| 2 | L-20260831-0017 | `530d9e55-9f93-460c-99b6-d20d70a09f42` | completed_docs_received | **REQUIRED** — bill/line class proof |
| 3 | L-20260831-0003 | `f782ec51-975e-41a4-8085-2e9f962a5be8` | delivered_pending_docs | mid-hop |
| 4 | L-20260831-0004 | `eac446a0-51d4-4ea0-b3a5-d79050d117e9` | completed_docs_received | healed once — void+recreate |
| 5 | L-20260831-0006 | `8756083b-2a72-44c5-a707-0857be899f13` | completed_docs_received | positive-control twin |

## CC-3 (6–10)
| # | load_number | UUID | status |
|---|-------------|------|--------|
| 6 | L-20260831-0010 | `77728721-8ffb-4664-8e9c-2adccbc96ae6` | completed_docs_received |
| 7 | L-20260830-0029 | `b3e9c63e-2f3e-4bcf-a925-75cb3549363e` | completed_docs_received |
| 8 | L-20260830-0028 | `18235045-5772-4c27-8258-6865811c4c0b` | completed_docs_received |
| 9 | L-20260830-0027 | `9520f2b5-b531-40d1-bb3e-a66d0b5a0363` | completed_docs_received |
| 10 | L-20260830-0026 | `07c8a5a0-93dc-4e9c-944f-f9e9a8acbdc6` | completed_docs_received |

## Chain (every hop)
`book/dispatch → invoice → driver bill → load expense → settlement → deduction/escrow → factor → bank match → PAID`
Post per hop: URL · button · record ID · Neon table+amount · JE DR=CR.
