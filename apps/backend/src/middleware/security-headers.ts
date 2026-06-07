import type { FastifyInstance } from "fastify";
import helmet from "@fastify/helmet";

/**
 * Registers OWASP-recommended HTTP security headers via @fastify/helmet.
 *
 * CSP is intentionally in report-only mode for a 48h observation window before
 * switching to enforcement. This follows the GAP-SECURITY-HEADERS (Wave B) spec:
 * "CSP in report-only mode 48h first, then enforce."
 *
 * To enforce CSP after observation, change `reportOnly: true` → `reportOnly: false`
 * in the contentSecurityPolicy options below.
 *
 * Ref: docs/dispatch/GAP-BLOCKS-TIER1-TRUST-2026-06-06.md — Block 10
 * Ref: docs/audits/SEC-AUDIT-2026-06-05.md — "helmet middleware recommended"
 */
export async function registerSecurityHeaders(app: FastifyInstance): Promise<void> {
  await app.register(helmet, {
    // ── Content-Security-Policy ───────────────────────────────────────────────
    // report-only during 48h observation window; switch reportOnly→false to enforce.
    // styleSrc/imgSrc are intentionally permissive: server-rendered HTML reports
    // (dispatch sheets, settlement renders) use inline styles and data URIs.
    contentSecurityPolicy: {
      useDefaults: false,
      reportOnly: true,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "https:"],
        fontSrc: ["'self'", "data:"],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        upgradeInsecureRequests: [],
      },
    },

    // ── HSTS ─────────────────────────────────────────────────────────────────
    // 1-year max-age, include subdomains, eligible for preload list.
    // Render may also inject HSTS at the edge; application-level HSTS is additive.
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    },

    // ── X-Frame-Options ──────────────────────────────────────────────────────
    // DENY — no framing allowed (also enforced by CSP frame-ancestors above).
    frameguard: { action: "deny" },

    // ── X-Content-Type-Options ───────────────────────────────────────────────
    noSniff: true,

    // ── Referrer-Policy ──────────────────────────────────────────────────────
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },

    // ── X-DNS-Prefetch-Control ────────────────────────────────────────────────
    dnsPrefetchControl: { allow: false },

    // ── X-Permitted-Cross-Domain-Policies ────────────────────────────────────
    permittedCrossDomainPolicies: { permittedPolicies: "none" },

    // ── Cross-Origin-Opener-Policy (COOP) ─────────────────────────────────────
    crossOriginOpenerPolicy: { policy: "same-origin" },

    // ── Cross-Origin-Resource-Policy (CORP) ───────────────────────────────────
    crossOriginResourcePolicy: { policy: "same-site" },

    // ── Cross-Origin-Embedder-Policy (COEP) ───────────────────────────────────
    // Disabled: COEP require-corp would break Google OAuth + Render static asset
    // CDN cross-origin loads. Re-evaluate when CORP headers propagate to all
    // third-party resources in use.
    crossOriginEmbedderPolicy: false,
  });

  // ── Permissions-Policy ────────────────────────────────────────────────────
  // Set via onSend hook (helmet v8 does not yet expose a first-class option).
  // geolocation=self: driver PWA may request location; all others restricted.
  app.addHook("onSend", async (_req, reply) => {
    reply.header(
      "Permissions-Policy",
      "camera=(), microphone=(), geolocation=(self), payment=(), usb=(), fullscreen=(self)"
    );
  });
}
