#!/usr/bin/env node
// CHAT-2 backend contract guard. Locks the invariants that keep the dispatch chat correct + safe:
//   1. every chat route (app.get/app.post) passes a rate-limit config (the #1757 CodeQL lesson).
//   2. seq is server-authoritative + gap-free: the service locks the thread row (FOR UPDATE) and
//      increments last_seq — and NEVER computes MAX(seq)+1 in app code.
//   3. dedup-before-seq: the client_key dedup SELECT precedes the last_seq increment (a retry burns no seq).
//   4. hash-chain reuse: emits via events.log_event(...) and NEVER does a direct INSERT INTO events.event_log.
//   5. event subject_type is 'load'/'driver' (the spine CHECK excludes 'message') — no `subject_id=message`.
//   6. append-only: no DELETE FROM chat.* in the service or routes.
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const LABEL = "verify-chat-backend-contract";
const SERVICE = "apps/backend/src/chat/chat.service.ts";
const ROUTES = "apps/backend/src/chat/chat.routes.ts";
const read = (rel) => (fs.existsSync(path.join(ROOT, rel)) ? fs.readFileSync(path.join(ROOT, rel), "utf8") : "");

const svc = read(SERVICE);
const rts = read(ROUTES);
const failures = [];
if (!svc) failures.push(`missing ${SERVICE}`);
if (!rts) failures.push(`missing ${ROUTES}`);

if (svc && rts) {
  // 1. every route has a rate-limit config argument.
  const routeCalls = [...rts.matchAll(/app\.(get|post)\(\s*("[^"]+")\s*,\s*([^,]+),/g)];
  if (routeCalls.length === 0) failures.push("no chat routes found (expected app.get/app.post with a config arg)");
  for (const m of routeCalls) {
    const arg2 = m[3].trim();
    if (!/^RL\b|^RL_WRITE\b/.test(arg2)) failures.push(`route ${m[2]} missing rate-limit config (2nd arg = ${arg2.slice(0, 24)}…)`);
  }
  if (!/rateLimit:\s*\{\s*max:/.test(rts)) failures.push("no rateLimit config object defined in routes");

  // 2. seq via row lock + increment; never MAX(seq).
  if (!/FOR UPDATE/.test(svc)) failures.push("seq must be assigned under a thread row lock (SELECT … FOR UPDATE) — not found");
  if (!/last_seq\s*=\s*\$?\d/.test(svc) && !/SET last_seq/.test(svc)) failures.push("last_seq increment not found");
  if (/MAX\s*\(\s*seq/i.test(svc)) failures.push("MAX(seq) detected — seq must come from the thread last_seq counter, not MAX+1");

  // 3. dedup-before-seq ordering.
  const dupIdx = svc.search(/client_key\s*=\s*\$2/);
  const seqIdx = svc.search(/SET last_seq/);
  if (dupIdx === -1) failures.push("client_key dedup SELECT not found");
  else if (seqIdx !== -1 && dupIdx > seqIdx) failures.push("dedup must run BEFORE the last_seq increment (else a retried client_key burns a seq → gap)");

  // 4. event_log reuse.
  if (!/events\.log_event\(/.test(svc)) failures.push("must emit via events.log_event(...) — not found");
  if (/INSERT\s+INTO\s+events\.event_log/i.test(svc)) failures.push("direct INSERT INTO events.event_log — must use events.log_event()");

  // 5. valid subject_type.
  if (/subject_id[^,]*message/i.test(svc)) failures.push("event subject must be load/driver (spine CHECK excludes 'message')");

  // 6. append-only.
  for (const [name, src] of [["service", svc], ["routes", rts]]) {
    if (/DELETE\s+FROM\s+chat\./i.test(src)) failures.push(`DELETE FROM chat.* in ${name} — chat is append-only (tombstone, never delete)`);
  }
}

if (failures.length) {
  console.error(`${LABEL} — FAILED`);
  for (const f of failures) console.error(`- ${f}`);
  process.exit(1);
}
const routeCount = [...rts.matchAll(/app\.(get|post)\(/g)].length;
console.log(`${LABEL} — OK (${routeCount} routes rate-limited, seq via FOR UPDATE lock + dedup-before-seq, events.log_event reuse, no direct event_log insert, append-only)`);
