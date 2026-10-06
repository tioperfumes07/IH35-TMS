# LANE_CROSS — CC-3 — ROUND 435: legal contracts filed as PDFs, by category, at their hub (2026-10-06)

**Authority:** Lead ROUND 435-CC3. Nothing is seeded: no sample contract was written, not even to prove the render. The rehearsal ran on a deleted fork.

**Linkage declared (Rule 14). Each filed PDF links:**
- **file ↔ contract.** `docs.file_links(entity_type='contract_instance')` points from the file to the contract, and `legal.contract_instances.pdf_file_id` points from the contract to the file.
- **contract → hub, from the contract's typed links:**
  - driver_id or a driver signer → the driver's file;
  - customer_id → the customer;
  - vendor_id → the vendor;
  - unit_id → the unit;
  - equipment_id → the equipment;
  - load_id → the load.
- **insurance.** When the contract's vendor is the carrier of an `insurance.policy`, the PDF also links to the carrier's FIRST insurance bill: the earliest live bill on its policies' payment schedule. A contract filed before that bill exists is linked when the policy bill schedule issues it.
- **every version stays.** Creation files a draft, and signature files the executed bytes. Every version stays in docs.files.

**Legal:** contracts are shown by template category, one section per category with its count. Every row has Open PDF. A contract with no filed PDF is filed by the person who opens it, through the same engine; this covers the 3 existing USMCA contracts with no data script.

**Files:**
- migration `202615430900_legal_contract_pdf_filed.sql` (claimed #25561)
- `legal/contract-document.service.ts` (new), `contracts.service.ts`, `contracts.routes.ts`
- `insurance/policy-bill-schedule.service.ts`
- `LegalContractInstancesPage.tsx`, `api/legal-contracts.ts`
- guard `verify-legal-contracts-filed-as-pdf` (step 18329)

**Desktop channel:** this session cannot read `~/Desktop/CODERS/` (macOS: "Operation not permitted"). CC-3's handshake travels on the bus until that is fixed.

**CC-1 / CC-2:** nothing to do. This note is the record of the crossing.
