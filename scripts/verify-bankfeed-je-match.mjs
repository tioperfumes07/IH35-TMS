#!/usr/bin/env node
/**
 * ACCT-F05 / F05 — bank feed → JE matched_journal_entry_id honesty KEEP guard.
 *
 * #3424 merged bulk categorize→GL poster parity on main. Wiring is structural PASS;
 * live density remains ~3/10622 (ops backlog) — guard FAILs if scoreboard invents PASS.
 *
 * Asserts:
 *   - CHAIN-05 poster (maybePostBankCategorizationToGl) reuses postSourceTransaction
 *   - matched_journal_entry_id stamped in lockstep after post
 *   - single-row + bulk categorize routes both await the poster (#3424)
 *   - BANK_FEED_GL_POSTING_ENABLED flag gate (default OFF)
 *   - ACCT-LINK-06 + BANK-ECON-02: FAIL while density near-zero; PASS only when evidence
 *     cites matched_je=N/M with N >= MEANINGFUL_MATCHED_JE (live ops floor above the historic ~5).
 *
 *   node scripts/verify-bankfeed-je-match.mjs
 *   node scripts/verify-bankfeed-je-match.mjs --selftest
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { run as runBulkPoster } from "./verify-banking-bulk-categorize-posts-je.mjs";
import { densityIsMeaningful, MEANINGFUL_MATCHED_JE } from "./lib/matched-je-density.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const POSTER = "apps/backend/src/banking/bank-feed-gl-posting.service.ts";
const CATEGORIZE = "apps/backend/src/banking/categorization.routes.ts";
const MIG_0182 = "db/migrations/0182_p7_w2_bank_transactions_review.sql";
const ACCT_MANIFEST = "docs/module-completion/accounting.json";
const BANK_MANIFEST = "docs/module-completion/banking.json";
const ACCT_MD = "docs/module-completion/accounting.md";
const ACCT_ITEM = "ACCT-LINK-06";
const BANK_ITEM = "BANK-ECON-02";

function read(root, rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function readJson(root, rel) {
  return JSON.parse(read(root, rel));
}

export function run(root = ROOT) {
  const failures = [];

  failures.push(...runBulkPoster(root));

  const posterPath = path.join(root, POSTER);
  if (!fs.existsSync(posterPath)) {
    failures.push(`missing ${POSTER}`);
  } else {
    const poster = read(root, POSTER);
    if (!/export\s+async\s+function\s+maybePostBankCategorizationToGl/.test(poster)) {
      failures.push("bank-feed-gl-posting.service: maybePostBankCategorizationToGl must exist");
    }
    if (!/postSourceTransaction\s*\([\s\S]*source_transaction_type:\s*["']bank_categorization["']/.test(poster)) {
      failures.push("bank-feed-gl-posting.service: must post via postSourceTransaction bank_categorization (reuse poster, no new GL math)");
    }
    if (!/SET\s+matched_journal_entry_id\s*=/.test(poster)) {
      failures.push("bank-feed-gl-posting.service: must stamp matched_journal_entry_id after post");
    }
    if (!/matched_journal_entry_id\s+IS\s+NULL/.test(poster)) {
      failures.push("bank-feed-gl-posting.service: stamp must guard matched_journal_entry_id IS NULL (idempotency)");
    }
    if (!/BANK_FEED_GL_POSTING_ENABLED/.test(poster)) {
      failures.push("bank-feed-gl-posting.service: must gate on BANK_FEED_GL_POSTING_ENABLED");
    }
    if (!/reason:\s*["']flag_off["']/.test(poster)) {
      failures.push("bank-feed-gl-posting.service: flag OFF must return reason flag_off (no silent post)");
    }
  }

  const categorizePath = path.join(root, CATEGORIZE);
  if (!fs.existsSync(categorizePath)) {
    failures.push(`missing ${CATEGORIZE}`);
  } else {
    const routes = read(root, CATEGORIZE);
    const singleRowStart = routes.indexOf('app.post("/api/v1/banking/transactions/:id/categorize"');
    const singleRowEnd = routes.indexOf('app.post("/api/v1/banking/transactions/categorize-bulk"', singleRowStart);
    if (singleRowStart < 0) {
      failures.push("categorization.routes: single-row categorize route missing");
    } else {
      const singleSlice =
        singleRowEnd > singleRowStart ? routes.slice(singleRowStart, singleRowEnd) : routes.slice(singleRowStart);
      if (!/await\s+maybePostBankCategorizationToGl/.test(singleSlice)) {
        failures.push("categorization.routes: single-row categorize must await maybePostBankCategorizationToGl");
      }
    }
  }

  const migPath = path.join(root, MIG_0182);
  if (!fs.existsSync(migPath)) {
    failures.push(`missing ${MIG_0182}`);
  } else {
    const mig = read(root, MIG_0182);
    if (!/matched_journal_entry_id\s+uuid\s+REFERENCES\s+accounting\.journal_entries\(id\)/.test(mig)) {
      failures.push(`${MIG_0182}: matched_journal_entry_id FK to accounting.journal_entries must exist`);
    }
  }

  const acctPath = path.join(root, ACCT_MANIFEST);
  if (!fs.existsSync(acctPath)) {
    failures.push(`missing ${ACCT_MANIFEST}`);
  } else {
    const data = readJson(root, ACCT_MANIFEST);
    const item = (data.items || []).find((it) => it.id === ACCT_ITEM);
    if (!item) {
      failures.push(`${ACCT_MANIFEST} missing item ${ACCT_ITEM} (ACCT-F05 bank feed JE linkage)`);
    } else {
      const ev = String(item.evidence || "");
      if (!/#3424/.test(ev)) {
        failures.push(`${ACCT_ITEM} evidence must cite PR #3424 (bulk categorize→GL poster on main)`);
      }
      if (!/matched_je|matched_journal_entry_id/i.test(ev)) {
        failures.push(`${ACCT_ITEM} evidence must cite honest matched_JE density (matched_je=N/M)`);
      }
      if (item.status === "PASS") {
        if (!densityIsMeaningful(ev)) {
          failures.push(
            `${ACCT_ITEM} PASS requires matched_je=N/M with N>=${MEANINGFUL_MATCHED_JE} in evidence (Rule 23 — no theater PASS)`
          );
        }
      } else if (item.status === "FAIL") {
        if (!/ops backlog|density|FAIL until/i.test(ev)) {
          failures.push(`${ACCT_ITEM} FAIL evidence must name density backlog (poster works when used)`);
        }
        if (densityIsMeaningful(ev)) {
          failures.push(
            `${ACCT_ITEM} evidence cites meaningful density but status is still FAIL — flip to PASS`
          );
        }
      } else {
        failures.push(`${ACCT_ITEM} must be FAIL (near-zero density) or PASS (meaningful matched_je=N/M)`);
      }
    }
  }

  const bankPath = path.join(root, BANK_MANIFEST);
  if (!fs.existsSync(bankPath)) {
    failures.push(`missing ${BANK_MANIFEST}`);
  } else {
    const data = readJson(root, BANK_MANIFEST);
    const item = (data.items || []).find((it) => it.id === BANK_ITEM);
    if (!item) {
      failures.push(`${BANK_MANIFEST} missing companion item ${BANK_ITEM}`);
    } else {
      const ev = String(item.evidence || "");
      if (item.status === "PASS") {
        if (!densityIsMeaningful(ev)) {
          failures.push(
            `${BANK_ITEM} PASS requires matched_je=N/M with N>=${MEANINGFUL_MATCHED_JE} in evidence (Rule 23)`
          );
        }
      } else if (item.status !== "FAIL") {
        failures.push(`${BANK_ITEM} must be FAIL or PASS (not ${item.status})`);
      }
    }
  }

  const mdPath = path.join(root, ACCT_MD);
  if (fs.existsSync(mdPath)) {
    const md = read(root, ACCT_MD);
    const acct = readJson(root, ACCT_MANIFEST);
    const item = (acct.items || []).find((it) => it.id === ACCT_ITEM);
    const want = item?.status === "PASS" ? "PASS" : "FAIL";
    const rowRe = new RegExp(`\\| \`${ACCT_ITEM}\` \\| \\*\\*${want}\\*\\*`);
    if (!rowRe.test(md)) {
      failures.push(`${ACCT_MD} must show ${ACCT_ITEM} as ${want} (run verify-module-completion --write-md)`);
    }
  }

  return failures;
}

function write(root, rel, contents) {
  const target = path.join(root, rel);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, contents);
}

if (process.argv.includes("--selftest")) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "verify-bankfeed-je-match-"));

  const copyTree = (rel) => {
    const src = path.join(ROOT, rel);
    const dest = path.join(temp, rel);
    if (!fs.existsSync(src)) return;
    if (fs.statSync(src).isDirectory()) {
      fs.mkdirSync(dest, { recursive: true });
      for (const name of fs.readdirSync(src)) copyTree(path.join(rel, name));
    } else {
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(src, dest);
    }
  };

  for (const rel of [POSTER, CATEGORIZE, MIG_0182, ACCT_MANIFEST, BANK_MANIFEST]) {
    copyTree(rel);
  }

  try {
    const good = run(temp);
    if (good.length) throw new Error(`correct repo shape failed: ${good.join("; ")}`);

    const poster = read(temp, POSTER);
    const stripped = poster.replace(/SET\s+matched_journal_entry_id\s*=/, "SET matched_journal_entry_id_removed =");
    write(temp, POSTER, stripped);
    if (!run(temp).some((f) => f.includes("matched_journal_entry_id"))) {
      throw new Error("removed matched_journal_entry_id stamp was not detected");
    }
    copyTree(POSTER);

    const acct = readJson(temp, ACCT_MANIFEST);
    const link06 = acct.items.find((it) => it.id === ACCT_ITEM);
    link06.status = "PASS";
    link06.evidence = "theater PASS with no density count — must fail guard";
    write(temp, ACCT_MANIFEST, JSON.stringify(acct, null, 2) + "\n");
    if (!run(temp).some((f) => f.includes(`${ACCT_ITEM} PASS requires matched_je`))) {
      throw new Error("theater ACCT-LINK-06 PASS without matched_je=N/M was not detected");
    }

    link06.evidence =
      "LIVE matched_journal_entry_id=170/10830 (#3424 bulk categorize→GL); density meaningful";
    write(temp, ACCT_MANIFEST, JSON.stringify(acct, null, 2) + "\n");
    const after = run(temp);
    if (after.some((f) => f.includes(`${ACCT_ITEM} PASS requires`))) {
      throw new Error(`meaningful density PASS wrongly rejected: ${after.join("; ")}`);
    }

    console.log("verify-bankfeed-je-match --selftest OK");
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
} else if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const failures = run();
  if (failures.length) {
    console.error("verify-bankfeed-je-match — FAILED");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
  }
  console.log(
    "verify-bankfeed-je-match — OK (ACCT-F05 wiring locked; PASS allowed only with meaningful matched_je=N/M)"
  );
}
