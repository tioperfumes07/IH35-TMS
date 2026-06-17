#!/usr/bin/env node
// BLOCK 2 guard — the cash-follows-ETA confirm path is FORECAST-ONLY: it updates the prediction
// (mdata.loads.predicted_delivery_date) and writes a forecast audit row, but NEVER writes an
// invoice / AR / settlement / QBO entry. It is gated behind the OFF master flag and per-entity.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");
const fail = (m) => {
  console.error(`FAIL verify-cash-eta-forecast-only: ${m}`);
  process.exit(1);
};

const route = read("apps/backend/src/dispatch/predicted-delivery.routes.ts");

// Gated behind the master flag (OFF until enabled).
if (!route.includes("CASH_FOLLOWS_ETA_ENABLED")) fail("confirm endpoint must check CASH_FOLLOWS_ETA_ENABLED");
if (!/isEnabled\(/.test(route)) fail("confirm endpoint must gate on isEnabled()");
// Per-entity.
if (!route.includes("set_config('app.operating_company_id'")) fail("confirm endpoint must be per-entity scoped");
// Writes only the prediction + the forecast audit.
if (!/UPDATE\s+mdata\.loads[\s\S]{0,200}predicted_delivery_date/.test(route)) fail("must update predicted_delivery_date");
if (!route.includes("INSERT INTO forecast.predicted_delivery_changes")) fail("must write the forecast audit row");

// Forecast-only boundary: no accounting/AR/QBO writes in the executable code (strip comments).
const code = route
  .split("\n")
  .filter((line) => !line.trim().startsWith("//"))
  .join("\n");
if (/(INSERT|UPDATE|DELETE)\s+INTO?\s+accounting\./i.test(code)) fail("confirm path must not write accounting.*");
if (/qbo[._]|push\.service|sales_create_invoice/i.test(code)) fail("confirm path must not touch QBO/invoicing");

console.log("PASS verify-cash-eta-forecast-only");
