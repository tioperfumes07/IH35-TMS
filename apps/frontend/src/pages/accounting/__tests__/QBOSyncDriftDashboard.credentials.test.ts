import { describe, expect, it } from "vitest";
import source from "../QBOSyncDriftDashboard.tsx?raw";

// Regression guard for DISPATCH-C: the QBO Sync Drift dashboard returned 401 (empty body)
// because its data calls used a raw fetch() that omits credentials, so the session cookie
// was never sent to the authed /api/v1/qbo-sync/drift-dashboard route. The fix routes every
// call through apiRequest() (credentials: "include"). Lock that in: no raw fetch() / no
// resolveApiUrl on this page, ever — both silently drop credentials and re-break the screen.

describe("QBOSyncDriftDashboard credentials guard", () => {
  it("routes data calls through apiRequest (sends the session cookie)", () => {
    expect(source).toMatch(/import\s*\{[^}]*\bapiRequest\b[^}]*\}\s*from\s*["']\.\.\/\.\.\/api\/client["']/);
  });

  it("never uses a raw fetch() — that omits credentials and 401s the authed route", () => {
    // strip line + block comments so the explanatory comment mentioning fetch() doesn't trip the guard
    const code = source.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
    expect(code).not.toMatch(/[^a-zA-Z0-9_.]fetch\s*\(/);
  });

  it("does not import resolveApiUrl (raw-URL escape hatch)", () => {
    expect(source).not.toMatch(/\bresolveApiUrl\b/);
  });
});
