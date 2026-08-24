#!/usr/bin/env node
/**
 * verify-user-detail-event-mutation-errors-surfaced.mjs (USER-F6324, verify-step 4654)
 *
 * Root cause: `apps/frontend/src/pages/UserDetail.tsx`'s "Void Event" and "Update Event" modal
 * forms (dispatcher safety events) both did a bare `await voidEventMutation.mutateAsync(...)` /
 * `await updateEventMutation.mutateAsync(...)` inside their `onSubmit` handlers with NO
 * try/catch, and neither mutation had `onError`. This is a different instance of the same file's
 * OWN already-correct pattern: the sibling `createEventMutation` DOES wrap its `mutateAsync` call
 * in try/catch and surfaces failures via `pushToast` — proving the toast convention was already
 * established in this exact file, just not applied to these two mutations. On a rejected
 * void/update this was a silent no-op: the modal just sat there with no explanation.
 *
 * Fix: added `onError: (err) => pushToast(userFacingApiError(err, "..."), "error")` to both
 * mutations.
 *
 * Usage:
 *   node scripts/verify-user-detail-event-mutation-errors-surfaced.mjs            # scan
 *   node scripts/verify-user-detail-event-mutation-errors-surfaced.mjs --selftest # regression harness
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const FILE = "apps/frontend/src/pages/UserDetail.tsx";

const IMPORTS_ERROR_HELPER_RE = /import\s*\{[^}]*\buserFacingApiError\b[^}]*\}\s*from\s*["']\.\.\/lib\/api-error-message["']/;
const MUTATIONS = ["voidEventMutation", "updateEventMutation"];

function extractMutationBlock(src, mutationName) {
  const startRe = new RegExp(`const ${mutationName} = useMutation\\(\\{`);
  const m = startRe.exec(src);
  if (!m) return null;
  const closeIdx = src.indexOf("\n  });", m.index);
  if (closeIdx === -1) return null;
  return src.slice(m.index, closeIdx);
}

export function checkUserDetailEventMutationErrors(src) {
  const offenders = [];
  if (!IMPORTS_ERROR_HELPER_RE.test(src)) {
    offenders.push(`${FILE}: does not import userFacingApiError from ../lib/api-error-message — USER-F6324 regression.`);
  }
  for (const name of MUTATIONS) {
    const block = extractMutationBlock(src, name);
    if (!block || !/onError:/.test(block)) {
      offenders.push(`${FILE}: ${name} has no onError — a rejected void/update will silently do nothing again.`);
    }
  }
  return offenders;
}

export function run() {
  const src = fs.readFileSync(path.join(repoRoot, FILE), "utf8");
  const offenders = checkUserDetailEventMutationErrors(src);
  return { ok: offenders.length === 0, offenders };
}

if (process.argv.includes("--selftest")) {
  const buggy = `
    const voidEventMutation = useMutation({
      mutationFn: ({ id, reason }) => voidDispatcherSafetyEvent(userId, id, reason),
      onSuccess: () => {
        setVoidEventId(null);
        pushToast("Event voided", "info");
      },
    });
    const updateEventMutation = useMutation({
      mutationFn: (payload) => updateDispatcherSafetyEvent(userId, payload.eventId, {}),
      onSuccess: () => {
        setEditEventId(null);
        pushToast("Event updated", "success");
      },
    });
  `;
  const fixed = fs.readFileSync(path.join(repoRoot, FILE), "utf8");

  const buggyOffenders = checkUserDetailEventMutationErrors(buggy);
  const fixedOffenders = checkUserDetailEventMutationErrors(fixed);

  if (buggyOffenders.length >= 3 && fixedOffenders.length === 0) {
    console.log("verify-user-detail-event-mutation-errors-surfaced selftest OK");
    process.exit(0);
  }
  console.error("verify-user-detail-event-mutation-errors-surfaced selftest FAILED", {
    buggyOffenders,
    fixedOffenders,
  });
  process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { ok, offenders } = run();
  if (!ok) {
    console.error(
      "verify-user-detail-event-mutation-errors-surfaced FAIL:\n  " + offenders.map((o) => "✗ " + o).join("\n  "),
    );
    process.exit(1);
  }
  console.log(
    "verify-user-detail-event-mutation-errors-surfaced OK — void/update event mutations surface failures via toast, never a silent no-op",
  );
}
