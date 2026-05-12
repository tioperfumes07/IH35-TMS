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
  const signatureFooter = buildSignatureFooter(payload);
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
        p { margin: 6px 0; }
      </style>
    </head>
    <body>
      <section class="contract-meta">
        <p><strong>Template:</strong> ${payload.templateCode} v${payload.templateVersion}</p>
        <p><strong>Contract instance:</strong> ${payload.contractInstanceId}</p>
      </section>
      ${body}
      ${signatureFooter}
    </body>
  </html>`;
}

export async function renderSignedContractPdf(payload: LegalPdfPayload) {
  await acquireRenderSlot();
  try {
    const html = buildPdfHtml(payload);
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    try {
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
    } finally {
      await browser.close();
    }
  } finally {
    releaseRenderSlot();
  }
}
