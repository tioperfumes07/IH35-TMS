#!/usr/bin/env node
/**
 * Banking Full Audit FAIL-6 + FAIL-7, SUPERSEDED 2026-09-13 (ROUND-20.8 B3, coordinated with CC-3
 * ROUND 21.0 item 6 — "neither side deletes unilaterally", CC-3 shipped their side in #21952 and
 * explicitly deferred this half). The original ruling this guard enforced — "Factoring (Faro) is a
 * first-class Banking tab" — is REVERSED: Factoring owns its own module (16 tabs, now 6); a second
 * entry point inside Banking was a real duplicate, not two designs. Relay Card's own ruling is
 * UNCHANGED and still enforced below.
 *
 * Now asserts:
 *   - Relay Card stays a first-class Banking tab (unchanged from the original FAIL-7 ruling).
 *   - Factoring is NOT registered as a Banking tab id / BANKING_TAB_PATH key / activeTab body.
 *   - /banking/factoring still resolves (a redirect, not a 404 — routes/manifest.tsx) so an old
 *     bookmark/deep-link never dead-ends.
 *   - The Accounts tab's own read-only "Factoring · virtual bank" summary card, deep-linking into
 *     /factoring, still exists (Rule 07 additive — never delete the summary, only the duplicate tab).
 */
import fs from "node:fs";

const NAV = "apps/frontend/src/pages/banking/BANKING_NAV_CONFIG.ts";
const PATHS = "apps/frontend/src/router/route-manifest.ts";
const HOME = "apps/frontend/src/pages/banking/BankingHome.tsx";
const MANIFEST = "apps/frontend/src/routes/manifest.tsx";
const SIDEBAR = "apps/frontend/src/components/layout/sidebar-config.ts";

export function run(root = process.cwd()) {
  const failures = [];
  const nav = fs.readFileSync(`${root}/${NAV}`, "utf8");
  const paths = fs.readFileSync(`${root}/${PATHS}`, "utf8");
  const home = fs.readFileSync(`${root}/${HOME}`, "utf8");
  const manifest = fs.readFileSync(`${root}/${MANIFEST}`, "utf8");
  const sidebar = fs.readFileSync(`${root}/${SIDEBAR}`, "utf8");

  // Relay Card — unchanged, still a first-class tab.
  if (!nav.includes('id: "relay_card"')) failures.push("BANKING_MODULE_TABS missing relay_card");
  if (!paths.includes('relay_card: "/banking/relay"')) failures.push("BANKING_TAB_PATH missing relay_card");
  if (!paths.includes('pathname === "/banking/relay"')) failures.push("bankingTabFromPath missing relay");
  if (!manifest.includes('path="/banking/relay"')) failures.push("manifest missing /banking/relay");
  if (!home.includes('activeTab === "relay_card"')) failures.push("BankingHome missing relay_card tab body");
  if (!sidebar.includes("/banking/relay")) failures.push("sidebar bank flyout must include Relay");

  // Factoring — must NOT be a Banking tab anymore.
  if (nav.includes('id: "factoring"')) failures.push('BANKING_MODULE_TABS still registers a "factoring" tab id — B3 removed this');
  if (paths.includes('factoring: "/banking/factoring"')) failures.push("BANKING_TAB_PATH still maps factoring — B3 removed this key");
  if (home.includes('activeTab === "factoring"')) failures.push("BankingHome still branches on a factoring tab body — B3 removed this");

  // /banking/factoring must still resolve to SOMETHING (a redirect), never a bare 404.
  if (!manifest.includes('path="/banking/factoring"')) {
    failures.push("manifest must keep a /banking/factoring route (as a redirect) so old links don't 404");
  } else if (!/path="\/banking\/factoring"[\s\S]{0,200}?Navigate/.test(manifest)) {
    failures.push('/banking/factoring must render <Navigate .../>, not a live tab body');
  }

  // Accounts summary card — Rule 07 additive, never delete.
  if (!home.includes("Factoring · virtual bank")) failures.push("Accounts home Factoring card must remain (never delete)");
  if (!home.includes('to="/factoring"')) failures.push("Accounts home Factoring card must still deep-link into /factoring");

  return failures;
}

if (process.argv.includes("--selftest")) {
  const tmp = fs.mkdtempSync("/tmp/verify-banking-factoring-relay-");
  const files = {
    [NAV]: `id: "relay_card"\n`,
    [PATHS]: `relay_card: "/banking/relay"\npathname === "/banking/relay"\n`,
    [HOME]: `activeTab === "relay_card"\nto="/factoring"\nFactoring · virtual bank\n`,
    [MANIFEST]: `path="/banking/relay"\npath="/banking/factoring"\n<Navigate to="/banking" replace />\n`,
    [SIDEBAR]: `/banking/relay\n`,
  };
  const mk = (rel, body) => {
    const dir = `${tmp}/${rel.split("/").slice(0, -1).join("/")}`;
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(`${tmp}/${rel}`, body);
  };
  for (const [rel, body] of Object.entries(files)) mk(rel, body);
  if (run(tmp).length) throw new Error("expected PASS " + run(tmp).join(";"));

  // MUTATION — factoring tab id sneaks back into BANKING_MODULE_TABS.
  mk(NAV, `id: "relay_card"\nid: "factoring"\n`);
  if (!run(tmp).length) throw new Error("expected FAIL when factoring tab id is reintroduced");
  mk(NAV, files[NAV]);

  // MUTATION — the redirect route degrades into a bare mount with no <Navigate>.
  mk(MANIFEST, `path="/banking/relay"\npath="/banking/factoring"\n<BankingHomePage initialTab="factoring" />\n`);
  if (!run(tmp).length) throw new Error("expected FAIL when /banking/factoring stops redirecting");
  mk(MANIFEST, files[MANIFEST]);

  // MUTATION — the Accounts summary card is deleted.
  mk(HOME, `activeTab === "relay_card"\n`);
  if (!run(tmp).length) throw new Error("expected FAIL when the Accounts Factoring card is removed");

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log("verify-banking-factoring-relay-tabs --selftest OK (3/3 mutations caught)");
} else {
  const failures = run();
  if (failures.length) {
    console.error("verify-banking-factoring-relay-tabs FAIL:\n  " + failures.map((f) => "✗ " + f).join("\n  "));
    process.exit(1);
  }
  console.log("verify-banking-factoring-relay-tabs — OK (Relay Card first-class; Factoring tab removed per B3, redirect + summary card intact)");
}
