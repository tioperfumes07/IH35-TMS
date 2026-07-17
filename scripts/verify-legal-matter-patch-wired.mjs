#!/usr/bin/env node
/**
 * verify-legal-matter-patch-wired.mjs  (0441-mod12-legal-patch-matters-never-called)
 *
 * Root cause: backend PATCH /api/v1/legal/matters/:id existed but Save never called it
 * (dead endpoint). Fix: LegalMatterDetailPage Save → legalMattersApi.update (PATCH)
 * with success/error toasts; backend updateMatter keeps matter_updated audit.
 *
 * Usage:
 *   node scripts/verify-legal-matter-patch-wired.mjs            # scan
 *   node scripts/verify-legal-matter-patch-wired.mjs --selftest # planted-bug harness
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-legal-matter-patch-wired";
const DETAIL = "apps/frontend/src/pages/legal/matters/LegalMatterDetailPage.tsx";
const API = "apps/frontend/src/api/legal-matters.ts";
const ROUTES = "apps/backend/src/legal/matters.routes.ts";
const SERVICE = "apps/backend/src/legal/matters.service.ts";

/** Pure checks — takes text so --selftest can inject fixtures. */
export function check({ detail, api, routes, service }) {
  const f = [];

  if (!api) {
    f.push(`${API}: missing`);
  } else {
    if (!/update\s*\(/.test(api)) {
      f.push(`${API}: must export legalMattersApi.update`);
    }
    if (!/method:\s*["']PATCH["']/.test(api)) {
      f.push(`${API}: update must send method: "PATCH"`);
    }
    if (!/\/api\/v1\/legal\/matters\/\$\{/.test(api) && !/\/api\/v1\/legal\/matters\/`/.test(api)) {
      // encodeURIComponent path form
      if (!/\/api\/v1\/legal\/matters\//.test(api)) {
        f.push(`${API}: update must target /api/v1/legal/matters/:id`);
      }
    }
  }

  if (!detail) {
    f.push(`${DETAIL}: missing`);
  } else {
    if (!/legalMattersApi\.update\s*\(/.test(detail)) {
      f.push(`${DETAIL}: Save must call legalMattersApi.update (PATCH)`);
    }
    if (!/Save changes/.test(detail)) {
      f.push(`${DETAIL}: must retain Save changes affordance`);
    }
    if (!/updateMut\.mutate\(/.test(detail) && !/updateMut\.mutate\s*\(/.test(detail)) {
      f.push(`${DETAIL}: Save must invoke updateMut.mutate()`);
    }
    if (!/useToast/.test(detail) || !/pushToast/.test(detail)) {
      f.push(`${DETAIL}: must surface success/error via useToast / pushToast`);
    }
    if (!/pushToast\([^)]*["']success["']\)/.test(detail) && !/pushToast\([^,]+,\s*["']success["']\)/.test(detail)) {
      f.push(`${DETAIL}: must pushToast success on update`);
    }
    if (!/pushToast\([^)]*["']error["']\)/.test(detail) && !/pushToast\([^,]+,\s*["']error["']\)/.test(detail)) {
      f.push(`${DETAIL}: must pushToast error on update failure`);
    }
    if (!/onError:/.test(detail)) {
      f.push(`${DETAIL}: updateMut must have onError (toast failures)`);
    }
  }

  if (!routes) {
    f.push(`${ROUTES}: missing`);
  } else if (!/app\.patch\(\s*["']\/api\/v1\/legal\/matters\/:id["']/.test(routes)) {
    f.push(`${ROUTES}: must keep PATCH /api/v1/legal/matters/:id`);
  }

  if (!service) {
    f.push(`${SERVICE}: missing`);
  } else {
    if (!/export async function updateMatter/.test(service)) {
      f.push(`${SERVICE}: must export updateMatter`);
    }
    if (!/matter_updated/.test(service)) {
      f.push(`${SERVICE}: updateMatter must append matter_updated audit event`);
    }
    if (!/legal\.matter\.updated/.test(service)) {
      f.push(`${SERVICE}: updateMatter must appendCrudAudit legal.matter.updated`);
    }
  }

  return f;
}

export function run() {
  const read = (rel) => {
    try {
      return fs.readFileSync(path.join(ROOT, rel), "utf8");
    } catch {
      return null;
    }
  };
  return check({
    detail: read(DETAIL),
    api: read(API),
    routes: read(ROUTES),
    service: read(SERVICE),
  });
}

if (process.argv.includes("--selftest")) {
  const goodApi = `
    update(operatingCompanyId, id, body) {
      return apiRequest(withCompany(\`/api/v1/legal/matters/\${encodeURIComponent(id)}\`, operatingCompanyId), {
        method: "PATCH",
        body,
      });
    }
  `;
  const goodDetail = `
    import { useToast } from "../../../components/Toast";
    const { pushToast } = useToast();
    const updateMut = useMutation({
      mutationFn: () => legalMattersApi.update(companyId, id, formStateToUpdatePayload(editForm)),
      onSuccess: () => {
        pushToast("Matter updated", "success");
      },
      onError: (error) => {
        pushToast(String(error.message || "Could not update matter"), "error");
      },
    });
    <Button onClick={() => void updateMut.mutate()}>Save changes</Button>
  `;
  const goodRoutes = `app.patch("/api/v1/legal/matters/:id", async (req, reply) => {`;
  const goodService = `
    export async function updateMatter(client, args) {
      await appendMatterEvent(client, { eventType: "matter_updated" });
      await appendCrudAudit(client, actor, "legal.matter.updated", {});
    }
  `;
  const badApi = `
    update(operatingCompanyId, id, body) {
      return apiRequest(withCompany(\`/api/v1/legal/matters/\${id}\`, operatingCompanyId), {
        method: "PUT",
        body,
      });
    }
  `;
  const badDetail = `
    // Edit UI with no PATCH call — dead Save
    <Button type="button">Save changes</Button>
  `;
  const checks = [
    ["wired chain passes", check({ detail: goodDetail, api: goodApi, routes: goodRoutes, service: goodService }).length === 0],
    ["non-PATCH method fails", check({ detail: goodDetail, api: badApi, routes: goodRoutes, service: goodService }).length > 0],
    ["dead Save (no update call) fails", check({ detail: badDetail, api: goodApi, routes: goodRoutes, service: goodService }).length > 0],
  ];
  const failed = checks.filter(([, ok]) => !ok);
  if (failed.length) {
    console.error(`${LABEL} --selftest FAIL:`);
    for (const [n] of failed) console.error("  ✗ " + n);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS (${checks.length} checks)`);
  process.exit(0);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const failures = run();
  if (failures.length) {
    console.error(`${LABEL} FAIL:`);
    for (const msg of failures) console.error("  ✗ " + msg);
    process.exit(1);
  }
  console.log(`${LABEL} PASS (matter Save → PATCH + toasts + audit)`);
}
