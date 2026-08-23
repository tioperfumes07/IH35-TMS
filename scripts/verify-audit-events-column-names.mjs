#!/usr/bin/env node
/**
 * GUARD — SAF-425C. audit.audit_events is (uuid, created_at, ...). It has NO `id` and NO `emitted_at`.
 *
 * THE DEFECT (found by GUARD sweep, verified on prod 2026-07-30): safety/audit-425c.routes.ts selected
 * `id, event_class, payload, emitted_at` and ordered by `emitted_at`. Both columns are phantom, so the
 * 425C exhibit endpoint raised undefined_column and returned a 500 on EVERY call — a compliance
 * exhibit that could not be produced, failing silently as a server error rather than as a missing
 * exhibit.
 *
 * The trap is that `id` and `emitted_at` are plausible names and exist on OTHER tables, so a
 * copy-paste from a different audit query looks right. This asserts the real column names at the file
 * level, where the query lives.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const LABEL = "verify:audit-events-column-names";
const ROOT = process.cwd();
const SRC = join(ROOT, "apps/backend/src");
const REAL = ["uuid", "created_at", "event_class", "severity", "payload", "actor_user_uuid", "source"];
const PHANTOM = ["id", "emitted_at"];

function walk(dir) {
  const out = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (p.endsWith(".ts") && !p.endsWith(".test.ts")) out.push(p);
  }
  return out;
}

/** The SELECT ... FROM audit.audit_events span of a file, if any. */
export function auditEventsSelects(src) {
  const spans = [];
  const re = /SELECT([\s\S]{0,400}?)FROM\s+audit\.audit_events([\s\S]{0,300}?)(?:LIMIT|\)|`|$)/gi;
  let m;
  while ((m = re.exec(src)) !== null) spans.push(`${m[1]} ${m[2]}`);
  return spans;
}

export function analyse(files) {
  const problems = [];
  for (const { file, src } of files) {
    for (const span of auditEventsSelects(src)) {
      // Strip SQL comments so prose naming the old columns is not read as code.
      const code = span.split("\n").map((l) => (l.includes("--") ? l.slice(0, l.indexOf("--")) : l)).join("\n");
      for (const bad of PHANTOM) {
        // Bare column reference, not `AS id` / `AS emitted_at` (aliasing the real column is correct).
        // Catch `id`, `id::text`, and `ORDER BY id` — the original `id\\s*(,|\\s|$)` missed casts,
        // so maintenance/compliance.routes.ts `id::text` 500'd live while this guard stayed green.
        const bare = new RegExp(`(^|[,\\s(])${bad}(\\s*::|\\s|,|$)`, "m");
        const aliased = new RegExp(`AS\\s+${bad}\\b`, "i");
        if (bare.test(code) && !aliased.test(code)) {
          problems.push(
            `${file}: selects phantom column "${bad}" from audit.audit_events — the real columns are ${REAL.join(", ")}. This raises undefined_column at runtime (500), not a compile error.`
          );
        }
      }
    }
  }
  return problems;
}

function selftest() {
  let bad = 0;
  const t = (n, c) => { if (!c) { console.error(`  SELFTEST FAIL: ${n}`); bad++; } };
  const BROKEN = [{ file: "x.ts", src: "SELECT id, event_class, payload, emitted_at\nFROM audit.audit_events\nORDER BY emitted_at DESC LIMIT 5" }];
  const CASTED = [{ file: "x.ts", src: "SELECT id::text, event_class, payload\nFROM audit.audit_events\nORDER BY created_at DESC LIMIT 5" }];
  const FIXED  = [{ file: "x.ts", src: "SELECT uuid AS id, event_class, payload, created_at AS emitted_at\nFROM audit.audit_events\nORDER BY created_at DESC LIMIT 5" }];
  const PROSE  = [{ file: "x.ts", src: "SELECT uuid AS id -- this used to select emitted_at\nFROM audit.audit_events LIMIT 1" }];
  t("the exact 425C defect is caught", analyse(BROKEN).length >= 1);
  t("id::text cast is caught", analyse(CASTED).some((p) => p.includes('"id"')));
  t("the aliased fix passes", analyse(FIXED).length === 0);
  t("a comment naming the old column is not a defect", analyse(PROSE).length === 0);
  t("failure names the phantom column", (analyse(BROKEN)[0] || "").includes("emitted_at") || (analyse(BROKEN)[0] || "").includes('"id"'));
  return bad;
}

if (process.argv[1] && process.argv[1].endsWith("verify-audit-events-column-names.mjs")) {
  if (process.argv.includes("--selftest")) {
    const bad = selftest();
    console.log(bad === 0 ? `${LABEL} SELFTEST PASS — 5 cases` : `${LABEL} SELFTEST FAILED (${bad})`);
    process.exit(bad === 0 ? 0 : 1);
  }
  const files = walk(SRC).map((file) => ({ file: file.replace(`${ROOT}/`, ""), src: readFileSync(file, "utf8") }));
  const problems = analyse(files);
  if (problems.length) {
    console.error(`${LABEL} FAILED:\n  - ${problems.join("\n  - ")}`);
    process.exit(1);
  }
  console.log(`${LABEL} OK — no phantom id/emitted_at reads of audit.audit_events`);
}
