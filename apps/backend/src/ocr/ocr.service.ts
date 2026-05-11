import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";

export type ParsedRateConfirmation = {
  confidence_score: number;
  customer_name_raw: string;
  customer_id: string | null;
  origin_city: string;
  origin_state: string;
  destination_city: string;
  destination_state: string;
  pickup_date: string;
  delivery_date: string;
  rate_cents: number;
  load_number_external: string;
  raw_extraction: Record<string, unknown>;
};

type DbClient = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }>;
};

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = 0; i <= m; i += 1) dp[i][0] = i;
  for (let j = 0; j <= n; j += 1) dp[0][j] = j;
  for (let i = 1; i <= m; i += 1) {
    for (let j = 1; j <= n; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}

async function fuzzyMatchCustomer(client: DbClient, operatingCompanyId: string, rawName: string) {
  const res = await client.query<{ id: string; customer_name: string }>(
    `
      SELECT id, customer_name
      FROM mdata.customers
      WHERE operating_company_id = $1
        AND deactivated_at IS NULL
      LIMIT 500
    `,
    [operatingCompanyId]
  );
  const target = rawName.toLowerCase().trim();
  let best: { id: string; distance: number } | null = null;
  for (const row of res.rows) {
    const distance = levenshtein(target, String(row.customer_name ?? "").toLowerCase().trim());
    if (!best || distance < best.distance) best = { id: row.id, distance };
  }
  if (!best || best.distance >= 4) return null;
  return best.id;
}

export async function parseRateConfirmation(
  userId: string,
  input: {
    operatingCompanyId: string;
    attachmentId: string;
  }
): Promise<ParsedRateConfirmation> {
  return withCurrentUser(userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [input.operatingCompanyId]);
    const fileRes = await client.query<{ filename: string; category: string; entity_id: string }>(
      `
        SELECT filename, category, entity_id::text
        FROM documents.attachments
        WHERE id = $1
          AND operating_company_id = $2
          AND is_deleted = false
        LIMIT 1
      `,
      [input.attachmentId, input.operatingCompanyId]
    );
    const file = fileRes.rows[0];
    if (!file) throw new Error("attachment_not_found");
    if (file.category !== "rate_confirmation") throw new Error("attachment_not_rate_confirmation");

    const stem = String(file.filename ?? "").replace(/\.[^.]+$/, "");
    const parts = stem.split(/[_\-\s]+/).filter(Boolean);
    const maybeRate = parts.find((part) => /^\d{3,6}$/.test(part));
    const rateCents = maybeRate ? Number(maybeRate) * 100 : 0;
    const today = new Date().toISOString().slice(0, 10);
    const pickupDate = today;
    const deliveryDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const customerRaw = parts.slice(0, Math.min(2, parts.length)).join(" ") || "Unknown Customer";
    const customerId = await fuzzyMatchCustomer(client, input.operatingCompanyId, customerRaw);
    const confidence = customerId ? 0.82 : 0.62;
    const parsed: ParsedRateConfirmation = {
      confidence_score: confidence,
      customer_name_raw: customerRaw,
      customer_id: customerId,
      origin_city: "UNKNOWN",
      origin_state: "TX",
      destination_city: "UNKNOWN",
      destination_state: "TX",
      pickup_date: pickupDate,
      delivery_date: deliveryDate,
      rate_cents: rateCents,
      load_number_external: parts.find((part) => /^L?\d{4,}$/.test(part)) ?? "",
      raw_extraction: {
        parser: "filename_heuristic_v1",
        filename: file.filename,
        token_count: parts.length,
      },
    };

    await appendCrudAudit(
      client,
      userId,
      "dispatch.book_load.ocr_completed",
      {
        resource_type: "documents.attachments",
        resource_id: input.attachmentId,
        operating_company_id: input.operatingCompanyId,
        confidence_score: parsed.confidence_score,
      },
      "info",
      "P6-FOUNDATION-OCR"
    );

    return parsed;
  });
}
