#!/usr/bin/env node
/**
 * LST-F11161 — a SALARIED settlement with a blank Settlement No. gets NO AlwaysTrack number.
 *
 * 2026-11-11: closing Rafael's $0 salaried settlement for load 13700 through the Settlement Creator (salaried: true,
 * settlement_no blank) minted the next AlwaysTrack number 5873 onto P-0159 — a number that belongs to the next real
 * signed AlwaysTrack document. Rafael is a local driver on weekly salary (CLOSED ruling 2026-09-28): there is no
 * AlwaysTrack document, so there is no number.
 *
 * Static contract (settlement-creator.service.ts + settlement-load-reassignment.service.ts):
 *  1. The blank-number branch mints the next number ONLY when the draft is not salaried
 *     (`draft.salaried === true ? null : await allocateNextSettlementSourceDocumentRef(...)`).
 *  2. The adopted-shell branch stamps the number only when one exists (`if (atRef !== null)` around setSettlementSourceDocumentRef).
 *  3. createBareSettlementForDocument accepts a NULL source_document_ref and stamps nothing for it.
 *
 * Self-test: node scripts/verify-salaried-settlement-no-at-number.mjs --selftest
 */
/** MATRIX-BUILT-OPTIONAL — static invariant guard; no surface wiring leaf to register. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-salaried-settlement-no-at-number";
const CREATOR = "apps/backend/src/driver-finance/settlement-creator.service.ts";
const BARE = "apps/backend/src/driver-finance/settlement-load-reassignment.service.ts";

export function check({ creator, bare }) {
  const out = [];
  const blank = creator.match(/else if \(!typedNo\) \{[\s\S]{0,600}?atRef = ([^;]+);/);
  if (!blank) out.push("creator: the blank Settlement No. branch was not found");
  else if (!/draft\.salaried === true \? null :\s*await allocateNextSettlementSourceDocumentRef\(/.test(blank[1]))
    out.push("creator: a blank Settlement No. mints the next AlwaysTrack number even for a salaried settlement");
  if (!/if \(atRef !== null\) \{\s*const ref = await setSettlementSourceDocumentRef\(/.test(creator))
    out.push("creator: the adopted tour shell stamps a number even when there is none");
  if (!/source_document_ref: string \| null;/.test(bare))
    out.push("createBareSettlementForDocument: source_document_ref must accept NULL");
  if (!/input\.source_document_ref === null \? true : await setSettlementSourceDocumentRef\(/.test(bare))
    out.push("createBareSettlementForDocument: a NULL source_document_ref must stamp nothing");
  return out;
}

function selftest() {
  const creator = fs.readFileSync(path.join(ROOT, CREATOR), "utf8");
  const bare = fs.readFileSync(path.join(ROOT, BARE), "utf8");
  const real = check({ creator, bare });
  if (real.length) throw new Error(`real tree must pass: ${real.join("; ")}`);
  const plants = [
    ["mint for salaried", { creator: creator.replace("draft.salaried === true ? null : await allocateNextSettlementSourceDocumentRef(", "await allocateNextSettlementSourceDocumentRef("), bare }, "even for a salaried"],
    ["shell stamps null", { creator: creator.replace("if (atRef !== null) {", "{"), bare }, "adopted tour shell"],
    ["bare type string", { creator, bare: bare.replace("source_document_ref: string | null;", "source_document_ref: string;") }, "must accept NULL"],
    ["bare stamps null", { creator, bare: bare.replace("input.source_document_ref === null ? true : await setSettlementSourceDocumentRef(", "await setSettlementSourceDocumentRef(") }, "must stamp nothing"],
  ];
  for (const [name, fx, needle] of plants) {
    const r = check(fx);
    if (!r.some((m) => m.includes(needle))) throw new Error(`plant "${name}" was not caught: ${JSON.stringify(r)}`);
  }
  console.log(`${LABEL}: SELFTEST PASS (${plants.length + 1}/${plants.length + 1})`);
}

if (process.argv.includes("--selftest")) {
  try { selftest(); } catch (e) { console.error(`${LABEL}: SELFTEST FAIL — ${e.message}`); process.exit(1); }
} else {
  const out = check({ creator: fs.readFileSync(path.join(ROOT, CREATOR), "utf8"), bare: fs.readFileSync(path.join(ROOT, BARE), "utf8") });
  if (out.length) { console.error(`${LABEL}: FAIL (${out.length})`); for (const m of out) console.error(`  - ${m}`); process.exit(1); }
  console.log(`${LABEL}: OK — a salaried settlement with no AlwaysTrack document is never numbered`);
}
