# Module completion — Factoring (FACT)

**PROGRESS: 0 of 10** · complete: `false` · as_of: 2026-08-02 · live_sha: `—`

| Status | Count |
|---|---:|
| PASS | 0 |
| HOLD | 0 |
| OPEN | 10 |
| FAIL | 0 |
| UNVERIFIED | 0 |

| ID | Status | Title | Evidence | PR |
|---|---|---|---|---|
| `FACT-S01` | **OPEN** | /factoring home KPI row matches factoring.factor canonical row | scaffold — KPI PASS per auditor (Active Factor + Recourse Days match Neon) | — |
| `FACT-DUAL-01` | **OPEN** | Factor profile panel reads factoring.factor columns (not mdata.vendors notes parse) | scaffold — FAIL: FactoringHome.tsx:289-294 vendor-notes path contradicts KPI row on same screen | — |
| `FACT-DUAL-02` | **OPEN** | SubmitFactoringModal rates from factoring.factor (not parseVendorNotes) | scaffold — FAIL retained from cascade sibling sweep | — |
| `FACT-DUAL-03` | **OPEN** | factoring.routes active factor resolves canonical factoring.factor not mdata.vendors | scaffold — FAIL: factoring.routes.ts:39-60 mdata path | — |
| `FACT-S02` | **OPEN** | /factoring/submit submission queue wired and entity-scoped | scaffold — not proven | — |
| `FACT-S03` | **OPEN** | /factoring/batches batch wizard + detail drill-through | scaffold — not proven | — |
| `FACT-S04` | **OPEN** | /factoring/reserves reserve dashboard economics honest | scaffold — dual-path FAIL retained; reserve movement density UNVERIFIED | — |
| `FACT-S05` | **OPEN** | Duplicate factor vendor banner excludes self-pairs | scaffold — live proof: Faro Factoring ↔ Faro Factoring 100% similar false positive | — |
| `FACT-UNIT-01` | **OPEN** | Banking factor virtual register amount displays cents/100 correctly | scaffold — FAIL: banking.routes.ts:308 advance_amount_cents without /100 | — |
| `FACT-VERIFY-01` | **OPEN** | Factoring module VERIFY-1..8 click-through TRANSP + USMCA | scaffold — not proven | — |

Desktop audit: ~/Desktop/IH35-CURSOR-AUDIT/AUDITOR-RUN-2026-07-31/modules/factoring-deep-2026-08-01.md
