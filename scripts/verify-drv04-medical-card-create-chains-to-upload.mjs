#!/usr/bin/env node
/**
 * DRV-04 — "Safety > Driver Files > Driver Safety Cards: 'Add DOT Medical Card' has NOWHERE to
 * upload the document." (owner, Coronado Neftali, 2026-09-03).
 *
 * Root cause: MedicalCardsHistorySection's "Add DOT medical card" create form has no file field
 * (a medical card's docs.file_links target only exists once the row is saved), and the row-level
 * Upload button only appears back in the table — a first-time user who just saved a card had no
 * visible next step. Fix: the create mutation's onSuccess chains straight into the same,
 * already-working per-row UploadModal by setting uploadCardId to the newly created row's id.
 *
 * This guard locks that chain in place: it fails if setUploadCardId(...) is ever removed from
 * createMutation's onSuccess, or if it stops using the freshly created row's id.
 */
import fs from "node:fs";

const REL = "apps/frontend/src/components/safety/MedicalCardsHistorySection.tsx";

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

  if (!/setUploadCardId\(\s*result\.id\s*\)/.test(body)) {
    failures.push(`${REL}: createMutation.onSuccess no longer chains into setUploadCardId(result.id) — DRV-04 regressed, a saved card has no visible upload step again`);
  }
  if (!/setOpen\(false\)/.test(body)) {
    failures.push(`${REL}: createMutation.onSuccess no longer closes the create drawer — unexpected structural change, re-verify DRV-04's fix still applies`);
  }

  return failures;
}

function selftest() {
  const path = new URL(import.meta.url).pathname;
  const dir = fs.mkdtempSync("/tmp/drv04-guard-selftest-");
  const tmpFile = `${dir}/${REL}`;
  fs.mkdirSync(tmpFile.slice(0, tmpFile.lastIndexOf("/")), { recursive: true });

  const fixedSnippet = `
export function MedicalCardsHistorySection() {
  const createMutation = useMutation({
    mutationFn: () => createSafetyMedicalCard(),
    onSuccess: async (result, input) => {
      if (input.generation !== companyGenerationRef.current) return;
      companyGenerationRef.current += 1;
      setOpen(false);
      setSelectedDriverId(driverId ?? "");
      await queryClient.invalidateQueries({ queryKey: ["safety", "medical-cards", input.companyId] });
      setUploadCardId(result.id);
    },
  });
}
`;
  fs.writeFileSync(tmpFile, fixedSnippet);
  const passFailures = run(dir);
  if (passFailures.length) throw new Error("PASS fail (should be clean): " + JSON.stringify(passFailures));

  // Mutation: strip the chain-to-upload call — the exact DRV-04 regression.
  const broken = fixedSnippet.replace("      setUploadCardId(result.id);\n", "");
  fs.writeFileSync(tmpFile, broken);
  const f1 = run(dir);
  if (f1.length === 0) throw new Error("FAIL to catch: removing setUploadCardId(result.id) went undetected");

  fs.rmSync(dir, { recursive: true, force: true });
  console.log("verify-drv04-medical-card-create-chains-to-upload SELFTEST PASS");
  void path;
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const failures = run();
if (failures.length) {
  console.error("verify-drv04-medical-card-create-chains-to-upload FAILED:");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("verify-drv04-medical-card-create-chains-to-upload OK — saving a new DOT medical card immediately opens its upload step");
