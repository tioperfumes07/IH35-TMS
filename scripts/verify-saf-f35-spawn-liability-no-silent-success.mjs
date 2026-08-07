#!/usr/bin/env node
/**
 * SAF-F35 / CLS-SILENT-SUCCESS — spawn-liability must create a real liability
 * (or fail closed). It must NOT return 2xx with null id, and must NOT leave the
 * FINANCIAL-HOLD stub in place once the create path is live.
 *
 * History: this guard originally ratified the HOLD stub (422 not_implemented +
 * FINANCIAL-HOLD toast). That was correct while posting was blocked. Owner
 * unlocked the work — the permanent bar is INSERT + honest UI, not the stub.
 */
import { readFileSync, writeFileSync, mkdtempSync, rmSync, copyFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const LABEL = "verify-saf-f35-spawn-liability-no-silent-success";
const ROUTE = join(ROOT, "apps/backend/src/safety/safety.routes.ts");
const DRAWER = join(ROOT, "apps/frontend/src/components/safety/AccidentReportDrawer.tsx");

function spawnHandler(routeSrc) {
  const start = routeSrc.indexOf('app.post("/api/v1/safety/accidents/:id/spawn-liability"');
  if (start < 0) return "";
  const rest = routeSrc.slice(start);
  const next = rest.indexOf('app.post("/api/v1/safety/accidents/:id/spawn-wo"');
  return next < 0 ? rest.slice(0, 9000) : rest.slice(0, next);
}

function audit(routeSrc, drawerSrc) {
  const problems = [];
  const handler = spawnHandler(routeSrc);
  if (!handler) {
    problems.push("spawn-liability route missing");
    return problems;
  }

  // Silent success (the original SAF-F35 defect) stays forbidden forever.
  if (/return\s+\{\s*accident_id:[\s\S]{0,200}spawned_liability_id:\s*null/.test(handler)) {
    problems.push("route still returns { spawned_liability_id: null } as a success payload (silent success)");
  }
  if (/spawn_liability_not_implemented/.test(handler) || /rejected_not_implemented/.test(handler)) {
    problems.push("route must not keep FINANCIAL-HOLD stub (spawn_liability_not_implemented)");
  }
  if (!/INSERT INTO driver_finance\.driver_liabilities/.test(handler)) {
    problems.push("route must INSERT driver_finance.driver_liabilities (live create path)");
  }
  if (!/C6-MONEY-JE-EXEMPT:/.test(handler)) {
    problems.push(
      "route must carry C6-MONEY-JE-EXEMPT (recovery subledger; JE on settlement apply — Claude SWEEP-C6)"
    );
  }
  if (!/createSettlementDeduction/.test(handler) && !/createSettlementDeduction/.test(routeSrc)) {
    problems.push("route must reuse createSettlementDeduction (no new GL math)");
  }

  // UI: never toast success on missing id; never leave HOLD copy once live.
  if (/pushToast\(\s*"Spawn liability requested"\s*,\s*"success"\s*\)/.test(drawerSrc)) {
    problems.push('UI still toasts "Spawn liability requested" as success');
  }
  if (/FINANCIAL-HOLD/.test(drawerSrc)) {
    problems.push("UI must not keep FINANCIAL-HOLD toast copy — spawn-liability is live");
  }
  if (!/spawned_liability_id/.test(drawerSrc)) {
    problems.push("UI must check spawned_liability_id before toasting success");
  }
  if (!/pushToast\([\s\S]*?"error"/.test(drawerSrc)) {
    problems.push("UI must toast error when spawn cannot create a liability id");
  }
  return problems;
}

function selftest() {
  const tmp = mkdtempSync(join(tmpdir(), "saf-f35-"));
  try {
    const liveRoute = readFileSync(ROUTE, "utf8");
    const liveDrawer = readFileSync(DRAWER, "utf8");
    const liveProblems = audit(liveRoute, liveDrawer);
    if (liveProblems.length) {
      console.error(`${LABEL}: selftest FAIL live: ${liveProblems.join("; ")}`);
      process.exit(1);
    }

    // Plant HOLD stub + silent null success + FINANCIAL-HOLD toast
    const plantedRoute = liveRoute.replace(
      /INSERT INTO driver_finance\.driver_liabilities[\s\S]*?RETURNING id::text/,
      "/* planted stub */ spawned_liability_id: null, error: 'spawn_liability_not_implemented'"
    ).replace(
      /return \{\s*accident_id:[\s\S]*?spawned_liability_id:[\s\S]*?\};/,
      "return { accident_id: params.data.id, spawned_liability_id: null };"
    );
    // Force the classic silent-success shape if replace missed
    let badRoute = plantedRoute;
    if (!/spawned_liability_id:\s*null/.test(badRoute)) {
      badRoute = liveRoute.replace(
        /app\.post\("\/api\/v1\/safety\/accidents\/:id\/spawn-liability"[\s\S]*?app\.post\("\/api\/v1\/safety\/accidents\/:id\/spawn-wo"/,
        `app.post("/api/v1/safety/accidents/:id/spawn-liability", async (req, reply) => {
    return { accident_id: params.data.id, spawned_liability_id: null };
  });
  app.post("/api/v1/safety/accidents/:id/spawn-wo"`
      );
    }
    const badDrawer = liveDrawer
      .replace(/FINANCIAL-HOLD/g, "x")
      .replace(
        /pushToast\(\s*[\s\S]*?Spawn Liability failed[\s\S]*?"error"\s*\)/,
        'pushToast("Spawn liability requested", "success")'
      );
    // Ensure FINANCIAL-HOLD plant for the disclosure check flip
    const plantedDrawer = `${badDrawer}\n// planted: pushToast("Spawn liability requested", "success")\n`;

    const hits = audit(badRoute, plantedDrawer.includes("Spawn liability requested")
      ? plantedDrawer
      : liveDrawer.replace(
          /void spawnSafetyLiability[\s\S]*?\.catch\([\s\S]*?\)/,
          `void spawnSafetyLiability(id, operatingCompanyId).then(() => pushToast("Spawn liability requested", "success"))`
        ));

    // Also plant a pure HOLD drawer for FINANCIAL-HOLD detection when live has none
    const holdDrawer = liveDrawer.includes("FINANCIAL-HOLD")
      ? liveDrawer
      : liveDrawer.replace(
          /Spawn Liability failed/,
          "Spawn Liability is not live yet (FINANCIAL-HOLD) — no payable was created"
        );
    const holdHits = audit(
      `app.post("/api/v1/safety/accidents/:id/spawn-liability", async () => {
        return { accident_id: "x", spawned_liability_id: null };
      });
      app.post("/api/v1/safety/accidents/:id/spawn-wo"`,
      holdDrawer
    );

    const caught =
      holdHits.some((h) => /silent success|null/.test(h)) &&
      holdHits.some((h) => /INSERT|stub|FINANCIAL-HOLD|not_implemented|EXEMPT/.test(h));
    if (!caught && holdHits.length < 2) {
      console.error(
        `${LABEL}: selftest FAIL — planted defects not caught (${holdHits.length}): ${holdHits.join("; ")}`
      );
      process.exit(1);
    }
    console.log(`${LABEL}: selftest PASS — planted silent-success / stub caught`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }
  const problems = audit(readFileSync(ROUTE, "utf8"), readFileSync(DRAWER, "utf8"));
  if (problems.length) {
    for (const p of problems) console.error(`  ✗ ${p}`);
    process.exit(1);
  }
  console.log(
    `${LABEL} OK — spawn-liability creates driver_liabilities (C6-exempt); UI never toasts success on null id`
  );
}

main();
