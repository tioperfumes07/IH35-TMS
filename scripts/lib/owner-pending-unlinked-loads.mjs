/**
 * LINK 2 owner-pending unlinked loads — shared by verify-load-to-cash-chain and
 * verify-load-settlement-linkage (MAIN-RED-2026-11-12i). Consciously unlinked; CC-1 must link
 * (or ITEM1-close) each entry. Do not raise the settlement-linkage orphan baseline for these.
 *
 * Forensic notes live with the consumers; keep this file the set of load_numbers only.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const _r224GateEx = JSON.parse(
  fs.readFileSync(
    path.join(path.dirname(fileURLToPath(import.meta.url)), "r224-gate-exception-sets.baseline.json"),
    "utf8",
  ),
);
const R224_LINK2_PENDING = Object.freeze([...(_r224GateEx.r224_load_to_cash_link2 ?? [])]);

export const OWNER_PENDING_UNLINKED = new Set([
  "13526",
  "13527",
  "13561",
  "13563",
  "13567",
  "13571",
  "13574",
  "13595",
  "13615",
  "13609",
  "13610",
  "13612",
  "13613",
  "13618",
  "13616",
  "13617",
  "13614",
  "90007",
  "13544",
  ...R224_LINK2_PENDING,
]);
