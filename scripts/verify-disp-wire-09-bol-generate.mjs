#!/usr/bin/env node
/**
 * CLS-DISP-WIRE-09 — BOL generate is wired end-to-end, not orphaned on Pod Review only.
 *
 * FAIL if:
 *   (a) POST /api/v1/dispatch/loads/:loadId/bol/generate missing or not calling generateAndStoreBol
 *   (b) generateAndStoreBol does not INSERT dispatch.bol_documents
 *   (c) registerDispatchPodBolRoutes not mounted from apps/backend/src/index.ts
 *   (d) FE generateLoadBol client missing
 *   (e) LoadBolPanel missing bol-generate-button / not used on PodReview + LoadDetailDrawer
 *   (f) Stored-copy download rejects silently instead of surfacing an operator error
 *   (g) Generate BOL closes over a mutable load/company or applies stale completion state
 *   (h) Summary loading/failure masquerades as zero POD/BOL history or permits duplicate generation
 *   (i) Stored-copy download applies a signed URL/error after load/company scope replacement
 *   (j) Canonical BOL creation returns without transaction-bound actor/company/load/document audit evidence
 *
 * Mutation-tested both directions.
 *
 * @matrix-built {"modules":["dispatch"],"cols":["connectivity"],"leaves":["dispatch.panel.load_bol"],"task":"DRV-F6209-BOL-SHARED-DRIVER-LABEL","vertical":"class-sweep"}
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-disp-wire-09-bol-generate";

const PATHS = {
  routes: "apps/backend/src/dispatch/pod.routes.ts",
  service: "apps/backend/src/dispatch/bol-generator.service.ts",
  index: "apps/backend/src/index.ts",
  api: "apps/frontend/src/api/dispatch.ts",
  panel: "apps/frontend/src/components/dispatch/LoadBolPanel.tsx",
  podReview: "apps/frontend/src/pages/dispatch/PodReviewPage.tsx",
  drawer: "apps/frontend/src/components/dispatch/LoadDetailDrawer.tsx",
};

function read(rel) {
  return readFileSync(join(ROOT, rel), "utf8");
}

export function auditBolWire(sources) {
  const problems = [];
  const routes = sources.routes ?? "";
  const service = sources.service ?? "";
  const index = sources.index ?? "";
  const api = sources.api ?? "";
  const panel = sources.panel ?? "";
  const podReview = sources.podReview ?? "";
  const drawer = sources.drawer ?? "";

  if (!/\/api\/v1\/dispatch\/loads\/:loadId\/bol\/generate/.test(routes)) {
    problems.push(`${PATHS.routes}: missing POST bol/generate route`);
  }
  if (!/generateAndStoreBol\s*\(/.test(routes)) {
    problems.push(`${PATHS.routes}: bol/generate does not call generateAndStoreBol`);
  }
  if (!/INSERT\s+INTO\s+dispatch\.bol_documents/i.test(service)) {
    problems.push(`${PATHS.service}: generateAndStoreBol path does not INSERT dispatch.bol_documents`);
  }
  if (!/export\s+async\s+function\s+generateAndStoreBol/.test(service)) {
    problems.push(`${PATHS.service}: generateAndStoreBol export missing`);
  }
  if (!/appendCrudAudit\(client, userId, ["']dispatch\.bol\.generated["'],\s*\{[\s\S]{0,160}operating_company_id:\s*operatingCompanyId,[\s\S]{0,160}bol_id:\s*stored\.id,[\s\S]{0,160}load_id:\s*loadId,[\s\S]{0,180}pdf_r2_key:\s*r2Key,[\s\S]{0,160}sha256,[\s\S]{0,160}template_version:\s*templateVersion/.test(service)) {
    problems.push(`${PATHS.service}: canonical BOL create must append actor/company/load/document audit evidence`);
  }
  if (!/if \(!stored\?\.id\) throw new Error\(["']bol_document_create_failed["']\);[\s\S]{0,120}await appendCrudAudit\(client, userId, ["']dispatch\.bol\.generated["']/.test(service)) {
    problems.push(`${PATHS.service}: BOL audit must run after required canonical document identity inside the compensated write block`);
  }
  if (!/driver_company_authorizations bol_driver_dca[\s\S]{0,320}bol_driver_dca\.company_id = \$2::uuid[\s\S]{0,180}bol_driver_dca\.is_authorized = true[\s\S]{0,180}bol_driver_dca\.deactivated_at IS NULL/.test(service)) {
    problems.push(`${PATHS.service}: BOL driver label must accept active company authorization`);
  }
  if (!/registerDispatchPodBolRoutes/.test(index)) {
    problems.push(`${PATHS.index}: registerDispatchPodBolRoutes not mounted`);
  }
  if (!/function\s+generateLoadBol|export\s+function\s+generateLoadBol/.test(api)) {
    problems.push(`${PATHS.api}: generateLoadBol client missing`);
  }
  if (!/bol\/generate/.test(api)) {
    problems.push(`${PATHS.api}: generateLoadBol does not POST bol/generate`);
  }
  if (!/data-testid=["']bol-generate-button["']/.test(panel)) {
    problems.push(`${PATHS.panel}: missing data-testid=bol-generate-button`);
  }
  if (!/generateLoadBol/.test(panel)) {
    problems.push(`${PATHS.panel}: LoadBolPanel does not call generateLoadBol`);
  }
  if (!/mutationFn:\s*\(input:\s*\{ loadId: string; companyId: string; generation: number \}\)\s*=>\s*generateLoadBol\(input\.loadId, input\.companyId\)/.test(panel)) {
    problems.push(`${PATHS.panel}: Generate BOL must submit an immutable load/company/generation snapshot`);
  }
  if (!/queryKey:\s*\["pod-bol-summary", input\.companyId, input\.loadId\]/.test(panel)) {
    problems.push(`${PATHS.panel}: Generate BOL must invalidate the submitted load/company cache`);
  }
  if (!/generateGenerationRef\.current \+= 1;[\s\S]{0,120}setGenerateError\(null\);[\s\S]{0,120}generateMutation\.reset\(\);[\s\S]{0,80}\[companyId, loadId\]/.test(panel)) {
    problems.push(`${PATHS.panel}: Generate BOL must retire and reset action state on load/company change`);
  }
  if (!/input\.generation === generateGenerationRef\.current\) setGenerateError\(error as Error\)/.test(panel)) {
    problems.push(`${PATHS.panel}: Generate BOL must suppress stale error completion state`);
  }
  if (!/generateMutation\.mutate\(\{\s*loadId,\s*companyId,\s*generation: generateGenerationRef\.current,\s*\}\)/.test(panel)) {
    problems.push(`${PATHS.panel}: Generate BOL click must snapshot the visible load/company intent`);
  }
  if (!/disabled=\{[\s\S]{0,180}summaryQuery\.isLoading\s*\|\|[\s\S]{0,80}summaryQuery\.isError\s*\|\|[\s\S]{0,180}generateMutation\.isPending/.test(panel)) {
    problems.push(`${PATHS.panel}: Generate BOL must stay disabled while canonical POD/BOL history is unknown`);
  }
  if (!/summaryQuery\.isLoading[\s\S]{0,180}Loading POD and BOL history[\s\S]{0,180}summaryQuery\.isError[\s\S]{0,260}<ListErrorState[\s\S]{0,240}POD and BOL history unavailable\.[\s\S]{0,180}summaryQuery\.refetch\(\)[\s\S]{0,360}pods\.length[\s\S]{0,160}bols\.length/.test(panel)) {
    problems.push(`${PATHS.panel}: summary loading/error must render before canonical POD/BOL counts with exact retry`);
  }
  if (!/async function downloadStoredBol\([\s\S]{0,520}await\s+downloadBolDocument\([\s\S]{0,420}catch\s*\([^)]+\)[\s\S]{0,240}pushToast\(userFacingApiError\([^,]+,\s*["']Stored BOL download failed["']\),\s*["']error["']\)/.test(panel)) {
    problems.push(`${PATHS.panel}: stored BOL download must surface rejected requests through the canonical error toast`);
  }
  if (!/const input = \{[\s\S]{0,120}bolId,[\s\S]{0,120}companyId,[\s\S]{0,120}generation: generateGenerationRef\.current/.test(panel)
      || !/downloadBolDocument\(input\.bolId, input\.companyId\)/.test(panel)) {
    problems.push(`${PATHS.panel}: stored BOL download must snapshot document/company/generation at click`);
  }
  if ((panel.match(/generateGenerationRef\.current !== input\.generation/g) ?? []).length < 2
      || !/generateGenerationRef\.current === input\.generation\) setDownloadingBolId\(null\)/.test(panel)) {
    problems.push(`${PATHS.panel}: stored BOL download must suppress stale URL/error/finally callbacks`);
  }
  if (!/setDownloadingBolId\(null\);[\s\S]{0,100}generateMutation\.reset\(\);[\s\S]{0,80}\[companyId, loadId\]/.test(panel)) {
    problems.push(`${PATHS.panel}: stored BOL download state must retire on load/company transition`);
  }
  if (!/data-testid=["']bol-stored-download-button["'][\s\S]{0,180}disabled=\{downloadingBolId !== null\}[\s\S]{0,180}downloadStoredBol\(bol\.id\)/.test(panel)) {
    problems.push(`${PATHS.panel}: stored BOL buttons must lock against duplicate signed-URL requests`);
  }
  if (!/<LoadBolPanel\b/.test(podReview)) {
    problems.push(`${PATHS.podReview}: Pod Review must mount <LoadBolPanel /> (entry kept)`);
  }
  if (!/<LoadBolPanel\b/.test(drawer)) {
    problems.push(
      `${PATHS.drawer}: Load Detail drawer Documents tab must mount <LoadBolPanel /> — ` +
        `EntityLink /dispatch/loads/:id is the canonical load path; BOL cannot live only on pod-review`,
    );
  }

  return problems;
}

function realSources() {
  return Object.fromEntries(Object.entries(PATHS).map(([k, rel]) => [k, read(rel)]));
}

function mutate(src, from, to, label) {
  const out = typeof from === "string" ? src.replace(from, to) : src.replace(from, to);
  if (out === src) throw new Error(`mutation "${label}" did not apply`);
  return out;
}

function selftest() {
  const failures = [];
  const real = realSources();
  const clean = auditBolWire(real);
  if (clean.length) failures.push(`case0 FAIL: ${clean.join(" | ")}`);

  const cases = [
    {
      label: "route removed",
      run: () =>
        auditBolWire({
          ...real,
          routes: mutate(real.routes, "/api/v1/dispatch/loads/:loadId/bol/generate", "/api/v1/dispatch/loads/:loadId/bol/MISSING", "route"),
        }),
      expect: "missing POST bol/generate",
    },
    {
      label: "INSERT removed",
      run: () =>
        auditBolWire({
          ...real,
          service: mutate(
            real.service,
            /INSERT\s+INTO\s+dispatch\.bol_documents/i,
            "INSERT INTO dispatch.NOT_BOL_DOCS",
            "insert",
          ),
        }),
      expect: "INSERT dispatch.bol_documents",
    },
    {
      label: "shared-driver authorization removed",
      run: () =>
        auditBolWire({
          ...real,
          service: mutate(real.service, "bol_driver_dca.is_authorized = true", "bol_driver_dca.is_authorized = false", "driver auth"),
        }),
      expect: "active company authorization",
    },
    {
      label: "BOL generated audit event removed",
      run: () =>
        auditBolWire({
          ...real,
          service: mutate(real.service, '"dispatch.bol.generated"', '"dispatch.bol.generated_GONE"', "BOL audit event"),
        }),
      expect: "append actor/company/load/document audit evidence",
    },
    {
      label: "BOL audit loses canonical document identity",
      run: () =>
        auditBolWire({
          ...real,
          service: mutate(real.service, "bol_id: stored.id", "bol_id: loadId", "BOL audit identity"),
        }),
      expect: "append actor/company/load/document audit evidence",
    },
    {
      label: "BOL audit moves before identity requirement",
      run: () =>
        auditBolWire({
          ...real,
          service: mutate(
            real.service,
            'if (!stored?.id) throw new Error("bol_document_create_failed");',
            'void stored?.id;',
            "BOL audit ordering",
          ),
        }),
      expect: "after required canonical document identity",
    },
    {
      label: "drawer mount removed",
      run: () =>
        auditBolWire({
          ...real,
          drawer: mutate(real.drawer, /<LoadBolPanel\b/, "<LoadBolGONE", "drawer"),
        }),
      expect: "Load Detail drawer",
    },
    {
      label: "panel button removed",
      run: () =>
        auditBolWire({
          ...real,
          panel: mutate(real.panel, 'data-testid="bol-generate-button"', 'data-testid="bol-generate-GONE"', "btn"),
        }),
      expect: "bol-generate-button",
    },
    {
      label: "summary failure masquerades as empty history",
      run: () =>
        auditBolWire({
          ...real,
          panel: mutate(real.panel, "summaryQuery.isError ? (", "false ? (", "summary failure"),
        }),
      expect: "summary loading/error must render",
    },
    {
      label: "generate enabled while summary failed",
      run: () =>
        auditBolWire({
          ...real,
          panel: mutate(real.panel, "summaryQuery.isError ||", "false ||", "summary generate gate"),
        }),
      expect: "Generate BOL must stay disabled",
    },
    {
      label: "stored download rejection handler removed",
      run: () =>
        auditBolWire({
          ...real,
          panel: mutate(
            real.panel,
            'pushToast(userFacingApiError(error, "Stored BOL download failed"), "error");',
            'void error;',
            "stored download error toast",
          ),
        }),
      expect: "stored BOL download must surface",
    },
    {
      label: "stored download consumes mutable company",
      run: () => auditBolWire({ ...real, panel: mutate(real.panel, "downloadBolDocument(input.bolId, input.companyId)", "downloadBolDocument(input.bolId, companyId)", "download scope") }),
      expect: "snapshot document/company/generation",
    },
    {
      label: "stored download stale success accepted",
      run: () => auditBolWire({ ...real, panel: mutate(real.panel, "if (generateGenerationRef.current !== input.generation) return;", "void input.generation;", "download stale success") }),
      expect: "suppress stale URL/error/finally",
    },
    {
      label: "stored download pending state survives scope transition",
      run: () => auditBolWire({ ...real, panel: mutate(real.panel, "setDownloadingBolId(null);", "void downloadingBolId;", "download scope reset") }),
      expect: "download state must retire",
    },
    {
      label: "stored download duplicate request lock removed",
      run: () => auditBolWire({ ...real, panel: mutate(real.panel, "disabled={downloadingBolId !== null}", "disabled={false}", "download lock") }),
      expect: "lock against duplicate",
    },
    {
      label: "generate input falls back to mutable props",
      run: () =>
        auditBolWire({
          ...real,
          panel: mutate(
            real.panel,
            "generateLoadBol(input.loadId, input.companyId)",
            "generateLoadBol(loadId, companyId)",
            "generate input",
          ),
        }),
      expect: "immutable load/company/generation snapshot",
    },
    {
      label: "submitted cache identity falls back to visible props",
      run: () =>
        auditBolWire({
          ...real,
          panel: mutate(
            real.panel,
            '["pod-bol-summary", input.companyId, input.loadId]',
            '["pod-bol-summary", companyId, loadId]',
            "submitted cache",
          ),
        }),
      expect: "submitted load/company cache",
    },
    {
      label: "scope change does not retire generation",
      run: () =>
        auditBolWire({
          ...real,
          panel: mutate(real.panel, "generateGenerationRef.current += 1;", "void generateGenerationRef.current;", "generation reset"),
        }),
      expect: "retire and reset action state",
    },
    {
      label: "stale error completion accepted",
      run: () =>
        auditBolWire({
          ...real,
          panel: mutate(
            real.panel,
            "input.generation === generateGenerationRef.current",
            "true",
            "stale error",
          ),
        }),
      expect: "suppress stale error completion",
    },
  ];

  for (const c of cases) {
    let problems;
    try {
      problems = c.run();
    } catch (err) {
      failures.push(`${c.label}: ${err.message}`);
      continue;
    }
    if (!problems.some((p) => p.includes(c.expect))) {
      failures.push(`${c.label} NOT caught (got: ${problems.join(" | ") || "none"})`);
    }
  }

  if (failures.length) {
    console.error(`${LABEL}: SELFTEST FAIL`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL}: selftest OK`);
}

function main() {
  if (process.argv.includes("--selftest")) return selftest();
  const problems = auditBolWire(realSources());
  if (problems.length) {
    console.error(`${LABEL}: FAIL`);
    for (const p of problems) console.error(`  ${p}`);
    process.exit(1);
  }
  console.log(
    `${LABEL}: OK — bol/generate → generateAndStoreBol → bol_documents; shared panel mounts and stored-download failures surface visibly`,
  );
}

main();
