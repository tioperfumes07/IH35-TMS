import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, "../..");
const scriptPath = path.join(repoRoot, "scripts/verify-scheduler-tenant-context.mjs");
const tempDirs: string[] = [];

function writeFixture(root: string, relPath: string, content: string) {
  const absolute = path.join(root, relPath);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, content, "utf8");
}

function runGuard(root: string) {
  return spawnSync("node", [scriptPath], {
    env: {
      ...process.env,
      VERIFY_SCHEDULER_TENANT_CONTEXT_ROOT: root,
    },
    encoding: "utf8",
  });
}

describe("verify-scheduler-tenant-context", () => {
  afterEach(() => {
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop();
      if (dir) fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("fails for cron files missing assertTenantContext guard", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "scheduler-tenant-guard-bad-"));
    tempDirs.push(root);
    writeFixture(
      root,
      "apps/backend/src/cron/bad.cron.ts",
      `
        export async function initializeBadCron() {
          const operating_company_id = "";
          console.log(operating_company_id);
        }
      `
    );

    const result = runGuard(root);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("bad.cron.ts");
    expect(result.stderr).toContain("missing assertTenantContext");
  });

  it("passes for guarded cron files and tenant-agnostic allowlist marker", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "scheduler-tenant-guard-good-"));
    tempDirs.push(root);
    writeFixture(
      root,
      "apps/backend/src/cron/_helpers/tenant-context-guard.ts",
      "export function assertTenantContext(value, cronName) { if (!value) throw new Error(cronName); }"
    );
    writeFixture(
      root,
      "apps/backend/src/cron/good.cron.ts",
      `
        import { assertTenantContext } from "./_helpers/tenant-context-guard.js";
        export async function initializeGoodCron() {
          const operating_company_id = "11111111-1111-1111-1111-111111111111";
          assertTenantContext(operating_company_id, "good.cron");
        }
      `
    );
    writeFixture(
      root,
      "apps/backend/src/cron/agnostic.cron.ts",
      `
        // @cron-tenant-agnostic: global cleanup queue processor
        export async function initializeAgnosticCron() {
          console.log("agnostic");
        }
      `
    );

    const result = runGuard(root);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("OK");
  });

  it("ignores *.test.ts files during discovery", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "scheduler-tenant-guard-ignore-tests-"));
    tempDirs.push(root);
    writeFixture(
      root,
      "apps/backend/src/cron/ignored.test.ts",
      `
        export function testOnly() {
          const operating_company_id = "";
          return operating_company_id;
        }
      `
    );

    const result = runGuard(root);
    expect(result.status).toBe(0);
    expect(result.stderr).not.toContain("ignored.test.ts");
  });
});
