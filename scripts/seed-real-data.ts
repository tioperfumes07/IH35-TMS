/**
 * P6-T11205 — orchestrates `apps/backend/scripts/seed-from-csv.ts` using
 * the manifest at tests/fixtures/seed-test-data.csv (and fixture CSVs under tests/fixtures/p6-t11205/).
 *
 * No direct SQL — delegates to existing idempotent INSERT/skip semantics in seed-from-csv.
 *
 * Usage (repo root):
 *   npx tsx scripts/seed-real-data.ts --dry-run
 *   npx tsx scripts/seed-real-data.ts
 */
import dotenv from "dotenv";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";

dotenv.config();

type ManifestRow = {
  entity: string;
  target_count: string;
  fixture_paths: string;
  loader_support: string;
  notes: string;
};

async function readManifestRows(repoRoot: string): Promise<ManifestRow[]> {
  const p = path.join(repoRoot, "tests/fixtures/seed-test-data.csv");
  const raw = await fs.readFile(p, "utf8");
  const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) throw new Error("seed-test-data.csv: expected header + rows");
  const headerParts = lines[0].split(",").map((h) => h.trim());
  const want = ["entity", "target_count", "fixture_paths", "loader_support", "notes"];
  for (const h of want) {
    if (!headerParts.includes(h)) throw new Error(`seed-test-data.csv missing column "${h}"`);
  }
  const rows: ManifestRow[] = [];
  for (let i = 1; i < lines.length; i += 1) {
    const line = lines[i] ?? "";
    const firstComma = line.indexOf(",");
    const secondComma = line.indexOf(",", firstComma + 1);
    const thirdComma = line.indexOf(",", secondComma + 1);
    const fourthComma = line.indexOf(",", thirdComma + 1);
    if (firstComma < 0 || secondComma < 0 || thirdComma < 0 || fourthComma < 0) {
      throw new Error(`seed-test-data.csv line ${i + 1}: expected 5 comma-separated fields`);
    }
    rows.push({
      entity: line.slice(0, firstComma).trim(),
      target_count: line.slice(firstComma + 1, secondComma).trim(),
      fixture_paths: line.slice(secondComma + 1, thirdComma).trim(),
      loader_support: line.slice(thirdComma + 1, fourthComma).trim(),
      notes: line.slice(fourthComma + 1).trim(),
    });
  }
  return rows;
}

function runSeedFile(repoRoot: string, relativeCsv: string, dryRun: boolean): number {
  const seedScript = path.join(repoRoot, "apps/backend/scripts/seed-from-csv.ts");
  const args = ["tsx", seedScript, "--file", relativeCsv];
  if (dryRun) args.push("--dry-run");
  const res = spawnSync("npx", args, {
    cwd: repoRoot,
    env: process.env,
    stdio: "inherit",
  });
  return res.status ?? 1;
}

async function main() {
  const repoRoot = process.cwd();
  const dryRun = process.argv.includes("--dry-run");
  const manifest = await readManifestRows(repoRoot);
  const toRun: string[] = [];
  for (const r of manifest) {
    if (r.loader_support !== "seed_from_csv") continue;
    if (!r.fixture_paths) continue;
    for (const seg of r.fixture_paths
      .split("|")
      .map((s) => s.trim())
      .filter(Boolean)) {
      toRun.push(seg);
    }
  }
  if (toRun.length === 0) {
    console.error("No seed_from_csv rows with fixture_paths in manifest.");
    process.exit(1);
  }
  console.info(`[seed-real-data] Running ${toRun.length} CSV file(s) via seed-from-csv (dryRun=${dryRun})`);
  let code = 0;
  for (const f of toRun) {
    const st = runSeedFile(repoRoot, f, dryRun);
    if (st !== 0) code = st;
  }
  process.exit(code);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
