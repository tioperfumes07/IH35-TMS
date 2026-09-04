#!/usr/bin/env node
/**
 * DRV-07 — "Background and MVR checks: create screen cannot upload/save the document." Same
 * UPL-03 gap as DRV-04's medical card fix: BackgroundChecksSection's "Create background / MVR
 * check" form had no file field (a check's docs.file_links target only exists once the row is
 * saved), and the row-level Upload button only appears back in the table — a first-time user who
 * just saved a check had no visible next step. Fix: the create mutation's onSuccess chains
 * straight into the same, already-working per-row UploadModal by setting uploadCheckId to the
 * newly created row's id.
 *
 * This guard locks that chain in place: it fails if setUploadCheckId(...) is ever removed from
 * createMutation's onSuccess, or if it stops using the freshly created row's id.
 */
import fs from "node:fs";

const REL = "apps/frontend/src/components/safety/BackgroundChecksSection.tsx";

export function run(root = process.cwd()) {
  const failures = [];
  let src;
  try {
    src = fs.readFileSync(`${root}/${REL}`, "utf8");
  } catch {
    return [`${REL}: missing`];
  }

  const onSuccessMatch = src.match(/onSuccess:\s*async\s*\(result,\s*input\)\s*=>\s*\{([\s\S]*?)\n\s*\},/);
  if (!onSuccessMatch) {
    failures.push(`${REL}: createMutation.onSuccess(result, input) handler not found (was it renamed or restructured?)`);
    return failures;
  }
  const body = onSuccessMatch[1];

  if (!/setUploadCheckId\(\s*result\.id\s*\)/.test(body)) {
    failures.push(`${REL}: createMutation.onSuccess no longer chains into setUploadCheckId(result.id) — DRV-07 regressed, a saved check has no visible upload step again`);
  }
  if (!/setOpen\(false\)/.test(body)) {
    failures.push(`${REL}: createMutation.onSuccess no longer closes the create drawer — unexpected structural change, re-verify DRV-07's fix still applies`);
  }

  return failures;
}

function selftest() {
  const dir = fs.mkdtempSync("/tmp/drv07-guard-selftest-");
  const tmpFile = `${dir}/${REL}`;
  fs.mkdirSync(tmpFile.slice(0, tmpFile.lastIndexOf("/")), { recursive: true });

  const fixedSnippet = `
export function BackgroundChecksSection() {
  const createMutation = useMutation({
    mutationFn: () => createSafetyBackgroundCheck(),
    onSuccess: async (result, input) => {
      if (input.generation !== companyGenerationRef.current) return;
      companyGenerationRef.current += 1;
      setOpen(false);
      setSelectedDriverId(driverId ?? "");
      await queryClient.invalidateQueries({ queryKey: ["safety", "background-checks", input.companyId] });
      setUploadCheckId(result.id);
    },
  });
}
`;
  fs.writeFileSync(tmpFile, fixedSnippet);
  const passFailures = run(dir);
  if (passFailures.length) throw new Error("PASS fail (should be clean): " + JSON.stringify(passFailures));

  // Mutation: strip the chain-to-upload call — the exact DRV-07 regression.
  const broken = fixedSnippet.replace("      setUploadCheckId(result.id);\n", "");
  fs.writeFileSync(tmpFile, broken);
  const f1 = run(dir);
  if (f1.length === 0) throw new Error("FAIL to catch: removing setUploadCheckId(result.id) went undetected");

  fs.rmSync(dir, { recursive: true, force: true });
  console.log("verify-drv07-background-check-create-chains-to-upload SELFTEST PASS");
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const failures = run();
if (failures.length) {
  console.error("verify-drv07-background-check-create-chains-to-upload FAILED:");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("verify-drv07-background-check-create-chains-to-upload OK — saving a new background/MVR check immediately opens its upload step");
