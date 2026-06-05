#!/usr/bin/env node
/**
 * CLOSURE-18-PERF-AUDIT — snapshot frontend + driver bundle sizes (prod or local dist).
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "perf-bundle-size-snapshot";
const BUDGETS_PATH = path.join(ROOT, "docs/perf-budgets.json");

const PROD_DEFAULTS = {
  frontend: "https://ih35-tms-web.onrender.com",
  driver: "https://ih35-tms-driver.onrender.com",
};

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`);
}

function gzipSize(buffer) {
  return zlib.gzipSync(buffer).length;
}

function largestJsInDir(dir) {
  if (!fs.existsSync(dir)) return null;
  let best = null;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const nested = largestJsInDir(full);
      if (nested && (!best || nested.bytes > best.bytes)) best = nested;
    } else if (entry.isFile() && entry.name.endsWith(".js")) {
      const bytes = fs.statSync(full).size;
      if (!best || bytes > best.bytes) {
        best = { name: path.relative(ROOT, full), bytes, source: "local dist" };
      }
    }
  }
  return best;
}

async function fetchBundleFromProd(baseUrl) {
  const htmlRes = await fetch(`${baseUrl.replace(/\/$/, "")}/`);
  if (!htmlRes.ok) return null;
  const html = await htmlRes.text();
  const match = html.match(/src="(\/assets\/[^"]+\.js)"/);
  if (!match) return null;
  const assetUrl = `${baseUrl.replace(/\/$/, "")}${match[1]}`;
  const bundleRes = await fetch(assetUrl);
  if (!bundleRes.ok) return null;
  const buffer = Buffer.from(await bundleRes.arrayBuffer());
  return {
    name: path.basename(match[1]),
    bytes: buffer.length,
    gzipped: gzipSize(buffer),
    source: `prod ${baseUrl}`,
  };
}

async function main() {
  const budgets = readJson(BUDGETS_PATH);
  const frontendBase = process.env.FRONTEND_BASE_URL?.replace(/\/$/, "") ?? PROD_DEFAULTS.frontend;
  const driverBase = process.env.DRIVER_PWA_BASE_URL?.replace(/\/$/, "") ?? PROD_DEFAULTS.driver;

  let fe = await fetchBundleFromProd(frontendBase);
  let driver = await fetchBundleFromProd(driverBase);

  if (!fe) {
    fe = largestJsInDir(path.join(ROOT, "apps/frontend/dist"));
    if (fe) {
      const buf = fs.readFileSync(path.join(ROOT, fe.name));
      fe.gzipped = gzipSize(buf);
    }
  }
  if (!driver) {
    driver = largestJsInDir(path.join(ROOT, "apps/driver-pwa/dist"));
    if (driver) {
      const buf = fs.readFileSync(path.join(ROOT, driver.name));
      driver.gzipped = gzipSize(buf);
    }
  }

  if (!fe) {
    console.warn(`[${LABEL}] WARN: no frontend bundle — set FRONTEND_BASE_URL or build:frontend`);
  } else {
    budgets.fe_bundle_uncompressed = fe.bytes;
    budgets.fe_bundle_gzipped = fe.gzipped ?? gzipSize(fs.readFileSync(path.join(ROOT, fe.name)));
    console.log(`[${LABEL}] frontend ${fe.bytes} bytes (${budgets.fe_bundle_gzipped} gz) from ${fe.source}`);
  }

  if (!driver) {
    console.warn(`[${LABEL}] WARN: no driver bundle — set DRIVER_PWA_BASE_URL or build:driver-pwa`);
  } else {
    budgets.driver_bundle_uncompressed = driver.bytes;
    budgets.driver_bundle_gzipped = driver.gzipped ?? gzipSize(fs.readFileSync(path.join(ROOT, driver.name)));
    console.log(`[${LABEL}] driver ${driver.bytes} bytes (${budgets.driver_bundle_gzipped} gz) from ${driver.source}`);
  }

  const chunks = [];
  if (fe) chunks.push({ name: fe.name, bytes: fe.bytes, source: fe.source });
  if (driver) chunks.push({ name: driver.name, bytes: driver.bytes, source: driver.source });
  if (chunks.length) budgets.largest_chunks = chunks;

  budgets.snapshot_date = new Date().toISOString().slice(0, 10);
  writeJson(BUDGETS_PATH, budgets);
  console.log(`[${LABEL}] updated ${path.relative(ROOT, BUDGETS_PATH)}`);
}

main().catch((err) => {
  console.error(`[${LABEL}] FAIL:`, err);
  process.exit(1);
});
