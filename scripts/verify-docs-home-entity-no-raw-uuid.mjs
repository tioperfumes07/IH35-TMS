#!/usr/bin/env node
/**
 * verify-docs-home-entity-no-raw-uuid.mjs
 * LV-DOCS-HOME-ENTITY-RAW-UUID
 *
 * Docs Home Entity column must never render a bare UUID via EntityLink label??id.
 * Unresolved links use entityLabel tombstones (noninteractive).
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const LABEL = "verify-docs-home-entity-no-raw-uuid";
const PAGE = "apps/frontend/src/pages/docs/DocsHomePage.tsx";
const BACKEND = "apps/backend/src/docs/entity-labels.ts";

function read(rel) {
  return fs.readFileSync(path.join(process.cwd(), rel), "utf8");
}

function analyze(page, backend) {
  const failures = [];
  if (!/from ["'].*lib\/entity-label["']/.test(page)) {
    failures.push("DocsHomePage must import entityLabel helpers");
  }
  if (!/isUnresolvedEntityTombstone/.test(page) || !/entityLabel\(/.test(page)) {
    failures.push("DocsHomePage must tombstone unresolved entity links");
  }
  if (!/data-testid=\{kind \? "docs-entity-unresolved" : "docs-entity-plain"\}/.test(page)
    && !/docs-entity-unresolved/.test(page)) {
    failures.push("DocsHomePage must mark unresolved entity cells");
  }
  // Forbid EntityLink with label={link.entity_label ?? undefined} alone (UUID fallback path)
  if (/label=\{label\}/.test(page) && /entity_label \?\? undefined/.test(page)) {
    failures.push("must not pass nullable entity_label straight into EntityLink (UUID fallback)");
  }
  if (/d\.id::text/.test(backend) || /COALESCE\([^)]*d\.id::text/.test(backend)) {
    failures.push("entity-labels must not COALESCE human names to id::text");
  }
  if (!/NULLIF\(TRIM\(d\.customer_name\)/.test(backend)) {
    failures.push("customer label must NULLIF empty customer_name");
  }
  if (/disabled=\{!companyId\}/.test(page)) {
    failures.push("+ Upload Document must toast when no company — disabled-only was a dead click");
  }
  if (!page.includes("Select an operating company before uploading a document")) {
    failures.push("DocsHomePage must toast before upload when no operating company");
  }
  return failures;
}

function fail(msg) {
  console.error(`${LABEL} FAIL: ${msg}`);
  process.exit(1);
}

function selftest() {
  const goodPage = `
    import { entityLabel, isUnresolvedEntityTombstone } from "../../lib/entity-label";
    if (!kind || isUnresolvedEntityTombstone(rawLabel, link.entity_id, noun)) {
      return <span data-testid={kind ? "docs-entity-unresolved" : "docs-entity-plain"}>{entityLabel(rawLabel, link.entity_id, noun)}</span>;
    }
    <EntityLink label={String(rawLabel).trim()} />
    Select an operating company before uploading a document
  `;
  const badPage = `
    const label = link.entity_label ?? undefined;
    <EntityLink kind={kind} id={link.entity_id} label={label} />
  `;
  const goodBackend = `
    customer: { labelSelect: "NULLIF(TRIM(d.customer_name), '')" },
    driver: { labelSelect: "NULLIF(TRIM(BOTH FROM COALESCE(d.first_name, '') || ' ' || COALESCE(d.last_name, '')), '')" },
  `;
  const badBackend = `
    driver: { labelSelect: "COALESCE(NULLIF(d.first_name || ' ' || d.last_name, ' '), d.id::text)" },
    customer: { labelSelect: "d.customer_name" },
  `;
  if (analyze(goodPage, goodBackend).length) fail("selftest expected GOOD to pass");
  if (!analyze(badPage, goodBackend).length) fail("selftest expected BAD page to fail");
  if (!analyze(goodPage, badBackend).length) fail("selftest expected BAD backend to fail");
  console.log(`${LABEL} selftest PASS`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const failures = analyze(read(PAGE), read(BACKEND));
if (failures.length) fail(failures.join("; "));
console.log(`${LABEL} PASS — Docs Home Entity column rejects raw UUID chrome`);
