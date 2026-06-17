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
const errors = [];

const files = [
  { f: "apps/frontend/src/components/fleet/EditVehicleModal.tsx", api: "patchUnit" },
  { f: "apps/frontend/src/components/fleet/EditTrailerModal.tsx", api: "patchTrailer" },
];

for (const { f, api } of files) {
  const src = read(f);
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

if (errors.length > 0) {
  console.error("verify-fleet-edit-save-wired FAIL:");
  for (const e of errors) console.error(`  • ${e}`);
  process.exit(1);
}
console.log("verify-fleet-edit-save-wired OK — fleet Edit Save fires the mutation + onError, no dead-button.");
