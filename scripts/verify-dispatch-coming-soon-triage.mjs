#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.env.VERIFY_DISPATCH_COMING_SOON_ROOT ?? process.cwd();

const paths = {
  manifest: path.join(ROOT, "apps/frontend/src/routes/manifest.tsx"),
  sidebar: path.join(ROOT, "apps/frontend/src/components/layout/sidebar-config.ts"),
  allowlist: path.join(ROOT, "scripts/nav-integrity-allowlist.json"),
};

function read(filePath) {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : "";
}

function main() {
  const failures = [];
  const manifest = read(paths.manifest);
  const sidebar = read(paths.sidebar);
  const allowlist = JSON.parse(read(paths.allowlist) || "{}");

  const comingSoonBlock = manifest.match(/\{\[\s*([\s\S]*?)\]\.map\(\(path\) =>/);
  if (comingSoonBlock) {
    for (const legacy of ["/dispatch/loads", "/dispatch/factoring-packets", "/dispatch/incidents"]) {
      if (comingSoonBlock[1].includes(`"${legacy}"`)) {
        failures.push(`manifest ComingSoon catch-all still lists ${legacy}`);
      }
    }
  }

  const redirects = [
    ['path="/dispatch/incidents"', 'Navigate to="/dispatch/alerts"'],
    ['path="/dispatch/factoring-packets"', 'Navigate to="/accounting/factoring"'],
  ];
  for (const [routePath, target] of redirects) {
    if (!manifest.includes(routePath) || !manifest.includes(target)) {
      failures.push(`manifest missing redirect ${routePath} → ${target}`);
    }
  }

  // SWEEP-C5 — this section used to REQUIRE the defect it was written to prevent.
  //
  // Its original three assertions demanded `function DispatchLoadDetailRedirect`, a
  // `/dispatch/loads` → `Navigate to="/dispatch?view=loads"` hop, and the literal
  // "load_id=${encodeURIComponent(id)}". Together those pinned a canonical route whose entire body
  // was a bounce back to the query-param board: /dispatch/loads/:id passed every route audit and
  // then immediately threw the path param away. A guard that mandates the redirect is a guard that
  // makes the real route un-shippable, so it is repointed here — not relaxed. What it now forbids
  // is strictly MORE than what it forbade before: the bounce it once required is now a failure.
  if (!manifest.includes('path="/dispatch/loads"') || !manifest.includes("DispatchLoadsRoute")) {
    failures.push('manifest missing the canonical /dispatch/loads route (DispatchLoadsRoute)');
  }
  if (!manifest.includes('path="/dispatch/loads/:id"')) {
    failures.push("manifest missing /dispatch/loads/:id deep-link alias");
  }
  if (!manifest.includes("function DispatchLoadDetailRoute")) {
    failures.push("manifest missing DispatchLoadDetailRoute — the canonical load-detail route");
  }
  // The canonical detail route must RENDER the board, never Navigate away from its own path param.
  const detailBody = manifest.match(/function DispatchLoadDetailRoute\(\)\s*\{([\s\S]*?)\n\}/);
  if (detailBody && /Navigate\s+to=\{`\/dispatch\?load_id=/.test(detailBody[1])) {
    failures.push(
      "DispatchLoadDetailRoute bounces /dispatch/loads/:id back to /dispatch?load_id= — the canonical " +
        "route must render the board with the :id PATH param, not discard it (SWEEP-C5).",
    );
  }
  // Legacy bookmarks are additive-only: /loads/:id must still resolve, now onto the canonical path.
  if (!manifest.includes("function DispatchLoadLegacyPathRedirect")) {
    failures.push("manifest dropped DispatchLoadLegacyPathRedirect — legacy /loads/:id must keep resolving");
  }

  for (const label of ["Border Crossing", "Border History", "Factoring Packets"]) {
    if (!sidebar.includes(label)) {
      failures.push(`sidebar dispatch flyout missing "${label}" link`);
    }
  }

  const block43 = allowlist.BLOCK_43_TODO ?? [];
  for (const legacy of ["/dispatch/loads", "/dispatch/factoring-packets", "/dispatch/incidents"]) {
    const entry = block43.find((row) => row.path === legacy);
    if (entry && /ComingSoon stub/i.test(entry.reason)) {
      failures.push(`nav-integrity allowlist still marks ${legacy} as ComingSoon stub`);
    }
  }

  if (failures.length > 0) {
    console.error("verify:dispatch-coming-soon-triage FAILED");
    for (const failure of failures) console.error(` - ${failure}`);
    process.exit(1);
  }

  console.log("verify:dispatch-coming-soon-triage OK");
}

main();
