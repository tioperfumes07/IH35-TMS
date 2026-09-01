// scripts/_lib/selftest-safe-mutation.mjs
// Canonical fix for GUARD-SELFTEST-MUTATES-SOURCE (docs/bus/GUARD-SELFTEST-MUTATES-SOURCE-2026-08-31.md):
// 611 guard scripts' --selftest handlers both plant a failure AND writeFileSync — 401 restore in a
// `finally`, 210 have none. Even the 401-with-a-finally still corrupt the shared working tree on
// SIGKILL: a `finally` cannot run through a kill signal, full stop. Root cause: the selftest mutates
// TRACKED SOURCE at all. The fix is one rule, not more finally blocks:
//
//   A selftest must never mutate tracked source. Copy the target to a temp path, plant the failure
//   in the copy, assert against the copy. Nothing in the working tree is ever touched.
//
// This helper is that copy-to-temp pattern, written once, so every selftest can call it instead of
// hand-rolling its own read/write/restore dance:
//
//   import { withMutatedCopy } from "./_lib/selftest-safe-mutation.mjs";
//
//   await withMutatedCopy(realPath, (source) => source.replace(/foo/, "bar"), (mutatedPath) => {
//     const result = check({ overridePath: mutatedPath }); // whatever the guard's check() accepts
//     assert(...);
//   });
//
// The real file is opened read-only and never written. The mutated copy lives at a fresh
// `mkdtempSync(os.tmpdir())` directory for the lifetime of the callback and is removed:
//   - normally, in a `finally` (the common case — no kill involved);
//   - on SIGTERM and SIGINT, which CAN be caught (unlike SIGKILL, which cannot be caught by any
//     process, ever — that is exactly why the temp dir lives outside the tracked tree in the first
//     place: even an uncaught SIGKILL leaves at worst an orphaned /tmp directory, never a corrupted
//     source file in the shared repo).
// A SIGKILL still leaves the temp dir behind (nothing can prevent that — it is not catchable), but
// it can NEVER leave `apps/`/`packages/` mutated, because this helper never writes there.
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

/**
 * Run `useFn(mutatedFilePath)` against a temp copy of `realPath`, transformed by `transformFn`.
 * The real file is only ever read, never written. The temp copy (and its containing directory) is
 * removed on normal completion, on a thrown error, and on SIGTERM/SIGINT — never on SIGKILL, which
 * no process can intercept; that is an accepted, harmless orphaned-tmp-dir cost, not a tracked-
 * source corruption risk.
 *
 * @param {string} realPath - absolute path to the real, tracked source file (read-only).
 * @param {(source: string) => string} transformFn - produces the planted-failure content.
 * @param {(mutatedPath: string, mutatedContent: string) => (void | Promise<void>)} useFn - runs the
 *   actual assertion against the mutated COPY. Receives the temp file's path and its content.
 * @returns {Promise<void>}
 */
export async function withMutatedCopy(realPath, transformFn, useFn) {
  const original = readFileSync(realPath, "utf8");
  const mutated = transformFn(original);
  const tmpDir = mkdtempSync(path.join(tmpdir(), "ih35-selftest-"));
  const tmpPath = path.join(tmpDir, path.basename(realPath));

  const cleanup = () => {
    try {
      rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // best-effort — a leftover /tmp dir is harmless; a leftover mutation in apps/ or packages/
      // is not, and this helper never creates the latter.
    }
  };
  const onSignal = (signal) => {
    cleanup();
    // Re-raise the default behavior for the signal instead of swallowing it silently.
    process.kill(process.pid, signal);
  };
  process.once("SIGTERM", onSignal);
  process.once("SIGINT", onSignal);

  try {
    writeFileSync(tmpPath, mutated, "utf8");
    await useFn(tmpPath, mutated);
  } finally {
    cleanup();
    process.removeListener("SIGTERM", onSignal);
    process.removeListener("SIGINT", onSignal);
  }
}

/**
 * Convenience variant for the common "check() takes a directory root, not a single file path"
 * shape: copies the WHOLE containing directory of `realPath` into a temp dir (shallow — only the
 * one file's siblings needed for the check should be copied by the caller via `extraFiles`, kept
 * intentionally minimal rather than recursively cloning the whole repo tree for every selftest).
 *
 * @param {string} realPath
 * @param {(source: string) => string} transformFn
 * @param {(mutatedDir: string, mutatedFilePath: string) => (void | Promise<void>)} useFn
 */
export async function withMutatedCopyInTempDir(realPath, transformFn, useFn) {
  return withMutatedCopy(realPath, transformFn, async (tmpPath) => {
    await useFn(path.dirname(tmpPath), tmpPath);
  });
}
