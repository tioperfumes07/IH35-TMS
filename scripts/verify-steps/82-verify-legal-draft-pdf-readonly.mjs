import fs from "node:fs";
import path from "node:path";

// Regression lock for the in-app DRAFT contract PDF endpoint (feat/legal-contract-draft-pdf-view).
//
// GET /api/v1/legal/contracts/:id/draft-pdf lets the owner view/download a SAVED contract as a PDF
// BEFORE e-signing. It is strictly READ-ONLY: it renders from stored content with a "DRAFT — NOT
// EXECUTED" watermark and must NEVER upload to R2 or mutate the database. This guard fails the build
// (loud, with file + reason) if any load-bearing property is reverted:
//   1. The route exists.
//   2. It is office-role gated (requireOfficeRole) — not public.
//   3. It calls the renderer with draft: true (so it can never emit a clean, signed-looking PDF).
//   4. Its handler performs NO write (no R2 PutObject, no INSERT/UPDATE/DELETE).
const ROUTES = "apps/backend/src/legal/contracts.routes.ts";

function read(rel) {
  const abs = path.resolve(rel);
  if (!fs.existsSync(abs)) {
    console.error(`verify-legal-draft-pdf-readonly FAILED — missing ${rel}`);
    process.exit(1);
  }
  return fs.readFileSync(abs, "utf8");
}

// Extract the draft-pdf route handler body (from its app.get registration to the matching close).
function sliceDraftPdfHandler(src) {
  const marker = src.indexOf('app.get("/api/v1/legal/contracts/:id/draft-pdf"');
  if (marker === -1) return "";
  // Next route registration (app.get/app.post) after the marker, or EOF.
  const rest = src.slice(marker + 1);
  const nextRoute = rest.search(/\n {2}app\.(get|post|put|patch|delete)\(/);
  return nextRoute === -1 ? src.slice(marker) : src.slice(marker, marker + 1 + nextRoute);
}

export default {
  name: "verify-legal-draft-pdf-readonly",
  run: async () => {
    const fails = [];
    const src = read(ROUTES);

    // 1. Route present.
    if (!/app\.get\(\s*["']\/api\/v1\/legal\/contracts\/:id\/draft-pdf["']/.test(src)) {
      fails.push(`${ROUTES}: the GET /api/v1/legal/contracts/:id/draft-pdf route must exist.`);
    }

    const handler = sliceDraftPdfHandler(src);

    // 2. Office-role gated.
    if (!/requireOfficeRole\(/.test(handler)) {
      fails.push(`${ROUTES}: the draft-pdf handler must be office-role gated (requireOfficeRole).`);
    }

    // 3. Renders as a draft (watermark/empty-signature path), never a signed-looking PDF.
    if (!/draft:\s*true/.test(handler)) {
      fails.push(`${ROUTES}: the draft-pdf handler must call the renderer with \`draft: true\`.`);
    }

    // 4. Read-only — no R2 upload and no SQL write in the handler.
    if (/PutObjectCommand|r2Client|uploadSignedPdfToR2|getR2Client/.test(handler)) {
      fails.push(`${ROUTES}: the draft-pdf handler must NOT upload to R2 (on-demand render only).`);
    }
    if (/INSERT\s+INTO|UPDATE\s+\w|DELETE\s+FROM/i.test(handler)) {
      fails.push(`${ROUTES}: the draft-pdf handler must be read-only (no INSERT/UPDATE/DELETE).`);
    }

    if (fails.length) {
      console.error("verify-legal-draft-pdf-readonly FAILED:");
      for (const f of fails) console.error("  - " + f);
      process.exit(1);
    }
    console.log(
      "verify-legal-draft-pdf-readonly OK — office-gated, draft:true, read-only (no R2 upload / no DB write)."
    );
  },
};
