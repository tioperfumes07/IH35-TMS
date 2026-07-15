#!/usr/bin/env node
// B-B GUARD-THE-GUARD (static, no network) — keeps the frontend build-sha stamp + its CDN-cache fix in place
// so the "fixed in main but old frontend shows live" class (2026-07-15) cannot silently return.
// Asserts:
//   1. apps/frontend/vite.config.ts injects __APP_VERSION__ (a `define`) using the SAME precedence the backend
//      uses (RENDER_GIT_COMMIT → GITHUB_SHA → "dev") + .slice(0, 7), AND emits version.json into the bundle.
//   2. render.yaml keeps the frontend index.html "must-revalidate" cache header (the CDN sub-fix — do NOT drop).
// Pure checks are exported + covered by --self-test.
import fs from "node:fs";

export function checkViteConfig(src) {
  const s = String(src || "");
  const reasons = [];
  if (!/__APP_VERSION__/.test(s)) reasons.push("vite.config: missing __APP_VERSION__ injection");
  if (!/\bdefine\s*:/.test(s)) reasons.push("vite.config: missing a `define` block");
  if (!/RENDER_GIT_COMMIT/.test(s)) reasons.push("vite.config: build sha must read RENDER_GIT_COMMIT (mirror backend precedence)");
  if (!/GITHUB_SHA/.test(s)) reasons.push("vite.config: build sha must fall back to GITHUB_SHA");
  if (!/\.slice\(\s*0\s*,\s*7\s*\)/.test(s)) reasons.push("vite.config: sha must be .slice(0, 7) to match backend resolveBackendVersion()");
  if (!/version\.json/.test(s)) reasons.push("vite.config: must emit version.json (served frontend sha for the parity monitor)");
  return reasons;
}

export function checkRenderYaml(src) {
  const s = String(src || "");
  const reasons = [];
  // The app shell (index.html) must stay must-revalidate or a stale HTML can pin an old bundle at the CDN.
  if (!/must-revalidate/.test(s)) reasons.push("render.yaml: frontend index.html 'must-revalidate' cache header is missing (CDN could pin a stale shell)");
  return reasons;
}

function selfTest() {
  const good = {
    vite:
      'const buildVersion = (process.env.RENDER_GIT_COMMIT?.trim() || process.env.GITHUB_SHA?.trim() || "dev").slice(0, 7);\n' +
      'export default defineConfig({ define: { __APP_VERSION__: JSON.stringify(buildVersion) }, plugins: [ /* version.json */ ] });',
    render: 'headers:\n  - path: /index.html\n    value: "public, max-age=0, must-revalidate"',
  };
  const cases = [
    { name: "good vite -> 0 reasons", got: checkViteConfig(good.vite).length, want: 0 },
    { name: "vite missing define -> flagged", got: checkViteConfig("const x = process.env.RENDER_GIT_COMMIT; __APP_VERSION__; version.json GITHUB_SHA .slice(0, 7)").some((r) => /define/.test(r)), want: true },
    { name: "vite missing slice -> flagged", got: checkViteConfig("define: { __APP_VERSION__ } RENDER_GIT_COMMIT GITHUB_SHA version.json").some((r) => /slice/.test(r)), want: true },
    { name: "vite missing version.json -> flagged", got: checkViteConfig('define: { __APP_VERSION__ } RENDER_GIT_COMMIT GITHUB_SHA .slice(0, 7)').some((r) => /version\.json/.test(r)), want: true },
    { name: "good render -> 0 reasons", got: checkRenderYaml(good.render).length, want: 0 },
    { name: "render missing must-revalidate -> flagged", got: checkRenderYaml("headers: []").length, want: 1 },
  ];
  let failed = 0;
  for (const c of cases) {
    const ok = c.got === c.want;
    if (!ok) failed++;
    console.log(`${ok ? "ok  " : "FAIL"}  ${c.name}  (got ${JSON.stringify(c.got)}, want ${JSON.stringify(c.want)})`);
  }
  if (failed) { console.error(`\nself-test FAILED: ${failed}/${cases.length}`); process.exit(1); }
  console.log(`\nself-test PASS: ${cases.length}/${cases.length}`);
}

function main() {
  if (process.argv.includes("--self-test")) { selfTest(); return; }
  selfTest();
  const reasons = [];
  const read = (p) => { try { return fs.readFileSync(p, "utf8"); } catch { reasons.push(`missing file: ${p}`); return ""; } };
  reasons.push(...checkViteConfig(read("apps/frontend/vite.config.ts")));
  reasons.push(...checkRenderYaml(read("render.yaml")));
  if (reasons.length) {
    console.error("\nFAIL verify-frontend-version-stamp:");
    reasons.forEach((r) => console.error(`  • ${r}`));
    process.exit(1);
  }
  console.log("\nPASS verify-frontend-version-stamp — build sha injected + version.json emitted + CDN must-revalidate intact.");
}

main();
