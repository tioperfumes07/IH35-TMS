import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  ALLOWED_DOC_MIME_TYPES,
  MAX_DOC_UPLOAD_BYTES,
  isAllowedDocMimeType,
} from "../../docs/upload-constraints.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const filesRoutesSrc = readFileSync(resolve(HERE, "../../docs/files.routes.ts"), "utf8");
const attachmentsRoutesSrc = readFileSync(resolve(HERE, "../attachments.routes.ts"), "utf8");

describe("DOCS-2 guard: docs uploader size cap + MIME allowlist", () => {
  it("caps upload size at 25 MiB (matching the attachments uploader)", () => {
    expect(MAX_DOC_UPLOAD_BYTES).toBe(25 * 1024 * 1024);
  });

  it("allows the real business document types the UI uploads", () => {
    for (const mime of [
      "application/pdf",
      "image/jpeg",
      "image/png",
      "image/heic",
      "text/csv",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ]) {
      expect(isAllowedDocMimeType(mime), mime).toBe(true);
    }
  });

  it("allows application/octet-stream (browser-unknown fallback sent by UploadModal)", () => {
    // UploadModal.tsx sends `file.type || "application/octet-stream"`; blocking it breaks legit
    // uploads. octet-stream is download-forced, never rendered inline, so it is XSS-safe.
    expect(isAllowedDocMimeType("application/octet-stream")).toBe(true);
  });

  it("is case-insensitive and trims", () => {
    expect(isAllowedDocMimeType("  APPLICATION/PDF  ")).toBe(true);
  });

  it("BLOCKS inline-renderable / executable attack vectors (negative test)", () => {
    for (const mime of [
      "text/html",
      "application/xhtml+xml",
      "image/svg+xml",
      "application/javascript",
      "text/javascript",
      "application/x-msdownload",
      "application/x-sh",
      "application/x-executable",
    ]) {
      expect(isAllowedDocMimeType(mime), mime).toBe(false);
      expect(ALLOWED_DOC_MIME_TYPES.has(mime), mime).toBe(false);
    }
  });

  it("wires the size cap + allowlist into BOTH docs upload schemas (upload-url + versions)", () => {
    // Static guard: the zod schemas must reference the shared constraints so the cap/allowlist
    // cannot silently regress back to `size_bytes.min(1)` / unbounded mime_type.
    const uploadRefs = filesRoutesSrc.match(/\.refine\(isAllowedDocMimeType/g) ?? [];
    const sizeRefs = filesRoutesSrc.match(/\.max\(MAX_DOC_UPLOAD_BYTES\)/g) ?? [];
    // uploadUrlBodySchema + createVersionBodySchema
    expect(uploadRefs.length).toBeGreaterThanOrEqual(2);
    expect(sizeRefs.length).toBeGreaterThanOrEqual(2);
    expect(filesRoutesSrc).not.toMatch(/mime_type:\s*z\.string\(\)\.trim\(\)\.min\(1\)\.max\(200\),/);
  });
});

describe("DOCS-2 guard: attachments DELETE is role-gated", () => {
  it("gates DELETE /api/v1/attachments/:id behind a role check", () => {
    // Slice the delete handler body and assert it enforces a role gate before deleting.
    const start = attachmentsRoutesSrc.indexOf('app.delete("/api/v1/attachments/:id"');
    expect(start).toBeGreaterThan(-1);
    const handler = attachmentsRoutesSrc.slice(start, start + 600);
    expect(handler).toMatch(/requireRole\(reply, user\.role/);
    // The gate must run before the destructive service call.
    const gateIdx = handler.indexOf("requireRole(");
    const deleteIdx = handler.indexOf("softDeleteAttachment");
    expect(gateIdx).toBeGreaterThan(-1);
    expect(deleteIdx).toBeGreaterThan(gateIdx);
  });

  it("restricts the delete gate to Owner/Administrator (void/cancel governance)", () => {
    expect(attachmentsRoutesSrc).toMatch(/ATTACHMENT_DELETE_ROLES\s*=\s*\["Owner",\s*"Administrator"\]/);
  });
});
