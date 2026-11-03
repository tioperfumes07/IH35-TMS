#!/usr/bin/env node
/**
 * verify-legal-contract-list-signer-entitylink.mjs
 * LV-LEGAL-CONTRACT-LIST-SIGNER-PLAIN-TEXT
 *
 * List Signer cell must EntityLink when signerKind + signer_entity_id exist;
 * list API must select signer_entity_id (detail already did).
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const LABEL = "verify-legal-contract-list-signer-entitylink";
const PAGE = "apps/frontend/src/pages/legal/contracts/LegalContractInstancesPage.tsx";
const API = "apps/frontend/src/api/legal-contracts.ts";
const SVC = "apps/backend/src/legal/contracts.service.ts";

function read(rel) {
  return fs.readFileSync(path.join(process.cwd(), rel), "utf8");
}

function analyze(planted = {}) {
  const failures = [];
  const readSrc = (rel) => planted[rel] ?? read(rel);
  const page = readSrc(PAGE);
  if (!/function signerKind\(/.test(page)) {
    failures.push("page must define module-level signerKind");
  }
  if (!/legal-contract-list-signer-link/.test(page)) {
    failures.push("list Signer cell must mount EntityLink with legal-contract-list-signer-link test id");
  }
  if (!/legal-contract-list-signer-plain/.test(page)) {
    failures.push("list must retain plain signer fallback test id for manual/other");
  }
  if (!/kind && entityId \?/.test(page) && !/kind && entityId\?/.test(page)) {
    failures.push("list must gate EntityLink on kind AND signer_entity_id");
  }
  // Unconditional plain-only list signer (the defect)
  if (/key:\s*"signer_name"[\s\S]{0,220}<div>\{row\.signer_name\}<\/div>/.test(page)) {
    failures.push("list signer_name column must not render bare plain-text name only");
  }
  if (!/EntityLink[\s\S]{0,80}kind=\{kind\}/.test(page)) {
    failures.push("list must EntityLink with computed kind");
  }

  const api = readSrc(API);
  if (!/export type LegalContractSummary = \{[\s\S]*?signer_entity_id: string \| null;/.test(api)) {
    failures.push("LegalContractSummary must include signer_entity_id");
  }

  const svc = readSrc(SVC);
  // list query block — require signer_entity_id near signer_type in SELECT
  if (!/ci\.signer_type,\s*\n\s*ci\.signer_entity_id,/.test(svc)) {
    failures.push("listContractInstances SELECT must include ci.signer_entity_id after signer_type");
  }
  // Codex batch67 sibling — multi-status must hit the server before LIMIT 300.
  if (!page.includes('statusFilter.length ? statusFilter.join(",") : undefined')) {
    failures.push("list queryFn must send statusFilter comma-union to the API");
  }
  if (/statusFilter\.length <= 1[\s\S]{0,200}statusFilter\.includes\(row\.status\)/.test(page) || /statusFilter\.length === 1[\s\S]{0,220}statusFilter\.includes\(row\.status\)/.test(page)) {
    failures.push("list queryFn must not client-filter a LIMIT 300 page for multi-status");
  }
  if (!svc.includes("parseContractInstanceStatusFilter") || !svc.includes("ci.status = ANY($${values.length}::legal.contract_instance_status[])")) {
    failures.push("listContractInstances must apply status ANY() via parseContractInstanceStatusFilter before LIMIT");
  }
  return failures;
}

function fail(msg) {
  console.error(`${LABEL} FAIL: ${msg}`);
  process.exit(1);
}

function selftest() {
  const pagePath = path.join(process.cwd(), PAGE);
  const original = fs.readFileSync(pagePath, "utf8");
  try {
    const bad = original.replace(
      /render:\s*\(row\)\s*=>\s*\{[\s\S]*?legal-contract-list-signer-plain[\s\S]*?\},\s*\},/,
      `render: (row) => (
          <>
            <div>{row.signer_name}</div>
            <div className="text-xs text-gray-500">{row.signer_email ?? row.signer_phone ?? "No contact"}</div>
          </>
        ),
      },`,
    );
    if (bad === original) fail("selftest could not plant plain-text list signer");
    const planted = analyze({ [PAGE]: bad });
    if (!planted.some((m) => /plain-text|signer-link|EntityLink/.test(m))) {
      fail(`selftest expected list fail; got: ${planted.join("; ")}`);
    }
  } finally {
    // nothing written to disk; planted text is passed in-memory
  }

  const svcPath = path.join(process.cwd(), SVC);
  const svcOriginal = fs.readFileSync(svcPath, "utf8");
  try {
    const bad = svcOriginal.replace(/ci\.signer_type,\s*\n\s*ci\.signer_entity_id,/, "ci.signer_type,");
    if (bad === svcOriginal) fail("selftest could not drop list signer_entity_id");
    const planted = analyze({ [SVC]: bad });
    if (!planted.some((m) => /signer_entity_id/.test(m))) {
      fail(`selftest expected service fail; got: ${planted.join("; ")}`);
    }
  } finally {
    // in-memory plant only
  }

  const pageBadUnion = analyze({
    [PAGE]: original.replace('statusFilter.length ? statusFilter.join(",") : undefined', "statusFilter.length === 1 ? statusFilter[0] : undefined"),
  });
  if (!pageBadUnion.some((m) => /comma-union/.test(m))) {
    fail(`selftest expected comma-union fail; got: ${pageBadUnion.join("; ")}`);
  }
  const pageClientFilter = analyze({
    [PAGE]:
      original +
      '\nif (statusFilter.length <= 1) return result;\nconst contracts = (result.contracts ?? []).filter((row) => statusFilter.includes(row.status));\n',
  });
  if (!pageClientFilter.some((m) => /client-filter|LIMIT 300/.test(m))) {
    fail(`selftest expected client-filter fail; got: ${pageClientFilter.join("; ")}`);
  }
  const svcNoAny = analyze({
    [SVC]: svcOriginal.replaceAll(
      "ci.status = ANY($${values.length}::legal.contract_instance_status[])",
      "ci.status = $REMOVED"
    ),
  });
  if (!svcNoAny.some((m) => /ANY\(\)/.test(m))) {
    fail(`selftest expected status ANY fail; got: ${svcNoAny.join("; ")}`);
  }

  const good = analyze();
  if (good.length) fail(`selftest expected GOOD: ${good.join("; ")}`);
  console.log(`${LABEL} selftest PASS`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const failures = analyze();
if (failures.length) fail(failures.join("; "));
console.log(`${LABEL} PASS — legal contract list Signer EntityLinks when kind+entity id exist`);
