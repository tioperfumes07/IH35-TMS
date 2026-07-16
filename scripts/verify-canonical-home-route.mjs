#!/usr/bin/env node
/**
 * verify-canonical-home-route.mjs
 *
 * Locks audit gap #12: Sidebar HOME and design MODULE 1 share ONE canonical path `/home`.
 * `/app/homepage` may exist only as an additive Navigate redirect to `/home` (bookmark compat).
 * Dual-home drift (sidebar → /app/homepage while training uses /home) must not return.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const CANONICAL_HOME = "/home";
const LEGACY_ALIAS = "/app/homepage";

const sidebarPath = path.join(ROOT, "apps/frontend/src/components/layout/sidebar-config.ts");
const routesPath = path.join(ROOT, "apps/frontend/src/routes/manifest.tsx");
const ownerHomePath = path.join(ROOT, "apps/frontend/src/pages/home/OwnerHome.tsx");
const qboHomePath = path.join(ROOT, "apps/frontend/src/pages/home/QboStyleHomePage.tsx");

const errors = [];

function read(p) {
  if (!fs.existsSync(p)) {
    errors.push(`missing file: ${path.relative(ROOT, p)}`);
    return "";
  }
  return fs.readFileSync(p, "utf8");
}

const sidebar = read(sidebarPath);
const routes = read(routesPath);

// 1) Sidebar HOME item must target canonical /home
const homeMeta = sidebar.match(/home:\s*\{\s*id:\s*"home"[\s\S]*?to:\s*"([^"]+)"/);
if (!homeMeta) {
  errors.push('sidebar-config: could not find home item `to: "..."` in SIDEBAR_ITEM_META');
} else if (homeMeta[1] !== CANONICAL_HOME) {
  errors.push(
    `sidebar HOME to="${homeMeta[1]}" — expected canonical "${CANONICAL_HOME}" (not ${LEGACY_ALIAS})`
  );
}

// 2) /home route must exist and not redirect to the legacy alias
if (!/path=["']\/home["']/.test(routes)) {
  errors.push(`manifest: missing route path="${CANONICAL_HOME}"`);
} else {
  const homeBlock = routes.match(/path=["']\/home["'][\s\S]{0,400}/);
  if (homeBlock && /<Navigate\s+to=["']\/app\/homepage["']/.test(homeBlock[0])) {
    errors.push(`manifest: ${CANONICAL_HOME} must not redirect to ${LEGACY_ALIAS}`);
  }
  if (!/HomeRoute|OwnerHome|HomePage/.test(routes)) {
    errors.push("manifest: /home must render HomeRoute / OwnerHome / HomePage family");
  }
}

// 3) /app/homepage must remain as additive redirect → /home (never delete the URL door)
const aliasIdx = routes.search(/path=["']\/app\/homepage["']/);
if (aliasIdx === -1) {
  errors.push(
    `manifest: missing additive alias path="${LEGACY_ALIAS}" (keep as Navigate → ${CANONICAL_HOME}; never delete)`
  );
} else {
  const aliasSlice = routes.slice(aliasIdx, aliasIdx + 350);
  if (!/<Navigate\s+to=["']\/home["']/.test(aliasSlice)) {
    errors.push(
      `manifest: ${LEGACY_ALIAS} must <Navigate to="${CANONICAL_HOME}" replace /> (bookmark alias, not a second home)`
    );
  }
  if (/QboHomepageRoute|QboStyleHomePage/.test(aliasSlice)) {
    errors.push(
      `manifest: ${LEGACY_ALIAS} must not mount QboStyleHomePage — that recreates dual-home drift`
    );
  }
}

// 4) Never-delete: both home page modules stay on disk
if (!fs.existsSync(ownerHomePath)) {
  errors.push("never-delete: OwnerHome.tsx missing");
}
if (!fs.existsSync(qboHomePath)) {
  errors.push("never-delete: QboStyleHomePage.tsx missing (retain file even when /app/homepage redirects)");
}

// 5) Forbid sidebar pointing at the legacy alias for home id
if (/home:\s*\{[^}]*to:\s*"\/app\/homepage"/.test(sidebar)) {
  errors.push(`sidebar-config: home must not use to="${LEGACY_ALIAS}"`);
}

if (errors.length > 0) {
  console.error("verify-canonical-home-route FAIL:");
  for (const e of errors) console.error(`  • ${e}`);
  process.exit(1);
}

console.log(
  `verify-canonical-home-route OK — sidebar HOME → ${CANONICAL_HOME}; ${LEGACY_ALIAS} redirects to ${CANONICAL_HOME}; OwnerHome + QboStyleHomePage files retained.`
);
