#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const files = {
  service: "apps/backend/src/maintenance/work-orders.service.ts",
  workOrdersRoute: "apps/backend/src/maintenance/work-orders.routes.ts",
  dashboardRoute: "apps/backend/src/maintenance/dashboard.routes.ts",
  api: "apps/frontend/src/api/maintenance.ts",
  page: "apps/frontend/src/pages/maintenance/MaintenanceHome.tsx",
};

function read(base, file) { return fs.readFileSync(path.join(base, file), "utf8"); }

function verify(base) {
  const source = Object.fromEntries(Object.entries(files).map(([key, file]) => [key, read(base, file)]));
  const failures = [];
  const need = (ok, message) => { if (!ok) failures.push(message); };

  need(source.service.includes("SELECT COUNT(*)::int AS total_count"), "bucket service lacks exact total");
  need((source.service.match(/openWorkOrderPredicate\("w"\)/g) ?? []).length >= 2, "count and page must share the canonical open-WO predicate");
  need(source.service.includes("LIMIT $2 OFFSET $3"), "bucket service lacks bounded server range");
  need(!/LIMIT 80\b/.test(source.service), "silent LIMIT 80 remains in mounted bucket service");
  need(source.service.includes("total_count: Number(count.rows[0]?.total_count ?? 0)"), "bucket response drops exact total");
  need(source.workOrdersRoute.includes("limit: z.coerce.number().int().min(1).max(200).default(50)"), "work-orders/by-bucket route lacks validated limit");
  need(source.workOrdersRoute.includes("{ limit: q.limit, offset: q.offset }"), "work-orders/by-bucket does not forward range");
  need(source.dashboardRoute.includes("rmStatusQuerySchema") && source.dashboardRoute.includes("{ limit: parsed.data.limit, offset: parsed.data.offset }"), "dashboard route does not validate/forward range");
  need(source.api.includes('params.set("limit"') && source.api.includes('params.set("offset"'), "frontend API drops server range");
  need(source.page.includes('"rm-status", companyId, rmStatusPage'), "mounted board cache key omits page");
  need(source.page.includes('data-testid="rm-status-server-range"'), "mounted board lacks exact range disclosure");
  need(source.page.includes("rmStatusQuery.data?.total_count"), "mounted board does not consume server total");
  return failures;
}

const root = process.cwd();
const failures = verify(root);
if (failures.length) {
  console.error(`MAINT-F6915 guard FAILED (${failures.length})`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "maint-f6915-"));
  for (const file of Object.values(files)) {
    const target = path.join(tmp, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(root, file), target);
  }
  const service = path.join(tmp, files.service);
  fs.writeFileSync(service, read(tmp, files.service).replace("LIMIT $2 OFFSET $3", "LIMIT 80"));
  const planted = verify(tmp);
  fs.rmSync(tmp, { recursive: true, force: true });
  if (!planted.some((failure) => failure.includes("LIMIT 80"))) {
    console.error("MAINT-F6915 selftest FAILED: planted silent cap escaped");
    process.exit(1);
  }
  console.log("MAINT-F6915 selftest PASS: planted silent cap was rejected");
}

console.log("MAINT-F6915 PASS: R&M Status Board exposes an exact scoped server range");
