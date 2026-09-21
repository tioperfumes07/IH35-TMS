# ROUND 26.3 STEP 4A -- correction register

Owner ruled 2026-09-21 13:50 CT (18:50 UTC): AlwaysTrack is the source of truth. Both settlements
are deduction shortfalls; gross was already correct on both. Run by CC-1 (Claude), 2026-09-21T18:58:02.740Z.
Actor user id (owner): e4117991-d2c0-406d-8cda-74e98d95bccd. Mode: EXECUTE.

## 5795 (41c422bb-27b1-4ffe-942e-7acc9f133af2)
- REUSE a67bd457-4d03-432b-8bd5-3f983261c547 "Admin fee - GAS" $10.00 -- was applied_to_settlement_id=41c422bb-27b1-4ffe-942e-7acc9f133af2 status=pending -> repoint to 41c422bb-27b1-4ffe-942e-7acc9f133af2, status='applied', load_id=13567
  settlement_lines d46333ed-4e1b-487a-92f2-195550f23eea role=other_recovery posting_account_id=06a9e010-e8db-44a3-9c8e-2b636dbb2e7d approval_status=approved
- REUSE 302b7561-7807-4c20-8672-36814588a71e "CASH ADVANCE WIRE TRANSFER" $201.99 -- was applied_to_settlement_id=3c81e7d5-3a59-4d85-9a16-585d0de05893 status=pending -> repoint to 41c422bb-27b1-4ffe-942e-7acc9f133af2, status='applied', load_id=13567
  settlement_lines d8071398-a87e-459c-a620-a6df4eafd0d7 role=advance_recovery posting_account_id=e4d191a2-621f-4d95-bcda-c4822ed1176e approval_status=approved
- recomputeSettlementHeader method=settlement_lines: deductions_total 50.00 -> 261.99, net_pay 1001.03 -> 789.04 (gross_pay 1051.03)
- TARGET deductions_total=261.99 net_pay=789.04 -- MATCH

## 5800 (1104c9f4-2c1a-46f1-b96b-ed3a71b1901b)
- CREATE "Admin fee - GAS" $10.00 load 13584 deduction_type=other -> a30ff9dc-aba0-4206-8f7e-f698df63e17d
  settlement_lines 24417f26-2bfe-4b62-93b7-7514c6a07b17 role=other_recovery posting_account_id=06a9e010-e8db-44a3-9c8e-2b636dbb2e7d approval_status=approved
- CREATE "CASH ADVANCE WIRE TRANSFER" $200.00 load 13584 deduction_type=advance -> c95dc4d5-2221-4e36-b0b7-fe5c29e63a5f
  settlement_lines 86c6cce7-3500-4682-aade-a13c77525c78 role=advance_recovery posting_account_id=e4d191a2-621f-4d95-bcda-c4822ed1176e approval_status=approved
- CREATE "Admin fee - PAGO DE TELEFONO PERSONAL" $75.00 load 13584 deduction_type=other -> b75cd47e-e74f-45fc-8f1c-daa0ec3b84c1
  settlement_lines 869eeb35-f1cd-446f-9992-e627081f222b role=other_recovery posting_account_id=06a9e010-e8db-44a3-9c8e-2b636dbb2e7d approval_status=approved
- CREATE "Cash Advance-Efectivo" $100.00 load 13584 deduction_type=advance -> 5de17b3b-a2c0-4257-96eb-95419cbba584
  settlement_lines a64bcbc0-d68b-44df-a56c-9dd3745d1392 role=advance_recovery posting_account_id=e4d191a2-621f-4d95-bcda-c4822ed1176e approval_status=approved
- recomputeSettlementHeader method=settlement_lines: deductions_total 285.00 -> 385.00, net_pay 1407.40 -> 1307.40 (gross_pay 1662.10)
- TARGET deductions_total=385.00 net_pay=1307.40 -- MATCH

