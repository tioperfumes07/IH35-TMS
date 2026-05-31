#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const loadsRoutePath = path.resolve(process.cwd(), "apps/backend/src/mdata/loads.routes.ts");

function fail(message) {
  throw new Error(message);
}

export function verifyNoEmptyStringUuidBind() {
  if (!fs.existsSync(loadsRoutePath)) {
    fail("loads route source not found");
  }

  const src = fs.readFileSync(loadsRoutePath, "utf8");

  if (!src.includes("const optionalUuidQueryFilter = z.preprocess((value) => (value === \"\" ? undefined : value), z.string().uuid().optional());")) {
    fail("missing optional UUID preprocess coercion helper");
  }

  if (!src.includes("customer_id: optionalUuidQueryFilter") || !src.includes("driver_id: optionalUuidQueryFilter")) {
    fail("UUID query filters must use optionalUuidQueryFilter in listLoadsQuerySchema");
  }

  if (!src.includes(".map((entry) => (entry === \"\" ? undefined : entry))")) {
    fail("operating_company_id preprocess must coerce empty-string entries before UUID validation");
  }
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname;
if (isDirectRun) {
  try {
    verifyNoEmptyStringUuidBind();
    console.log("verify:no-empty-string-uuid-bind OK");
  } catch (error) {
    console.error(`verify:no-empty-string-uuid-bind FAIL: ${String((error && error.message) || error)}`);
    process.exit(1);
  }
}
