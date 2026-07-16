#!/usr/bin/env node
/**
 * verify-append-event-severity-domain.mjs
 *
 * GUARD 2026-07-16: audit.audit_events CHECK allows only info|warning|critical.
 * Relay fuel ingest used severity "error" → 23514 → aborted the shared backfill txn.
 * Fails CI if any audit.append_event call site passes a string-literal severity
 * outside {info,warning,critical}.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-append-event-severity-domain";
const SRC = path.join(ROOT, "apps/backend/src");
const BAD = "error|warn|fatal|debug";

/** 2nd arg is a bad severity literal: append_event($1, "error", …) */
const INLINE = new RegExp(
  String.raw`append_event\s*\(\s*(?:\$\d+|['"\`][^'"\`]+['"\`])\s*,\s*['"\`](${BAD})['"\`]`,
  "gi"
);
/** Args array form: append_event(...), [ "event.class", "error", …] */
const ARRAY = new RegExp(
  String.raw`append_event[\s\S]{0,120}?\[\s*['"\`][^'"\`]+['"\`]\s*,\s*['"\`](${BAD})['"\`]`,
  "gi"
);

const offenders = [];

function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const fp = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name === "dist") continue;
      walk(fp);
    } else if (/\.ts$/.test(e.name) && !/\.(test|spec)\.ts$/.test(e.name)) {
      const rel = path.relative(ROOT, fp).replace(/\\/g, "/");
      const src = fs.readFileSync(fp, "utf8");
      for (const re of [INLINE, ARRAY]) {
        re.lastIndex = 0;
        let m;
        while ((m = re.exec(src))) {
          const line = src.slice(0, m.index).split("\n").length;
          offenders.push(`${rel}:${line} severity="${m[1]}" (allowed: info|warning|critical)`);
        }
      }
    }
  }
}

walk(SRC);

if (offenders.length > 0) {
  console.error(`[${LABEL}] FAIL — ${offenders.length} out-of-domain audit severity literal(s):`);
  for (const o of offenders) console.error(`  - ${o}`);
  process.exit(1);
}

console.log(`[${LABEL}] OK — all audit.append_event string-literal severities ∈ {info,warning,critical}`);
