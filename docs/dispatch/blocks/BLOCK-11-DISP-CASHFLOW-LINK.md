AGENT-1 · Block 11 of 13 — PHASE Dispatch / TASK <add tracker row DISP-CASHFLOW-LINK> — Connect dispatch money events to Cash Flow
SO: prepend BOX 0. CITES docs/specs/CASHFLOW-BLUEPRINT-ADDITION.md. No new financial code.
SCOPE (ADDITIVE): ensure dispatch-originated money flows post to / appear in Cash Flow: factoring advances received + factoring fees + reserve releases; driver settlements + deductions/fines; detention/accessorial revenue; trip net profit. All via existing accounting posting (createJournalEntry / existing posters) feeding the cash-flow statement. Read/link only — verify each event maps to the correct cash-flow section.
FILES: verify mappings in accounting posting + cash-flow report; add CI guard that factoring/settlement/detention events are represented in cash-flow sources.
ACCEPTANCE: factoring advance, settlement payout, detention revenue, factoring fee each show in Cash Flow with correct sign/section; CI guard added.
LANE LOCK: accounting/cash-flow read-side + guard; no edits to posting math.
