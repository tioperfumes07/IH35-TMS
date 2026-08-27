import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const routes = fs.readFileSync(path.join(here, "../loads.routes.ts"), "utf8");

// A9 (2026-07-05, read-only, non-financial): the load-detail read
// (GET /api/v1/dispatch/loads/:id) previously had no way to resolve the load's
// rate-con PDF. mdata.loads has no rate-con column — the real link is the
// polymorphic docs.file_links(entity_type='load', entity_id) -> docs.files,
// filtered to category 'rate_confirmation' via catalogs.file_categories. Guard
// the join shape so the frontend rate-con viewer's ratecon_file_id keeps resolving,
// and so a future edit can't silently widen the scope past THIS load's id (which
// would reopen the lowest-UUID cross-company doc leak).
describe("dispatch/loads.routes — load-detail rate-con read-model (A9)", () => {
  it("resolves ratecon_file_id/_file_name/_uploaded_at from docs.file_links + docs.files, scoped to this load id", () => {
    expect(routes).toContain("rc.file_id AS ratecon_file_id");
    expect(routes).toContain("rc.original_filename AS ratecon_file_name");
    expect(routes).toContain("rc.uploaded_at AS ratecon_uploaded_at");
    // Alias was later renamed df -> rate_file (cosmetic; same join, same deleted_at guard).
    expect(routes).toContain("JOIN docs.files rate_file ON rate_file.id = dfl.file_id AND rate_file.deleted_at IS NULL");
    expect(routes).toContain("fc.code = 'rate_confirmation'");
    expect(routes).toContain("dfl.entity_type = 'load' AND dfl.entity_id = l.id AND dfl.deleted_at IS NULL");
  });
});
