#!/usr/bin/env node
/**
 * MODULE-MATRIX-LEAF-DETAIL-ENDPOINT-HANGS (live-caught, CC-2, 2026-08-21): `GET
 * /api/v1/program/module-matrix?scope=module&module=<x>` hung 40+ seconds on two independent
 * live attempts while `scope=system` on the identical session resolved fast. Root cause: the
 * `scope=system` path already carries a proven stale-while-revalidate defense against exactly
 * this failure mode — `systemCache`/`systemInflight`/`SYSTEM_LAST_GOOD_PATH`, boot-warmed via
 * `warmSystemModuleMatrixAtBoot` (see its own "cold 4.5MB sync freeze" comment) — but
 * `buildModuleMatrix` (the `scope=module` code path) had only a plain 5-minute TTL Map cache
 * with NO fallback: a cold cache (fresh deploy, or simply idle >5 min with no `scope=system`
 * poll to piggyback a warm module cache off of) meant every request blocked on the FULL
 * synchronous leaf×column computation with no inflight dedup either — a thundering herd of
 * concurrent requests for the same module each redid the entire computation.
 *
 * FIX: `buildModuleMatrix` now wraps the real computation (`computeModuleMatrixUncached`) with
 * the identical pattern already proven for system scope: per-module in-memory stale-serve
 * (expired cache hit still returns immediately while refreshing in the background),
 * per-(module,probeScope) disk-persisted last-good JSON survives a cold process, and
 * per-cacheKey inflight dedup so concurrent callers share one computation instead of each
 * blocking on their own. The route handler was also missing `req.user?.uuid` on this call site
 * (present on the `scope=system` sibling two lines above it) — without it every authenticated
 * request silently degraded to `committed_stale` probe scope instead of `neon_live`.
 *
 * FAIL: any of the stale-while-revalidate primitives (inflight map, per-module last-good
 * read/write, or the wrapper serving a stale/last-good payload instead of blocking) is missing
 * from module-matrix.service.ts, OR the route's scope=module branch does not pass userUuid.
 * PASS: all present.
 *
 * Self-test: node scripts/verify-matrix-module-scope-stale-while-revalidate.mjs --selftest
 */
import fs from "node:fs";

const LABEL = "verify-matrix-module-scope-stale-while-revalidate";
const SVC = "apps/backend/src/program/module-matrix.service.ts";
const ROUTES = "apps/backend/src/program/audit-scoreboard.routes.ts";

function failures(sources) {
  const out = [];
  const svc = sources[SVC];
  const routes = sources[ROUTES];

  if (!/const moduleMatrixInflight\s*=\s*new Map/.test(svc)) {
    out.push("module-matrix.service: missing moduleMatrixInflight Map — concurrent scope=module requests for the same module will each redo the full computation (thundering herd)");
  }
  if (!/function moduleLastGoodPath/.test(svc) || !/MODULE_LAST_GOOD_DIR/.test(svc)) {
    out.push("module-matrix.service: missing per-module last-good disk path helper — a cold process has no fallback and must block the first request on the full computation");
  }
  if (!/async function readModuleLastGood/.test(svc)) {
    out.push("module-matrix.service: missing readModuleLastGood — no disk-survives-restart fallback for scope=module");
  }
  if (!/async function persistModuleLastGood/.test(svc)) {
    out.push("module-matrix.service: missing persistModuleLastGood — a fresh computation is never saved for the next cold start to fall back on");
  }

  // Scope to the exported buildModuleMatrix wrapper (between its declaration and the start of
  // computeModuleMatrixUncached) and confirm it never AWAITS the full projection.
  const wrapStart = svc.indexOf("export async function buildModuleMatrix(");
  const wrapEnd = svc.indexOf("async function computeModuleMatrixUncached(");
  if (wrapStart === -1 || wrapEnd === -1 || wrapEnd < wrapStart) {
    out.push("module-matrix.service: could not locate buildModuleMatrix wrapper / computeModuleMatrixUncached split — file shape changed, re-check this guard");
  } else {
    const wrapper = svc.slice(wrapStart, wrapEnd);
    if (!/kickMatrixComputeOffThread\(\)/.test(wrapper)) {
      out.push("module-matrix.service: buildModuleMatrix must kick the worker_thread, not compute on the HTTP thread");
    }
    if (/return runCompute\(/.test(wrapper) || /void runCompute\(/.test(wrapper) || /computeModuleMatrixUncached\(/.test(wrapper)) {
      out.push("module-matrix.service: buildModuleMatrix must not call computeModuleMatrixUncached / runCompute on the request path (PROD-MATRIX-REQUEST-PATH-FREEZE)");
    }
    if (!/kickMatrixComputeOffThread\(\);\s*\n\s*return hit\.payload;/.test(wrapper)) {
      out.push("module-matrix.service: buildModuleMatrix must return a stale in-memory hit immediately (not block) while the worker refreshes");
    }
    if (!/readModuleLastGood\(cacheKey\)/.test(wrapper)) {
      out.push("module-matrix.service: buildModuleMatrix must consult the disk last-good on a cold in-memory cache before blocking");
    }
    if (!/return lastGood/.test(wrapper)) {
      out.push("module-matrix.service: buildModuleMatrix must return the disk last-good immediately, not just read it");
    }
    if (!/computeModuleMatrixRequiredOnly/.test(wrapper)) {
      out.push("module-matrix.service: cold miss must return computeModuleMatrixRequiredOnly — never await the ledger projection");
    }
  }

  // MATRIX-HANDOFF-02: fire-and-forget raced readModuleLastGood → HTTP stayed REQUIRED-SEED.
  // SYSTEM already awaits persistSystemLastGood. MODULE must await persistModuleLastGood.
  if (/void persistModuleLastGood\(cacheKey, payload\)/.test(svc)) {
    out.push("module-matrix.service: persistModuleLastGood must be awaited — void races the parent last-good read and module boards stay 0%");
  }
  if (!/await persistModuleLastGood\(cacheKey, payload\)/.test(svc)) {
    out.push("module-matrix.service: computeModuleMatrixUncached must await persistModuleLastGood so last-good is on disk before the worker posts ok");
  }
  if (!/await persistSystemLastGood\(payload\)/.test(svc)) {
    out.push("module-matrix.service: computeSystemModuleMatrix must await persistSystemLastGood (MATRIX-HANDOFF-01)");
  }
  if (/void persistSystemLastGood/.test(svc)) {
    out.push("module-matrix.service: persistSystemLastGood must not be fire-and-forget");
  }
  if (!/moduleMatrixInflight\.clear\(\)/.test(svc)) {
    out.push("module-matrix.service: clearModuleMatrixCache must also clear moduleMatrixInflight (test isolation)");
  }

  const routeAnchor = "const payload = await buildModuleMatrix(moduleId";
  const routeIdx = routes.indexOf(routeAnchor);
  if (routeIdx === -1) {
    out.push("audit-scoreboard.routes: scope=module buildModuleMatrix call site not found — file shape changed, re-check this guard");
  } else {
    const call = routes.slice(routeIdx, routeIdx + routeAnchor.length + 40);
    if (!/buildModuleMatrix\(moduleId,\s*req\.user\?\.uuid\)/.test(call)) {
      out.push("audit-scoreboard.routes: scope=module branch must pass req.user?.uuid into buildModuleMatrix (parity with the scope=system branch) or authed requests silently stay committed_stale");
    }
  }

  return out;
}

const live = { [SVC]: fs.readFileSync(SVC, "utf8"), [ROUTES]: fs.readFileSync(ROUTES, "utf8") };

if (process.argv.includes("--selftest") || process.argv.includes("--self-test")) {
  const mutations = [
    {
      name: "inflight dedup removed",
      file: SVC,
      mutate: (text) => text.replace("const moduleMatrixInflight = new Map<string, Promise<ModuleMatrixPayload>>();", ""),
    },
    {
      name: "stale in-memory hit no longer served immediately",
      file: SVC,
      mutate: (text) =>
        text.replace(
          "  if (hit) {\n    kickMatrixComputeOffThread();\n    return hit.payload;\n  }\n",
          "  if (hit) {\n    return computeModuleMatrixUncached(moduleId, cacheKey);\n  }\n",
        ),
    },
    {
      name: "disk last-good fallback removed",
      file: SVC,
      mutate: (text) =>
        text.replace(
          "  const lastGood = await readModuleLastGood(cacheKey);\n  if (lastGood) {\n    moduleMatrixCache.set(cacheKey, { atMs: now - MATRIX_CACHE_MS, payload: lastGood });\n    kickMatrixComputeOffThread();\n    return lastGood;\n  }\n",
          "",
        ),
    },
    {
      name: "fresh computation never persisted to disk",
      file: SVC,
      mutate: (text) => text.replace("await persistModuleLastGood(cacheKey, payload);\n", ""),
    },
    {
      name: "module last-good persist is fire-and-forget again",
      file: SVC,
      mutate: (text) => text.replace("await persistModuleLastGood(cacheKey, payload);", "void persistModuleLastGood(cacheKey, payload);"),
    },
    {
      name: "system last-good persist is fire-and-forget again",
      file: SVC,
      mutate: (text) => text.replace("await persistSystemLastGood(payload);", "void persistSystemLastGood(payload);"),
    },
    {
      name: "route drops userUuid on scope=module",
      file: ROUTES,
      mutate: (text) => text.replace("buildModuleMatrix(moduleId, req.user?.uuid)", "buildModuleMatrix(moduleId)"),
    },
  ];
  const escaped = [];
  for (const { name, file, mutate } of mutations) {
    const mutated = mutate(live[file]);
    if (mutated === live[file]) {
      escaped.push(`${name}: mutation anchor missing`);
      continue;
    }
    const mutant = { ...live, [file]: mutated };
    if (failures(mutant).length === 0) escaped.push(`${name}: planted defect escaped`);
  }
  if (escaped.length) {
    console.error(`${LABEL} SELFTEST FAIL\n${escaped.join("\n")}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — ${mutations.length}/${mutations.length} planted defects rejected`);
  process.exit(0);
}

const missing = failures(live);
if (missing.length) {
  console.error(`${LABEL} FAIL\n${missing.map((f) => ` - ${f}`).join("\n")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — scope=module carries the same stale-while-revalidate + inflight-dedup + last-good-disk protection as scope=system`);
