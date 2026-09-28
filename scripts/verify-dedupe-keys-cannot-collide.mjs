#!/usr/bin/env node
/**
 * verify-dedupe-keys-cannot-collide.mjs — ROUND 155 (Claude Lead).
 *
 * THE DEFECT CLASS, found twice in one sweep and guarded by nothing.
 *
 * A dedup key built by concatenating fields with a separator is only a valid identity if the
 * separator CANNOT occur inside any field. When a FREE-TEXT field (a description, vendor name,
 * memo, reason) sits in a non-final position joined by a printable separator, two genuinely
 * different records collapse onto one key and one of them is silently dropped. Silently: no error,
 * no exception, no log line. The record just is not there.
 *
 * Both live instances were money:
 *
 *   apps/backend/src/feed/seed-settlement-document.service.ts
 *     `${load}\0${date}\0${vendor}\0${description}\0${cents}` — the author correctly reached for a
 *     separator that cannot appear in text, but used a literal NUL BYTE, which made the entire file
 *     register as binary and invisible to `grep -r` (verify-no-nul-bytes-in-source). The obvious
 *     repair — swap NUL for a space — would have CREATED this collision on vendor and description,
 *     dropping real expenses off settlements. Right instinct, unusable character.
 *
 *   apps/backend/src/safety/safety.routes.ts
 *     `${section} ${description} ${amountCents}` — space-joined with the free-text description in
 *     the middle. ("A B", "C", 100) and ("A", "B C", 100) are the same key. One of two different
 *     accident cost lines was skipped on insert.
 *
 * THE RULE. A template-literal key whose identifier ends in Key/key must not place a free-text
 * interpolation anywhere but last when the parts are joined by a single printable separator. Use
 * JSON.stringify over an array of the parts instead: every element is quoted and escaped, so the
 * encoding is unambiguous, and unlike a NUL byte it stays printable and greppable.
 *
 * DELIBERATELY NARROW. It does not flag keys built only from ids, uuids, dates, enums and numbers —
 * those cannot contain a separator, and flagging them would train everyone to ignore this guard.
 * FREE_TEXT below is the list of field-name endings that carry user-typed text; extend it when a
 * new one appears rather than widening the match to everything.
 *
 *   node scripts/verify-dedupe-keys-cannot-collide.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-dedupe-keys-cannot-collide";
const SRC = path.join(ROOT, "apps", "backend", "src");

/** Field-name endings that hold user-typed text, where any printable separator can legitimately occur. */
const FREE_TEXT = [
  "description", "descriptions", "vendor", "vendorname", "name", "label", "memo",
  "notes", "note", "reason", "comment", "comments", "title", "payee", "address",
];

/** `const somethingKey = ` followed by a template literal, captured to its closing backtick. */
const KEY_TEMPLATE = /const\s+([A-Za-z_$][\w$]*(?:[Kk]ey))\s*(?::[^=]+)?=\s*`([^`]*)`/g;
/** `${ expr }` */
const INTERP = /\$\{([^}]*)\}/g;

function isFreeText(expr) {
  const tail = expr.split(/[.?\s]/).filter(Boolean).pop() ?? "";
  const bare = tail.replace(/[^A-Za-z]/g, "").toLowerCase();
  return FREE_TEXT.some((f) => bare === f || bare.endsWith(f));
}

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { walk(p, out); continue; }
    if (!/\.ts$/.test(e.name)) continue;
    if (/\.test\.ts$/.test(e.name)) continue;
    out.push(p);
  }
  return out;
}

export function auditSource(rel, source) {
  const failures = [];
  for (const m of source.matchAll(KEY_TEMPLATE)) {
    const [, name, body] = m;
    const parts = [...body.matchAll(INTERP)];
    if (parts.length < 2) continue;

    // The separator between each pair of interpolations: the literal text between them.
    const gaps = [];
    let cursor = 0;
    for (const p of parts) {
      gaps.push(body.slice(cursor, p.index));
      cursor = p.index + p[0].length;
    }
    gaps.shift(); // text before the first interpolation is a prefix, not a separator

    for (let i = 0; i < parts.length - 1; i += 1) {
      // A free-text part in a NON-FINAL position is the hazard; a trailing one cannot collide.
      if (!isFreeText(parts[i][1])) continue;
      const sep = gaps[i] ?? "";
      if (sep.length === 0) {
        failures.push(`${rel}: ${name} — free-text \${${parts[i][1].trim()}} is concatenated with NO separator`);
      } else if (/^[\x20-\x7E]+$/.test(sep)) {
        failures.push(
          `${rel}: ${name} — free-text \${${parts[i][1].trim()}} sits in a non-final position joined by ` +
            `${JSON.stringify(sep)}, which can occur inside the text itself. Two different records ` +
            `collapse onto one key and one is silently dropped. Build the key with ` +
            `JSON.stringify([...parts]) instead.`
        );
      }
    }
  }
  return failures;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const files = fs.existsSync(SRC) ? walk(SRC) : [];
  const failures = [];
  for (const abs of files) {
    const rel = path.relative(ROOT, abs);
    failures.push(...auditSource(rel, fs.readFileSync(abs, "utf8")));
  }
  if (failures.length > 0) {
    console.error(`${LABEL} FAIL — dedup key(s) that can collide:\n`);
    for (const f of failures) console.error(`  - ${f}`);
    console.error(
      `\nA separator that can appear inside a field is not a separator. Use ` +
        `JSON.stringify([...]) — never a NUL byte, which makes the file invisible to grep.`
    );
    process.exit(1);
  }
  console.log(`${LABEL} OK — ${files.length} backend source file(s); no collidable composite dedup key`);
}
