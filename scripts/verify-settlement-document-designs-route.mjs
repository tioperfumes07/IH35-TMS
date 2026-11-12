#!/usr/bin/env node
/**
 * Settlement Document Designs (ROUND 8.12) — approved print specimens must stay mounted
 * under Settlements with a subnav item and public HTML asset.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const LABEL = "verify-settlement-document-designs-route";

const FILES = {
  page: "apps/frontend/src/pages/driver-finance/SettlementDocumentDesignsPage.tsx",
  manifest: "apps/frontend/src/routes/manifest.tsx",
  subnav: "apps/frontend/src/pages/driver-finance/settlementsSubnav.ts",
  html: "apps/frontend/public/design/settlement-document-designs.html",
};

function read(rel) {
  const full = path.join(ROOT, rel);
  if (!fs.existsSync(full)) return null;
  return fs.readFileSync(full, "utf8");
}

export function assertSettlementDocumentDesignsRoute(sources = {}) {
  const failures = [];
  const page = sources.page ?? read(FILES.page) ?? "";
  const manifest = sources.manifest ?? read(FILES.manifest) ?? "";
  const subnav = sources.subnav ?? read(FILES.subnav) ?? "";
  const htmlOk = sources.htmlExists ?? fs.existsSync(path.join(ROOT, FILES.html));

  if (!page) failures.push(`${FILES.page}: missing`);
  if (!/settlement-document-designs-page/.test(page)) {
    failures.push(`${FILES.page}: must expose data-testid="settlement-document-designs-page"`);
  }
  if (!/\/design\/settlement-document-designs\.html/.test(page)) {
    failures.push(`${FILES.page}: iframe must load /design/settlement-document-designs.html`);
  }
  if (!/SettlementsModuleShell/.test(page) || !/backTo="\/driver-finance\/settlements"/.test(page)) {
    failures.push(`${FILES.page}: must mount SettlementsModuleShell with backTo settlements home`);
  }
  if (!/path="\/driver-finance\/settlements\/document-designs"/.test(manifest)) {
    failures.push(`${FILES.manifest}: missing /driver-finance/settlements/document-designs route`);
  }
  if (!/SettlementDocumentDesignsPage/.test(manifest)) {
    failures.push(`${FILES.manifest}: must lazy-load SettlementDocumentDesignsPage`);
  }
  if (!/Document Designs/.test(subnav) || !/document-designs/.test(subnav)) {
    failures.push(`${FILES.subnav}: Document Designs subnav item required`);
  }
  if (!htmlOk) failures.push(`${FILES.html}: approved HTML asset missing`);
  return failures;
}

function selftest() {
  const good = {
    page: `export function SettlementDocumentDesignsPage() {
      return (
        <SettlementsModuleShell showBack backLabel="Settlements" backTo="/driver-finance/settlements">
          <div data-testid="settlement-document-designs-page">
            <iframe src="/design/settlement-document-designs.html" />
          </div>
        </SettlementsModuleShell>
      );
    }`,
    manifest: `path="/driver-finance/settlements/document-designs" element={<SettlementDocumentDesignsPage />}`,
    subnav: `{ label: "Document Designs", to: "/driver-finance/settlements/document-designs" }`,
    htmlExists: true,
  };
  const badMissingRoute = { ...good, manifest: `path="/driver-finance/settlements"` };
  const checks = [
    ["clean passes", assertSettlementDocumentDesignsRoute(good).length === 0],
    ["missing route fails", assertSettlementDocumentDesignsRoute(badMissingRoute).length > 0],
  ];
  const failed = checks.filter(([, ok]) => !ok);
  if (failed.length) {
    console.error(`${LABEL} --selftest FAIL:`);
    for (const [name] of failed) console.error(`  ✗ ${name}`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS (${checks.length} checks)`);
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  const failures = assertSettlementDocumentDesignsRoute();
  if (failures.length) {
    console.error(`${LABEL}: FAIL`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL}: PASS — Document Designs route + subnav + HTML asset mounted`);
}
