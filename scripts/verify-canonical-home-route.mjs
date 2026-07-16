#!/usr/bin/env node
/**
 * verify-canonical-home-route.mjs
 *
 * Locks audit gap #12: Sidebar HOME and design MODULE 1 share ONE canonical path `/home`.
 * `/app/homepage` remains an additive reachable surface mounting QboStyleHomePage (C6 /
 * bookmarks) — never deleted, never orphaned. Training/sidebar HOME stays `/home`.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const CANONICAL_HOME = "/home";
const QBO_HOME = "/app/homepage";

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
    `sidebar HOME to="${homeMeta[1]}" — expected canonical "${CANONICAL_HOME}" (not ${QBO_HOME})`
  );
}

// 2) /home route must exist and not redirect to the QBO surface
if (!/path=["']\/home["']/.test(routes)) {
  errors.push(`manifest: missing route path="${CANONICAL_HOME}"`);
} else {
  const homeBlock = routes.match(/path=["']\/home["'][\s\S]{0,400}/);
  if (homeBlock && /<Navigate\s+to=["']\/app\/homepage["']/.test(homeBlock[0])) {
    errors.push(`manifest: ${CANONICAL_HOME} must not redirect to ${QBO_HOME}`);
  }
  if (!/HomeRoute|OwnerHome|HomePage/.test(routes)) {
    errors.push("manifest: /home must render HomeRoute / OwnerHome / HomePage family");
  }
}

// 3) /app/homepage must mount QboStyleHomePage (additive reachable surface — never orphan)
const aliasIdx = routes.search(/path=["']\/app\/homepage["']/);
if (aliasIdx === -1) {
  errors.push(
    `manifest: missing additive route path="${QBO_HOME}" (keep QboStyleHomePage mounted; never delete)`
  );
} else {
  const aliasSlice = routes.slice(aliasIdx, aliasIdx + 450);
  if (/<Navigate\s+to=["']\/home["']/.test(aliasSlice)) {
    errors.push(
      `manifest: ${QBO_HOME} must not bare-Navigate to ${CANONICAL_HOME} — that orphans QboStyleHomePage; mount QboHomepageRoute instead`
    );
  }
  if (!/QboHomepageRoute|QboStyleHomePage/.test(aliasSlice)) {
    errors.push(
      `manifest: ${QBO_HOME} must mount QboHomepageRoute / QboStyleHomePage (additive QBO-style home)`
    );
  }
  if (!/ProtectedRoute/.test(aliasSlice)) {
    errors.push(`manifest: ${QBO_HOME} must be wrapped in ProtectedRoute`);
  }
}

// 4) Never-delete: both home page modules stay on disk
if (!fs.existsSync(ownerHomePath)) {
  errors.push("never-delete: OwnerHome.tsx missing");
}
if (!fs.existsSync(qboHomePath)) {
  errors.push("never-delete: QboStyleHomePage.tsx missing");
}

// 5) Forbid sidebar pointing at the QBO surface for home id (training HOME is /home)
if (/home:\s*\{[^}]*to:\s*"\/app\/homepage"/.test(sidebar)) {
  errors.push(`sidebar-config: home must not use to="${QBO_HOME}" (sidebar HOME = ${CANONICAL_HOME})`);
}

if (errors.length > 0) {
  console.error("verify-canonical-home-route FAIL:");
  for (const e of errors) console.error(`  • ${e}`);
  process.exit(1);
}

console.log(
  `verify-canonical-home-route OK — sidebar HOME → ${CANONICAL_HOME}; ${QBO_HOME} mounts QboStyleHomePage; both surfaces retained.`
);
