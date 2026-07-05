#!/usr/bin/env node
// G10-H4 static guard — the generic catch in the QBO outbound-accounting push path must NOT retry an
// unknown / non-transient error forever. It has to gate on the SAME dead-letter threshold
// (shouldDeadLetterAccountingAttempt / ACCOUNTING_DEAD_LETTER_AFTER) that the known HTTP-error branches
// use, so unknown errors also stop after N attempts and dead-letter. This guard fails if the catch
// regresses to an unconditional `sync_status = 'pending'` reset.
import fs from "node:fs";
import path from "node:path";

const srcPath = path.join(process.cwd(), "apps/backend/src/integrations/qbo/sync-outbound-accounting.ts");

function fail(message) {
  console.error(`verify:qbo-outbound-generic-catch-deadletter — FAILED\n- ${message}`);
  process.exit(1);
}

if (!fs.existsSync(srcPath)) fail(`missing required file: ${srcPath}`);
const text = fs.readFileSync(srcPath, "utf8");

// 1. The shared threshold helper must exist and be exported (single source of truth).
if (!/export function shouldDeadLetterAccountingAttempt\s*\(/.test(text)) {
  fail("shared cap helper shouldDeadLetterAccountingAttempt(...) must be exported");
}

// 2. Isolate the final generic catch block (the one that ROLLBACKs and re-queues the row).
const catchIdx = text.lastIndexOf("} catch (err) {");
if (catchIdx < 0) fail("generic `} catch (err) {` block not found");
const finallyIdx = text.indexOf("} finally {", catchIdx);
if (finallyIdx < 0) fail("catch block not terminated by a finally");
const catchBlock = text.slice(catchIdx, finallyIdx);

// 3. That catch MUST consult the dead-letter cap …
if (!/shouldDeadLetterAccountingAttempt\s*\(/.test(catchBlock)) {
  fail("generic catch must gate on shouldDeadLetterAccountingAttempt (dead-letter cap)");
}
// … and be able to terminally dead-letter (not only re-queue as pending).
if (!/dead_letter/.test(catchBlock)) {
  fail("generic catch must be able to set sync_status = 'dead_letter' after the cap");
}
// 4. It must NOT hard-code an unconditional pending reset (the old infinite-retry bug).
if (/sync_status\s*=\s*'pending'\s*,/.test(catchBlock)) {
  fail("generic catch must not unconditionally reset sync_status to 'pending' (G10-H4 infinite retry)");
}

console.log("verify:qbo-outbound-generic-catch-deadletter — OK");
