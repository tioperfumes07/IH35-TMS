#!/usr/bin/env node
/**
 * verify-fleet-edit-save-wired.mjs (BUG-FLEET-EDIT-SAVE)
 * The Edit Vehicle / Edit Trailer modal Save must actually fire its update mutation,
 * surface failures (onError), and never be a permanently-disabled no-op gated only on
 * an empty diff. Guards against regression to the silent no-op GUARD found live.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

const files = [
  { f: "apps/frontend/src/components/fleet/EditVehicleModal.tsx", api: "patchUnit" },
  { f: "apps/frontend/src/components/fleet/EditTrailerModal.tsx", api: "patchTrailer" },
];

function audit(entries) {
  const errors = [];
  for (const { f, api, src } of entries) {
  if (!new RegExp(`mutationFn:\\s*\\(\\)\\s*=>\\s*${api}`).test(src))
    errors.push(`${f}: saveMutation.mutationFn must call ${api}.`);
  if (!src.includes("saveMutation.mutate()"))
    errors.push(`${f}: Save button must call saveMutation.mutate().`);
  if (!/onError:/.test(src))
    errors.push(`${f}: saveMutation must have an onError handler (surface failures).`);
  // Save must not be disabled solely on an empty diff (dead-button no-op).
  if (/disabled=\{[^}]*(dirtyCount === 0|patchPayload\)\.length === 0)[^}]*\}/.test(src))
    errors.push(`${f}: Save button must not be disabled on an empty diff — handle the no-change case in onClick (onClose), not by disabling.`);
  }
  return errors;
}

const sources = files.map(({ f, api }) => ({ f, api, src: read(f) }));

if (process.argv.includes("--selftest")) {
  const fixtures = [];
  for (const [index, entry] of sources.entries()) {
    const other = sources[1 - index];
    const mutationSources = [
      entry.src.replace(`mutationFn: () => ${entry.api}`, "mutationFn: () => Promise.resolve"),
      entry.src.replace("saveMutation.mutate()", "onClose()"),
      entry.src.replace("onError:", "onSettled:"),
      index === 0
        ? entry.src.replace("disabled={saveMutation.isPending", "disabled={dirtyCount === 0 || saveMutation.isPending")
        : entry.src.replace("disabled={profileQuery.isError", "disabled={Object.keys(patchPayload).length === 0 || profileQuery.isError"),
    ];
    for (const mutated of mutationSources) {
      fixtures.push(index === 0 ? [{ ...entry, src: mutated }, other] : [other, { ...entry, src: mutated }]);
    }
  }
  const escaped = fixtures.filter((fixture) => audit(fixture).length === 0);
  if (audit(sources).length || escaped.length) {
    console.error(`verify-fleet-edit-save-wired selftest FAIL — ${escaped.length} of 8 mutations escaped`);
    process.exit(1);
  }
  console.log("verify-fleet-edit-save-wired selftest PASS — 8/8 unit/trailer save regressions detected");
  process.exit(0);
}

const errors = audit(sources);
if (errors.length > 0) {
  console.error("verify-fleet-edit-save-wired FAIL:");
  for (const e of errors) console.error(`  • ${e}`);
  process.exit(1);
}
console.log("verify-fleet-edit-save-wired OK — fleet Edit Save fires the mutation + onError, no dead-button.");
