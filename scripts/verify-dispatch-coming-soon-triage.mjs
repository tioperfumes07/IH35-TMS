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
    ['path="/dispatch/loads"', 'Navigate to="/dispatch?view=loads"'],
    ['path="/dispatch/incidents"', 'Navigate to="/dispatch/alerts"'],
    ['path="/dispatch/factoring-packets"', 'Navigate to="/accounting/factoring"'],
  ];
  for (const [routePath, target] of redirects) {
    if (!manifest.includes(routePath) || !manifest.includes(target)) {
      failures.push(`manifest missing redirect ${routePath} → ${target}`);
    }
  }

  if (!manifest.includes("function DispatchLoadDetailRedirect")) {
    failures.push("manifest missing DispatchLoadDetailRedirect helper");
  }
  if (!manifest.includes('path="/dispatch/loads/:id"')) {
    failures.push("manifest missing /dispatch/loads/:id deep-link alias");
  }
  if (!manifest.includes("load_id=${encodeURIComponent(id)}")) {
    failures.push("load detail alias must preserve load_id query param");
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
