import crypto from "node:crypto";
import Handlebars from "handlebars";
import puppeteer from "puppeteer";

type LegalPdfPayload = {
  templateCode: string;
  templateVersion: number;
  contractInstanceId: string;
  language: "en" | "es" | "bilingual";
  signerName: string;
  contentHtmlEn: string;
  contentHtmlEs: string;
  filledVariables: Record<string, unknown>;
  signedAtIso: string;
  typedSignature: string;
  drawnSignatureSvg: string;
  ipAddress: string | null;
  userAgent: string | null;
  // When true, render an UNSIGNED preview: stamp a "DRAFT — NOT EXECUTED" watermark/header and OMIT
  // the electronic-signature evidence block. Additive + default-off so the signed path stays
  // byte-identical when draft is falsy (the signed PDF sha256 must never shift). See draft-pdf route.
  draft?: boolean;
};

let activeRenders = 0;
const MAX_CONCURRENT_RENDERS = 3;
const renderWaiters: Array<() => void> = [];

function releaseRenderSlot() {
  activeRenders = Math.max(activeRenders - 1, 0);
  const next = renderWaiters.shift();
  if (next) next();
}

async function acquireRenderSlot() {
  if (activeRenders < MAX_CONCURRENT_RENDERS) {
    activeRenders += 1;
    return;
  }
  await new Promise<void>((resolve) => {
    renderWaiters.push(() => {
      activeRenders += 1;
      resolve();
    });
  });
}

function renderTemplate(html: string, variables: Record<string, unknown>) {
  const template = Handlebars.compile(html, { noEscape: true });
  return template(variables);
}

function buildSignatureFooter(payload: LegalPdfPayload) {
  const ipLine = payload.ipAddress ? `IP: ${payload.ipAddress}` : "IP: n/a";
  const uaLine = payload.userAgent ? `User-Agent: ${payload.userAgent}` : "User-Agent: n/a";
  const signedAtLine = `Signed at: ${new Date(payload.signedAtIso).toISOString()}`;
  return `
    <section class="signature-proof">
      <h3>Electronic Signature Evidence</h3>
      <p><strong>Signer:</strong> ${payload.signerName}</p>
      <p><strong>Typed signature:</strong> ${payload.typedSignature}</p>
      <div class="drawn-signature">${payload.drawnSignatureSvg}</div>
      <p>${signedAtLine}</p>
      <p>${ipLine}</p>
      <p>${uaLine}</p>
    </section>
  `;
}

function buildPdfHtml(payload: LegalPdfPayload) {
  const resolvedEn = renderTemplate(payload.contentHtmlEn, payload.filledVariables);
  const resolvedEs = renderTemplate(payload.contentHtmlEs, payload.filledVariables);
  // Draft preview: no signature evidence, and stamp the page so an unsigned draft can never be
  // mistaken for an executed contract. Both pieces are empty strings on the signed path, injected
  // with no surrounding whitespace, so a non-draft render is byte-identical to before.
  const signatureFooter = payload.draft ? "" : buildSignatureFooter(payload);
  const draftStyles = payload.draft
    ? `
        .draft-watermark { position: fixed; top: 42%; left: 0; right: 0; text-align: center; font: bold 64px Arial, sans-serif; color: rgba(220, 38, 38, 0.12); transform: rotate(-24deg); letter-spacing: 0.06em; pointer-events: none; z-index: 9999; white-space: nowrap; }
        .draft-banner { border: 1px solid #dc2626; background: #fef2f2; color: #b91c1c; font-weight: bold; text-align: center; padding: 8px; margin-bottom: 14px; letter-spacing: 0.04em; }`
    : "";
  const draftBanner = payload.draft
    ? `
      <div class="draft-watermark">DRAFT — NOT EXECUTED</div>
      <div class="draft-banner">DRAFT — NOT EXECUTED · ${payload.templateCode} v${payload.templateVersion} · ${payload.language.toUpperCase()}</div>`
    : "";
  const body =
    payload.language === "en"
      ? resolvedEn
      : payload.language === "es"
      ? resolvedEs
      : `
        <section class="bilingual-section">
          <h2>English (controlling)</h2>
          ${resolvedEn}
        </section>
        <hr />
        <section class="bilingual-section">
          <h2>Español</h2>
          ${resolvedEs}
        </section>
      `;

  return `<!doctype html>
  <html>
    <head>
      <meta charset="utf-8" />
      <style>
        @page { size: Letter; margin: 0.55in; }
        body { font-family: Arial, sans-serif; color: #0f172a; font-size: 12px; line-height: 1.5; }
        h1, h2, h3 { margin: 0 0 8px; color: #111827; }
        h2 { font-size: 15px; margin-top: 18px; }
        hr { border: 0; border-top: 1px solid #d1d5db; margin: 18px 0; }
        .contract-meta { margin-bottom: 14px; color: #334155; font-size: 11px; }
        .bilingual-section { margin-bottom: 16px; }
        .signature-proof {
          margin-top: 20px;
          border-top: 2px solid #cbd5e1;
          padding-top: 12px;
          font-size: 11px;
          background: #f8fafc;
          page-break-inside: avoid;
        }
        .drawn-signature {
          margin: 8px 0;
          min-height: 48px;
          border: 1px dashed #cbd5e1;
          background: #fff;
          padding: 6px;
        }
        p { margin: 6px 0; }${draftStyles}
      </style>
    </head>
    <body>${draftBanner}
      <section class="contract-meta">
        <p><strong>Template:</strong> ${payload.templateCode} v${payload.templateVersion}</p>
        <p><strong>Contract instance:</strong> ${payload.contractInstanceId}</p>
      </section>
      ${body}
      ${signatureFooter}
    </body>
  </html>`;
}

// Exported for unit testing only (no Chromium needed): asserts draft watermarking + signature
// omission without launching a browser. Do NOT use on the request path — go through
// renderSignedContractPdf so launch/render failures are mapped to legal_pdf_render_failed.
export const __test__ = { buildPdfHtml };

export async function renderSignedContractPdf(payload: LegalPdfPayload) {
  await acquireRenderSlot();
  // --no-sandbox / --disable-setuid-sandbox are required so headless Chromium launches inside the
  // Render container (no user namespaces). Any launch/render failure is mapped to a single clean
  // error (legal_pdf_render_failed) so a raw Chromium stack never escapes onto the signing hot path,
  // and the browser is always closed in finally if it launched.
  let browser: Awaited<ReturnType<typeof puppeteer.launch>> | null = null;
  try {
    const html = buildPdfHtml(payload);
    browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load" });
    const pdf = await page.pdf({ format: "Letter", printBackground: true });
    const pdfBuffer = Buffer.from(pdf);
    const sha256 = crypto.createHash("sha256").update(pdfBuffer).digest("hex");
    const filename = `contract-${payload.templateCode}-v${payload.templateVersion}-${payload.contractInstanceId}.pdf`;
    return {
      html,
      pdfBuffer,
      filename,
      mimeType: "application/pdf",
      sha256,
    };
  } catch (error) {
    console.error("legal_pdf_render_failed", (error as Error)?.message ?? error);
    throw new Error("legal_pdf_render_failed");
  } finally {
    if (browser) {
      await browser.close().catch(() => undefined);
    }
    releaseRenderSlot();
  }
}
