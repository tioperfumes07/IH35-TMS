#!/usr/bin/env node
/**
 * verify-check-routes-mounted — ROUND 224.
 *
 * Defect: registerCheckRoutes lived only inside accounting/checks/checks.routes.ts
 * behind `export default fp(...)` with ZERO callers in index.ts. Autoload alone is not a
 * greppable mount contract. Frontend CheckDetail/Print existed — HTTP registrar did not.
 *
 * This guard asserts the cash-flow pattern:
 *   1. apps/backend/src/index.ts imports registerCheckRoutes from checks.routes.js
 *   2. apps/backend/src/index.ts calls await registerCheckRoutes(app)
 *   3. accounting/index.ts ignorePattern excludes checks.routes (belt)
 *   4. checks.routes.ts has NO `export default fp` (named export only — stops
 *      verify-no-duplicate-routes from counting an autoload twin of the manual mount)
 *   5. frontend manifest mounts CheckDetailPage + CheckPrintPage at /accounting/checks/:id and /print
 *
 * --selftest uses in-memory mutations only (never writes tracked source).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-check-routes-mounted";

const FILES = {
  index: "apps/backend/src/index.ts",
  routes: "apps/backend/src/accounting/checks/checks.routes.ts",
  accIndex: "apps/backend/src/accounting/index.ts",
  manifest: "apps/frontend/src/routes/manifest.tsx",
};

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

export function check({ indexSrc, routesSrc, accIndexSrc, manifestSrc }) {
  const errors = [];

  if (!/export\s+async\s+function\s+registerCheckRoutes\s*\(/.test(routesSrc)) {
    errors.push(`${FILES.routes}: must export async function registerCheckRoutes(app)`);
  }
  if (!routesSrc.includes("/api/v1/checks")) {
    errors.push(`${FILES.routes}: must define /api/v1/checks routes`);
  }
  // Named-export only (cash-flow / finance-hub). A default fp export is what the
  // duplicate-routes static scanner treats as an autoload registration — dual with
  // the explicit index.ts mount = gate red + boot crash class.
  if (/^export\s+default\s+fp\s*\(/m.test(routesSrc)) {
    errors.push(
      `${FILES.routes}: must NOT export default fp(...) — cash-flow pattern (explicit index.ts mount only)`
    );
  }

  if (
    !/import\s*\{[^}]*\bregisterCheckRoutes\b[^}]*\}\s*from\s*["']\.\/accounting\/checks\/checks\.routes\.js["']/.test(
      indexSrc
    )
  ) {
    errors.push(
      `${FILES.index}: must import registerCheckRoutes from ./accounting/checks/checks.routes.js`
    );
  }
  if (!/\bawait\s+registerCheckRoutes\s*\(\s*app\s*\)/.test(indexSrc)) {
    errors.push(
      `${FILES.index}: must call await registerCheckRoutes(app) — ROUND 224 mount contract`
    );
  }

  // Must be ignored by autoload so the explicit mount is the sole path (no DUPLICATE-ROUTE-BOOT-CRASH).
  if (!/ignorePattern:\s*\//.test(accIndexSrc)) {
    errors.push(`${FILES.accIndex}: must declare an ignorePattern for autoload`);
  } else if (!/\(\^\|\\\/\)checks\\\.routes\\\./.test(accIndexSrc) && !/checks\.routes/.test(accIndexSrc)) {
    errors.push(
      `${FILES.accIndex}: ignorePattern must exclude checks.routes (explicit mount only)`
    );
  }

  if (!manifestSrc.includes("CheckDetailPage")) {
    errors.push(`${FILES.manifest}: must reference CheckDetailPage`);
  }
  if (!manifestSrc.includes("CheckPrintPage")) {
    errors.push(`${FILES.manifest}: must reference CheckPrintPage`);
  }
  if (!/path=["']\/accounting\/checks\/:id["']/.test(manifestSrc)) {
    errors.push(`${FILES.manifest}: must mount path="/accounting/checks/:id"`);
  }
  if (!/path=["']\/accounting\/checks\/print["']/.test(manifestSrc)) {
    errors.push(`${FILES.manifest}: must mount path="/accounting/checks/print"`);
  }
  if (!/<CheckDetailPage\s*\/>/.test(manifestSrc)) {
    errors.push(`${FILES.manifest}: must render <CheckDetailPage />`);
  }
  if (!/<CheckPrintPage\s*\/>/.test(manifestSrc)) {
    errors.push(`${FILES.manifest}: must render <CheckPrintPage />`);
  }

  return errors;
}

function selftest() {
  const good = {
    indexSrc: read(FILES.index),
    routesSrc: read(FILES.routes),
    accIndexSrc: read(FILES.accIndex),
    manifestSrc: read(FILES.manifest),
  };
  const goodErrors = check(good);
  if (goodErrors.length) {
    console.error(`${LABEL} SELFTEST FAIL — real tree flagged bad:\n  - ${goodErrors.join("\n  - ")}`);
    process.exit(1);
  }

  const dropImport = {
    ...good,
    indexSrc: good.indexSrc
      .split("\n")
      .filter((l) => !l.includes("registerCheckRoutes"))
      .join("\n"),
  };
  if (check(dropImport).length === 0) {
    console.error(`${LABEL} SELFTEST FAIL — dropping registerCheckRoutes from index.ts not caught`);
    process.exit(1);
  }

  const dropDetail = {
    ...good,
    manifestSrc: good.manifestSrc.replace(/<CheckDetailPage\s*\/>/g, "<div />"),
  };
  if (check(dropDetail).length === 0) {
    console.error(`${LABEL} SELFTEST FAIL — removing CheckDetailPage mount not caught`);
    process.exit(1);
  }

  const dropPrint = {
    ...good,
    manifestSrc: good.manifestSrc.replace(/path="\/accounting\/checks\/print"/g, 'path="/accounting/checks/print-gone"'),
  };
  if (check(dropPrint).length === 0) {
    console.error(`${LABEL} SELFTEST FAIL — removing print path not caught`);
    process.exit(1);
  }

  const addDefaultFp = {
    ...good,
    routesSrc:
      good.routesSrc +
      '\nexport default fp(async (app) => { await registerCheckRoutes(app); }, { name: "accounting.registerCheckRoutes" });\n',
  };
  if (check(addDefaultFp).length === 0) {
    console.error(`${LABEL} SELFTEST FAIL — re-adding export default fp not caught`);
    process.exit(1);
  }

  console.log(`${LABEL} SELFTEST PASS (4 planted regressions caught)`);
}

function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }
  const errors = check({
    indexSrc: read(FILES.index),
    routesSrc: read(FILES.routes),
    accIndexSrc: read(FILES.accIndex),
    manifestSrc: read(FILES.manifest),
  });
  if (errors.length) {
    console.error(`${LABEL} FAIL:\n  - ${errors.join("\n  - ")}`);
    process.exit(1);
  }
  console.log(
    `${LABEL} PASS — registerCheckRoutes imported+called in index.ts; checks.routes ignored by autoload; CheckDetailPage + CheckPrintPage mounted in manifest.`
  );
}

main();
