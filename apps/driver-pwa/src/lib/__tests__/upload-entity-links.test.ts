import { describe, expect, it } from "vitest";
import { resolveEntityLinks } from "../upload-sync";
import type { UploadQueueItem } from "../upload-queue";

/**
 * CLS-ORPHAN-SURFACE. Measured on the prod branch br-fancy-credit-akjnd07a 2026-08-07: `docs.files`
 * held 30 rows while `docs.file_links` held ZERO across every entity type, because `load_stop` was
 * grouped with `standalone` and returned no link — and `load_stop` is the type the ONE surface a
 * driver uses to submit proof of delivery (StopAction → UploadDocumentModal) sends.
 *
 * These assert the MAPPING, which is the contract. `standalone` is the only entity type allowed to
 * produce no link; that is what the word means.
 */

const LOAD = "3f1a2b3c-4d5e-4f60-8a1b-000000000001";
const STOP = "3f1a2b3c-4d5e-4f60-8a1b-000000000002";
const DRIVER = "3f1a2b3c-4d5e-4f60-8a1b-000000000003";

type LinkInput = Pick<UploadQueueItem, "entity_type" | "entity_id" | "parent_load_id">;

describe("resolveEntityLinks (CLS-ORPHAN-SURFACE)", () => {
  it("links a stop capture to its PARENT LOAD, not to the stop", () => {
    const input: LinkInput = { entity_type: "load_stop", entity_id: STOP, parent_load_id: LOAD };
    // The exact regression: this returned undefined, so every BOL/POD captured at a delivery stop
    // was written to docs.files with no row in docs.file_links at all.
    expect(resolveEntityLinks(input)).toEqual([{ entity_type: "load", entity_id: LOAD }]);
  });

  it("never links to the stop id — docs.file_links has no load_stop entity type", () => {
    const links = resolveEntityLinks({ entity_type: "load_stop", entity_id: STOP, parent_load_id: LOAD });
    expect(links?.some((l) => l.entity_id === STOP)).toBe(false);
  });

  it("keeps the driver and load types linking to their own id", () => {
    expect(resolveEntityLinks({ entity_type: "driver", entity_id: DRIVER, parent_load_id: null })).toEqual([
      { entity_type: "driver", entity_id: DRIVER },
    ]);
    expect(resolveEntityLinks({ entity_type: "load", entity_id: LOAD, parent_load_id: null })).toEqual([
      { entity_type: "load", entity_id: LOAD },
    ]);
  });

  it("standalone is the ONLY type that produces no link", () => {
    expect(resolveEntityLinks({ entity_type: "standalone", entity_id: null, parent_load_id: null })).toBeUndefined();
    for (const entity_type of ["driver", "load", "load_stop"] as const) {
      const links = resolveEntityLinks({ entity_type, entity_id: STOP, parent_load_id: LOAD });
      expect(links, `${entity_type} must produce a link`).toBeDefined();
    }
  });

  it("falls back to the stop id for a queue row written before parent_load_id existed", () => {
    // Not silent: an unlinkable id is rejected by the backend's ensureLinkEntityExists as a visible
    // 400, which is strictly better than the orphan this replaced.
    expect(resolveEntityLinks({ entity_type: "load_stop", entity_id: STOP, parent_load_id: null })).toEqual([
      { entity_type: "load", entity_id: STOP },
    ]);
  });

  it("returns undefined rather than a malformed link when the id is not a uuid", () => {
    expect(resolveEntityLinks({ entity_type: "load", entity_id: "not-a-uuid", parent_load_id: null })).toBeUndefined();
    expect(resolveEntityLinks({ entity_type: "load_stop", entity_id: "", parent_load_id: "  " })).toBeUndefined();
  });
});
