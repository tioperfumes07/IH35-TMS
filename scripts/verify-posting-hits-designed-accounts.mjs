#!/usr/bin/env node
/**
 * H1 — ACCOUNT-CODE CONTRACT (Honesty Program 2026-08-29).
 *
 * A posting path with no contract entry FAILS.
 * je: prose is a caption; je_contract + POSTING-CONTRACTS.json are the machine check.
 * Roles only — never one entity's account code in a shared contract.
 *
 * Run: node scripts/verify-posting-hits-designed-accounts.mjs
 *      node scripts/verify-posting-hits-designed-accounts.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-posting-hits-designed-accounts";
const CONTRACTS_PATH = path.join(ROOT, "docs/specs/accounting/POSTING-CONTRACTS.json");
const FLAGS_PATH = path.join(ROOT, "apps/backend/src/lib/feature-flags/service.ts");
const REGISTRY_PATH = path.join(ROOT, "apps/backend/src/home/scenario-registry.ts");
const COA_ROLES_PATH = path.join(ROOT, "apps/backend/src/accounting/coa-roles/resolver.service.ts");
const SELFTEST = process.argv.includes("--selftest");

export function extractQuotedFlags(src) {
  const out = new Set();
  const m = src.match(/export const POSTING_FLAG_KEYS[\s\S]*?\n\]\);/);
  if (!m) throw new Error("POSTING_FLAG_KEYS block not found");
  for (const q of m[0].matchAll(/"([A-Z0-9_]+)"/g)) out.add(q[1]);
  return [...out].sort();
}

export function extractCoaRoles(src) {
  const m = src.match(/export const COA_ROLE_VALUES = \[([\s\S]*?)\];/);
  if (!m) throw new Error("COA_ROLE_VALUES not found");
  return [...m[1].matchAll(/"([a-z0-9_]+)"/g)].map((x) => x[1]);
}

export function postingJeBlocks(registrySrc) {
  const blocks = [];
  const re = /je: "([^"]+)",(\n    je_contract:)?/g;
  let m;
  while ((m = re.exec(registrySrc))) {
    blocks.push({ je: m[1], contractSrc: m[2] ? "present" : null });
  }
  return blocks;
}

export function analyse({ contractsDoc, postingFlags, coaRoles, registrySrc }) {
  const problems = [];
  const paths = contractsDoc.paths || [];
  const byFlag = new Map(paths.map((p) => [p.flag, p]));
  const exempt = new Set(contractsDoc.exempt_flags || []);

  if (!Array.isArray(contractsDoc.honesty_28) || contractsDoc.honesty_28.length !== 28) {
    problems.push(`honesty_28 must list exactly 28 posting paths (got ${contractsDoc.honesty_28?.length}).`);
  } else {
    for (const f of contractsDoc.honesty_28) {
      if (!byFlag.has(f)) problems.push(`honesty_28 path ${f} has no contract entry. A posting path with no contract entry FAILS.`);
    }
  }

  for (const flag of postingFlags) {
    if (exempt.has(flag)) continue;
    if (!byFlag.has(flag)) {
      problems.push(`POSTING_FLAG_KEYS ${flag} has no POSTING-CONTRACTS entry. A posting path with no contract entry FAILS.`);
    }
  }

  for (const p of paths) {
    if (!p.flag) problems.push("contract missing flag");
    if (!p.must_balance) problems.push(`${p.flag}: must_balance must be true`);
    if (!p.reversal || !p.reversal.mode) problems.push(`${p.flag}: missing reversal (H5 registry field)`);
    if (!Array.isArray(p.lines) || p.lines.length < 2) problems.push(`${p.flag}: need DR and CR lines`);
    const sides = (p.lines || []).map((l) => l.side).sort().join(",");
    if (!(p.lines || []).some((l) => l.side === "DR") || !(p.lines || []).some((l) => l.side === "CR")) {
      problems.push(`${p.flag}: contract must include DR and CR`);
    }
    for (const line of p.lines || []) {
      if (line.account_code && !line.account_role) {
        problems.push(`${p.flag}: hardcoded account_code ${line.account_code} without account_role — entity codes are not a shared contract`);
      }
      if (!line.account_role) problems.push(`${p.flag}: line missing account_role`);
      else if (!coaRoles.includes(line.account_role)) {
        problems.push(`${p.flag}: account_role "${line.account_role}" is not in COA_ROLE_VALUES (unknown role cannot resolve per entity)`);
      }
    }
    void sides;
  }

  const jes = postingJeBlocks(registrySrc);
  for (const b of jes) {
    if (b.je.trim().startsWith("—")) continue;
    if (!b.contractSrc) {
      problems.push(`scenario je ${JSON.stringify(b.je)} has no je_contract. Caption is not a check.`);
    } else if (/account_code:\s*"\d+"/.test(b.contractSrc) && !/account_role/.test(b.contractSrc)) {
      problems.push(`scenario je_contract hardcodes a numeric account_code without a role`);
    }
  }

  return { problems, pathCount: paths.length, flagCount: postingFlags.length };
}

export function matchPostedToContract(postedLines, contract, roleToAccountId) {
  const problems = [];
  const drAmt = postedLines.filter((l) => l.side === "DR").reduce((s, l) => s + l.amount, 0);
  const crAmt = postedLines.filter((l) => l.side === "CR").reduce((s, l) => s + l.amount, 0);
  if (contract.must_balance && Math.abs(drAmt - crAmt) > 0.009) {
    problems.push(`DR (${drAmt}) ≠ CR (${crAmt})`);
  }
  for (const spec of contract.lines) {
    const wantId = roleToAccountId[spec.account_role];
    const hit = postedLines.find((l) => l.side === spec.side && l.account_id === wantId);
    if (!hit) problems.push(`missing ${spec.side} for role ${spec.account_role}`);
  }
  for (const line of postedLines) {
    const allowed = new Set(contract.lines.filter((c) => c.side === line.side).map((c) => roleToAccountId[c.account_role]));
    if (!allowed.has(line.account_id)) problems.push(`posted ${line.side} account ${line.account_id} outside contract`);
  }
  return problems;
}

function selftest() {
  const T = [];
  const t = (n, f) => {
    try {
      f();
      T.push([n, true]);
    } catch (e) {
      T.push([n, false, e.message]);
    }
  };
  const baseDoc = JSON.parse(fs.readFileSync(CONTRACTS_PATH, "utf8"));
  const flags = extractQuotedFlags(fs.readFileSync(FLAGS_PATH, "utf8"));
  const roles = extractCoaRoles(fs.readFileSync(COA_ROLES_PATH, "utf8"));
  const registrySrc = fs.readFileSync(REGISTRY_PATH, "utf8");

  t("clean contracts PASS structural", () => {
    const r = analyse({ contractsDoc: baseDoc, postingFlags: flags, coaRoles: roles, registrySrc });
    if (r.problems.length) throw new Error(r.problems.join(" | "));
  });
  t("missing path FAILS", () => {
    const doc = { ...baseDoc, paths: baseDoc.paths.filter((p) => p.flag !== "BILL_GL_POSTING_ENABLED") };
    const r = analyse({ contractsDoc: doc, postingFlags: flags, coaRoles: roles, registrySrc });
    if (!r.problems.some((p) => p.includes("BILL_GL_POSTING_ENABLED") && p.includes("no contract"))) {
      throw new Error(r.problems.join(" | ") || "no fail");
    }
  });
  t("hardcoded entity code without role FAILS", () => {
    const paths = baseDoc.paths.map((p) =>
      p.flag === "BILL_GL_POSTING_ENABLED"
        ? { ...p, lines: [{ side: "DR", account_code: "6800" }, { side: "CR", account_role: "ap_control" }] }
        : p
    );
    const r = analyse({ contractsDoc: { ...baseDoc, paths }, postingFlags: flags, coaRoles: roles, registrySrc });
    if (!r.problems.some((p) => p.includes("hardcoded"))) throw new Error(r.problems.join(" | "));
  });
  t("unknown CoA role FAILS", () => {
    const paths = baseDoc.paths.map((p) =>
      p.flag === "BILL_GL_POSTING_ENABLED"
        ? { ...p, lines: [{ side: "DR", account_role: "not_a_real_role" }, { side: "CR", account_role: "ap_control" }] }
        : p
    );
    const r = analyse({ contractsDoc: { ...baseDoc, paths }, postingFlags: flags, coaRoles: roles, registrySrc });
    if (!r.problems.some((p) => p.includes("not_a_real_role"))) throw new Error(r.problems.join(" | "));
  });
  const bill = baseDoc.paths.find((p) => p.flag === "BILL_GL_POSTING_ENABLED");
  const map = { expense_default: "A-exp", ap_control: "A-ap" };
  t("wrong DR account FAILS live matcher", () => {
    const posted = [
      { side: "DR", account_id: "WRONG", amount: 100 },
      { side: "CR", account_id: "A-ap", amount: 100 },
    ];
    const p = matchPostedToContract(posted, bill, map);
    if (!p.some((x) => x.includes("missing DR"))) throw new Error(p.join());
  });
  t("wrong CR account FAILS live matcher", () => {
    const posted = [
      { side: "DR", account_id: "A-exp", amount: 100 },
      { side: "CR", account_id: "WRONG", amount: 100 },
    ];
    const p = matchPostedToContract(posted, bill, map);
    if (!p.some((x) => x.includes("missing CR"))) throw new Error(p.join());
  });
  t("flipped signs FAILS live matcher", () => {
    const posted = [
      { side: "CR", account_id: "A-exp", amount: 100 },
      { side: "DR", account_id: "A-ap", amount: 100 },
    ];
    const p = matchPostedToContract(posted, bill, map);
    if (!p.length) throw new Error("expected mismatch");
  });
  t("DR ≠ CR FAILS live matcher", () => {
    const posted = [
      { side: "DR", account_id: "A-exp", amount: 100 },
      { side: "CR", account_id: "A-ap", amount: 90 },
    ];
    const p = matchPostedToContract(posted, bill, map);
    if (!p.some((x) => x.includes("≠"))) throw new Error(p.join());
  });
  t("balanced matching roles PASS live matcher", () => {
    const posted = [
      { side: "DR", account_id: "A-exp", amount: 100 },
      { side: "CR", account_id: "A-ap", amount: 100 },
    ];
    const p = matchPostedToContract(posted, bill, map);
    if (p.length) throw new Error(p.join());
  });

  const failed = T.filter((x) => !x[1]);
  for (const row of T) console.log(`${row[1] ? "PASS" : "FAIL"} ${row[0]}${row[2] ? " — " + row[2] : ""}`);
  if (failed.length) {
    console.error(`${LABEL} --selftest ${failed.length}/${T.length} failed`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest ${T.length}/${T.length} ok`);
}

function main() {
  if (SELFTEST) return selftest();
  if (!fs.existsSync(CONTRACTS_PATH)) {
    console.error(`${LABEL} FAIL CLOSED: missing ${CONTRACTS_PATH}`);
    process.exit(1);
  }
  const contractsDoc = JSON.parse(fs.readFileSync(CONTRACTS_PATH, "utf8"));
  const postingFlags = extractQuotedFlags(fs.readFileSync(FLAGS_PATH, "utf8"));
  const coaRoles = extractCoaRoles(fs.readFileSync(COA_ROLES_PATH, "utf8"));
  const registrySrc = fs.readFileSync(REGISTRY_PATH, "utf8");
  const r = analyse({ contractsDoc, postingFlags, coaRoles, registrySrc });
  if (r.problems.length) {
    for (const p of r.problems) console.error(`  ${p}`);
    console.error(`${LABEL} FAIL ${r.problems.length} (paths=${r.pathCount} flags=${r.flagCount})`);
    process.exit(1);
  }
  console.log(`${LABEL} PASS paths=${r.pathCount} flags=${r.flagCount} honesty_28=28`);
}

main();
