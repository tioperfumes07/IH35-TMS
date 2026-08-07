#!/usr/bin/env node
/**
 * GUARD — verify-console-email-never-sent (LV-010)
 *
 * THE DEFECT THIS ASSERTS — measured on prod, not theorised
 * email.email_queue held 232 rows, ALL status='sent', and every single one carried a
 * provider_message_id beginning 'console-email-' — the literal produced by
 * apps/backend/src/email/providers/console.ts. EMAIL_PROVIDER defaults to "console"
 * (email/factory.ts), so on prod nothing had ever been handed to a real ESP: 232 console writes,
 * 0 real deliveries, every one recorded as 'sent' since 2026-05-19.
 *
 * 'sent' is the word an operator, a customer dispute, a collections workflow and an auditor all read
 * as "we delivered this". An invoice or settlement notice whose only destination was stdout was
 * indistinguishable from mail a customer actually received. That is a false green on a
 * customer-facing money path, which is why it gets a guard and not just a fix.
 *
 * WHAT IS ENFORCED
 * The TRANSPORT decides the terminal status. A console provider may only ever terminate at
 * 'logged_only'; 'sent' must be reachable only for a real provider. The status may not be a hardcoded
 * literal in the UPDATE, because that is precisely how a console send got recorded as delivered.
 *
 * METHOD: comments stripped before asserting (guards of mine have passed by matching their own
 * prose); --selftest mutates the REAL source and requires every assertion to trip.
 */
import { readFileSync } from "node:fs";

const LABEL = "verify-console-email-never-sent";
const CRON = "apps/backend/src/email/cron.ts";

function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/** The success-finalizer only — the one place a terminal status is written. */
function finalizer(src) {
  const start = src.indexOf("async function finalizeSuccess");
  if (start === -1) return "";
  const next = src.indexOf("\nasync function ", start + 1);
  return src.slice(start, next === -1 ? src.length : next);
}

function check(rawSrc) {
  const code = stripComments(rawSrc);
  const fn = finalizer(code);
  const errors = [];

  if (!fn) {
    errors.push(`${CRON}: finalizeSuccess not found — cannot prove console sends are honest`);
    return errors;
  }

  // 1. A hardcoded 'sent' in the finalizer is the original defect.
  if (/status\s*=\s*'sent'/.test(fn)) {
    errors.push(
      `${CRON}: finalizeSuccess hardcodes status='sent'. A console-only send would again be recorded ` +
        `as delivered mail (LV-010 regression).`
    );
  }

  // 2. The terminal status must be derived from the transport.
  if (!/providerKind/.test(fn)) {
    errors.push(`${CRON}: finalizeSuccess does not receive the provider kind — status cannot be honest`);
  }
  if (!/logged_only/.test(fn)) {
    errors.push(`${CRON}: 'logged_only' never appears — a console send has no honest terminal status`);
  }
  if (!/providerKind\s*===\s*"console"\s*\?\s*"logged_only"/.test(fn)) {
    errors.push(
      `${CRON}: the console transport is not pinned to 'logged_only' — only a real ESP may write 'sent'`
    );
  }

  // 3. The row must record WHICH transport handled it.
  if (!/provider\s*=\s*\$\d/.test(fn)) {
    errors.push(`${CRON}: the provider column is not written — the row cannot say which transport ran`);
  }

  // 4. The call site must pass the real provider kind, not a constant.
  if (!/finalizeSuccess\([^)]*provider\.kind/.test(code)) {
    errors.push(`${CRON}: finalizeSuccess is not called with provider.kind — the guard above is bypassable`);
  }
  return errors;
}

function selftest() {
  const real = readFileSync(CRON, "utf8");
  if (check(real).length !== 0) {
    console.error(`${LABEL} --selftest FAIL — real source does not pass:`);
    for (const e of check(real)) console.error(`  - ${e}`);
    process.exit(1);
  }

  const mutations = [
    ["hardcoded sent restored", (s) => s.replace(/SET status = \$3,/, "SET status = 'sent',")],
    ["console no longer pinned", (s) => s.replace(/providerKind === "console" \? "logged_only" : "sent"/, '"sent"')],
    ["provider kind not passed", (s) => s.replace("finalizeSuccess(client, id, sent.messageId, provider.kind)", "finalizeSuccess(client, id, sent.messageId, \"ses\")")],
    ["provider column dropped", (s) => s.replace(/provider = \$4,/, "")],
  ];

  for (const [name, mutate] of mutations) {
    const broken = mutate(real);
    if (broken === real) {
      console.error(`${LABEL} --selftest FAIL — mutation "${name}" changed nothing (guard is stale).`);
      process.exit(1);
    }
    if (check(broken).length === 0) {
      console.error(`${LABEL} --selftest FAIL — mutation "${name}" was NOT detected.`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} --selftest PASS — ${mutations.length} mutations all detected.`);
  process.exit(0);
}

if (process.argv.includes("--selftest")) selftest();

const errors = check(readFileSync(CRON, "utf8"));
if (errors.length) {
  console.error(`${LABEL} FAIL — ${errors.length} problem(s): a console send could be recorded as delivered:`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(
  `${LABEL} PASS — the transport decides the terminal status: console terminates at 'logged_only', ` +
    `only a real provider may write 'sent', and the row records which transport ran.`
);
