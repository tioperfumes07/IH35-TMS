#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const targetFile = path.join(repoRoot, "apps/backend/src/mdata/equipment-bulk-update.routes.ts");
const source = fs.readFileSync(targetFile, "utf8");

const whereBlocks = source.match(/WHERE[\s\S]*?RETURNING/g) ?? [];
const hasScopedWhere = whereBlocks.some((block) => block.includes("operating_company_id"));

if (!hasScopedWhere) {
  console.error("[verify-equipment-bulk-update-rls-where] operating_company_id missing from bulk-update WHERE clause");
  process.exit(1);
}

console.log("[verify-equipment-bulk-update-rls-where] OK");
