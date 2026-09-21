# ROUND 28 STEP 3 PHASE 2 -- correction register

AlwaysTrack ADDITIONAL PAY / DRIVER REIMBURSEMENTS / DEDUCTIONS sheets are source of truth.
Run by CC-1 (Claude), 2026-09-21T21:27:32.747Z. Actor user id (owner): e4117991-d2c0-406d-8cda-74e98d95bccd.
Mode: EXECUTE.

## 5804 (48341005-1ac9-4a32-bd7b-f78479782a99, status=closed)
- ADD reimbursement load=13576 "LOVES Driver Reimbursement-TPE-Scale Expense" $15.25
  driver_reimbursements 5b28bad9-a0d3-4e85-922e-bc66616ad6ef -> settlement_lines c2407872-7f1c-4065-bf6b-fd5ec68cab9b posting_account_id=4a0a5b88-3f56-4dc7-853c-37071089315a approval_status=approved
- ADD deduction load=13594 "Admin fee - GAS" $10.00
  driver_settlement_deductions 671fa828-f1c8-4b81-9922-dfcde203e8b4 -> settlement_lines 443d2008-094c-4f7e-bef2-cb94ab42b142 role=other_recovery posting_account_id=06a9e010-e8db-44a3-9c8e-2b636dbb2e7d approval_status=approved
- recomputeSettlementHeader method=settlement_lines: gross_pay=1645.83 deductions_total 50.00 -> 60.00, net_pay 1595.83 -> 1601.08

## 5805 (6a8ecf55-c321-4648-bb05-17fada8881a4, status=closed)
- ADD extra_pay load=13582 "Driver Pay-Enlonada" $25.00
  driver_reimbursements 077f466d-f8c3-4f94-9f33-1ae5e3f805d1 -> settlement_lines 2e7ae6d7-1960-45fd-9be5-d5d39be396ab posting_account_id=fd3a69a2-7c71-41e4-89d8-d5f1f9e15c4b approval_status=approved
- ADD extra_pay load=13582 "Driver Pay-Desenlonada" $25.00
  driver_reimbursements d2cb9c47-cbb0-4400-988f-182f39126804 -> settlement_lines fa82bff4-1e94-48e5-a1b2-cf51493e1f96 posting_account_id=fd3a69a2-7c71-41e4-89d8-d5f1f9e15c4b approval_status=approved
- SKIP (already exists) extra_pay load=13592 "Driver Pay-Enlonada" $25.00 -> 2e7ae6d7-1960-45fd-9be5-d5d39be396ab
- SKIP (already exists) extra_pay load=13592 "Driver Pay-Desenlonada" $25.00 -> fa82bff4-1e94-48e5-a1b2-cf51493e1f96
- ADD reimbursement load=13582 "LOVES GASOLINA/HONDA" $10.00
  driver_reimbursements 4c1cbc0f-01ba-4ea7-b670-1cbc79bcc847 -> settlement_lines 01daf7a3-2bc9-4bbb-b9c7-552268a59a9b posting_account_id=353fbd5b-d39c-4709-ac19-60cae52018f7 approval_status=approved
- ADD deduction load=13592 "Admin fee - GAS" $10.00
  driver_settlement_deductions 353a2312-cd2a-4e45-a084-49dd0cbedffe -> settlement_lines 41029a66-7fc4-4109-8fa0-33455ab46682 role=other_recovery posting_account_id=06a9e010-e8db-44a3-9c8e-2b636dbb2e7d approval_status=approved
- recomputeSettlementHeader method=settlement_lines: gross_pay=1952.65 deductions_total 25.00 -> 35.00, net_pay 1877.65 -> 1927.65

## 5806 (f5305500-726f-4650-ab1c-ebef26db4c31, status=closed)
- ADD extra_pay load=13581 "Driver Pay-Enlonada" $25.00
  driver_reimbursements c023efcd-6c3f-4371-966d-0899842a555d -> settlement_lines d26a9892-1c12-4f9e-b735-10101f28eaaa posting_account_id=fd3a69a2-7c71-41e4-89d8-d5f1f9e15c4b approval_status=approved
- ADD extra_pay load=13581 "Driver Pay-Desenlonada" $25.00
  driver_reimbursements 86a1f25b-64a6-4f44-9011-dec94d643376 -> settlement_lines 0e8b1358-258e-49f4-9a12-2f5a6caa15a4 posting_account_id=fd3a69a2-7c71-41e4-89d8-d5f1f9e15c4b approval_status=approved
- SKIP (already exists) extra_pay load=13591 "Driver Pay-Enlonada" $25.00 -> d26a9892-1c12-4f9e-b735-10101f28eaaa
- SKIP (already exists) extra_pay load=13591 "Driver Pay-Desenlonada" $25.00 -> 0e8b1358-258e-49f4-9a12-2f5a6caa15a4
- ADD deduction load=13591 "Admin fee - GAS" $10.00
  driver_settlement_deductions ee0b4696-e716-4e94-bf98-54af7ea0e80e -> settlement_lines 542fd33a-41ec-4433-9cd1-d41bc6d05113 role=other_recovery posting_account_id=06a9e010-e8db-44a3-9c8e-2b636dbb2e7d approval_status=approved
- recomputeSettlementHeader method=settlement_lines: gross_pay=1968.15 deductions_total 50.00 -> 60.00, net_pay 1868.15 -> 1908.15

## 5807 (89c90396-28b3-46cd-8920-2c496e499b2f, status=open)
- ADD extra_pay load=13585 "Driver Pay-Layover-Estancia 6 y 7 DE SEPTIEMBRE" $50.00
  driver_reimbursements 60c3de87-eba9-4408-9e49-2f1b781e4be6 -> settlement_lines fc2dca3d-af74-470e-8d60-2712e868afcb posting_account_id=fd3a69a2-7c71-41e4-89d8-d5f1f9e15c4b approval_status=approved
- ADD deduction load=13578 "Driver-Escrow For Claims" $25.00
  driver_settlement_deductions d6dcec55-825d-4f44-beaa-c1248885601d -> settlement_lines b199cad3-4fa1-4965-8245-8766a198ff07 role=escrow_contribution posting_account_id=7761b1cd-4844-4cd3-8469-4fd143152da7 approval_status=approved
- ADD deduction load=13587 "Admin fee - GAS" $10.00
  driver_settlement_deductions 7d5dd0c6-4398-49a6-8c50-2f0d3709a94b -> settlement_lines d5a14113-92fb-4cba-987e-9c6e762eaf9d role=other_recovery posting_account_id=06a9e010-e8db-44a3-9c8e-2b636dbb2e7d approval_status=approved
- ADD deduction load=13587 "CASH ADVANCE WIRE TRANSFER" $280.00
  driver_settlement_deductions 8f6ecf3b-5280-4246-9378-5eee011c8ba8 -> settlement_lines 875475e0-4244-42ce-924f-48c290694ca3 role=advance_recovery posting_account_id=e4d191a2-621f-4d95-bcda-c4822ed1176e approval_status=approved
- SKIP (already exists) deduction load=13585 "Driver-Escrow For Claims" $25.00 -> b199cad3-4fa1-4965-8245-8766a198ff07
- recomputeSettlementHeader method=settlement_lines: gross_pay=2067.05 deductions_total 25.00 -> 340.00, net_pay 1992.05 -> 1727.05

## 5808 (63a8333b-8446-4426-bd34-4277997608ec, status=closed)
- ADD extra_pay load=13597 "Driver Pay-Enlonada" $25.00
  driver_reimbursements de441f31-bf5f-4f5d-a3f8-18e145e101ad -> settlement_lines a3a9f369-4168-4b11-b958-711d60ca7aa0 posting_account_id=fd3a69a2-7c71-41e4-89d8-d5f1f9e15c4b approval_status=approved
- ADD extra_pay load=13597 "Driver Pay-Desenlonada" $25.00
  driver_reimbursements 2a3808aa-d35f-41e3-8b31-7e75e35032d9 -> settlement_lines 9c31908c-8bb2-4deb-b612-18f3542b7d02 posting_account_id=fd3a69a2-7c71-41e4-89d8-d5f1f9e15c4b approval_status=approved
- SKIP (already exists) extra_pay load=13601 "Driver Pay-Enlonada" $25.00 -> a3a9f369-4168-4b11-b958-711d60ca7aa0
- SKIP (already exists) extra_pay load=13601 "Driver Pay-Desenlonada" $25.00 -> 9c31908c-8bb2-4deb-b612-18f3542b7d02
- ADD reimbursement load=13597 "ROAD RANGER GAS/HONDA" $10.00
  driver_reimbursements 96979c9a-3504-46da-afc8-9552b47cec6e -> settlement_lines 80ceb0bb-4cac-4cde-b31e-daf826753dfd posting_account_id=353fbd5b-d39c-4709-ac19-60cae52018f7 approval_status=approved
- ADD deduction load=13601 "Admin fee - GAS" $10.00
  driver_settlement_deductions a63e1ef7-4dbd-499b-b595-14bda00ed6c2 -> settlement_lines d1ae5bca-9159-4b14-897d-99f414a9de9b role=other_recovery posting_account_id=06a9e010-e8db-44a3-9c8e-2b636dbb2e7d approval_status=approved
- recomputeSettlementHeader method=settlement_lines: gross_pay=1951.25 deductions_total 0.00 -> 10.00, net_pay 1901.25 -> 1951.25

## 5809 (4db66351-c523-43a4-b949-bd4d9c42e5a2, status=closed)
- ADD extra_pay load=13583 "Driver Pay-Layover-Estancia 11 Y 13 DE SEPTIEMBRE" $50.00
  driver_reimbursements 11b628ef-34ef-45a4-810c-53a2700545f0 -> settlement_lines 0845a3ce-a0e3-40df-98b4-5b427f9bee6e posting_account_id=fd3a69a2-7c71-41e4-89d8-d5f1f9e15c4b approval_status=approved
- ADD extra_pay load=13583 "Driver Pay-Extra Delivery/Drop" $25.00
  driver_reimbursements 20ada1c9-fc51-493a-a4d4-20f9258b9ef7 -> settlement_lines 2323ec89-c961-49da-a954-7b226081a766 posting_account_id=fd3a69a2-7c71-41e4-89d8-d5f1f9e15c4b approval_status=approved
- ADD reimbursement load=13606 "GDC GROUP LOGISTICS,INC Warehouse-Lumper Fee Expense" $120.00
  driver_reimbursements cb93b706-1bb4-4029-840a-025909708324 -> settlement_lines 5434a72f-e166-453f-8f9c-9552b14fc50c posting_account_id=b029d12d-f0b2-4f69-9e84-5df91a954c77 approval_status=approved
- ADD deduction load=13598 "Driver-Escrow For Claims" $25.00
  driver_settlement_deductions fedc5fe7-e9f1-4148-8fdf-ea7d288a58fd -> settlement_lines 992716ea-8b7a-4c39-8ed5-48b5bca40f9a role=escrow_contribution posting_account_id=a1516250-8c94-4dd4-9faf-1f4088cd90a7 approval_status=approved
- SKIP (already exists) deduction load=13606 "Driver-Escrow For Claims" $25.00 -> 992716ea-8b7a-4c39-8ed5-48b5bca40f9a
- ADD deduction load=13606 "Admin fee - GAS" $10.00
  driver_settlement_deductions 9f472b88-388a-439d-be60-d03fd3939798 -> settlement_lines d59a36a0-a11d-49ce-bb90-10e31c7ae5b1 role=other_recovery posting_account_id=06a9e010-e8db-44a3-9c8e-2b636dbb2e7d approval_status=approved
- recomputeSettlementHeader method=settlement_lines: gross_pay=2040.97 deductions_total 50.00 -> 85.00, net_pay 1915.97 -> 2075.97

## 5810 (f074c0c9-266c-4fc6-9c1e-446d702ced49, status=open)
- ADD extra_pay load=13599 "Driver Pay-Extra Pick Up" $25.00
  driver_reimbursements 8c2cf9c3-1224-47bb-8201-ebb810ccf961 -> settlement_lines d0f6b431-597c-4e95-868f-62bb9f730461 posting_account_id=fd3a69a2-7c71-41e4-89d8-d5f1f9e15c4b approval_status=approved
- SKIP (already exists) extra_pay load=13599 "Driver Pay-Extra Pick Up" $25.00 -> d0f6b431-597c-4e95-868f-62bb9f730461
- ADD deduction load=13599 "Driver-Escrow For Claims" $25.00
  driver_settlement_deductions cdd923c6-952f-41aa-8f63-0fca2f8dc2d5 -> settlement_lines 920a46df-f343-47ef-999b-3aa77c1a691a role=escrow_contribution posting_account_id=6974ef4b-1f48-40a0-b736-d3ceb4137859 approval_status=approved
- ADD deduction load=13599 "Admin fee - gas" $10.00
  driver_settlement_deductions 22fe3c2f-9602-4615-a98e-ab7415260757 -> settlement_lines 1d0bde22-b56a-41ec-8727-0618bc7da5fb role=other_recovery posting_account_id=06a9e010-e8db-44a3-9c8e-2b636dbb2e7d approval_status=approved
- recomputeSettlementHeader method=settlement_lines: gross_pay=1735.77 deductions_total 25.00 -> 60.00, net_pay 1685.77 -> 1675.77

## 5811 (222c0d6b-9c2c-4751-ba08-affd64a993a3, status=closed)
- ADD extra_pay load=13596 "Driver Pay-Enlonada" $25.00
  driver_reimbursements d753b329-c073-4ae3-99d9-e6b28dccbac5 -> settlement_lines 3cfd1894-1073-46ea-8255-62cd1db2bf98 posting_account_id=fd3a69a2-7c71-41e4-89d8-d5f1f9e15c4b approval_status=approved
- ADD extra_pay load=13596 "Driver Pay-Desenlonada" $25.00
  driver_reimbursements 62d44a9a-902f-478f-b67d-56f12eb6e070 -> settlement_lines e8913721-f550-4184-b233-48f8f0705e54 posting_account_id=fd3a69a2-7c71-41e4-89d8-d5f1f9e15c4b approval_status=approved
- SKIP (already exists) extra_pay load=13603 "Driver Pay-Enlonada" $25.00 -> 3cfd1894-1073-46ea-8255-62cd1db2bf98
- SKIP (already exists) extra_pay load=13603 "Driver Pay-Desenlonada" $25.00 -> e8913721-f550-4184-b233-48f8f0705e54
- ADD extra_pay load=13603 "Driver Pay-Layover-Estancia" $25.00
  driver_reimbursements e82fc327-0de3-46fe-b90a-508ca498fd14 -> settlement_lines b5db8a6c-4caa-407e-a077-407945263205 posting_account_id=fd3a69a2-7c71-41e4-89d8-d5f1f9e15c4b approval_status=approved
- ADD deduction load=13603 "Driver-Escrow For Claims" $25.00
  driver_settlement_deductions cf9ae738-4911-4bda-a2f7-7db77be2f70c -> settlement_lines b9488adc-6f6d-4a28-b759-35a56d5baea1 role=escrow_contribution posting_account_id=7680014f-3980-47a3-8959-90606b32adf8 approval_status=approved
- ADD deduction load=13603 "Admin fee - GAS" $10.00
  driver_settlement_deductions 2ad7f283-1c0b-4ed5-a9b1-fb117b03ab2b -> settlement_lines b4147f5f-83b7-4441-9245-bce2b7b98b3a role=other_recovery posting_account_id=06a9e010-e8db-44a3-9c8e-2b636dbb2e7d approval_status=approved
- recomputeSettlementHeader method=settlement_lines: gross_pay=1974.35 deductions_total 25.00 -> 60.00, net_pay 1874.35 -> 1914.35

## 5812 (63145f15-a749-4b86-adc6-254be14d31c7, status=closed)
- ADD deduction load=13588 "Driver-Escrow For Claims" $25.00
  driver_settlement_deductions b1fdf05e-e93d-433e-bef9-c019a1e126f4 -> settlement_lines ac31e2d6-6b9e-4164-971d-495c5e449116 role=escrow_contribution posting_account_id=7761b1cd-4844-4cd3-8469-4fd143152da7 approval_status=approved
- SKIP (already exists) deduction load=13600 "Driver-Escrow For Claims" $25.00 -> ac31e2d6-6b9e-4164-971d-495c5e449116
- recomputeSettlementHeader method=settlement_lines: gross_pay=0.00 deductions_total 0.00 -> 25.00, net_pay 721.68 -> -25.00

## 5813 (e47e64e2-33cf-4c27-abf2-4e3ee5dbc95e, status=closed)
- ADD extra_pay load=13602 "Driver Pay-Enlonada" $25.00
  driver_reimbursements 0050d539-d602-4015-8791-72c4ddfd5fc9 -> settlement_lines 63e3a688-66e9-4b88-a7be-dd4ff5c0d95b posting_account_id=fd3a69a2-7c71-41e4-89d8-d5f1f9e15c4b approval_status=approved
- ADD extra_pay load=13602 "Driver Pay-Desenlonada" $25.00
  driver_reimbursements abe870fb-bd0d-4067-96d6-cc60efc44f28 -> settlement_lines a3323633-bdf7-4293-8980-ce8329ca4728 posting_account_id=fd3a69a2-7c71-41e4-89d8-d5f1f9e15c4b approval_status=approved
- SKIP (already exists) extra_pay load=13607 "Driver Pay-Enlonada" $25.00 -> 63e3a688-66e9-4b88-a7be-dd4ff5c0d95b
- SKIP (already exists) extra_pay load=13607 "Driver Pay-Desenlonada" $25.00 -> a3323633-bdf7-4293-8980-ce8329ca4728
- ADD deduction load=13607 "Admin fee - GAS" $10.00
  driver_settlement_deductions d607d1fd-e69d-4ef9-b463-55239997e3af -> settlement_lines 9b78458d-45f2-4062-9b53-2468233fdd4b role=other_recovery posting_account_id=06a9e010-e8db-44a3-9c8e-2b636dbb2e7d approval_status=approved
- recomputeSettlementHeader method=settlement_lines: gross_pay=1946.05 deductions_total 0.00 -> 10.00, net_pay 1896.05 -> 1936.05

## 5814 (d00faf77-0d38-451a-807f-54a594c318f5, status=closed)
- ADD extra_pay load=13604 "Driver Pay-Enlonada" $25.00
  driver_reimbursements 5805ef85-5f77-4c8d-9e88-5ad9d6a83023 -> settlement_lines 188115aa-1eef-4181-851e-2c8f33078329 posting_account_id=fd3a69a2-7c71-41e4-89d8-d5f1f9e15c4b approval_status=approved
- ADD extra_pay load=13604 "Driver Pay-Desenlonada" $25.00
  driver_reimbursements fdf914e3-ad48-4a90-a603-e04abd09d937 -> settlement_lines 9d609597-d074-40c3-a06b-05d6dab231c7 posting_account_id=fd3a69a2-7c71-41e4-89d8-d5f1f9e15c4b approval_status=approved
- SKIP (already exists) extra_pay load=13608 "Driver Pay-Enlonada" $25.00 -> 188115aa-1eef-4181-851e-2c8f33078329
- SKIP (already exists) extra_pay load=13608 "Driver Pay-Desenlonada" $25.00 -> 9d609597-d074-40c3-a06b-05d6dab231c7
- ADD deduction load=13608 "Admin fee - GAS" $10.00
  driver_settlement_deductions 321c7efd-05db-434f-b385-aa421c02ac25 -> settlement_lines 287dd971-5e73-4dd5-8293-01af7dbaf329 role=other_recovery posting_account_id=06a9e010-e8db-44a3-9c8e-2b636dbb2e7d approval_status=approved
- recomputeSettlementHeader method=settlement_lines: gross_pay=1952.65 deductions_total 0.00 -> 10.00, net_pay 1902.65 -> 1942.65

## 5815 (00027149-1c90-4bc1-b213-0a6d6d614ac6, status=open)
- ADD deduction load=13605 "Driver-Escrow For Claims" $25.00
  driver_settlement_deductions 8e7da2d7-cd90-468d-9bcb-c2d80c12a291 -> settlement_lines 5c1cb9a3-b2f2-4659-a42a-48b553a01b0c role=escrow_contribution posting_account_id=2a05f421-72a6-4b2c-9488-9533a4f135dc approval_status=approved
- SKIP (already exists) deduction load=13611 "Driver-Escrow For Claims" $25.00 -> 5c1cb9a3-b2f2-4659-a42a-48b553a01b0c
- ADD deduction load=13611 "Admin fee - GAS" $10.00
  driver_settlement_deductions 55324b6a-9748-4e47-a99d-4eb3f79e3cfa -> settlement_lines f07c8691-5001-49e4-9caa-a657e8946d0b role=other_recovery posting_account_id=06a9e010-e8db-44a3-9c8e-2b636dbb2e7d approval_status=approved
- recomputeSettlementHeader method=settlement_lines: gross_pay=1266.10 deductions_total 0.00 -> 35.00, net_pay 1266.10 -> 1231.10

## stray load 13595 (belongs to document 5816, not 5809)
- VOID settlement_lines 805b072c-4af8-4860-a1fb-548cad8702ed (escrow_contribution $25.00) — load 13595 does not belong to document 5809
- NULL mdata.loads.presettlement_link_id for load 13595
- recomputeSettlementHeader(5809) method=settlement_lines: deductions_total=60.00 net_pay=2100.97

