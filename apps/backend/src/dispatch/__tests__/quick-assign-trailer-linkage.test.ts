import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const dispatchDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const root = path.resolve(dispatchDir, "../../../..");
const service = fs.readFileSync(path.join(dispatchDir, "quick-assign.service.ts"), "utf8");
const inlineService = fs.readFileSync(path.join(dispatchDir, "assignments/quicksave.service.ts"), "utf8");
const routes = fs.readFileSync(path.join(dispatchDir, "quicksave.routes.ts"), "utf8");
const aggregate = fs.readFileSync(path.join(root, "apps/backend/src/mdata/equipment-aggregate.service.ts"), "utf8");
const profile = fs.readFileSync(path.join(root, "apps/frontend/src/pages/fleet/TrailerProfilePage.tsx"), "utf8");

describe("quick-assign trailer linkage", () => {
  it("validates an active entity-scoped trailer before either create-path write", () => {
    expect(service.match(/FROM mdata\.equipment/g)).toHaveLength(2);
    expect(
      service.match(/COALESCE\(currently_leased_to_company_id, owner_company_id\) = \$2::uuid/g)?.length ?? 0
    ).toBeGreaterThanOrEqual(2);
    // Create + update paths each validate trailer (+ unit lease checks may share the same clause).
    expect(service.match(/deactivated_at IS NULL/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(service.match(/E_TRAILER_NOT_FOUND/g)).toHaveLength(2);
    expect(service.indexOf("if (!resolvedTrailerId)")).toBeLessThan(service.indexOf("const update = await client.query"));
    expect(routes).toContain('code === "E_TRAILER_NOT_FOUND"');
    expect(routes).toContain("status: 404");
  });

  it("writes the canonical FK and exposes its exact entity-scoped reverse drill", () => {
    expect(service).toContain("previous_trailer_id, new_trailer_id");
    expect(service).toContain("input.trailer_id ?? null");
    expect(service).toMatch(/resolvedTrailerId \?\? previousTrailerId,\s*userId/);
    expect(service).toContain("async function resolveCurrentTrailerId");
    expect(service).toContain("operating_company_id = $1::uuid");
    expect(
      service.match(/resolveCurrentTrailerId\(\s*client,\s*input\.operating_company_id,\s*input\.load_id,?\s*\)/g)
    ).toHaveLength(2);
    expect(service).toContain("previousTrailerId,\n          input.trailer_id ?? null");
    expect(aggregate).toContain("lah.new_trailer_id = $1::uuid");
    expect(aggregate).toContain("lah.operating_company_id = $2::uuid");
    expect(profile).toContain("aggregate.loads ?? []");
    expect(profile).toContain('kind="load"');
    expect(profile).toContain("No linked loads.");
  });

  it("atomically records previous and new unit/trailer FKs when completing a draft", () => {
    const draftPath = service.match(
      /export async function completeQuicksaveDraft[\s\S]*?export async function listQuicksaveDrafts/
    )?.[0];
    expect(draftPath).toBeTruthy();
    expect(draftPath).not.toMatch(/client\.query\(["'`]\s*(?:BEGIN|COMMIT|ROLLBACK)\s*["'`]\)/);
    expect(draftPath).toMatch(/SELECT assigned_unit_id::text[\s\S]{0,220}FOR UPDATE/);
    expect(draftPath).toContain("previous_unit_id, new_unit_id");
    expect(draftPath).toMatch(/before\.assigned_unit_id,\s*unitId \?\? before\.assigned_unit_id/);
  });

  it("leaves transaction ownership to withCurrentUser on every assignment writer", () => {
    const nestedTransaction = /client\.query\(["'`]\s*(?:BEGIN|COMMIT|ROLLBACK)\s*["'`]\)/;
    expect(service).not.toMatch(nestedTransaction);
    expect(inlineService).not.toMatch(nestedTransaction);
  });
});
