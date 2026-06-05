# Security Baseline — IH35 TMS

**Snapshot date:** 2026-06-05  
**Block:** CLOSURE-19-SEC-AUDIT (Lane B)  
**Owner:** Jorge Munoz

## Posture summary

| Area | Status | CI guard |
|------|--------|----------|
| RLS / tenant isolation | **Amber** — `identity.email_verifications` lacks RLS; carrier-scoped tables guarded by `verify:rls-operating-company-scope` + `verify:no-cross-carrier-data-leak` | `sec-audit-rls-policies.mjs`, existing verify scripts |
| Auth (Google OAuth + Lucia sessions) | **Green** — httpOnly cookies, PKCE, server-side session invalidation on logout | `sec-audit-auth-flows.mjs` |
| Password reset | **Green** — UUID one-time tokens, 1h expiry, `used_at` burn on confirm | `sec-audit-auth-flows.mjs` |
| Secrets in bundles | **Green** — no patterns in built JS (when dist present) | `verify-no-secrets-in-bundle.mjs` |
| Dependency CVEs | **Green** — 0 critical / 0 high (7 moderate across workspace) | `sec-audit-deps-cve-scan.mjs` + PR delta gate |
| CORS | **Green** — explicit allowlist, not `*` | `sec-audit-cors-csp.mjs` |
| CSP / HSTS / X-Frame / Referrer | **Amber** — not set in Fastify or static HTML; Render edge may add HSTS | `sec-audit-cors-csp.mjs` (documents gaps) |
| Driver PWA service worker | **Green** — caches shell assets only, no API response caching | `sec-audit-cors-csp.mjs` |

## Documented exceptions

| ID | Risk | Mitigation | Expires | Owner sign-off |
|----|------|------------|---------|----------------|
| SEC-EX-01 | `identity.email_verifications` has no RLS policies | Table holds pre-auth tokens only; no `operating_company_id`; accessed via Lucia bypass | 2026-09-05 | **Jorge Munoz — accepted 2026-06-05** |
| SEC-EX-02 | No Content-Security-Policy on API or SPA static hosts | Render static hosting; API returns JSON only; frontend uses Vite-built assets without inline scripts | 2026-08-05 | **Jorge Munoz — accepted 2026-06-05** |
| SEC-EX-03 | No X-Frame-Options / Referrer-Policy in app code | Login/OAuth flows use same-site cookies; add helmet middleware in future hardening block | 2026-08-05 | **Jorge Munoz — accepted 2026-06-05** |
| SEC-EX-04 | 7 moderate npm advisories (mostly dev-chain transitive) | `npm audit --omit=dev`; no critical/high; track in SEC-AUDIT upgrade plan | 2026-07-05 | **Jorge Munoz — accepted 2026-06-05** |

## Accepted risks — owner attestation

I, Jorge Munoz, have reviewed the exceptions above and accept them for production operation through their expiration dates, contingent on no new critical/high CVEs or cross-tenant RLS failures.

**Signed:** Jorge Munoz  
**Date:** 2026-06-05

## Automation

- **Workflow:** `.github/workflows/security-checks.yml` — runs on every PR to `main`, every push to `main`, and nightly (06:00 UTC).
- **PR gate:** Fails if new critical/high CVEs are introduced vs base branch.
- **Bundle gate:** `verify-no-secrets-in-bundle.mjs` scans `apps/frontend/dist` and `apps/driver-pwa/dist`.

## Related audits

- Full findings: [SEC-AUDIT-2026-06-05.md](./audits/SEC-AUDIT-2026-06-05.md)
- RLS runtime guards: `scripts/verify-rls-operating-company-scope.mjs`, `scripts/verify-no-cross-carrier-data-leak.mjs`
