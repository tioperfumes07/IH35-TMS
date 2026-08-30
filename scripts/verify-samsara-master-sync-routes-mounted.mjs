#!/usr/bin/env node
// SAMSARA-MASTER-SYNC-ROUTES-ORPHANED: samsara-master-sync.routes.ts (POST
// /api/v1/integrations/samsara/{drivers,assets}/sync) has no `export default fp(...)`, so no
// directory-wide autoload covers it -- every other integrations/samsara/*.routes.ts file gets its
// own explicit register call in index.ts, but this one was simply never added. Confirmed live: both
// endpoints 404'd despite being fully implemented in the repo. Guard requires index.ts to import and
// call registerSamsaraMasterSyncRoutes exactly once.
import fs from "node:fs";

const FILE = "apps/backend/src/index.ts";

function inspect(source) {
  const failures = [];

  if (!/import \{ registerSamsaraMasterSyncRoutes \} from "\.\/integrations\/samsara\/samsara-master-sync\.routes\.js";/.test(source)) {
    failures.push("index.ts no longer imports registerSamsaraMasterSyncRoutes");
  }
  const callCount = (source.match(/await registerSamsaraMasterSyncRoutes\(app\);/g) ?? []).length;
  if (callCount !== 1) {
    failures.push(`expected exactly 1 call to registerSamsaraMasterSyncRoutes(app), found ${callCount} (duplicate registration crashes boot -- see ACCT-DETAIL-ROUTES-DOUBLE-MOUNTED-CRASHES-BOOT-BEFORE-LISTEN)`);
  }

  return failures;
}

if (process.argv.includes("--selftest")) {
  const real = fs.readFileSync(FILE, "utf8");
  const realFailures = inspect(real);
  if (realFailures.length !== 0) {
    console.error("verify-samsara-master-sync-routes-mounted --selftest FAILED: real source itself fails:", realFailures);
    process.exit(1);
  }
  const mutated = real.replace(
    "  await registerSamsaraMasterSyncRoutes(app);\n",
    ""
  );
  if (mutated === real) {
    console.error("verify-samsara-master-sync-routes-mounted --selftest: mutation did not match live source — update the test");
    process.exit(1);
  }
  const mutatedFailures = inspect(mutated);
  if (mutatedFailures.length === 0) {
    console.error("verify-samsara-master-sync-routes-mounted --selftest FAILED: mutation was not caught");
    process.exit(1);
  }
  console.log("verify-samsara-master-sync-routes-mounted --selftest: OK (mutation caught, real source clean)");
  process.exit(0);
}

const source = fs.readFileSync(FILE, "utf8");
const failures = inspect(source);
if (failures.length > 0) {
  console.error("verify-samsara-master-sync-routes-mounted FAILED:");
  for (const f of failures) console.error(" -", f);
  process.exit(1);
}
console.log("verify-samsara-master-sync-routes-mounted: OK — registerSamsaraMasterSyncRoutes is imported and called exactly once in index.ts");
