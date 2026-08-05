// ─────────────────────────────────────────────────────────────────────────────
// GENERATED FILE — do not hand-edit.
// Produced by scripts/gen-program-scoreboard.mjs from docs/audit/program-scoreboard.json,
// which is emitted by the audit machine check from docs/audit/AUDIT-COVERAGE-LIVE.md.
// Source of truth = the ledger. The board renders truth; it cannot manufacture it.
// ─────────────────────────────────────────────────────────────────────────────

export type GateState = "PASS" | "AUDIT" | "FIX" | "FAIL" | "UNV" | "NA";
export interface ModuleRow { tier: string; module: string; build: string; cells: GateState[]; gap: string; }
export interface ProdMetric { n: string; label: string; detail: string; tone?: "good" | "flag" | "zero"; }
export interface ChainNode { title: string; table: string; fk: string; chip: string; chipTone: "prod" | "unv" | "fix" | "fail"; hub?: boolean; branch?: boolean; }
export interface GuardItem { badge: string; tone: "ver" | "pend" | "flag" | "fail"; text: string; }
export interface ProgramScoreboard {
  meta: { generatedAt: string; sourceSha: string; deployedSha: string; prodReadAt: string; ledgerRows: number; failOpen: number; defects: number; };
  modules: ModuleRow[]; prod: ProdMetric[]; chain: ChainNode[]; chainMoney: string; chainReverse: string; guard: GuardItem[];
}

export const PROGRAM_SCOREBOARD: ProgramScoreboard = {
  "meta": {
    "generatedAt": "2026-08-04T23:22:35-05:00",
    "sourceSha": "4e4033ffb",
    "deployedSha": "308bc66",
    "prodReadAt": "2026-08-02 22:02 CDT",
    "ledgerRows": 680,
    "failOpen": 15,
    "defects": 14
  },
  "modules": [
    {
      "tier": "0",
      "module": "banking",
      "build": "18/19",
      "cells": [
        "AUDIT",
        "AUDIT",
        "AUDIT",
        "AUDIT",
        "FIX",
        "AUDIT",
        "AUDIT",
        "AUDIT",
        "AUDIT",
        "AUDIT",
        "AUDIT",
        "UNV",
        "AUDIT"
      ],
      "gap": "B PROD (10,970 txns). V4: 192 JEs balanced; single-row walk + picker/link click-through pending."
    },
    {
      "tier": "0",
      "module": "home",
      "build": "1/1",
      "cells": [
        "AUDIT",
        "AUDIT",
        "NA",
        "NA",
        "AUDIT",
        "AUDIT",
        "NA",
        "AUDIT",
        "NA",
        "NA",
        "NA",
        "UNV",
        "AUDIT"
      ],
      "gap": "Dashboard surface; V3 tile-link click-through pending."
    },
    {
      "tier": "0",
      "module": "lists",
      "build": "23/23",
      "cells": [
        "AUDIT",
        "AUDIT",
        "AUDIT",
        "NA",
        "AUDIT",
        "AUDIT",
        "FAIL",
        "AUDIT",
        "NA",
        "AUDIT",
        "NA",
        "AUDIT",
        "AUDIT"
      ],
      "gap": "1,434 CoA. V2 FAIL: payment-terms creator 42701. Catalog click-throughs pending."
    },
    {
      "tier": "1",
      "module": "accounting",
      "build": "38/39",
      "cells": [
        "FAIL",
        "AUDIT",
        "FAIL",
        "FAIL",
        "AUDIT",
        "AUDIT",
        "AUDIT",
        "AUDIT",
        "AUDIT",
        "AUDIT",
        "FIX",
        "UNV",
        "AUDIT"
      ],
      "gap": "Bill→GL PROD (JE 52e17945). Invoice→GL merged, pending deploy. CoA→register→report click-through pending (V3)."
    },
    {
      "tier": "1",
      "module": "vendors",
      "build": "7/7",
      "cells": [
        "AUDIT",
        "AUDIT",
        "AUDIT",
        "AUDIT",
        "AUDIT",
        "AUDIT",
        "AUDIT",
        "AUDIT",
        "AUDIT",
        "AUDIT",
        "PASS",
        "UNV",
        "AUDIT"
      ],
      "gap": "2,828 vendors. V6 PROD: vendor→bill→GL JE 52e17945. Picker/1099/WO links live-exercise pending."
    },
    {
      "tier": "1",
      "module": "maintenance",
      "build": "0/39",
      "cells": [
        "AUDIT",
        "AUDIT",
        "FIX",
        "FAIL",
        "AUDIT",
        "AUDIT",
        "FAIL",
        "FIX",
        "FIX",
        "AUDIT",
        "FIX",
        "UNV",
        "AUDIT"
      ],
      "gap": "WO create #4091 merged (was 500) — pending deploy+live 201. V2 FAIL: maintenance catalogs 404 unmounted."
    },
    {
      "tier": "1",
      "module": "settlements",
      "build": "1/9",
      "cells": [
        "AUDIT",
        "FAIL",
        "UNV",
        "AUDIT",
        "FIX",
        "AUDIT",
        "NA",
        "AUDIT",
        "UNV",
        "AUDIT",
        "UNV",
        "UNV",
        "AUDIT"
      ],
      "gap": "0 settlements — V4/V6 terminal UNVERIFIED. Step-1: run a settlement."
    },
    {
      "tier": "1",
      "module": "fuel",
      "build": "0/9",
      "cells": [
        "AUDIT",
        "FAIL",
        "FAIL",
        "NA",
        "AUDIT",
        "AUDIT",
        "NA",
        "AUDIT",
        "FAIL",
        "AUDIT",
        "FAIL",
        "UNV",
        "AUDIT"
      ],
      "gap": "1,547 txns/$625,546/100% load_id NULL/0 GL. V4+V6 FAIL, no fix merged."
    },
    {
      "tier": "2",
      "module": "dispatch",
      "build": "0/37",
      "cells": [
        "AUDIT",
        "AUDIT",
        "FAIL",
        "FIX",
        "AUDIT",
        "AUDIT",
        "FIX",
        "AUDIT",
        "FIX",
        "AUDIT",
        "FIX",
        "UNV",
        "AUDIT"
      ],
      "gap": "11 loads. wf064 escrow consumer not completing. BookLoad/QuickAssign picker guards merged."
    },
    {
      "tier": "2",
      "module": "drivers",
      "build": "0/20",
      "cells": [
        "AUDIT",
        "FAIL",
        "FAIL",
        "AUDIT",
        "AUDIT",
        "AUDIT",
        "AUDIT",
        "AUDIT",
        "UNV",
        "AUDIT",
        "UNV",
        "UNV",
        "AUDIT"
      ],
      "gap": "183 drivers. B FAIL: duplicate drivers + 3 schema-drift cols. V4: 0 settlements."
    },
    {
      "tier": "2",
      "module": "insurance",
      "build": "1/6",
      "cells": [
        "AUDIT",
        "AUDIT",
        "UNV",
        "AUDIT",
        "AUDIT",
        "AUDIT",
        "AUDIT",
        "AUDIT",
        "UNV",
        "AUDIT",
        "UNV",
        "UNV",
        "AUDIT"
      ],
      "gap": "0 policies/0 claims — the 15-FK V4 web unwalkable. Step-1: create a claim (ClaimCreateModal)."
    },
    {
      "tier": "2",
      "module": "safety",
      "build": "36/38",
      "cells": [
        "AUDIT",
        "AUDIT",
        "FAIL",
        "AUDIT",
        "AUDIT",
        "AUDIT",
        "UNV",
        "AUDIT",
        "UNV",
        "AUDIT",
        "UNV",
        "UNV",
        "AUDIT"
      ],
      "gap": "0 accidents/fines/incidents — V4 unwalkable. Cursor 26→38 surfaces."
    },
    {
      "tier": "2",
      "module": "legal",
      "build": "0/12",
      "cells": [
        "AUDIT",
        "AUDIT",
        "FIX",
        "AUDIT",
        "AUDIT",
        "AUDIT",
        "UNV",
        "AUDIT",
        "UNV",
        "AUDIT",
        "NA",
        "UNV",
        "AUDIT"
      ],
      "gap": "0 matters — matter→claim→driver→unit V4 unwalkable (exposure, no GL). Step-1: open a matter."
    },
    {
      "tier": "2",
      "module": "compliance",
      "build": "1/9",
      "cells": [
        "AUDIT",
        "AUDIT",
        "NA",
        "AUDIT",
        "AUDIT",
        "AUDIT",
        "UNV",
        "AUDIT",
        "AUDIT",
        "AUDIT",
        "NA",
        "UNV",
        "AUDIT"
      ],
      "gap": "Operational (no GL). Permit/inspection→driver/unit V4 + D/E live-exercise."
    },
    {
      "tier": "2",
      "module": "system",
      "build": "0/6",
      "cells": [
        "AUDIT",
        "FAIL",
        "FIX",
        "AUDIT",
        "FIX",
        "AUDIT",
        "NA",
        "AUDIT",
        "AUDIT",
        "AUDIT",
        "NA",
        "UNV",
        "AUDIT"
      ],
      "gap": "4 bg jobs failed 2026-08-02 (B FAIL)."
    },
    {
      "tier": "3",
      "module": "customers",
      "build": "9/10",
      "cells": [
        "AUDIT",
        "AUDIT",
        "UNV",
        "AUDIT",
        "AUDIT",
        "AUDIT",
        "AUDIT",
        "AUDIT",
        "FIX",
        "AUDIT",
        "FIX",
        "UNV",
        "AUDIT"
      ],
      "gap": "2,694 customers. V4/V6: customer→invoice→AR→GL gated on invoice→GL fix (pending deploy)."
    },
    {
      "tier": "3",
      "module": "fleet",
      "build": "0/7",
      "cells": [
        "FIX",
        "AUDIT",
        "UNV",
        "AUDIT",
        "AUDIT",
        "AUDIT",
        "FAIL",
        "AUDIT",
        "AUDIT",
        "AUDIT",
        "NA",
        "UNV",
        "AUDIT"
      ],
      "gap": "188 units. V2 FAIL: fleet catalogs POST 500 (trailing -- comment). A fix live-check."
    },
    {
      "tier": "3",
      "module": "inventory",
      "build": "7/7",
      "cells": [
        "AUDIT",
        "AUDIT",
        "AUDIT",
        "FAIL",
        "AUDIT",
        "AUDIT",
        "UNV",
        "AUDIT",
        "UNV",
        "AUDIT",
        "UNV",
        "UNV",
        "AUDIT"
      ],
      "gap": "Picker seed + parts→WO→GL, 0 activity."
    },
    {
      "tier": "3",
      "module": "factoring",
      "build": "0/10",
      "cells": [
        "AUDIT",
        "AUDIT",
        "UNV",
        "NA",
        "AUDIT",
        "AUDIT",
        "NA",
        "AUDIT",
        "UNV",
        "AUDIT",
        "UNV",
        "UNV",
        "AUDIT"
      ],
      "gap": "0 advances — factoring→customer/invoice/reserve V4 unwalkable."
    },
    {
      "tier": "3",
      "module": "finance",
      "build": "0/9",
      "cells": [
        "AUDIT",
        "AUDIT",
        "AUDIT",
        "NA",
        "AUDIT",
        "AUDIT",
        "NA",
        "AUDIT",
        "AUDIT",
        "AUDIT",
        "AUDIT",
        "UNV",
        "AUDIT"
      ],
      "gap": "GL cockpit traced; live click-through pending."
    },
    {
      "tier": "3",
      "module": "reports",
      "build": "0/8",
      "cells": [
        "AUDIT",
        "AUDIT",
        "AUDIT",
        "NA",
        "AUDIT",
        "AUDIT",
        "NA",
        "AUDIT",
        "NA",
        "AUDIT",
        "NA",
        "UNV",
        "AUDIT"
      ],
      "gap": "Report figures reconcile check pending (V3)."
    },
    {
      "tier": "3",
      "module": "form_425",
      "build": "0/5",
      "cells": [
        "AUDIT",
        "AUDIT",
        "AUDIT",
        "NA",
        "AUDIT",
        "AUDIT",
        "NA",
        "AUDIT",
        "NA",
        "AUDIT",
        "NA",
        "UNV",
        "AUDIT"
      ],
      "gap": "Non-table surface; E + V3."
    },
    {
      "tier": "3",
      "module": "cash-flow",
      "build": "1/3",
      "cells": [
        "AUDIT",
        "AUDIT",
        "AUDIT",
        "NA",
        "AUDIT",
        "AUDIT",
        "NA",
        "AUDIT",
        "AUDIT",
        "AUDIT",
        "NA",
        "UNV",
        "AUDIT"
      ],
      "gap": "Derived from GL/bank; reconcile check pending."
    },
    {
      "tier": "3",
      "module": "eld",
      "build": "5/5",
      "cells": [
        "AUDIT",
        "AUDIT",
        "NA",
        "NA",
        "AUDIT",
        "AUDIT",
        "UNV",
        "AUDIT",
        "AUDIT",
        "AUDIT",
        "NA",
        "UNV",
        "AUDIT"
      ],
      "gap": "HOS→driver/unit V4 (no GL); D/E."
    },
    {
      "tier": "3",
      "module": "tasks",
      "build": "0/5",
      "cells": [
        "AUDIT",
        "AUDIT",
        "NA",
        "AUDIT",
        "AUDIT",
        "AUDIT",
        "AUDIT",
        "AUDIT",
        "AUDIT",
        "AUDIT",
        "NA",
        "UNV",
        "AUDIT"
      ],
      "gap": "Task→entity links (CreateTask EntityPicker); live-exercise."
    },
    {
      "tier": "3",
      "module": "users",
      "build": "0/6",
      "cells": [
        "AUDIT",
        "AUDIT",
        "NA",
        "NA",
        "FIX",
        "AUDIT",
        "NA",
        "AUDIT",
        "AUDIT",
        "AUDIT",
        "NA",
        "UNV",
        "AUDIT"
      ],
      "gap": "User→company/driver links; D/E."
    },
    {
      "tier": "3",
      "module": "program",
      "build": "0/6",
      "cells": [
        "AUDIT",
        "AUDIT",
        "FAIL",
        "NA",
        "AUDIT",
        "AUDIT",
        "NA",
        "AUDIT",
        "NA",
        "AUDIT",
        "NA",
        "UNV",
        "AUDIT"
      ],
      "gap": "Program board; E."
    },
    {
      "tier": "3",
      "module": "driver-hub",
      "build": "0/2",
      "cells": [
        "AUDIT",
        "AUDIT",
        "NA",
        "NA",
        "AUDIT",
        "AUDIT",
        "NA",
        "AUDIT",
        "AUDIT",
        "AUDIT",
        "NA",
        "UNV",
        "AUDIT"
      ],
      "gap": "Driver-hub→driver/loads/settlements; E."
    },
    {
      "tier": "3",
      "module": "docs",
      "build": "1/5",
      "cells": [
        "AUDIT",
        "AUDIT",
        "NA",
        "NA",
        "AUDIT",
        "AUDIT",
        "NA",
        "AUDIT",
        "AUDIT",
        "AUDIT",
        "NA",
        "UNV",
        "AUDIT"
      ],
      "gap": "docs.files hub → entity attachments; V4 both ways."
    },
    {
      "tier": "3",
      "module": "help",
      "build": "5/5",
      "cells": [
        "AUDIT",
        "NA",
        "NA",
        "NA",
        "AUDIT",
        "AUDIT",
        "NA",
        "AUDIT",
        "NA",
        "NA",
        "NA",
        "UNV",
        "AUDIT"
      ],
      "gap": "E."
    }
  ],
  "prod": [
    {
      "n": "2,828",
      "label": "Vendors",
      "detail": "TRANSP 1,873 · USMCA 951 · TRK 4"
    },
    {
      "n": "2,694",
      "label": "Customers",
      "detail": "TRANSP 1,446 · USMCA 1,247 · TRK 1"
    },
    {
      "n": "11,979",
      "label": "Invoices — 1 posted",
      "detail": "1 posted + 1 reversed. Fix merged, awaiting deploy.",
      "tone": "flag"
    },
    {
      "n": "$625,546",
      "label": "Fuel — 0 GL",
      "detail": "1,547 txns · 100% load_id NULL · 0 postings.",
      "tone": "flag"
    },
    {
      "n": "192",
      "label": "Journal entries",
      "detail": "All posted · 0 unbalanced · GL integrity PROD",
      "tone": "good"
    },
    {
      "n": "16,248",
      "label": "Bills · 27,072 expenses",
      "detail": "2 posted, 1 failed · 2 NULL-vendor"
    },
    {
      "n": "1,434",
      "label": "CoA · 170 categorizations",
      "detail": "of 10,970 bank txns · 16 accounts"
    },
    {
      "n": "0",
      "label": "Claims/policies/matters/accidents",
      "detail": "Insurance+legal web unwalkable — Step-1 create",
      "tone": "zero"
    }
  ],
  "chain": [
    {
      "title": "LOAD",
      "table": "mdata.loads",
      "fk": "→ assigned_primary_driver_id → mdata.drivers · → assigned_unit_id → mdata.units",
      "chip": "PROD · 11",
      "chipTone": "prod"
    },
    {
      "title": "DRIVER & UNIT (hubs)",
      "table": "mdata.drivers · mdata.units",
      "fk": "units: owner_company_id / currently_leased_to_company_id (NOT operating_company_id, no display_id)",
      "chip": "PROD · 183 / 188",
      "chipTone": "prod"
    },
    {
      "title": "ACCIDENT REPORT",
      "table": "safety.accident_reports",
      "fk": "→ driver_id · unit_id · load_id · insurance_claim_id",
      "chip": "UNVERIFIED · 0",
      "chipTone": "unv"
    },
    {
      "title": "INSURANCE POLICY",
      "table": "insurance.policy",
      "fk": "→ coverage_type_id → catalog (insurance_coverage_type)",
      "chip": "UNVERIFIED · 0",
      "chipTone": "unv"
    },
    {
      "title": "INSURANCE CLAIM — the hub linked to everything",
      "table": "insurance.claim",
      "fk": "→ policy_id · accident_report_id · driver_id · load_id · asset_id(unit) · deductible_cents · driver_responsible",
      "chip": "UNVERIFIED · 0 · Step-1 ClaimCreateModal",
      "chipTone": "unv",
      "hub": true
    },
    {
      "title": "LEGAL MATTER",
      "table": "legal.matters",
      "fk": "→ insurance_claim_id · related_driver_id · unit_id — exposure only, NO GL. Reverse: LegalMattersReverseSection on VehicleProfile / ClaimsTab / LawsuitsTab",
      "chip": "UNVERIFIED · 0",
      "chipTone": "unv",
      "branch": true
    },
    {
      "title": "WORK ORDER (repair)",
      "table": "maintenance.work_orders",
      "fk": "→ insurance_claim_id · driver_id · unit_id · load_id · source_type='AC'. Create was 500 (phantom display_id) — fix merged, pending deploy. 2 WOs exist.",
      "chip": "FIX · #4091 merged",
      "chipTone": "fix",
      "branch": true
    },
    {
      "title": "DRIVER LIABILITY → DEDUCTION",
      "table": "driver_finance.driver_liabilities → driver_settlement_deductions",
      "fk": "→ driver_id · type='deductible' · deduction_type='deductible' · load_id",
      "chip": "UNVERIFIED · 0",
      "chipTone": "unv",
      "branch": true
    },
    {
      "title": "BILL → REPAIR ACCT",
      "table": "accounting.bills",
      "fk": "bill_lines.category_kind='maintenance' → expense_category_account_map → repair account",
      "chip": "PROD · JE 52e17945",
      "chipTone": "prod",
      "branch": true
    }
  ],
  "chainMoney": "MONEY TERMINUS (V6) — postSourceTransaction → JE (DR Repair Expense / CR A/P) → BALANCED GL. Bill path PROD-VERIFIED live: bill USMCA-TEST-BILL-05 → JE 52e17945, DR Repairs $0.05 / CR A/P $0.05, both-way linked. Claim-originated path UNVERIFIED (0 claims). All 192 JEs on prod balance.",
  "chainReverse": "REVERSE FAN-OUT (V4 reverse) — GET /api/v1/insurance/claims/:id/graph returns work_orders[], bills[], legal_matters[], accident_reports[]. Reverse sections on DriverDetail / VehicleProfile / TrailerProfile / LoadDetail. Code present (AUDIT); live UNVERIFIED until a claim exists. Certify by: create a claim → re-run graph → create the WO (after #4091 deploys) → post the settlement → paste the balanced JE. Then the whole web flips PROD-VERIFIED, both ways.",
  "guard": [
    {
      "badge": "V6 · PROD",
      "tone": "ver",
      "text": "**Bill → GL, both ways** — bill USMCA-TEST-BILL-05 → balanced JE **52e17945** (DR Repairs $0.05 / CR A/P $0.05), both-way linked. Reference for a V6 PASS."
    },
    {
      "badge": "PROD",
      "tone": "ver",
      "text": "**GL integrity** — all 192 JEs balance (0 unbalanced) on prod."
    },
    {
      "badge": "V2 · PROD",
      "tone": "ver",
      "text": "**#4053 payment-account picker scope** — USMCA Record-Expense picker shows exactly 2 accounts + inline create (was 18). Live on 05dad9c."
    },
    {
      "badge": "FIX → PENDING",
      "tone": "pend",
      "text": "**#4091 WO create** and **invoice→GL** merged on 308bc661b; flip green after deploy + one live exercise each."
    },
    {
      "badge": "V2 · FAIL",
      "tone": "fail",
      "text": "**Catalog creators broken** — fleet 500 (SQL comment); maintenance 404 (unmounted); payment-terms 42701 (dup column)."
    },
    {
      "badge": "V4/V6 · FAIL",
      "tone": "fail",
      "text": "**Fuel → GL** — 1,547 txns, $625,546.39, 0 postings, 100% load_id NULL (§4)."
    }
  ]
};
