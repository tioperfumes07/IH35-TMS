#!/usr/bin/env node
/**
 * C5 — CANONICAL LOAD NAVIGATION EVERYWHERE.
 *
 * THE DEFECT THIS GUARD PINS
 * --------------------------
 * A load has exactly one canonical address: `/dispatch/loads/:id`. EntityLink kind="load" already
 * resolves to it, `/dispatch/loads/:id` is already mounted in routes/manifest.tsx, and eighteen
 * surfaces already drill through it correctly. And yet the load is still, in most of dispatch,
 * addressed as a QUERY PARAMETER — `/dispatch?load_id=<uuid>` — which is a different thing wearing
 * the same clothes:
 *
 *   - it is a BOARD BOOKMARK, not a record address. Nothing about `/dispatch?load_id=x` says
 *     "load x"; it says "the dispatch board, which happens to have a drawer open".
 *   - it puts a raw load UUID in a query string on a surface where the path form is the norm —
 *     the exact shape §6/L6 forbids, and the shape that leaks into copied links and screenshots.
 *   - it FORKS the drill-through. Half the app links `/dispatch/loads/:id`, half links
 *     `/dispatch?load_id=`, and the two are not interchangeable for back/forward, deep-link
 *     restore, or "open in new tab".
 *
 * ROOT CAUSE — THE CANONICAL ROUTE IS A FACADE
 * --------------------------------------------
 * `/dispatch/loads/:id` is mounted, so every audit that greps for the route passes. But the
 * component it is mounted to is `DispatchLoadDetailRedirect`, whose entire body is:
 *
 *     return <Navigate to={`/dispatch?load_id=${encodeURIComponent(id)}`} replace />;
 *
 * The canonical route BOUNCES STRAIGHT BACK to the query-param form. So EntityLink kind="load" —
 * the primitive the whole codebase was migrated onto — lands the operator on `?load_id=` anyway.
 * Migrating the remaining call sites without fixing this would have produced a green guard and
 * zero behavioural change: every link would still end at the query string. That is why this guard
 * fails on the FACADE (channel B) and on the READER (channel E), not only on the call sites.
 *
 * FIVE CHANNELS
 *   A. QUERY-PARAM LOAD NAVIGATION — a client-navigation URL literal whose path is the dispatch
 *      board (`/dispatch`, `/dispatch/loads`) and whose query carries `load_id=` / `load=`.
 *      That is a load address written the wrong way. `/api/...` URLs are NOT navigation — a
 *      backend filter parameter is legitimate and is skipped by the api-prefix group.
 *   B. FACADE — the component mounted at `/dispatch/loads/:id` must not itself navigate to a
 *      `?load_id=` URL, and the route must exist at all. Pins the root cause above.
 *   C. RESOLVER CONTRACT — EntityLink's `case "load"` must return the PATH form and must contain
 *      no `?`. Pins the primitive so the facade can never be "fixed" by degrading the resolver
 *      to match it (the cheapest wrong fix available, and the one that would silence channel A).
 *   D. A "LOAD" COLUMN IS A LOAD REFERENCE — a table column literal labelled Load / Load # /
 *      Load No / Load number must drill: `<EntityLink kind="load">`, `entityKind: "load"`, or a
 *      `/dispatch/loads/` link. A column that prints `row.source_load_id ?? "—"` shows the
 *      operator a raw UUID under a header that promises a load, and the click does nothing.
 *   E. READER — pages/Dispatch.tsx must derive the open load from the ROUTE PARAM, not only from
 *      `searchParams`. Without this, channel A can be migrated to `/dispatch/loads/:id` and every
 *      link silently opens the board with no drawer. This is the channel that makes the fix real
 *      rather than cosmetic.
 *
 * WHAT IS DELIBERATELY NOT CLAIMED (stated, not hidden)
 * -----------------------------------------------------
 *   - `/dispatch/map?load_id=` (EntityLink kind="load_map") is a MAP VIEWPORT FOCUS, not a record
 *     address: MapView reads it as `focusLoadId` to centre the map. There is no
 *     `/dispatch/loads/:id/map` route and inventing one would be a fabricated link.
 *   - `/dispatch/factoring-queue?load_id=` (EntityLink kind="factoring_queue_load") and
 *     `/dispatch/in-transit-issues?load_id=` (EntityLink kind="intransit_issues_load") are QUEUE
 *     SURFACE FOCUSES — filtered workflow lists, not the office load record address.
 *     All three are budgeted at SURFACE_FOCUS_BUDGET (shrink-only).
 *   - `searchParams.get("load_id")` READS stay legal forever — old bookmarks and emailed board
 *     links must keep working. This guard forbids WRITING the query form, never reading it.
 *   - Channel D judges `.tsx` only. `pages/reports/runners/runner-config.ts` declares column DATA
 *     with no render function; the generic runner renders it, and that runner is a separate
 *     surface. Named in REMAINING rather than force-flagged in a file that renders nothing.
 *   - Channel D accepts a render that returns ONLY an em-dash literal (Vendors.tsx "Load #") —
 *     an honestly-unwired column with no id in the payload is not a dead link, it is an honest
 *     blank. It becomes a failure the moment it prints an id.
 *   - Channel D accepts `/portal/loads/:id` as a canonical target. src/portal/** is the CUSTOMER
 *     portal — a separate authenticated surface with its own load route (routes/manifest.tsx:723,
 *     `<Route path="loads/:id" element={<PortalLoadDetailPage />} />` under the PortalRouteGuard).
 *     Sending a customer to the internal dispatch board would be a cross-surface authz leak, not a
 *     fix. Narrowed for that stated reason — the portal link is a real drill-through, not an escape.
 *
 * Run against pre-fix origin/main and this FAILS: the canonical route is a redirect back to
 * `?load_id=`, Dispatch.tsx never reads the route param, 13 call sites navigate by query string,
 * and 2 "Load" columns print an unclickable id.
 *
 *   node scripts/verify-canonical-load-nav.mjs
 *   node scripts/verify-canonical-load-nav.mjs --selftest
 *   LOAD_NAV_INVENTORY_PRINT=1 node scripts/verify-canonical-load-nav.mjs   (full inventory)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = "apps/frontend/src";
const LABEL = "verify-canonical-load-nav";
const MISSING = " MISSING ";

const MANIFEST_FILE = `${SRC}/routes/manifest.tsx`;
const ENTITY_LINK_FILE = `${SRC}/components/shared/EntityLink.tsx`;
const DISPATCH_PAGE_FILE = `${SRC}/pages/Dispatch.tsx`;

/** The one canonical load address for the office app. */
const CANONICAL_PATH = "/dispatch/loads/";
const CANONICAL_ROUTE = '"/dispatch/loads/:id"';
/** The customer portal's own canonical load address — see the header. */
const PORTAL_CANONICAL_PATH = "/portal/loads/";

/**
 * Surface-focus `?load_id=` writers (not the office load record address) — see the header.
 * Shrink-only: never raise to admit `/dispatch?load_id=` board bookmarks.
 *   1. EntityLink kind="load_map" → /dispatch/map?load_id=
 *   2. EntityLink kind="factoring_queue_load" → /dispatch/factoring-queue?load_id=
 *   3. EntityLink kind="intransit_issues_load" → /dispatch/in-transit-issues?load_id=
 */
const SURFACE_FOCUS_BUDGET = 3;
const SURFACE_FOCUS_PATHS = ["/dispatch/map", "/dispatch/factoring-queue", "/dispatch/in-transit-issues"];

// ---------------------------------------------------------------------------------------------
// Source scanning
// ---------------------------------------------------------------------------------------------

/**
 * Blank `//` and block comments, preserving every byte offset and newline so line numbers and
 * slices stay exact. Required: this guard's own header quotes the very URL it forbids, and both
 * LoadBankingLinkagePage and manifest.tsx carry doc comments that spell out `?load_id=`. A guard
 * judges executable code, never prose.
 */
export function blankComments(source) {
  let out = "";
  let i = 0;
  let str = null;
  while (i < source.length) {
    const c = source[i];
    const next = source[i + 1];
    if (str) {
      out += c;
      if (c === "\\") {
        out += next ?? "";
        i += 2;
        continue;
      }
      if (c === str) str = null;
      i += 1;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      str = c;
      out += c;
      i += 1;
      continue;
    }
    if (c === "/" && next === "/") {
      while (i < source.length && source[i] !== "\n") {
        out += " ";
        i += 1;
      }
      continue;
    }
    if (c === "/" && next === "*") {
      const end = source.indexOf("*/", i + 2);
      const stop = end === -1 ? source.length : end + 2;
      for (; i < stop; i += 1) out += source[i] === "\n" ? "\n" : " ";
      continue;
    }
    out += c;
    i += 1;
  }
  return out;
}

function lineOf(source, index) {
  let line = 1;
  for (let i = 0; i < index && i < source.length; i += 1) if (source[i] === "\n") line += 1;
  return line;
}

// ---------------------------------------------------------------------------------------------
// CHANNEL A — query-param load navigation
// ---------------------------------------------------------------------------------------------

/**
 * A dispatch URL literal whose query carries a load id.
 *   group 1 — an `/api/...` prefix. Present ⇒ this is a backend request, not navigation.
 *   group 2 — the path (`/dispatch`, `/dispatch/loads`, `/dispatch/map`, …).
 */
const QUERY_LOAD_NAV = /(\/api\/[A-Za-z0-9/_.-]*)?(\/dispatch(?:\/[A-Za-z0-9_-]+)*)\?[^"'`\s)]*?\bload(?:_id)?=/g;

export function scanQueryParamLoadNav(files) {
  const hits = [];
  for (const [file, raw] of Object.entries(files)) {
    const src = blankComments(raw);
    QUERY_LOAD_NAV.lastIndex = 0;
    let m;
    while ((m = QUERY_LOAD_NAV.exec(src)) !== null) {
      if (m[1]) continue; // backend request URL — a filter param, not a load address
      const navPath = m[2];
      hits.push({
        file,
        line: lineOf(src, m.index),
        navPath,
        snippet: m[0],
        surfaceFocus: SURFACE_FOCUS_PATHS.includes(navPath),
      });
    }
  }
  return hits.sort((a, b) => (a.file === b.file ? a.line - b.line : a.file < b.file ? -1 : 1));
}

// ---------------------------------------------------------------------------------------------
// CHANNEL B — the canonical route must not be a facade
// ---------------------------------------------------------------------------------------------

/** Body of `function Name(...) { … }` at top level, matched by brace depth. */
function functionBody(source, name) {
  const start = source.search(new RegExp(`function\\s+${name}\\s*\\(`));
  if (start === -1) return null;
  const open = source.indexOf("{", start);
  if (open === -1) return null;
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === "{") depth += 1;
    else if (source[i] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(open, i + 1);
    }
  }
  return null;
}

export function facadeErrors(manifestRaw) {
  const errors = [];
  if (manifestRaw === MISSING) return [`${MANIFEST_FILE} is missing — cannot verify the canonical load route`];
  const src = blankComments(manifestRaw);

  const routeAt = src.indexOf(`path=${CANONICAL_ROUTE}`);
  if (routeAt === -1) {
    errors.push(
      `${MANIFEST_FILE}: canonical load route path=${CANONICAL_ROUTE} is NOT mounted — ` +
        "EntityLink kind=\"load\" would 404"
    );
    return errors;
  }

  // The element rendered at the canonical route.
  const window = src.slice(routeAt, routeAt + 600);
  const element = /element=\{\s*<\s*([A-Za-z0-9_]+)/.exec(window);
  if (!element) {
    errors.push(`${MANIFEST_FILE}:${lineOf(src, routeAt)}: could not read the element for ${CANONICAL_ROUTE}`);
    return errors;
  }
  // Unwrap <ProtectedRoute><X /></ProtectedRoute> — the guarded child is the real surface.
  const inner = /element=\{\s*<\s*ProtectedRoute[^>]*>\s*<\s*([A-Za-z0-9_]+)/.exec(window);
  const rendered = inner ? inner[1] : element[1];

  const body = functionBody(src, rendered);
  if (body && /\?[^"'`\s)]*\bload(?:_id)?=/.test(body)) {
    errors.push(
      `${MANIFEST_FILE}: ${rendered} is mounted at ${CANONICAL_ROUTE} but REDIRECTS BACK to a ` +
        "`?load_id=` URL — the canonical route is a facade, so every EntityLink kind=\"load\" still " +
        "lands on the query-param board"
    );
  }
  return errors;
}

// ---------------------------------------------------------------------------------------------
// CHANNEL C — EntityLink resolver contract
// ---------------------------------------------------------------------------------------------

export function resolverErrors(entityLinkRaw) {
  const errors = [];
  if (entityLinkRaw === MISSING) return [`${ENTITY_LINK_FILE} is missing — the load drill primitive does not exist`];
  const src = blankComments(entityLinkRaw);

  if (!/\|\s*"load"|^\s*\|\s*"load"/m.test(src) && !/EntityKind[\s\S]{0,400}"load"/.test(src)) {
    errors.push(`${ENTITY_LINK_FILE}: EntityKind union no longer declares "load"`);
  }

  const at = src.indexOf('case "load":');
  if (at === -1) {
    errors.push(`${ENTITY_LINK_FILE}: resolveEntityRoute has no \`case "load":\` — kind="load" resolves to null`);
    return errors;
  }
  const ret = /return\s+([^;]+);/.exec(src.slice(at, at + 400));
  if (!ret) {
    errors.push(`${ENTITY_LINK_FILE}: \`case "load":\` has no return`);
    return errors;
  }
  const target = ret[1];
  if (!target.includes(CANONICAL_PATH)) {
    errors.push(
      `${ENTITY_LINK_FILE}: kind="load" resolves to ${target.trim()} — must be the canonical ` +
        `\`${CANONICAL_PATH}\${id}\``
    );
  }
  if (target.includes("?")) {
    errors.push(
      `${ENTITY_LINK_FILE}: kind="load" resolves to a QUERY-PARAM url (${target.trim()}) — the load ` +
        "primitive must use the path form, never a query string"
    );
  }
  return errors;
}

// ---------------------------------------------------------------------------------------------
// CHANNEL D — a "Load" column is a load reference
// ---------------------------------------------------------------------------------------------

const LOAD_COLUMN_LABEL = /label:\s*"Load(?:\s*(?:#|No\.?|number|Number))?"/g;
/** A render that returns only an em-dash/dash literal — honestly unwired, no id shown. */
const HONEST_DASH_RENDER = /render:\s*\([^)]*\)\s*=>\s*["'`](?:—|-|–)["'`]\s*[,}]/;

/** Enclosing `{ … }` object literal around `index`, by brace depth. */
function enclosingObject(source, index) {
  let depth = 0;
  let start = -1;
  for (let i = index; i >= 0; i -= 1) {
    const c = source[i];
    if (c === "}") depth += 1;
    else if (c === "{") {
      if (depth === 0) {
        start = i;
        break;
      }
      depth -= 1;
    }
  }
  if (start === -1) return null;
  depth = 0;
  for (let i = start; i < source.length; i += 1) {
    if (source[i] === "{") depth += 1;
    else if (source[i] === "}") {
      depth -= 1;
      if (depth === 0) return { start, text: source.slice(start, i + 1) };
    }
  }
  return null;
}

export function scanLoadColumns(files) {
  const found = [];
  for (const [file, raw] of Object.entries(files)) {
    if (!file.endsWith(".tsx")) continue; // see header: column DATA in .ts renders nothing
    // Archived, unrouted source is retained only as historical context. Claiming its columns as
    // product navigation would force dead-code wiring and manufacture Built credit.
    if (/^\s*\/\/\s*@archived\b/m.test(raw)) continue;
    const src = blankComments(raw);
    LOAD_COLUMN_LABEL.lastIndex = 0;
    let m;
    while ((m = LOAD_COLUMN_LABEL.exec(src)) !== null) {
      const obj = enclosingObject(src, m.index);
      if (!obj) continue;
      // `{ value: "load", label: "Load" }` is a <select> option, not a table column.
      if (/(?:^|[{,\s])value:\s*["'`]/.test(obj.text)) continue;
      const drills =
        /kind=\{?["'`]load["'`]/.test(obj.text) ||
        /kind=\{?["'`]portal_load["'`]/.test(obj.text) ||
        /entityKind:\s*["'`]load["'`]/.test(obj.text) ||
        obj.text.includes(CANONICAL_PATH) ||
        // Only a portal file may satisfy the contract with the portal route. An office surface
        // linking a customer-portal URL is a cross-surface leak, not a drill-through.
        (file.startsWith(`${SRC}/portal/`) && obj.text.includes(PORTAL_CANONICAL_PATH));
      const honestBlank = HONEST_DASH_RENDER.test(obj.text);
      found.push({ file, line: lineOf(src, m.index), drills, honestBlank, text: obj.text });
    }
  }
  return found.sort((a, b) => (a.file === b.file ? a.line - b.line : a.file < b.file ? -1 : 1));
}

// ---------------------------------------------------------------------------------------------
// CHANNEL E — the reader: Dispatch.tsx must honor the route param
// ---------------------------------------------------------------------------------------------

/** Accepts the three shapes a route-param read can reasonably take. */
const ROUTE_PARAM_READ = /\b(?:routeLoadId|pathLoadId|params\.id)\b/;

export function readerErrors(dispatchRaw) {
  if (dispatchRaw === MISSING) return [`${DISPATCH_PAGE_FILE} is missing — cannot verify the load-detail reader`];
  const src = blankComments(dispatchRaw);
  const errors = [];

  if (!/useParams/.test(src)) {
    errors.push(
      `${DISPATCH_PAGE_FILE}: does not call useParams — \`${CANONICAL_ROUTE}\` carries the load id in ` +
        "the PATH, so a searchParams-only reader opens the board with no drawer"
    );
  }
  const decl = /const\s+loadId\s*=\s*([^;]+);/.exec(src);
  if (!decl) {
    errors.push(`${DISPATCH_PAGE_FILE}: no \`const loadId = …\` binding — cannot verify the load-detail reader`);
    return errors;
  }
  if (!ROUTE_PARAM_READ.test(decl[1])) {
    errors.push(
      `${DISPATCH_PAGE_FILE}: \`loadId\` is read from ${decl[1].trim()} — it must prefer the ROUTE ` +
        "param (routeLoadId / params.id) so /dispatch/loads/:id actually opens the load"
    );
  }
  return errors;
}

// ---------------------------------------------------------------------------------------------

export function contractErrors(src) {
  const errors = [];

  // A
  const navs = scanQueryParamLoadNav(src.files);
  for (const hit of navs) {
    if (hit.surfaceFocus) continue;
    errors.push(
      `${hit.file}:${hit.line}: navigates to a load by QUERY STRING (\`${hit.snippet}…\`) — use ` +
        `EntityLink kind="load" / \`${CANONICAL_PATH}\${id}\``
    );
  }
  const surfaceFocus = navs.filter((h) => h.surfaceFocus);
  if (surfaceFocus.length > SURFACE_FOCUS_BUDGET) {
    errors.push(
      `surface-focus \`?load_id=\` budget exceeded: ${surfaceFocus.length} > ${SURFACE_FOCUS_BUDGET} ` +
        `(${surfaceFocus.map((h) => `${h.file}:${h.line}`).join(", ")}) — map/factoring/in-transit ` +
        "exemptions are shrink-only and must never absorb a board bookmark"
    );
  }

  // B, C, E
  errors.push(...facadeErrors(src.manifest));
  errors.push(...resolverErrors(src.entityLink));
  errors.push(...readerErrors(src.dispatchPage));

  // D
  for (const col of scanLoadColumns(src.files)) {
    if (col.drills || col.honestBlank) continue;
    errors.push(
      `${col.file}:${col.line}: a "Load" column that does not drill — render it through ` +
        '<EntityLink kind="load"> (or entityKind: "load"); a bare id under a Load header is a dead click'
    );
  }

  return errors;
}

// ---------------------------------------------------------------------------------------------
// SELFTEST — every assertion proven capable of failing before the real tree is judged
// ---------------------------------------------------------------------------------------------

const GOOD_MANIFEST = `
import { Navigate, Route, useParams } from "react-router-dom";
function FleetUnitLegacyRedirect() {
  const { id } = useParams();
  return <Navigate to={\`/fleet/units/\${id}\`} replace />;
}
export function Manifest() {
  return (
    <Routes>
      <Route path="/dispatch/loads/:id/banking" element={<ProtectedRoute><LoadBankingLinkagePage /></ProtectedRoute>} />
      <Route path="/dispatch/loads/:id" element={<ProtectedRoute><DispatchPage loadsDeepLink /></ProtectedRoute>} />
    </Routes>
  );
}
`;

const GOOD_ENTITY_LINK = `
export type EntityKind = "load" | "bill" | "driver" | "load_map" | "factoring_queue_load" | "intransit_issues_load";
export function resolveEntityRoute(kind, id) {
  switch (kind) {
    case "load":
      return \`/dispatch/loads/\${id}\`;
    case "load_map":
      return \`/dispatch/map?load_id=\${id}\`;
    case "factoring_queue_load":
      return \`/dispatch/factoring-queue?load_id=\${id}\`;
    case "intransit_issues_load":
      return \`/dispatch/in-transit-issues?load_id=\${id}\`;
    case "bill":
      return \`/accounting/bills/\${id}\`;
    default:
      return null;
  }
}
`;

const GOOD_DISPATCH_PAGE = `
import { useParams, useSearchParams } from "react-router-dom";
export function DispatchPage() {
  const { id: routeLoadId } = useParams();
  const [searchParams] = useSearchParams();
  const loadId = routeLoadId ?? searchParams.get("load_id") ?? searchParams.get("load");
  return <LoadDetailDrawer loadId={loadId} />;
}
`;

function goodFixture() {
  return {
    manifest: GOOD_MANIFEST,
    entityLink: GOOD_ENTITY_LINK,
    dispatchPage: GOOD_DISPATCH_PAGE,
    files: {
      // migrated call sites — the shape the fix produces
      [`${SRC}/pages/dispatch/DetentionBoardPage.tsx`]: `
        const columns = [
          { key: "load_number", label: "Load", render: (e) => <EntityLink kind="load" id={e.load_id} label={e.load_number} /> },
        ];`,
      [`${SRC}/pages/dispatch/DispatchBoard.tsx`]: `
        <BulkProgressDialog resolveRowHref={(id) => \`/dispatch/loads/\${encodeURIComponent(id)}\`} />`,
      [`${SRC}/pages/dispatch/planners/LoadsPlanner.tsx`]: `
        const openLoad = (loadId) => navigate(\`/dispatch/loads/\${encodeURIComponent(loadId)}\`);`,
      // surface-focus call sites (URLs live in EntityLink resolver — budgeted there)
      [`${SRC}/components/dispatch/LoadLivePositionCell.tsx`]: `
        <EntityLink kind="load_map" id={loadId} label="View map" />`,
      [`${SRC}/components/shared/EntityLink.tsx`]: GOOD_ENTITY_LINK,
      // controls the guard must NOT claim
      [`${SRC}/components/dispatch/LoadDetailDriverPayTab.tsx`]: `
        fetch(\`/api/v1/driver-finance/driver-bills?load_id=\${encodeURIComponent(loadId)}\`);`,
      [`${SRC}/pages/DispatchLegacyReader.tsx`]: `
        const legacy = searchParams.get("load_id") ?? searchParams.get("load");`,
      [`${SRC}/pages/CommentedOut.tsx`]: `
        // <Link to={\`/dispatch?load_id=\${id}\`}>old</Link>
        /* to={\`/dispatch?load_id=\${id}\`} */
        <EntityLink kind="load" id={id} />`,
      [`${SRC}/pages/OptionList.tsx`]: `
        const KINDS = [{ value: "load", label: "Load" }, { value: "unit", label: "Unit" }];`,
      [`${SRC}/pages/HonestBlank.tsx`]: `
        const cols = [{ key: "load_no", label: "Load #", render: () => "—" }];`,
      [`${SRC}/pages/EntityKindColumn.tsx`]: `
        const cols = [{ key: "load_id", label: "Load", entityKind: "load" }];`,
      [`${SRC}/components/dispatch/ArchivedDispatchList.tsx`]: `
        // @archived — zero live routes/imports; retained only as historical context
        const cols = [{ key: "load_number", label: "Load #", render: (l) => l.load_number }];`,
      [`${SRC}/portal/PortalDashboardPage.tsx`]: `
        const cols = [{ key: "load_number", label: "Load #",
          render: (l) => <EntityLink kind="portal_load" id={l.id} label={l.load_number} /> }];`,
      [`${SRC}/pages/OtherModule.tsx`]: `
        <Link to={\`/banking/transactions?txn_id=\${id}\`}>txn</Link>
        <Link to={\`/dispatch?view=loads&status=in_transit\`}>board</Link>`,
      [`${SRC}/reports/runner-config.ts`]: `
        columns: [{ key: "load_number", label: "Load", align: "left" }],`,
    },
  };
}

function selftestMutations() {
  const M = [];
  const withFile = (rel, body) => {
    const g = goodFixture();
    g.files[rel] = body;
    return g;
  };

  // ---- channel A ----
  M.push([
    "Link to={`/dispatch?load_id=`}",
    withFile(`${SRC}/pages/X.tsx`, "<Link to={`/dispatch?load_id=${encodeURIComponent(id)}`}>Open</Link>"),
    /pages\/X\.tsx:1: navigates to a load by QUERY STRING/,
  ]);
  M.push([
    "navigate(`/dispatch?load_id=`)",
    withFile(`${SRC}/pages/X.tsx`, "onClick={() => navigate(`/dispatch?load_id=${loadId}`)}"),
    /navigates to a load by QUERY STRING/,
  ]);
  M.push([
    "double-quoted url",
    withFile(`${SRC}/pages/X.tsx`, 'navigate("/dispatch?load_id=" + id)'),
    /navigates to a load by QUERY STRING/,
  ]);
  M.push([
    "extra params before load_id (?view=loads&load_id=)",
    withFile(`${SRC}/pages/X.tsx`, "<Link to={`/dispatch?view=loads&load_id=${row.load_id}`}>#</Link>"),
    /navigates to a load by QUERY STRING/,
  ]);
  M.push([
    "legacy short param ?load=",
    withFile(`${SRC}/pages/X.tsx`, "<Link to={`/dispatch?load=${id}`}>Open</Link>"),
    /navigates to a load by QUERY STRING/,
  ]);
  M.push([
    "sub-path board url /dispatch/loads?load_id=",
    withFile(`${SRC}/pages/X.tsx`, "<Link to={`/dispatch/loads?load_id=${id}`}>Open</Link>"),
    /navigates to a load by QUERY STRING/,
  ]);
  M.push([
    "resolveRowHref factory",
    withFile(`${SRC}/pages/X.tsx`, "resolveRowHref={(id) => `/dispatch?load_id=${encodeURIComponent(id)}`}"),
    /navigates to a load by QUERY STRING/,
  ]);
  M.push([
    "<Navigate> redirect",
    withFile(`${SRC}/pages/X.tsx`, "return <Navigate to={`/dispatch?load_id=${id}`} replace />;"),
    /navigates to a load by QUERY STRING/,
  ]);
  M.push([
    "surface-focus budget breached by an extra writer",
    withFile(`${SRC}/pages/Y.tsx`, "<Link to={`/dispatch/map?load_id=${id}`}>map</Link>"),
    /surface-focus `\?load_id=` budget exceeded: 4 > 3/,
  ]);

  // ---- channel B ----
  const facade = () => {
    const g = goodFixture();
    g.manifest = `
      function DispatchLoadDetailRedirect() {
        const { id } = useParams();
        return <Navigate to={\`/dispatch?load_id=\${encodeURIComponent(id)}\`} replace />;
      }
      export function Manifest() {
        return <Route path="/dispatch/loads/:id" element={<ProtectedRoute><DispatchLoadDetailRedirect /></ProtectedRoute>} />;
      }`;
    return g;
  };
  M.push(["canonical route mounted to a ?load_id= redirect", facade(), /is a facade/]);
  M.push([
    "facade without a ProtectedRoute wrapper",
    (() => {
      const g = goodFixture();
      g.manifest = `
        function DispatchLoadDetailRedirect() {
          return <Navigate to={\`/dispatch?load_id=\${id}\`} replace />;
        }
        <Route path="/dispatch/loads/:id" element={<DispatchLoadDetailRedirect />} />`;
      return g;
    })(),
    /is a facade/,
  ]);
  M.push([
    "canonical route unmounted entirely",
    (() => {
      const g = goodFixture();
      g.manifest = '<Route path="/dispatch/loads" element={<DispatchLoadsRoute />} />';
      return g;
    })(),
    /is NOT mounted/,
  ]);
  M.push([
    "manifest file deleted",
    (() => {
      const g = goodFixture();
      g.manifest = MISSING;
      return g;
    })(),
    /manifest\.tsx is missing/,
  ]);

  // ---- channel C ----
  M.push([
    "resolver degraded to the query form",
    (() => {
      const g = goodFixture();
      g.entityLink = GOOD_ENTITY_LINK.replace("`/dispatch/loads/${id}`", "`/dispatch?load_id=${id}`");
      return g;
    })(),
    /resolves to a QUERY-PARAM url/,
  ]);
  M.push([
    "resolver repointed at another surface",
    (() => {
      const g = goodFixture();
      g.entityLink = GOOD_ENTITY_LINK.replace("`/dispatch/loads/${id}`", "`/dispatch/board/${id}`");
      return g;
    })(),
    /must be the canonical/,
  ]);
  M.push([
    'case "load" deleted from the resolver',
    (() => {
      const g = goodFixture();
      g.entityLink = GOOD_ENTITY_LINK.replace('case "load":\n      return `/dispatch/loads/${id}`;', "");
      return g;
    })(),
    /no `case "load":`/,
  ]);
  M.push([
    "EntityLink.tsx deleted",
    (() => {
      const g = goodFixture();
      g.entityLink = MISSING;
      return g;
    })(),
    /EntityLink\.tsx is missing/,
  ]);

  // ---- channel D ----
  M.push([
    "Load column printing a bare id",
    withFile(`${SRC}/pages/X.tsx`, '{ key: "load_no", label: "Load #", render: (r) => r.source_load_id ?? "—" }'),
    /a "Load" column that does not drill/,
  ]);
  M.push([
    "Load column with no render at all",
    withFile(`${SRC}/pages/X.tsx`, '{ key: "id", label: "Load" },'),
    /a "Load" column that does not drill/,
  ]);
  M.push([
    "office surface escaping into the customer-portal route",
    withFile(
      `${SRC}/pages/X.tsx`,
      '{ key: "load_number", label: "Load", render: (l) => <Link to={`/portal/loads/${l.id}`}>{l.load_number}</Link> }'
    ),
    /a "Load" column that does not drill/,
  ]);
  M.push([
    "Load column linking the query form",
    withFile(
      `${SRC}/pages/X.tsx`,
      '{ key: "load_number", label: "Load", render: (e) => <Link to={`/dispatch?load_id=${e.load_id}`}>{e.load_number}</Link> }'
    ),
    /a "Load" column that does not drill/,
  ]);

  // ---- channel E ----
  M.push([
    "reader dropped the route param",
    (() => {
      const g = goodFixture();
      g.dispatchPage = GOOD_DISPATCH_PAGE.replace("routeLoadId ?? ", "");
      return g;
    })(),
    /must prefer the ROUTE param/,
  ]);
  M.push([
    "useParams import removed",
    (() => {
      const g = goodFixture();
      g.dispatchPage = GOOD_DISPATCH_PAGE.replace(/useParams/g, "useSearchParams").replace(
        "const { id: routeLoadId } = useSearchParams();",
        ""
      );
      return g;
    })(),
    /does not call useParams|must prefer the ROUTE param/,
  ]);
  M.push([
    "Dispatch.tsx deleted",
    (() => {
      const g = goodFixture();
      g.dispatchPage = MISSING;
      return g;
    })(),
    /Dispatch\.tsx is missing/,
  ]);

  return M;
}

function selftest() {
  const failures = [];
  const good = goodFixture();

  const clean = contractErrors(good);
  if (clean.length) failures.push(`good fixture is not clean:\n      ${clean.join("\n      ")}`);

  // Classifier controls — proving the guard refuses these is as important as proving it catches.
  const navs = scanQueryParamLoadNav(good.files);
  const claimed = navs.filter((h) => !h.surfaceFocus).map((h) => h.file);
  for (const mustNot of [
    `${SRC}/components/dispatch/LoadDetailDriverPayTab.tsx`, // /api/ request URL
    `${SRC}/pages/DispatchLegacyReader.tsx`, // reads the legacy param, never writes it
    `${SRC}/pages/CommentedOut.tsx`, // prose, not a call site
    `${SRC}/pages/OtherModule.tsx`, // another module's query drill + a non-load board filter
  ]) {
    if (claimed.includes(mustNot)) failures.push(`channel A over-claimed: ${mustNot}`);
  }
  if (navs.filter((h) => h.surfaceFocus).length !== 3) {
    failures.push("channel A failed to classify map + factoring-queue + in-transit writers as surface-focus exemptions");
  }

  const cols = scanLoadColumns(good.files);
  for (const mustNot of [`${SRC}/pages/OptionList.tsx`, `${SRC}/reports/runner-config.ts`]) {
    if (cols.some((c) => c.file === mustNot)) failures.push(`channel D over-claimed a non-column: ${mustNot}`);
  }
  if (cols.some((c) => c.file === `${SRC}/components/dispatch/ArchivedDispatchList.tsx`)) {
    failures.push("channel D claimed an explicitly archived, unrouted component as a live load column");
  }
  if (!cols.some((c) => c.file === `${SRC}/pages/HonestBlank.tsx` && c.honestBlank)) {
    failures.push("channel D failed to classify an em-dash-only render as an honest blank");
  }
  if (!cols.some((c) => c.file === `${SRC}/pages/EntityKindColumn.tsx` && c.drills)) {
    failures.push('channel D failed to accept the `entityKind: "load"` column-config form');
  }
  if (!cols.some((c) => c.file === `${SRC}/portal/PortalDashboardPage.tsx` && c.drills)) {
    failures.push("channel D failed to accept the customer portal's own canonical /portal/loads/:id");
  }

  // Meta-assertions: each detector must be able to return a non-empty result, so a detector
  // silently rewritten to `return []` fails the selftest instead of passing every tree.
  const meta = [
    ["scanQueryParamLoadNav", scanQueryParamLoadNav({ x: "to={`/dispatch?load_id=${i}`}" }).length > 0],
    ["facadeErrors", facadeErrors("no routes here").length > 0],
    ["resolverErrors", resolverErrors("export const nothing = 1;").length > 0],
    ["scanLoadColumns", scanLoadColumns({ "a.tsx": '{ key: "k", label: "Load" }' }).length > 0],
    ["readerErrors", readerErrors("export function DispatchPage() { return null; }").length > 0],
  ];
  for (const [name, ok] of meta) if (!ok) failures.push(`meta: ${name} is a constant — it can never fail`);

  const mutations = selftestMutations();
  for (const [name, fixture, expected] of mutations) {
    const found = contractErrors(fixture);
    if (!found.some((e) => expected.test(e))) {
      failures.push(
        `mutation NOT caught: ${name}\n      expected ${expected}\n      got: ${found.join(" | ") || "(no errors)"}`
      );
    }
  }

  if (failures.length) {
    console.error(`FAIL ${LABEL} --selftest:\n  - ${failures.join("\n  - ")}`);
    process.exit(1);
  }
  console.log(
    `PASS ${LABEL} --selftest — good fixture clean; channel A refuses /api/ URLs, legacy READS, ` +
      `comments and other modules; channel D refuses select options, .ts column data and honest blanks; ` +
      `5/5 detectors proven non-constant; ${mutations.length}/${mutations.length} mutations caught.`
  );
}

// ---------------------------------------------------------------------------------------------

function read(rel) {
  try {
    return fs.readFileSync(path.join(ROOT, rel), "utf8");
  } catch (error) {
    if (error && error.code === "ENOENT") return MISSING;
    throw error;
  }
}

function collectFrontendFiles() {
  const files = {};
  const stack = [path.join(ROOT, SRC)];
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules") continue;
        stack.push(full);
      } else if (entry.name.endsWith(".tsx") || entry.name.endsWith(".ts")) {
        files[path.relative(ROOT, full).split(path.sep).join("/")] = fs.readFileSync(full, "utf8");
      }
    }
  }
  return files;
}

const IS_ENTRY = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (!IS_ENTRY) {
  // imported as a library (component test / tooling) — export-only.
} else if (process.argv.includes("--selftest")) {
  selftest();
} else {
  const files = collectFrontendFiles();
  const src = {
    files,
    manifest: read(MANIFEST_FILE),
    entityLink: read(ENTITY_LINK_FILE),
    dispatchPage: read(DISPATCH_PAGE_FILE),
  };
  if (process.env.LOAD_NAV_INVENTORY_PRINT === "1") {
    for (const hit of scanQueryParamLoadNav(files)) {
      console.log(`${hit.surfaceFocus ? "exempt " : "QUERY  "} ${hit.file}:${hit.line}  ${hit.snippet}`);
    }
    for (const col of scanLoadColumns(files)) {
      console.log(`${col.drills ? "drills " : col.honestBlank ? "blank  " : "DEAD   "} ${col.file}:${col.line}`);
    }
  }
  const errors = contractErrors(src);
  if (errors.length) {
    console.error(`FAIL ${LABEL}: ${errors.length} problem(s)\n  - ${errors.join("\n  - ")}`);
    process.exit(1);
  }
  const navs = scanQueryParamLoadNav(files);
  const cols = scanLoadColumns(files);
  console.log(
    `PASS ${LABEL} — every load reference uses the canonical \`${CANONICAL_PATH}:id\` route: ` +
      `0 query-string load navigations (${navs.filter((h) => h.surfaceFocus).length} surface-focus exemption(s), budget ${SURFACE_FOCUS_BUDGET}), ` +
      `${cols.length} "Load" column(s) all drill or are honestly blank, the canonical route is not a ` +
      "facade, and Dispatch.tsx opens the load from the route param."
  );
}
