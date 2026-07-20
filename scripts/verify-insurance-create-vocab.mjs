#!/usr/bin/env node
/**
 * VISUAL-AUDIT-PUNCHLIST-2026-07-03 items 229–230 (§7 vocab):
 * Insurance ClaimsTab / LawsuitsTab primary CTAs must use "+ Create [object]", never bare "+ Claim" / "+ Lawsuit".
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const paths = {
  claimsTab: path.join(ROOT, "apps/frontend/src/pages/insurance/ClaimsTab.tsx"),
  lawsuitsTab: path.join(ROOT, "apps/frontend/src/pages/insurance/LawsuitsTab.tsx"),
  claimsTest: path.join(ROOT, "apps/frontend/src/pages/insurance/ClaimsTab.create-modal.test.tsx"),
  lawsuitsTest: path.join(ROOT, "apps/frontend/src/pages/insurance/LawsuitsTab.create-modal.test.tsx"),
};

function read(filePath) {
  if (!fs.existsSync(filePath)) throw new Error(`missing file: ${filePath}`);
  return fs.readFileSync(filePath, "utf8");
}

function nonCommentLines(src) {
  return src
    .split("\n")
    .filter((line) => !line.trim().startsWith("//") && !line.includes("{/*"));
}

/** @param {{ claimsTab: string; lawsuitsTab: string; claimsTest: string; lawsuitsTest: string }} sources */
export function collectFailures({ claimsTab, lawsuitsTab, claimsTest, lawsuitsTest }) {
  const failures = [];

  if (!claimsTab.includes("+ Create claim")) {
    failures.push("ClaimsTab primary CTA must say + Create claim");
  }
  if (nonCommentLines(claimsTab).some((line) => /"\+\s*Claim"/.test(line))) {
    failures.push("ClaimsTab must not render bare '+ Claim' button label");
  }
  if (!lawsuitsTab.includes("+ Create lawsuit")) {
    failures.push("LawsuitsTab primary CTA must say + Create lawsuit");
  }
  if (nonCommentLines(lawsuitsTab).some((line) => /"\+\s*Lawsuit"/.test(line))) {
    failures.push("LawsuitsTab must not render bare '+ Lawsuit' button label");
  }
  if (!claimsTest.includes("\\+ Create claim")) {
    failures.push("ClaimsTab.create-modal.test must click + Create claim");
  }
  if (!lawsuitsTest.includes("\\+ Create lawsuit")) {
    failures.push("LawsuitsTab.create-modal.test must click + Create lawsuit");
  }

  return failures;
}

function main() {
  const failures = collectFailures({
    claimsTab: read(paths.claimsTab),
    lawsuitsTab: read(paths.lawsuitsTab),
    claimsTest: read(paths.claimsTest),
    lawsuitsTest: read(paths.lawsuitsTest),
  });

  if (failures.length) {
    console.error("[verify-insurance-create-vocab] FAIL");
    for (const f of failures) console.error(` - ${f}`);
    process.exit(1);
  }

  console.log("[verify-insurance-create-vocab] OK");
}

main();
