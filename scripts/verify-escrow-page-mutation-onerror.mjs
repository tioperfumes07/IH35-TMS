#!/usr/bin/env node
// verify:escrow-page-mutation-onerror
// Guard for EscrowPage silent mutation failure.
//
// Selecting an escrow account fires postingsQuery.mutate(). Without onError a failed fetch is silent —
// the postings table stays empty with no user feedback. The single useMutation MUST carry onError with
// pushToast. Additive only. LINKAGE: escrow postings drill -> user feedback (toast).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const file = "apps/frontend/src/pages/accounting/EscrowPage.tsx";

if (process.argv.includes("--selftest")) {
  const good = `
import { useMutation } from "@tanstack/react-query";
import { useToast } from "../../components/Toast";
const { pushToast } = useToast();
const postingsQuery = useMutation({
  mutationFn: () => {},
  onError: (error) => pushToast(String((error as Error)?.message ?? "Failed"), "error"),
});
`;
  const bad = `
import { useMutation } from "@tanstack/react-query";
const postingsQuery = useMutation({ mutationFn: () => {} });
`;
  const check = (src, expectPass) => {
    const onErrorCount = (src.match(/onError\s*:/g) || []).length;
    const mutationCount = (src.match(/useMutation\(/g) || []).length;
    const ok =
      mutationCount === 1 &&
      onErrorCount >= mutationCount &&
      src.includes("pushToast") &&
      src.includes("useToast");
    if (ok !== expectPass) {
      console.error(`verify:escrow-page-mutation-onerror --selftest FAIL (expectPass=${expectPass})`);
      process.exit(1);
    }
  };
  check(good, true);
  check(bad, false);
  console.log("verify:escrow-page-mutation-onerror --selftest PASS");
  process.exit(0);
}

const src = fs.readFileSync(path.join(ROOT, file), "utf8");
const onErrorCount = (src.match(/onError\s*:/g) || []).length;
const mutationCount = (src.match(/useMutation\(/g) || []).length;

const failures = [];
if (mutationCount !== 1) {
  failures.push(`expected exactly 1 useMutation() call (postingsQuery), found ${mutationCount}.`);
}
if (onErrorCount < mutationCount) {
  failures.push(`each useMutation must have an onError: found ${onErrorCount} onError for ${mutationCount} mutations.`);
}
if (!src.includes("useToast")) {
  failures.push("missing useToast import — error feedback hook not wired.");
}
if (!src.includes("pushToast")) {
  failures.push("no pushToast — error feedback is not surfaced to the user.");
}

if (failures.length > 0) {
  console.error("verify:escrow-page-mutation-onerror FAIL:");
  for (const f of failures) console.error("  ✗ " + f);
  process.exit(1);
}
console.log(
  `verify:escrow-page-mutation-onerror PASS (${onErrorCount} onError handlers for ${mutationCount} mutations)`,
);
