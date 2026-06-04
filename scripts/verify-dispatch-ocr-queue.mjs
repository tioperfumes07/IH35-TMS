#!/usr/bin/env node
/**
 * Block B21-D7: Dispatch OCR intake queue — email webhook → async OCR → review → Book Load convert.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const paths = {
  migration: path.join(ROOT, "db/migrations/0354_dispatch_ocr_intake.sql"),
  page: path.join(ROOT, "apps/frontend/src/pages/dispatch/OcrQueuePage.tsx"),
  pageTest: path.join(ROOT, "apps/frontend/src/pages/dispatch/__tests__/OcrQueuePage.test.tsx"),
  routes: path.join(ROOT, "apps/backend/src/dispatch/ocr-intake.routes.ts"),
  processor: path.join(ROOT, "apps/backend/src/dispatch/ocr-processor.service.ts"),
  routeTest: path.join(ROOT, "apps/backend/src/dispatch/__tests__/ocr-intake.routes.test.ts"),
  index: path.join(ROOT, "apps/backend/src/index.ts"),
  dispatchApi: path.join(ROOT, "apps/frontend/src/api/dispatch.ts"),
  manifest: path.join(ROOT, "apps/frontend/src/routes/manifest.tsx"),
  sidebar: path.join(ROOT, "apps/frontend/src/components/layout/sidebar-config.ts"),
  bookLoad: path.join(ROOT, "apps/frontend/src/pages/dispatch/components/BookLoadModalV4.tsx"),
  archDesign: path.join(ROOT, "docs/specs/IH35_ARCHITECTURAL_DESIGN.md"),
};

function read(filePath) {
  if (!fs.existsSync(filePath)) throw new Error(`missing file: ${filePath}`);
  return fs.readFileSync(filePath, "utf8");
}

function fail(msg) {
  console.error(`verify:dispatch-ocr-queue FAIL: ${msg}`);
  process.exit(1);
}

function main() {
  const migration = read(paths.migration);
  const page = read(paths.page);
  const pageTest = read(paths.pageTest);
  const routes = read(paths.routes);
  const processor = read(paths.processor);
  const routeTest = read(paths.routeTest);
  const index = read(paths.index);
  const dispatchApi = read(paths.dispatchApi);
  const manifest = read(paths.manifest);
  const sidebar = read(paths.sidebar);
  const bookLoad = read(paths.bookLoad);
  const archDesign = read(paths.archDesign);
  const failures = [];

  if (!migration.includes("dispatch.ocr_intake_queue")) failures.push("migration 0354 must create ocr_intake_queue");
  if (!migration.includes("ready_review")) failures.push("migration must include ready_review status");
  if (!page.includes("dispatch-ocr-queue-page")) failures.push("OcrQueuePage must expose test id");
  if (!page.includes("Convert to load")) failures.push("OcrQueuePage must expose convert CTA");
  if (!page.includes("BookLoadModal")) failures.push("OcrQueuePage must open BookLoadModal on convert");
  if ((pageTest.match(/\bit\(/g) ?? []).length < 4) failures.push("OcrQueuePage tests must cover at least 4 cases");
  if ((routeTest.match(/\bit\(/g) ?? []).length < 6) failures.push("ocr-intake.routes tests must cover at least 6 cases");

  if (!routes.includes("/api/v1/dispatch/ocr-intake/queue")) failures.push("ocr routes must expose queue list");
  if (!routes.includes("/api/v1/dispatch/ocr-intake/webhook/email")) failures.push("ocr routes must expose email webhook");
  if (!processor.includes("createOcrIntakeFromEmail")) failures.push("processor must intake email attachments to R2");
  if (!processor.includes("processOcrIntakeQueueItem")) failures.push("processor must run async OCR extraction");
  if (!processor.includes("book_load_prefill")) failures.push("processor must build book load prefill on convert");
  if (!index.includes("registerDispatchOcrIntakeRoutes")) failures.push("backend index must register ocr intake routes");

  if (!dispatchApi.includes("getOcrIntakeQueue")) failures.push("dispatch API must export getOcrIntakeQueue");
  if (!dispatchApi.includes("convertOcrIntakeToBookLoad")) failures.push("dispatch API must export convertOcrIntakeToBookLoad");
  if (!manifest.includes('path="/dispatch/ocr-queue"')) failures.push("manifest must route /dispatch/ocr-queue");

  const dispatchFlyout = sidebar.split('case "dispatch"')[1]?.split("case ")[0] ?? "";
  if (!dispatchFlyout.includes("/dispatch/ocr-queue")) failures.push("sidebar flyout must link OCR queue");

  if (!bookLoad.includes("templatePrefillJson")) failures.push("BookLoadModalV4 must accept templatePrefillJson for OCR convert");

  if (!archDesign.includes("verify:dispatch-ocr-queue")) {
    failures.push("ARCHITECTURAL_DESIGN must reference verify:dispatch-ocr-queue");
  }

  if (failures.length) {
    for (const f of failures) console.error(` - ${f}`);
    fail(failures.join("; "));
  }

  console.log("verify:dispatch-ocr-queue PASS");
}

main();
