#!/usr/bin/env node
/**
 * LV-DRIVER-ARCHIVED-NOT-DEACTIVATED — archive must deactivate; alert/message readers
 * must not treat archived drivers as live via deactivated_at-only filters.
 *
 * Prod proved 4 TEST-DRIVER seed rows archived while status='Active' and deactivated_at NULL,
 * so document alerts / messages that filter only deactivated_at still targeted them.
 */
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { maskComments } from "./lib/mask-comments.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const LABEL = "verify-driver-archive-implies-inactive";

const BULK = "apps/backend/src/drivers/drivers-bulk.routes.ts";
const ALERTS = "apps/backend/src/drivers/document-alerts.service.ts";
const MESSAGES = "apps/backend/src/drivers/messages.service.ts";

function readMasked(rel) {
  return maskComments(readFileSync(join(ROOT, rel), "utf8"));
}

export function auditSources(sources) {
  const problems = [];
  const bulk = sources.bulk ?? "";
  // Archive UPDATE must stamp deactivated_at (and not leave Active-only archive).
  if (!/archived_at\s*=\s*COALESCE\(archived_at,\s*now\(\)\)/.test(bulk)) {
    problems.push(`${BULK}: missing archived_at stamp on bulk archive UPDATE`);
  }
  if (!/deactivated_at\s*=\s*COALESCE\(deactivated_at,\s*now\(\)\)/.test(bulk)) {
    problems.push(`${BULK}: archive UPDATE must also stamp deactivated_at (archive implies inactive)`);
  }
  if (!/status\s*=\s*CASE[\s\S]*?Inactive'::mdata\.driver_status/.test(bulk)) {
    problems.push(`${BULK}: archive UPDATE must force non-terminal status to Inactive`);
  }

  for (const [rel, key] of [
    [ALERTS, "alerts"],
    [MESSAGES, "messages"],
  ]) {
    const text = sources[key] ?? "";
    // Every driver deactivated_at filter in these files must be paired with archived_at.
    const re = /AND\s+d\.deactivated_at\s+IS\s+NULL/g;
    let m;
    while ((m = re.exec(text))) {
      const window = text.slice(m.index, m.index + 120);
      if (!/archived_at\s+IS\s+NULL/.test(window)) {
        problems.push(
          `${rel}: deactivated_at-only live filter near offset ${m.index} — archived drivers still look live`
        );
      }
    }
  }
  return problems;
}

function auditTree() {
  return auditSources({
    bulk: readMasked(BULK),
    alerts: readMasked(ALERTS),
    messages: readMasked(MESSAGES),
  });
}

function selftest() {
  const good = {
    bulk: `
      UPDATE mdata.drivers
      SET
        archived_at = COALESCE(archived_at, now()),
        deactivated_at = COALESCE(deactivated_at, now()),
        status = CASE
          WHEN status::text IN ('Inactive', 'Terminated') THEN status
          ELSE 'Inactive'::mdata.driver_status
        END
    `,
    alerts: `AND d.deactivated_at IS NULL\n          AND d.archived_at IS NULL`,
    messages: `AND d.deactivated_at IS NULL\n        AND d.archived_at IS NULL`,
  };
  if (auditSources(good).length !== 0) throw new Error("selftest good failed");

  const badArchive = {
    ...good,
    bulk: `SET archived_at = COALESCE(archived_at, now()), updated_at = now()`,
  };
  if (auditSources(badArchive).length < 1) throw new Error("selftest bad archive failed");

  const badReader = {
    ...good,
    alerts: `AND d.deactivated_at IS NULL\n          AND d.cdl_expires_at IS NOT NULL`,
  };
  if (auditSources(badReader).length < 1) throw new Error("selftest bad reader failed");

  console.log(`${LABEL}: selftest PASS`);
}

function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }
  const problems = auditTree();
  if (problems.length) {
    console.error(`${LABEL}: FAIL (${problems.length})`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log(`${LABEL}: OK`);
}

main();
