import fs from "node:fs";
import path from "node:path";

// Regression lock for the legal e-sign verification bypass (fix/legal-esign-verified-at-and-pdf-hardening).
//
// completePublicSigning used to gate signing on `verification_code_hash` being NULL to mean
// "verified". But confirmPublicSigningVerification NULLs that SAME column on a SUCCESSFUL code check,
// so it was indistinguishable from a fresh, never-verified token — a never-verified sms/email token
// could sign WITHOUT verification. The fix is POSITIVE PROOF: a `verified_at` column set on confirm
// and required (IS NOT NULL) before signing for any channel other than "none".
//
// This guard fails the build (loud, with file + reason) if any of the three load-bearing pieces is
// reverted:
//   1. completePublicSigning gate references token.verified_at (NOT solely verification_code_hash).
//   2. confirmPublicSigningVerification sets verified_at = now().
//   3. pdf-renderer.service.ts launches Chromium with --no-sandbox (else PDF render dies in the
//      Render container on the signing hot path).
const CONTRACTS = "apps/backend/src/legal/contracts.service.ts";
const PDF_RENDERER = "apps/backend/src/legal/pdf-renderer.service.ts";

function read(rel) {
  const abs = path.resolve(rel);
  if (!fs.existsSync(abs)) {
    console.error(`verify-legal-esign-verified-at-gate FAILED — missing ${rel}`);
    process.exit(1);
  }
  return fs.readFileSync(abs, "utf8");
}

function sliceFn(src, fnName) {
  const start = src.indexOf(`function ${fnName}`);
  if (start === -1) return "";
  // Heuristic: from the function declaration to the next top-level `export ` after it (or EOF).
  const rest = src.slice(start + 1);
  const nextExport = rest.indexOf("\nexport ");
  return nextExport === -1 ? src.slice(start) : src.slice(start, start + 1 + nextExport);
}

export default {
  name: "verify-legal-esign-verified-at-gate",
  run: async () => {
    const fails = [];

    const contracts = read(CONTRACTS);
    const completeBody = sliceFn(contracts, "completePublicSigning");
    const confirmBody = sliceFn(contracts, "confirmPublicSigningVerification");

    // 1. completePublicSigning must gate on token.verified_at (positive proof), not solely the hash.
    if (!/!token\.verified_at/.test(completeBody) || !/legal_verification_required_before_sign/.test(completeBody)) {
      fails.push(
        `${CONTRACTS}: completePublicSigning must gate signing on \`!token.verified_at\` (throwing ` +
          `legal_verification_required_before_sign). The old \`token.verification_code_hash\` gate was bypassable ` +
          "because confirm NULLs that same column on success."
      );
    }

    // 2. confirmPublicSigningVerification must record positive proof: verified_at = now().
    if (!/verified_at\s*=\s*now\(\)/.test(confirmBody)) {
      fails.push(
        `${CONTRACTS}: confirmPublicSigningVerification must set \`verified_at = now()\` on a successful code ` +
          "check, otherwise the completePublicSigning gate can never pass."
      );
    }

    // 3. PDF renderer must launch with --no-sandbox so Chromium runs in the Render container.
    const renderer = read(PDF_RENDERER);
    if (!/--no-sandbox/.test(renderer)) {
      fails.push(
        `${PDF_RENDERER}: puppeteer.launch must include "--no-sandbox" (and --disable-setuid-sandbox) or the ` +
          "signed-PDF render dies in the Render container on the signing hot path."
      );
    }

    if (fails.length) {
      console.error("verify-legal-esign-verified-at-gate FAILED:");
      for (const f of fails) console.error("  - " + f);
      process.exit(1);
    }
    console.log(
      "verify-legal-esign-verified-at-gate OK — positive-proof verified_at gate + --no-sandbox PDF launch in place."
    );
  },
};
