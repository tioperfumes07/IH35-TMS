/**
 * Block X — production/staging read-only health checks (P7-VERIFY-1).
 *
 * Auth (pick one):
 * - BLOCK_X_PROD_COOKIE="ih35_session=..." (full Cookie header value optional — if only token, prefix ih35_session=)
 *
 * Env:
 * - BLOCK_X_PROD_BASE_URL (default https://api.ih35dispatch.com)
 * - BLOCK_X_PROD_OPERATING_COMPANY_ID (required when cookie set)
 */
function cookieHeader(): string | null {
  const raw = process.env.BLOCK_X_PROD_COOKIE?.trim();
  if (!raw) return null;
  if (raw.toLowerCase().startsWith("ih35_session=")) return raw;
  return `ih35_session=${raw}`;
}

const BASE_URL = (process.env.BLOCK_X_PROD_BASE_URL ?? "https://api.ih35dispatch.com").replace(/\/$/, "");

function allowedLagMs(record: { frequency?: unknown; cron_expression?: unknown }): number {
  const frequency = String(record.frequency ?? "daily");
  if (frequency === "daily") return 2 * 24 * 60 * 60 * 1000;
  if (frequency === "weekly") return 2 * 7 * 24 * 60 * 60 * 1000;
  if (frequency === "monthly") return 2 * 31 * 24 * 60 * 60 * 1000;
  if (frequency === "cron") {
    const expr = String(record.cron_expression ?? "");
    const m = expr.match(/^\*\/(\d+)\s+/);
    if (m) return 2 * Number(m[1]) * 60 * 1000;
    return 2 * 60 * 60 * 1000;
  }
  return 2 * 24 * 60 * 60 * 1000;
}

type ListRow = {
  id: string;
  status: string;
  last_run_at: string | null;
  cadence_label?: string;
};

async function main() {
  console.log(`\n[block-x production health] BASE_URL=${BASE_URL}`);

  const cookie = cookieHeader();
  const companyId = process.env.BLOCK_X_PROD_OPERATING_COMPANY_ID?.trim();

  const rows: Array<Record<string, string>> = [];

  if (!cookie || !companyId) {
    rows.push({
      check: "scheduled-reports freshness",
      result: "SKIPPED",
      detail: "Set BLOCK_X_PROD_COOKIE and BLOCK_X_PROD_OPERATING_COMPANY_ID",
    });
  } else {
    const headers = { cookie, accept: "application/json" };
    const listRes = await fetch(
      `${BASE_URL}/api/v1/scheduled-reports?operating_company_id=${encodeURIComponent(companyId)}&status=active`,
      { headers }
    );

    if (!listRes.ok) {
      rows.push({
        check: "GET /api/v1/scheduled-reports",
        result: "FAIL",
        detail: `HTTP ${listRes.status}`,
      });
    } else {
      const body = (await listRes.json()) as { rows?: ListRow[] };
      const schedules = Array.isArray(body.rows) ? body.rows : [];
      const candidates = schedules.filter((s) => s.status === "active" && s.last_run_at);

      if (!candidates.length) {
        rows.push({
          check: "active schedules with last_run_at",
          result: "OK",
          detail: "none found (nothing to verify)",
        });
      }

      const now = Date.now();
      for (const s of candidates) {
        const detailRes = await fetch(
          `${BASE_URL}/api/v1/scheduled-reports/${encodeURIComponent(s.id)}?operating_company_id=${encodeURIComponent(companyId)}`,
          { headers }
        );
        if (!detailRes.ok) {
          rows.push({
            check: `schedule ${s.id}`,
            result: "FAIL",
            detail: `detail HTTP ${detailRes.status}`,
          });
          continue;
        }
        const detail = (await detailRes.json()) as { record?: Record<string, unknown> };
        const record = detail.record ?? {};
        const lag = allowedLagMs(record);
        const last = new Date(String(s.last_run_at)).getTime();
        const delta = now - last;
        const ok = delta <= lag + 60 * 1000;
        rows.push({
          check: `last_run_at schedule ${s.id}`,
          result: ok ? "OK" : "WARN",
          detail: ok ? `Δ=${Math.round(delta / 1000)}s (allowed ${Math.round(lag / 1000)}s)` : `stale Δ=${Math.round(delta / 1000)}s`,
        });
      }
    }
  }

  if (!cookie || !companyId) {
    rows.push({
      check: "GET /api/v1/qbo/sync/runs",
      result: "SKIPPED",
      detail: "missing cookie/company",
    });
  } else {
    const syncUrl = `${BASE_URL}/api/v1/qbo/sync/runs?operating_company_id=${encodeURIComponent(companyId)}&limit=1`;
    const syncRes = await fetch(syncUrl, { headers: { cookie, accept: "application/json" } });
    rows.push({
      check: "GET /api/v1/qbo/sync/runs",
      result: syncRes.status === 404 ? "FAIL" : syncRes.ok ? "OK" : `HTTP ${syncRes.status}`,
      detail: syncRes.status === 404 ? "route missing (404)" : `HTTP ${syncRes.status}`,
    });
  }

  console.table(rows);

  const failed = rows.some((r) => r.result === "FAIL");
  if (failed) process.exitCode = 1;

  console.log("\n[block-x production health] done\n");
}

await main();
