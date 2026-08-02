#!/usr/bin/env node
/**
 * GUARD — WF-064 override notice must have a registered consumer.
 *
 * THE DEFECT (2026-08-02): `dispatch.wf064.override_notice` is PRODUCED in three places in
 * book-load.service.ts (unit dispatch-block override, OOS override, driver-qualification override) and
 * was CONSUMED NOWHERE. processor.ts calls markFailedNow() for an unregistered event_type, so every
 * override notice had been FAILING PERMANENTLY in the outbox — nobody was notified that an Owner had
 * pushed a dispatch past a federal CDL / DOT-medical stop, and the failure itself was invisible.
 *
 * WHAT IT ENFORCES: every event_type PRODUCED by an outbox INSERT in book-load.service.ts has a
 * handler registered in the outbox registry. Derived from the producers rather than hardcoded, so a
 * NEW override type added tomorrow without a consumer fails this guard instead of failing silently in
 * production — the ratchet, not a snapshot of today's three.
 */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import path from "node:path";

const LABEL = "verify:wf064-override-notice-consumer";
const PRODUCER = "apps/backend/src/dispatch/book-load.service.ts";
const REGISTRY = "apps/backend/src/outbox/handlers/registry.ts";
const HANDLER_DIR = "apps/backend/src/outbox/handlers";

/** Event types this producer enqueues, e.g. "dispatch.wf064.override_notice". */
export function producedEventTypes(src) {
  const out = new Set();
  for (const m of String(src).matchAll(/"(dispatch\.wf064\.[a-z0-9_.]+)"/g)) out.add(m[1]);
  return out;
}

/** Event types the registry can dispatch: any handler's `eventType = "..."`. */
export function registeredEventTypes(files) {
  const out = new Set();
  for (const [file, src] of Object.entries(files)) {
    if (!file.startsWith(HANDLER_DIR) || src == null) continue;
    for (const m of String(src).matchAll(/eventType\s*=\s*"([^"]+)"/g)) out.add(m[1]);
  }
  return out;
}

export function analyse(files) {
  const problems = [];
  const producer = files[PRODUCER];
  const registry = files[REGISTRY];
  if (producer == null) return [`${PRODUCER} is missing — cannot derive the produced event types.`];
  if (registry == null) return [`${REGISTRY} is missing.`];

  const produced = producedEventTypes(producer);
  const registered = registeredEventTypes(files);

  for (const evt of produced) {
    if (!registered.has(evt)) {
      problems.push(
        `"${evt}" is enqueued by ${PRODUCER} but NO handler declares it. processor.ts calls ` +
          `markFailedNow() for an unregistered event_type, so every one of these events fails ` +
          `permanently and nobody is notified — the live 2026-08-02 defect.`
      );
    }
    // Registered is not enough: the class must actually be wired into the registry array.
    const cls = Object.entries(files).find(
      ([f, s]) => f.startsWith(HANDLER_DIR) && s != null && s.includes(`eventType = "${evt}"`)
    );
    if (cls) {
      const name = /export class (\w+)/.exec(cls[1]);
      if (name && !new RegExp(`new ${name[1]}\\s*\\(`).test(registry)) {
        problems.push(
          `${name[1]} declares "${evt}" but is not constructed in ${REGISTRY}. A handler file that ` +
            `exists but is never registered is the same failure with extra steps.`
        );
      }
    }
  }
  return problems;
}

function readAll() {
  const out = {
    [PRODUCER]: existsSync(PRODUCER) ? readFileSync(PRODUCER, "utf8") : null,
    [REGISTRY]: existsSync(REGISTRY) ? readFileSync(REGISTRY, "utf8") : null,
  };
  if (existsSync(HANDLER_DIR)) {
    for (const n of readdirSync(HANDLER_DIR)) {
      if (!n.endsWith(".ts") || n.includes(".test.")) continue;
      const p = path.join(HANDLER_DIR, n);
      out[p] = readFileSync(p, "utf8");
    }
  }
  return out;
}

function selftest() {
  const failures = [];
  const t = (l, c) => { if (!c) failures.push(l); };
  const H = `${HANDLER_DIR}/x.handler.ts`;
  const prod = 'client.query(`INSERT INTO outbox.outbox_queue ...`, ["dispatch.wf064.override_notice"])';
  const handler = 'export class XHandler { eventType = "dispatch.wf064.override_notice"; }';
  const reg = "new XHandler(),";

  t("produced + handled + registered passes", analyse({ [PRODUCER]: prod, [REGISTRY]: reg, [H]: handler }).length === 0);
  // The REAL pre-fix state: produced, no handler anywhere.
  t("produced with NO handler FAILS", analyse({ [PRODUCER]: prod, [REGISTRY]: "", [H]: "nothing" }).length === 1);
  // Handler file exists but is never constructed.
  t("handler present but not registered FAILS", analyse({ [PRODUCER]: prod, [REGISTRY]: "", [H]: handler }).length === 1);
  // The ratchet: a NEW wf064 event with no consumer must fail too.
  t("a NEW unconsumed wf064 event FAILS",
    analyse({ [PRODUCER]: `${prod}; "dispatch.wf064.brand_new"`, [REGISTRY]: reg, [H]: handler }).length === 1);
  t("missing producer FAILS", analyse({ [PRODUCER]: null, [REGISTRY]: reg, [H]: handler }).length === 1);

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:\n  - ${failures.join("\n  - ")}`);
    process.exit(1);
  }
  return failures;
}

if (process.argv.includes("--selftest")) {
  selftest();
  console.log(`${LABEL} selftest OK — 5 cases (1 pass-shape, 4 fail-shapes incl. the real defect and the ratchet)`);
  process.exit(0);
}
const problems = analyse(readAll());
if (problems.length) {
  console.error(`${LABEL} FAILED:\n  - ${problems.join("\n  - ")}`);
  process.exit(1);
}
console.log(`${LABEL} OK — every wf064 event produced by book-load has a registered consumer`);
