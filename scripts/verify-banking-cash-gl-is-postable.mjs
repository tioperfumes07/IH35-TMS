#!/usr/bin/env node
/**
 * Banking defect E (lane 2026-07-23): cash-GL bind must only offer/accept is_postable accounts.
 * FAIL on main tip before fix: GET cash-gl-mapping filters asset without is_postable;
 * PUT binds without checking is_postable.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const ROUTES = "apps/backend/src/banking/banking.routes.ts";

export function run(root = ROOT) {
  const failures = [];
  const src = fs.readFileSync(path.join(root, ROUTES), "utf8");
  const getIdx = src.indexOf('app.get("/api/v1/banking/accounts/cash-gl-mapping"');
  const putIdx = src.indexOf('app.put("/api/v1/banking/accounts/:id/cash-gl"');
  if (getIdx < 0) failures.push("missing GET cash-gl-mapping route");
  if (putIdx < 0) failures.push("missing PUT cash-gl route");
  if (getIdx >= 0 && putIdx >= 0) {
    const getBlock = src.slice(getIdx, putIdx);
    if (!/is_postable\s*=\s*true/.test(getBlock)) {
      failures.push("GET cash-gl-mapping must filter catalogs.accounts with is_postable = true");
    }
    if (!/account_type\s+ILIKE\s+'asset'/.test(getBlock) && !/account_type ILIKE 'asset'/.test(getBlock)) {
      failures.push("GET cash-gl-mapping must still scope to asset accounts");
    }
    const putBlock = src.slice(putIdx, putIdx + 3500);
    if (!putBlock.includes("account_not_postable")) {
      failures.push("PUT cash-gl must reject non-postable accounts with account_not_postable");
    }
    if (!/is_postable\s*!==\s*true/.test(putBlock) && !putBlock.includes("is_postable !== true")) {
      failures.push("PUT cash-gl must check row.is_postable !== true before update");
    }
  }
  return failures;
}

function selftest() {
  const tmp = fs.mkdtempSync("/tmp/verify-cash-gl-postable-");
  const rel = ROUTES;
  fs.mkdirSync(path.join(tmp, path.dirname(rel)), { recursive: true });
  const bad = `
  app.get("/api/v1/banking/accounts/cash-gl-mapping", async () => {
    await client.query(\`SELECT id FROM catalogs.accounts WHERE account_type ILIKE 'asset'\`);
  });
  app.put("/api/v1/banking/accounts/:id/cash-gl", async () => {
    await client.query(\`SELECT id FROM catalogs.accounts WHERE id = $1\`);
  });
`;
  fs.writeFileSync(path.join(tmp, rel), bad);
  if (!run(tmp).length) throw new Error("selftest: bug shape must FAIL");
  const good = `
  app.get("/api/v1/banking/accounts/cash-gl-mapping", async () => {
    await client.query(\`SELECT id FROM catalogs.accounts
      WHERE account_type ILIKE 'asset' AND is_postable = true\`);
  });
  app.put("/api/v1/banking/accounts/:id/cash-gl", async () => {
    if (acct.rows[0].is_postable !== true) return { error: "account_not_postable" };
  });
`;
  fs.writeFileSync(path.join(tmp, rel), good);
  if (run(tmp).length) throw new Error("selftest: fixed shape must PASS: " + run(tmp).join("; "));
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log("verify-banking-cash-gl-is-postable --selftest OK");
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  if (process.argv.includes("--selftest")) {
    selftest();
  } else {
    const f = run();
    if (f.length) {
      console.error(f.join("\n"));
      process.exit(1);
    }
    console.log("verify-banking-cash-gl-is-postable — OK");
  }
}
