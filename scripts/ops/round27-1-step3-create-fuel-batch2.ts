#!/usr/bin/env tsx
// ROUND 27.1/28 STEP 3, batch 2 — create the 84 FUEL PURCHASES lines for settlements 5804-5816
// (the 13 settlements that were blocked on Step 1 load creation, now that 22 of 23 loads exist --
// this batch's own loads are all real per its own load list, including 13600).
//
// Every write is the real POST /api/v1/fuel/transactions office-entry route (RANK3-FUEL-OFFICE-
// POST-CREATE), in-process via app.inject() -- same mechanism the office UI itself calls, and the
// same class of call scripts/seed-settlements-codex.ts already uses for expenses. This route also
// triggers the real fuel-GL-posting path (flushFuelGlPostsAfterCommit) when
// EXPENSE_GL_POSTING_ENABLED is on, which is what pairs each fuel_transactions row with its own
// "Diesel"-memo accounting.expenses row -- the SAME pairing scripts/verify-diesel-expense-fuel-
// dedupe.mjs already asserts for the first 18-settlement scope. No new GL math of any kind.
//
// Data: scripts/alwaystrack/parse_settlements.py's own FUEL PURCHASES output, load-attributed
// directly from the document's own "Load NNNN / driver" section headers (never inferred) -- unlike
// the EXPENSES table, the FUEL PURCHASES table DOES print a load header, so there is no ambiguity
// here at all.
//
// SAFETY: --execute requires ROUND271_ALLOW_HOST naming the exact host in DATABASE_URL. Default is
// DRY RUN. Idempotency: checks for an existing live fuel_transactions row on the same load with the
// same purchased_at date and total_cost before inserting -- a re-run is always safe.
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { createIntegrationApp } from "../../apps/backend/test-helpers/http-app.js";
import { registerFuelTransactionsRoutes } from "../../apps/backend/src/fuel/fuel-transactions.routes.js";

const USMCA_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER_USER_ID = "e4117991-d2c0-406d-8cda-74e98d95bccd";

type Item = {
  doc: string;
  loadNumber: string;
  loadId: string;
  date: string;
  vendorId: string;
  vendorName: string;
  location: string;
  invoice: string | null;
  gallons: number | null;
  cpg: number | null;
  amount: number;
};

const ITEMS: Item[] = [
  { doc: "5804", loadNumber: "13576", loadId: "51e2d71b-c384-4b24-b5b9-f471a4da9dd1", date: "2026-09-04", vendorId: "5a529e97-5af6-4874-89c0-f300715101f2", vendorName: "LOVES", location: "101 PINNACLE ROAD", invoice: "99994613", gallons: 11.496, cpg: 6.089, amount: 70.0 },
  { doc: "5804", loadNumber: "13576", loadId: "51e2d71b-c384-4b24-b5b9-f471a4da9dd1", date: "2026-09-05", vendorId: "5a529e97-5af6-4874-89c0-f300715101f2", vendorName: "LOVES", location: "21548FM471S NATALIA,TX,", invoice: "99538531", gallons: 57.735, cpg: 5.889, amount: 340.0 },
  { doc: "5804", loadNumber: "13576", loadId: "51e2d71b-c384-4b24-b5b9-f471a4da9dd1", date: "2026-09-06", vendorId: "5a529e97-5af6-4874-89c0-f300715101f2", vendorName: "LOVES", location: "2024A WEST STREET", invoice: "99607680", gallons: 115.211, cpg: 5.989, amount: 690.0 },
  { doc: "5804", loadNumber: "13576", loadId: "51e2d71b-c384-4b24-b5b9-f471a4da9dd1", date: "2026-09-08", vendorId: "5a529e97-5af6-4874-89c0-f300715101f2", vendorName: "LOVES", location: "21548FM471S NATALIA,TX,", invoice: "99540434", gallons: 109.061, cpg: 5.889, amount: 642.26 },
  { doc: "5804", loadNumber: "13576", loadId: "51e2d71b-c384-4b24-b5b9-f471a4da9dd1", date: "2026-09-09", vendorId: "5a529e97-5af6-4874-89c0-f300715101f2", vendorName: "LOVES", location: "66595WADSWORTH PKWY", invoice: "99149991", gallons: 102.004, cpg: 6.049, amount: 617.02 },
  { doc: "5804", loadNumber: "13576", loadId: "51e2d71b-c384-4b24-b5b9-f471a4da9dd1", date: "2026-09-10", vendorId: "5a529e97-5af6-4874-89c0-f300715101f2", vendorName: "LOVES", location: "LOVES#99648540, GA", invoice: "99648840", gallons: 119.192, cpg: 5.789, amount: 690.0 },
  { doc: "5804", loadNumber: "13594", loadId: "6c08ae39-5079-4b23-ab16-8b044add7619", date: "2026-09-11", vendorId: "5a529e97-5af6-4874-89c0-f300715101f2", vendorName: "LOVES", location: "674CHIKEN FOOT RD", invoice: "0094046", gallons: 16.669, cpg: 5.999, amount: 100.0 },
  { doc: "5804", loadNumber: "13594", loadId: "6c08ae39-5079-4b23-ab16-8b044add7619", date: "2026-09-11", vendorId: "5a529e97-5af6-4874-89c0-f300715101f2", vendorName: "LOVES", location: "1911HWY 34WEST", invoice: "9478021", gallons: 98.577, cpg: 6.089, amount: 600.24 },
  { doc: "5804", loadNumber: "13594", loadId: "6c08ae39-5079-4b23-ab16-8b044add7619", date: "2026-09-12", vendorId: "5a529e97-5af6-4874-89c0-f300715101f2", vendorName: "LOVES", location: "9240COUTY FARMS ROAD", invoice: "99681509", gallons: 197.235, cpg: 6.389, amount: 1260.13 },
  { doc: "5805", loadNumber: "13582", loadId: "c750b5ec-10c3-4a78-a70a-05afa560829e", date: "2026-09-09", vendorId: "5a529e97-5af6-4874-89c0-f300715101f2", vendorName: "LOVES", location: "21548FM471SNATALIA,TX,", invoice: "99540777", gallons: 120.76, cpg: 5.889, amount: 711.16 },
  { doc: "5805", loadNumber: "13582", loadId: "c750b5ec-10c3-4a78-a70a-05afa560829e", date: "2026-09-09", vendorId: "5a529e97-5af6-4874-89c0-f300715101f2", vendorName: "LOVES", location: "I35/SR23 EXIT363", invoice: "99378218", gallons: 94.037, cpg: 6.089, amount: 572.59 },
  { doc: "5805", loadNumber: "13582", loadId: "c750b5ec-10c3-4a78-a70a-05afa560829e", date: "2026-09-10", vendorId: "5a529e97-5af6-4874-89c0-f300715101f2", vendorName: "LOVES", location: "10465LONESOME PINE", invoice: "99471980", gallons: 130.303, cpg: 6.219, amount: 810.35 },
  { doc: "5805", loadNumber: "13592", loadId: "d706f493-de13-4d8c-8bf0-4a889e3f87fb", date: "2026-09-12", vendorId: "5a529e97-5af6-4874-89c0-f300715101f2", vendorName: "LOVES", location: "14188PERINI AVE", invoice: "99889343", gallons: 50.184, cpg: 6.689, amount: 335.68 },
  { doc: "5805", loadNumber: "13592", loadId: "d706f493-de13-4d8c-8bf0-4a889e3f87fb", date: "2026-09-12", vendorId: "5a529e97-5af6-4874-89c0-f300715101f2", vendorName: "LOVES", location: "10465LONESOME PINE", invoice: "99473683", gallons: 148.0, cpg: 6.389, amount: 945.57 },
  { doc: "5805", loadNumber: "13592", loadId: "d706f493-de13-4d8c-8bf0-4a889e3f87fb", date: "2026-09-14", vendorId: "5a529e97-5af6-4874-89c0-f300715101f2", vendorName: "LOVES", location: "3158WEST IH-10", invoice: "99415102", gallons: 150.055, cpg: 6.189, amount: 928.69 },
  { doc: "5806", loadNumber: "13581", loadId: "639b38d8-4c5e-42ba-9d7f-2d5aeb3f735f", date: "2026-09-08", vendorId: "5a529e97-5af6-4874-89c0-f300715101f2", vendorName: "LOVES", location: "21548FM471S NATALIA,TX,", invoice: "99540441", gallons: 129.572, cpg: 5.889, amount: 763.05 },
  { doc: "5806", loadNumber: "13581", loadId: "639b38d8-4c5e-42ba-9d7f-2d5aeb3f735f", date: "2026-09-09", vendorId: "5a529e97-5af6-4874-89c0-f300715101f2", vendorName: "LOVES", location: "66595WADSWORTH PKWY", invoice: "99149988", gallons: 102.987, cpg: 6.049, amount: 622.97 },
  { doc: "5806", loadNumber: "13581", loadId: "639b38d8-4c5e-42ba-9d7f-2d5aeb3f735f", date: "2026-09-10", vendorId: "5a529e97-5af6-4874-89c0-f300715101f2", vendorName: "LOVES", location: "10465LONESME PINE", invoice: "99471824", gallons: 122.135, cpg: 6.219, amount: 759.56 },
  { doc: "5806", loadNumber: "13591", loadId: "10234bcb-933e-422c-9924-630a7f2a893f", date: "2026-09-11", vendorId: "5a529e97-5af6-4874-89c0-f300715101f2", vendorName: "LOVES", location: "18434SHOWALTER H,MD,", invoice: "2680400", gallons: 168.108, cpg: 6.689, amount: 1124.47 },
  { doc: "5806", loadNumber: "13591", loadId: "10234bcb-933e-422c-9924-630a7f2a893f", date: "2026-09-12", vendorId: "5a529e97-5af6-4874-89c0-f300715101f2", vendorName: "LOVES", location: "10465LONESOME PINE", invoice: "1498362", gallons: 63.988, cpg: 6.389, amount: 408.82 },
  { doc: "5806", loadNumber: "13591", loadId: "10234bcb-933e-422c-9924-630a7f2a893f", date: "2026-09-13", vendorId: "5a529e97-5af6-4874-89c0-f300715101f2", vendorName: "LOVES", location: "335HWY594 MONROE,LA,", invoice: "1602944", gallons: 97.985, cpg: 6.389, amount: 626.03 },
  { doc: "5807", loadNumber: "13578", loadId: "dc119bec-afc8-4b81-952c-6eb84ffa8329", date: "2026-09-04", vendorId: "5a529e97-5af6-4874-89c0-f300715101f2", vendorName: "LOVES", location: "101 PINNACLE ROAD", invoice: "1928596", gallons: 41.574, cpg: 6.089, amount: 253.14 },
  { doc: "5807", loadNumber: "13578", loadId: "dc119bec-afc8-4b81-952c-6eb84ffa8329", date: "2026-09-04", vendorId: "5a529e97-5af6-4874-89c0-f300715101f2", vendorName: "LOVES", location: "21548FM471S NATALIA,TX,", invoice: "2889213", gallons: 99.867, cpg: 5.889, amount: 588.12 },
  { doc: "5807", loadNumber: "13578", loadId: "dc119bec-afc8-4b81-952c-6eb84ffa8329", date: "2026-09-05", vendorId: "5a529e97-5af6-4874-89c0-f300715101f2", vendorName: "LOVES", location: "2510 Highway 231,", invoice: "99355909", gallons: 128.672, cpg: 5.589, amount: 719.15 },
  { doc: "5807", loadNumber: "13587", loadId: "0b3589e5-f09d-4b2b-9b2a-78134d2b2839", date: "2026-09-10", vendorId: "5a529e97-5af6-4874-89c0-f300715101f2", vendorName: "LOVES", location: "11207W STATE ROAD10", invoice: "99433769", gallons: 21.097, cpg: 6.289, amount: 132.68 },
  { doc: "5807", loadNumber: "13587", loadId: "0b3589e5-f09d-4b2b-9b2a-78134d2b2839", date: "2026-09-10", vendorId: "5a529e97-5af6-4874-89c0-f300715101f2", vendorName: "LOVES", location: "2400E200 LAFAYETTE,IN,", invoice: "99112548", gallons: 92.346, cpg: 6.389, amount: 590.0 },
  { doc: "5807", loadNumber: "13587", loadId: "0b3589e5-f09d-4b2b-9b2a-78134d2b2839", date: "2026-09-11", vendorId: "5a529e97-5af6-4874-89c0-f300715101f2", vendorName: "LOVES", location: "215EAST I-30N SVC RD", invoice: "1349911", gallons: 165.999, cpg: 6.289, amount: 1043.97 },
  { doc: "5807", loadNumber: "13587", loadId: "0b3589e5-f09d-4b2b-9b2a-78134d2b2839", date: "2026-09-10", vendorId: "5a529e97-5af6-4874-89c0-f300715101f2", vendorName: "LOVES", location: "I-10EXIT 213 LEARY,TX, TX", invoice: "2770078", gallons: 32.092, cpg: 6.289, amount: 201.83 },
  { doc: "5807", loadNumber: "13585", loadId: "d603567d-3f8c-4f97-a116-729e4378db65", date: "2026-09-06", vendorId: "5a529e97-5af6-4874-89c0-f300715101f2", vendorName: "LOVES", location: "200S. KINGS HWY FT", invoice: "99585760", gallons: 35.574, cpg: 5.789, amount: 205.94 },
  { doc: "5807", loadNumber: "13585", loadId: "d603567d-3f8c-4f97-a116-729e4378db65", date: "2026-09-08", vendorId: "5a529e97-5af6-4874-89c0-f300715101f2", vendorName: "LOVES", location: "200S. KINGS HWY FT", invoice: "99586534", gallons: 58.732, cpg: 5.789, amount: 340.0 },
  { doc: "5807", loadNumber: "13585", loadId: "d603567d-3f8c-4f97-a116-729e4378db65", date: "2026-09-08", vendorId: "5a529e97-5af6-4874-89c0-f300715101f2", vendorName: "LOVES", location: "11458SW 61ST WAY", invoice: "99864205", gallons: 112.696, cpg: 5.679, amount: 640.0 },
  { doc: "5807", loadNumber: "13585", loadId: "d603567d-3f8c-4f97-a116-729e4378db65", date: "2026-09-09", vendorId: "5a529e97-5af6-4874-89c0-f300715101f2", vendorName: "LOVES", location: "1900THE HILL AVE", invoice: "2707387", gallons: 105.36, cpg: 6.549, amount: 690.0 },
  { doc: "5808", loadNumber: "13597", loadId: "c4762193-3458-4a06-ae3c-f0dcd692c6b0", date: "2026-09-13", vendorId: "5a529e97-5af6-4874-89c0-f300715101f2", vendorName: "LOVES", location: "21548FM471SNATALIA,TX,", invoice: "99543794", gallons: 174.915, cpg: 6.289, amount: 1100.04 },
  { doc: "5808", loadNumber: "13597", loadId: "c4762193-3458-4a06-ae3c-f0dcd692c6b0", date: "2026-09-14", vendorId: "5a529e97-5af6-4874-89c0-f300715101f2", vendorName: "LOVES", location: "22183HWY216MCCALLA,A", invoice: "99509456", gallons: 127.576, cpg: 6.349, amount: 809.98 },
  { doc: "5808", loadNumber: "13597", loadId: "c4762193-3458-4a06-ae3c-f0dcd692c6b0", date: "2026-09-14", vendorId: "5a529e97-5af6-4874-89c0-f300715101f2", vendorName: "LOVES", location: "10465LONESOME PINE", invoice: "99475285", gallons: 60.713, cpg: 6.379, amount: 387.29 },
  { doc: "5808", loadNumber: "13601", loadId: "8df416db-63b3-4497-bbd2-19f4cb355d72", date: "2026-09-16", vendorId: "5a529e97-5af6-4874-89c0-f300715101f2", vendorName: "LOVES", location: "10465 LONESOME PINE", invoice: "99476767", gallons: 198.0, cpg: 6.589, amount: 1304.62 },
  { doc: "5808", loadNumber: "13601", loadId: "8df416db-63b3-4497-bbd2-19f4cb355d72", date: "2026-09-17", vendorId: "5a529e97-5af6-4874-89c0-f300715101f2", vendorName: "LOVES", location: "612PEDERSON RD", invoice: "99119426", gallons: 170.007, cpg: 6.489, amount: 1103.18 },
  { doc: "5809", loadNumber: "13583", loadId: "ffb3bb73-b039-4e32-8ed7-ac43566ebb83", date: "2026-09-08", vendorId: "5a529e97-5af6-4874-89c0-f300715101f2", vendorName: "LOVES", location: "101 PINNACLE ROAD", invoice: "101 PINNACLE ROAD", gallons: 31.204, cpg: 6.089, amount: 190.0 },
  { doc: "5809", loadNumber: "13583", loadId: "ffb3bb73-b039-4e32-8ed7-ac43566ebb83", date: "2026-09-09", vendorId: "5a529e97-5af6-4874-89c0-f300715101f2", vendorName: "LOVES", location: "66595 WADSWORTH", invoice: "99149981", gallons: 97.354, cpg: 6.049, amount: 588.89 },
  { doc: "5809", loadNumber: "13583", loadId: "ffb3bb73-b039-4e32-8ed7-ac43566ebb83", date: "2026-09-10", vendorId: "5a529e97-5af6-4874-89c0-f300715101f2", vendorName: "LOVES", location: "10465 LONESOME PINE", invoice: "99471808", gallons: 127.03, cpg: 6.219, amount: 790.0 },
  { doc: "5809", loadNumber: "13583", loadId: "ffb3bb73-b039-4e32-8ed7-ac43566ebb83", date: "2026-09-08", vendorId: "5a529e97-5af6-4874-89c0-f300715101f2", vendorName: "LOVES", location: "21548FM471S NATALI,TX,", invoice: "99540448", gallons: 117.168, cpg: 5.889, amount: 690.0 },
  { doc: "5809", loadNumber: "13598", loadId: "c5da7a39-280d-4a36-88aa-77f978f9e191", date: "2026-09-12", vendorId: "5a529e97-5af6-4874-89c0-f300715101f2", vendorName: "LOVES", location: "2008STATE HWY", invoice: "99162813", gallons: 115.929, cpg: 6.689, amount: 775.45 },
  { doc: "5809", loadNumber: "13598", loadId: "c5da7a39-280d-4a36-88aa-77f978f9e191", date: "2026-09-14", vendorId: "62dd25a7-460e-4fd0-b4f7-d80ec59fd8a7", vendorName: "PILOT", location: "433OLD GATE LANE", invoice: "9956564", gallons: 100.202, cpg: 6.799, amount: 681.27 },
  { doc: "5809", loadNumber: "13598", loadId: "c5da7a39-280d-4a36-88aa-77f978f9e191", date: "2026-09-15", vendorId: "5a529e97-5af6-4874-89c0-f300715101f2", vendorName: "LOVES", location: "10465LONESOME PINE", invoice: "99476002", gallons: 165.194, cpg: 6.579, amount: 1086.81 },
  { doc: "5809", loadNumber: "13606", loadId: "6f76f0eb-e674-455c-95e3-c483ff9cf487", date: "2026-09-17", vendorId: "5a529e97-5af6-4874-89c0-f300715101f2", vendorName: "LOVES", location: "I-35/SR22,EXIT 268", invoice: "99882087", gallons: 182.799, cpg: 6.449, amount: 1178.87 },
  { doc: "5810", loadNumber: "13590", loadId: "2bb2d1aa-612f-4fc3-8671-ee7ba90e036b", date: "2026-09-11", vendorId: "5a529e97-5af6-4874-89c0-f300715101f2", vendorName: "LOVES", location: "101 PINNACLE ROAD", invoice: "99997570", gallons: 50.004, cpg: 6.389, amount: 319.48 },
  { doc: "5810", loadNumber: "13590", loadId: "2bb2d1aa-612f-4fc3-8671-ee7ba90e036b", date: "2026-09-12", vendorId: "5a529e97-5af6-4874-89c0-f300715101f2", vendorName: "LOVES", location: "21548FM471S NATALIA,TX,", invoice: "99542864", gallons: 137.001, cpg: 6.289, amount: 861.6 },
  { doc: "5810", loadNumber: "13590", loadId: "2bb2d1aa-612f-4fc3-8671-ee7ba90e036b", date: "2026-09-12", vendorId: "5a529e97-5af6-4874-89c0-f300715101f2", vendorName: "LOVES", location: "21548FM471S NATALIA,TX,", invoice: "2892119", gallons: 31.005, cpg: 6.289, amount: 194.99 },
  { doc: "5810", loadNumber: "13590", loadId: "2bb2d1aa-612f-4fc3-8671-ee7ba90e036b", date: "2026-09-13", vendorId: "5a529e97-5af6-4874-89c0-f300715101f2", vendorName: "LOVES", location: "22183HWY216McCALLA,AL", invoice: "99508632", gallons: 140.001, cpg: 6.389, amount: 894.47 },
  { doc: "5810", loadNumber: "13599", loadId: "e80e9d9e-ea84-4188-8e0b-bd770572ec93", date: "2026-09-15", vendorId: "5a529e97-5af6-4874-89c0-f300715101f2", vendorName: "LOVES", location: "2008STATE HWY", invoice: "99164487", gallons: 100.0, cpg: 6.689, amount: 668.9 },
  { doc: "5810", loadNumber: "13599", loadId: "e80e9d9e-ea84-4188-8e0b-bd770572ec93", date: "2026-09-16", vendorId: "5a529e97-5af6-4874-89c0-f300715101f2", vendorName: "LOVES", location: "10465LONESOME PINE", invoice: "99476764", gallons: 177.02, cpg: 6.589, amount: 1166.38 },
  { doc: "5810", loadNumber: "13599", loadId: "e80e9d9e-ea84-4188-8e0b-bd770572ec93", date: "2026-09-17", vendorId: "5a529e97-5af6-4874-89c0-f300715101f2", vendorName: "LOVES", location: "1610COTTON GIN ROAD", invoice: "99807944", gallons: 167.006, cpg: 6.449, amount: 1077.02 },
  { doc: "5811", loadNumber: "13596", loadId: "deff9a3d-b8e1-4e43-aced-ff9bb7979841", date: "2026-09-13", vendorId: "5a529e97-5af6-4874-89c0-f300715101f2", vendorName: "LOVES", location: "21548FB471S NATALIA,TX,", invoice: "99543793", gallons: 180.052, cpg: 6.289, amount: 1132.35 },
  { doc: "5811", loadNumber: "13596", loadId: "deff9a3d-b8e1-4e43-aced-ff9bb7979841", date: "2026-09-14", vendorId: "5a529e97-5af6-4874-89c0-f300715101f2", vendorName: "LOVES", location: "22183HWY216", invoice: "99509464", gallons: 147.005, cpg: 6.349, amount: 933.33 },
  { doc: "5811", loadNumber: "13596", loadId: "deff9a3d-b8e1-4e43-aced-ff9bb7979841", date: "2026-09-14", vendorId: "5a529e97-5af6-4874-89c0-f300715101f2", vendorName: "LOVES", location: "10465LONESOME PINE", invoice: "99475290", gallons: 57.038, cpg: 6.379, amount: 363.85 },
  { doc: "5811", loadNumber: "13603", loadId: "4a066861-e929-44d7-bf9e-1f16c62f1671", date: "2026-09-17", vendorId: "5a529e97-5af6-4874-89c0-f300715101f2", vendorName: "LOVES", location: "3499LEE JACKSON HWY", invoice: "99041424", gallons: 30.001, cpg: 6.789, amount: 203.68 },
  { doc: "5811", loadNumber: "13603", loadId: "4a066861-e929-44d7-bf9e-1f16c62f1671", date: "2026-09-17", vendorId: "5a529e97-5af6-4874-89c0-f300715101f2", vendorName: "LOVES", location: "10465LONESOME PINE", invoice: "99477095", gallons: 175.004, cpg: 6.589, amount: 1153.1 },
  { doc: "5811", loadNumber: "13603", loadId: "4a066861-e929-44d7-bf9e-1f16c62f1671", date: "2026-09-18", vendorId: "5a529e97-5af6-4874-89c0-f300715101f2", vendorName: "LOVES", location: "66595WADSWORTH PKWY", invoice: "99157841", gallons: 118.016, cpg: 6.449, amount: 761.09 },
  { doc: "5811", loadNumber: "13603", loadId: "4a066861-e929-44d7-bf9e-1f16c62f1671", date: "2026-09-19", vendorId: "5a529e97-5af6-4874-89c0-f300715101f2", vendorName: "LOVES", location: "21548FM471S NATALIA,TX,", invoice: "99549122", gallons: 92.009, cpg: 6.439, amount: 592.45 },
  { doc: "5812", loadNumber: "13588", loadId: "0a20a60d-c652-433b-9cfd-4d4e017c05cc", date: "2026-09-08", vendorId: "5a529e97-5af6-4874-89c0-f300715101f2", vendorName: "LOVES", location: "21548FM471S NATALIA,TX,", invoice: "1853669", gallons: 125.658, cpg: 5.889, amount: 740.0 },
  { doc: "5812", loadNumber: "13588", loadId: "0a20a60d-c652-433b-9cfd-4d4e017c05cc", date: "2026-09-09", vendorId: "5a529e97-5af6-4874-89c0-f300715101f2", vendorName: "LOVES", location: "66595WADSWORTH PKWY", invoice: "99150018", gallons: 14.878, cpg: 6.049, amount: 90.0 },
  { doc: "5812", loadNumber: "13588", loadId: "0a20a60d-c652-433b-9cfd-4d4e017c05cc", date: "2026-09-09", vendorId: "5a529e97-5af6-4874-89c0-f300715101f2", vendorName: "LOVES", location: "66595WADSWORTH PKWY", invoice: "99149999", gallons: 97.452, cpg: 6.049, amount: 589.49 },
  { doc: "5812", loadNumber: "13588", loadId: "0a20a60d-c652-433b-9cfd-4d4e017c05cc", date: "2026-09-10", vendorId: "5a529e97-5af6-4874-89c0-f300715101f2", vendorName: "LOVES", location: "10465LONESOME PINE", invoice: "99471988", gallons: 115.253, cpg: 6.219, amount: 716.76 },
  { doc: "5812", loadNumber: "13600", loadId: "e4782161-7fc7-48a2-a164-96b6f30812c2", date: "2026-09-11", vendorId: "62dd25a7-460e-4fd0-b4f7-d80ec59fd8a7", vendorName: "PILOT", location: "979ROUTE 173", invoice: "99368363", gallons: 161.392, cpg: 6.699, amount: 1081.17 },
  { doc: "5812", loadNumber: "13600", loadId: "e4782161-7fc7-48a2-a164-96b6f30812c2", date: "2026-09-11", vendorId: "62dd25a7-460e-4fd0-b4f7-d80ec59fd8a7", vendorName: "PILOT", location: "979ROUTE 173", invoice: "99368358", gallons: 49.0, cpg: 6.699, amount: 328.25 },
  { doc: "5812", loadNumber: "13600", loadId: "e4782161-7fc7-48a2-a164-96b6f30812c2", date: "2026-09-15", vendorId: "5a529e97-5af6-4874-89c0-f300715101f2", vendorName: "LOVES", location: "10465LONESOME PINE", invoice: "99476048", gallons: 182.277, cpg: 6.639, amount: 1210.14 },
  { doc: "5812", loadNumber: "13600", loadId: "e4782161-7fc7-48a2-a164-96b6f30812c2", date: "2026-09-16", vendorId: "5a529e97-5af6-4874-89c0-f300715101f2", vendorName: "LOVES", location: "9600HWY 80WEST", invoice: "99471198", gallons: 143.668, cpg: 6.549, amount: 940.88 },
  { doc: "5813", loadNumber: "13602", loadId: "4cf0ffd3-f032-46ee-a62c-2202c34ea1ce", date: "2026-09-15", vendorId: "5a529e97-5af6-4874-89c0-f300715101f2", vendorName: "LOVES", location: "21548FM471S NATALIA,TX,", invoice: "2893712", gallons: 148.691, cpg: 6.449, amount: 958.91 },
  { doc: "5813", loadNumber: "13602", loadId: "4cf0ffd3-f032-46ee-a62c-2202c34ea1ce", date: "2026-09-16", vendorId: "5a529e97-5af6-4874-89c0-f300715101f2", vendorName: "LOVES", location: "20HWY607 PICAYUNE,MS,", invoice: "2373575", gallons: 96.794, cpg: 6.549, amount: 633.9 },
  { doc: "5813", loadNumber: "13602", loadId: "4cf0ffd3-f032-46ee-a62c-2202c34ea1ce", date: "2026-09-17", vendorId: "5a529e97-5af6-4874-89c0-f300715101f2", vendorName: "LOVES", location: "10465LONESOME PINE", invoice: "1499386", gallons: 101.669, cpg: 6.569, amount: 667.86 },
  { doc: "5813", loadNumber: "13607", loadId: "65b7edb1-fe70-4e9d-9451-969c2770e9bc", date: "2026-09-18", vendorId: "5a529e97-5af6-4874-89c0-f300715101f2", vendorName: "LOVES", location: "1015MOUND OLIVE RD", invoice: "3557619", gallons: 80.175, cpg: 6.889, amount: 552.33 },
  { doc: "5813", loadNumber: "13607", loadId: "65b7edb1-fe70-4e9d-9451-969c2770e9bc", date: "2026-09-19", vendorId: "5a529e97-5af6-4874-89c0-f300715101f2", vendorName: "LOVES", location: "22ELIZABETH LEE", invoice: "2313445", gallons: 142.268, cpg: 6.549, amount: 931.71 },
  { doc: "5813", loadNumber: "13607", loadId: "65b7edb1-fe70-4e9d-9451-969c2770e9bc", date: "2026-09-20", vendorId: "5a529e97-5af6-4874-89c0-f300715101f2", vendorName: "LOVES", location: "66595WADSWORTH PKWY", invoice: "1047573", gallons: 89.371, cpg: 6.389, amount: 570.99 },
  { doc: "5814", loadNumber: "13604", loadId: "9ecc3121-8056-4e99-b35e-2e27a66d37c3", date: "2026-09-15", vendorId: "5a529e97-5af6-4874-89c0-f300715101f2", vendorName: "LOVES", location: "3158WEST IH-10 SEGUIN", invoice: "99416535", gallons: 129.485, cpg: 6.289, amount: 814.33 },
  { doc: "5814", loadNumber: "13604", loadId: "9ecc3121-8056-4e99-b35e-2e27a66d37c3", date: "2026-09-16", vendorId: "5a529e97-5af6-4874-89c0-f300715101f2", vendorName: "LOVES", location: "20HWY607 PICAYUNE,MS,", invoice: "99823511", gallons: 82.922, cpg: 6.549, amount: 543.06 },
  { doc: "5814", loadNumber: "13604", loadId: "9ecc3121-8056-4e99-b35e-2e27a66d37c3", date: "2026-09-17", vendorId: "5a529e97-5af6-4874-89c0-f300715101f2", vendorName: "LOVES", location: "10465LONESOME PINE", invoice: "99477699", gallons: 97.122, cpg: 6.569, amount: 637.99 },
  { doc: "5814", loadNumber: "13608", loadId: "0e35b122-d643-411c-bac0-50f78690e507", date: "2026-09-19", vendorId: "5a529e97-5af6-4874-89c0-f300715101f2", vendorName: "LOVES", location: "10465LONESOME PINE", invoice: "99479001", gallons: 150.129, cpg: 6.539, amount: 981.69 },
  { doc: "5814", loadNumber: "13608", loadId: "0e35b122-d643-411c-bac0-50f78690e507", date: "2026-09-21", vendorId: "5a529e97-5af6-4874-89c0-f300715101f2", vendorName: "LOVES", location: "21548FM471S NATALIA,TX,", invoice: "99549704", gallons: 111.921, cpg: 6.349, amount: 710.59 },
  { doc: "5815", loadNumber: "13605", loadId: "454bb0c5-5ec8-45b0-ab33-806fa3197d2e", date: "2026-09-15", vendorId: "5a529e97-5af6-4874-89c0-f300715101f2", vendorName: "LOVES", location: "21548FM471S NATALIA,TX,", invoice: "99546338", gallons: 196.796, cpg: 6.449, amount: 1269.14 },
  { doc: "5815", loadNumber: "13605", loadId: "454bb0c5-5ec8-45b0-ab33-806fa3197d2e", date: "2026-09-16", vendorId: "5a529e97-5af6-4874-89c0-f300715101f2", vendorName: "LOVES", location: "66595WADSWORTH PKWY", invoice: "99155958", gallons: 115.503, cpg: 6.449, amount: 744.88 },
  { doc: "5815", loadNumber: "13605", loadId: "454bb0c5-5ec8-45b0-ab33-806fa3197d2e", date: "2026-09-17", vendorId: "5a529e97-5af6-4874-89c0-f300715101f2", vendorName: "LOVES", location: "2129WASHINGTON ROAD", invoice: "99883236", gallons: 16.223, cpg: 6.339, amount: 102.84 },
  { doc: "5815", loadNumber: "13611", loadId: "613657e2-7190-44a1-b773-83506ba37648", date: "2026-09-18", vendorId: "5a529e97-5af6-4874-89c0-f300715101f2", vendorName: "LOVES", location: "1911HWY34WEST", invoice: "99482661", gallons: 66.77, cpg: 6.149, amount: 410.57 },
  { doc: "5815", loadNumber: "13611", loadId: "613657e2-7190-44a1-b773-83506ba37648", date: "2026-09-19", vendorId: "5a529e97-5af6-4874-89c0-f300715101f2", vendorName: "LOVES", location: "340LONGS POND RD", invoice: "99531370", gallons: 154.495, cpg: 6.189, amount: 956.17 },
  { doc: "5815", loadNumber: "13611", loadId: "613657e2-7190-44a1-b773-83506ba37648", date: "2026-09-20", vendorId: "5a529e97-5af6-4874-89c0-f300715101f2", vendorName: "LOVES", location: "66595 WADSWORTH", invoice: "99159061", gallons: 119.017, cpg: 6.389, amount: 760.4 },
];

async function main() {
  const executeFlag = process.argv.includes("--execute");
  const url = process.env.DATABASE_URL ?? "";
  if (executeFlag && !process.env.ROUND271_ALLOW_HOST) {
    throw new Error("ABORT: --execute requires ROUND271_ALLOW_HOST to name the exact host in DATABASE_URL.");
  }
  if (executeFlag && !url.includes(process.env.ROUND271_ALLOW_HOST!)) {
    throw new Error("ABORT: DATABASE_URL does not match ROUND271_ALLOW_HOST -- refusing to execute.");
  }

  const pool = new pg.Pool({ connectionString: url, max: 3 });
  process.env.IH35_TEST_AUTH_BYPASS = "1";
  const app = await createIntegrationApp(async (a) => {
    await registerFuelTransactionsRoutes(a as never);
  });
  const authHeader = {
    "x-test-auth": Buffer.from(
      JSON.stringify({ id: OWNER_USER_ID, role: "Owner", email: "tioperfumes07@gmail.com" }),
      "utf8"
    ).toString("base64url"),
  };

  const dbClient = await pool.connect();
  await dbClient.query("BEGIN");
  await dbClient.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);

  let created = 0;
  let alreadyExisted = 0;
  let blocked = 0;
  let createdCents = 0;

  for (const item of ITEMS) {
    console.log(`${executeFlag ? "CREATE" : "DRY-RUN"} ${item.doc} load ${item.loadNumber} ${item.vendorName} $${item.amount.toFixed(2)}`);
    if (!executeFlag) continue;

    const dup = await dbClient.query<{ id: string }>(
      `SELECT id::text FROM fuel.fuel_transactions
        WHERE load_id = $1::uuid AND purchased_at::date = $2::date AND total_cost = $3::numeric AND archived_at IS NULL`,
      [item.loadId, item.date, item.amount.toFixed(2)]
    );
    if (dup.rows[0]) {
      alreadyExisted += 1;
      continue;
    }

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/fuel/transactions",
      headers: authHeader,
      payload: {
        operating_company_id: USMCA_COMPANY_ID,
        transaction_at: item.date,
        vendor_id: item.vendorId,
        fuel_type: "diesel",
        gallons: item.gallons ?? undefined,
        price_per_gallon: item.cpg ?? undefined,
        total_cost: item.amount,
        location_city: item.location || undefined,
        transaction_reference: item.invoice ?? undefined,
        notes: `${item.vendorName} — ${item.location || "no-location-on-file"} — inv ${item.invoice ?? "no-invoice"} — ${item.date} — $${item.amount.toFixed(2)} (settlement ${item.doc})`,
        load_id: item.loadId,
      },
    });
    if (res.statusCode >= 300) {
      blocked += 1;
      console.error(`  BLOCKED ${res.statusCode} ${res.body}`);
    } else {
      created += 1;
      createdCents += Math.round(item.amount * 100);
    }
  }

  if (executeFlag) {
    await dbClient.query("COMMIT");
  } else {
    await dbClient.query("ROLLBACK");
  }
  dbClient.release();

  console.log(
    `\n${executeFlag ? "EXECUTE" : "DRY RUN"} done: ${ITEMS.length} items -- created ${created} ($${(createdCents / 100).toFixed(2)}), already existed ${alreadyExisted}, blocked ${blocked}`
  );
  await pool.end();
  if (blocked > 0) process.exitCode = 1;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  await main();
}
