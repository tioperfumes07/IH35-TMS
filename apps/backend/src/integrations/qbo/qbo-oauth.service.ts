import crypto from "node:crypto";
import { appendCrudAudit } from "../../audit/crud-audit.js";
import { withCurrentUser, withLuciaBypass } from "../../auth/db.js";

type TokenExchangeResponse = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  x_refresh_token_expires_in: number;
};

type QboConnectionRow = {
  id: string;
  operating_company_id: string;
  realm_id: string;
  access_token: string;
  refresh_token: string;
  access_token_expires_at: string;
  refresh_token_expires_at: string;
  last_refreshed_at: string | null;
  last_used_at: string | null;
  needs_reauth_at: string | null;
  last_refresh_error: string | null;
  authorized_by_user_id: string | null;
  authorized_at: string;
  revoked_at: string | null;
  created_at: string;
  updated_at: string;
};

export type RealmLinkSummary = {
  operating_company_id: string;
  company_code: string | null;
  company_short_name: string | null;
  connection_id: string;
};

export type ExchangeAuthCodeResult = {
  connection: QboConnectionRow;
  realmLinks: RealmLinkSummary[];
};

function requireEnv(name: string) {
  const value = (process.env[name] ?? "").trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function qboTokenEndpoint() {
  return "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
}

function qboRevokeEndpoint() {
  return "https://developer.api.intuit.com/v2/oauth2/tokens/revoke";
}

function redirectUriFromEnv() {
  const webhookBase = (process.env.WEBHOOK_BASE_URL ?? "").trim();
  if (webhookBase) return `${webhookBase.replace(/\/$/, "")}/api/v1/integrations/qbo/oauth-callback`;
  const explicit = (process.env.QBO_OAUTH_REDIRECT_URI ?? "").trim();
  if (explicit) return explicit;
  throw new Error("WEBHOOK_BASE_URL or QBO_OAUTH_REDIRECT_URI is required");
}

function sanitizeTokenResponsePreview(bodyText: string) {
  return bodyText
    .replace(/"access_token"\s*:\s*"[^"]*"/g, '"access_token":"[REDACTED]"')
    .replace(/"refresh_token"\s*:\s*"[^"]*"/g, '"refresh_token":"[REDACTED]"')
    .slice(0, 500);
}

function clientIdPrefix() {
  const clientId = requireEnv("QBO_CLIENT_ID");
  return clientId.slice(0, 10);
}

function logOauthStep(level: "info" | "error", payload: Record<string, unknown>) {
  if (level === "error") {
    console.error("[QBO_OAUTH]", payload);
    return;
  }
  console.info("[QBO_OAUTH]", payload);
}

function redactedFormMetadata(form: URLSearchParams) {
  return {
    grant_type: form.get("grant_type"),
    has_code: Boolean(form.get("code")),
    has_refresh_token: Boolean(form.get("refresh_token")),
    has_redirect_uri: Boolean(form.get("redirect_uri")),
    redirect_uri: form.get("redirect_uri"),
  };
}

function ensureAuthorizationCodeRedirectUri(form: URLSearchParams) {
  const grantType = form.get("grant_type");
  if (grantType === "authorization_code") {
    const redirectUri = redirectUriFromEnv();
    form.set("redirect_uri", redirectUri);
    return redirectUri;
  }
  return form.get("redirect_uri");
}

function encryptionKeyBytes() {
  const secret = requireEnv("ENCRYPTION_KEY");
  return crypto.createHash("sha256").update(secret, "utf8").digest();
}

function encryptToken(plain: string) {
  const iv = crypto.randomBytes(12);
  const key = encryptionKeyBytes();
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}.${tag.toString("base64")}.${encrypted.toString("base64")}`;
}

function decryptToken(value: string) {
  const [ivB64, tagB64, cipherB64] = value.split(".");
  if (!ivB64 || !tagB64 || !cipherB64) throw new Error("invalid_encrypted_token_format");
  const key = encryptionKeyBytes();
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const plain = Buffer.concat([decipher.update(Buffer.from(cipherB64, "base64")), decipher.final()]);
  return plain.toString("utf8");
}

function basicClientAuthHeader() {
  const clientId = requireEnv("QBO_CLIENT_ID");
  const clientSecret = requireEnv("QBO_CLIENT_SECRET");
  return `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
}

async function appendSystemAudit(eventClass: string, payload: Record<string, unknown>, severity: "info" | "warning" = "info") {
  await withLuciaBypass(async (client) => {
    await client.query(`SELECT audit.append_event($1, $2, $3::jsonb, NULL, $4)`, [
      eventClass,
      severity,
      JSON.stringify(payload),
      "P5-T6-HOTFIX-QBO-OAUTH",
    ]);
  });
}

async function getActiveConnectionByCompany(operatingCompanyId: string) {
  return withLuciaBypass(async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [operatingCompanyId]);
    const res = await client.query<QboConnectionRow>(
      `
        SELECT *
        FROM integrations.qbo_connections
        WHERE operating_company_id = $1
          AND revoked_at IS NULL
        ORDER BY authorized_at DESC
        LIMIT 1
      `,
      [operatingCompanyId]
    );
    return res.rows[0] ?? null;
  });
}

export async function findActiveRealmLinks(realmId: string): Promise<RealmLinkSummary[]> {
  return withLuciaBypass(async (client) => {
    const companiesRes = await client.query<{ id: string }>(
      `SELECT id::text AS id FROM org.companies WHERE is_active = true ORDER BY id`
    );

    const links: RealmLinkSummary[] = [];
    for (const company of companiesRes.rows) {
      await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [company.id]);
      const latestRes = await client.query<
        RealmLinkSummary & {
          realm_id: string;
        }
      >(
        `
          SELECT
            qc.operating_company_id::text AS operating_company_id,
            c.code AS company_code,
            c.short_name AS company_short_name,
            qc.id::text AS connection_id,
            qc.realm_id
          FROM integrations.qbo_connections qc
          JOIN org.companies c ON c.id = qc.operating_company_id
          WHERE qc.revoked_at IS NULL
          ORDER BY qc.authorized_at DESC, qc.updated_at DESC
          LIMIT 1
        `,
        []
      );
      const latest = latestRes.rows[0];
      if (latest && latest.realm_id === realmId) {
        links.push({
          operating_company_id: latest.operating_company_id,
          company_code: latest.company_code,
          company_short_name: latest.company_short_name,
          connection_id: latest.connection_id,
        });
      }
    }

    const dedup = new Map<string, RealmLinkSummary>();
    for (const row of links) {
      const key = `${row.operating_company_id}:${row.connection_id}`;
      dedup.set(key, row);
    }
    return Array.from(dedup.values());
  });
}

async function getConnectionById(connectionId: string, operatingCompanyId?: string) {
  return withLuciaBypass(async (client) => {
    if (operatingCompanyId) {
      await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [operatingCompanyId]);
    }
    const res = await client.query<QboConnectionRow>(
      `
        SELECT *
        FROM integrations.qbo_connections
        WHERE id = $1
          AND ($2::uuid IS NULL OR operating_company_id = $2::uuid)
        LIMIT 1
      `,
      [connectionId, operatingCompanyId ?? null]
    );
    return res.rows[0] ?? null;
  });
}

function expiryFromNow(seconds: number) {
  return new Date(Date.now() + seconds * 1000).toISOString();
}

export function buildAuthorizationUrl(operatingCompanyId: string, redirectUri = redirectUriFromEnv()) {
  const clientId = requireEnv("QBO_CLIENT_ID");
  logOauthStep("info", {
    step: "oauth_start_url_built",
    operating_company_id: operatingCompanyId,
    redirect_uri: redirectUri,
    clientIdPrefix: clientIdPrefix(),
  });
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    scope: "com.intuit.quickbooks.accounting",
    redirect_uri: redirectUri,
    state: operatingCompanyId,
  });
  return `https://appcenter.intuit.com/connect/oauth2?${params.toString()}`;
}

async function tokenExchangeRequest(form: URLSearchParams) {
  const redirectUri = ensureAuthorizationCodeRedirectUri(form);
  logOauthStep("info", {
    step: "token_exchange_request",
    token_endpoint: qboTokenEndpoint(),
    clientIdPrefix: clientIdPrefix(),
    redirectUri,
    form: redactedFormMetadata(form),
  });

  const response = await fetch(qboTokenEndpoint(), {
    method: "POST",
    headers: {
      Authorization: basicClientAuthHeader(),
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: form.toString(),
  });
  const responseText = await response.text();
  const responsePreview = sanitizeTokenResponsePreview(responseText);
  logOauthStep("info", {
    step: "token_exchange_response",
    status: response.status,
    statusText: response.statusText,
    bodyPreview: responsePreview,
  });

  let payload: Partial<TokenExchangeResponse> = {};
  try {
    payload = JSON.parse(responseText) as Partial<TokenExchangeResponse>;
  } catch {
    payload = {};
  }
  if (!response.ok || !payload.access_token || !payload.refresh_token) {
    const err = new Error(`QBO token exchange failed: status=${response.status}`);
    (err as { intuitStatus?: number }).intuitStatus = response.status;
    (err as { intuitResponse?: string }).intuitResponse = responsePreview;
    throw err;
  }
  return payload as TokenExchangeResponse;
}

export async function exchangeAuthCodeForTokens(
  code: string,
  realmId: string,
  operatingCompanyId: string,
  userId: string,
  redirectUri = redirectUriFromEnv()
): Promise<ExchangeAuthCodeResult> {
  const existingRealmLinks = await findActiveRealmLinks(realmId);
  const conflictingLinks = existingRealmLinks.filter((row) => row.operating_company_id !== operatingCompanyId);
  if (conflictingLinks.length > 0) {
    const linkedCodes = conflictingLinks.map((row) => row.company_code).filter(Boolean).join(", ");
    await appendSystemAudit(
      "integrations.qbo.shared_realm_blocked",
      {
        realm_id: realmId,
        attempted_operating_company_id: operatingCompanyId,
        linked_company_ids: conflictingLinks.map((row) => row.operating_company_id),
        linked_company_codes: conflictingLinks.map((row) => row.company_code).filter(Boolean),
      },
      "warning"
    );
    throw new Error(
      linkedCodes
        ? `QuickBooks company already linked to ${linkedCodes}. Disconnect it there first to avoid cross-company imports.`
        : "QuickBooks company already linked to another internal company. Disconnect it there first to avoid cross-company imports."
    );
  }

  const payload = await tokenExchangeRequest(
    new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    })
  );

  const accessTokenEncrypted = encryptToken(payload.access_token);
  const refreshTokenEncrypted = encryptToken(payload.refresh_token);
  const accessTokenExpiresAt = expiryFromNow(Number(payload.expires_in ?? 3600));
  const refreshTokenExpiresAt = expiryFromNow(Number(payload.x_refresh_token_expires_in ?? 8_640_000));

  const saved = await withCurrentUser(userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1, false)`, [operatingCompanyId]);
    const upsert = await client.query<QboConnectionRow>(
      `
        INSERT INTO integrations.qbo_connections (
          operating_company_id,
          realm_id,
          access_token,
          refresh_token,
          access_token_expires_at,
          refresh_token_expires_at,
          last_refreshed_at,
          last_used_at,
          authorized_by_user_id,
          authorized_at,
          created_at,
          updated_at,
          revoked_at
        )
        VALUES ($1,$2,$3,$4,$5,$6,now(),now(),$7,now(),now(),now(),NULL)
        ON CONFLICT (operating_company_id, realm_id) WHERE revoked_at IS NULL
        DO UPDATE SET
          access_token = EXCLUDED.access_token,
          refresh_token = EXCLUDED.refresh_token,
          access_token_expires_at = EXCLUDED.access_token_expires_at,
          refresh_token_expires_at = EXCLUDED.refresh_token_expires_at,
          last_refreshed_at = now(),
          last_used_at = now(),
          needs_reauth_at = NULL,
          last_refresh_error = NULL,
          authorized_by_user_id = EXCLUDED.authorized_by_user_id,
          authorized_at = now(),
          updated_at = now(),
          revoked_at = NULL
        RETURNING *
      `,
      [operatingCompanyId, realmId, accessTokenEncrypted, refreshTokenEncrypted, accessTokenExpiresAt, refreshTokenExpiresAt, userId]
    );

    logOauthStep("info", {
      step: "token_save_db_insert",
      operatingCompanyId,
      realmId,
      rowCount: upsert.rowCount ?? 0,
      hasReturnedRow: upsert.rows.length > 0,
    });

    if (!upsert.rows.length) {
      const err = new Error(
        `INSERT INTO integrations.qbo_connections returned 0 rows. Likely RLS blocked the write. Ensure app.operating_company_id=${operatingCompanyId} is set before INSERT.`
      );
      (err as { code?: string }).code = "TOKEN_SAVE_FAILED";
      throw err;
    }
    const saved = upsert.rows[0];

    // Enforce one active QBO connection per internal company.
    await client.query(
      `
        UPDATE integrations.qbo_connections
        SET revoked_at = now(),
            updated_at = now()
        WHERE operating_company_id = $1
          AND id <> $2
          AND revoked_at IS NULL
      `,
      [operatingCompanyId, saved.id]
    );

    return saved;
  });

  await withCurrentUser(userId, async (client) => {
    await appendCrudAudit(
      client,
      userId,
      "integrations.qbo.authorized",
      { operating_company_id: operatingCompanyId, realm_id: realmId, connection_id: saved.id },
      "info",
      "P5-T6-HOTFIX-QBO-OAUTH"
    );
  });

  const realmLinks = await findActiveRealmLinks(realmId);
  const linkedOtherCompanies = realmLinks.filter((row) => row.operating_company_id !== operatingCompanyId);
  if (linkedOtherCompanies.length > 0) {
    await appendSystemAudit(
      "integrations.qbo.shared_realm_detected",
      {
        realm_id: realmId,
        primary_operating_company_id: operatingCompanyId,
        linked_company_ids: linkedOtherCompanies.map((row) => row.operating_company_id),
        linked_company_codes: linkedOtherCompanies.map((row) => row.company_code).filter(Boolean),
      },
      "warning"
    );
  }

  return { connection: saved, realmLinks };
}

/**
 * Stamp a token-refresh failure on the connection so the "connected" state stops lying.
 * `needs_reauth_at` is set ONLY for auth failures (dead/expired refresh token — Intuit
 * invalid_grant, HTTP 400/401), which a re-authorization fixes. Transient failures
 * (network/5xx) record `last_refresh_error` for diagnostics but do NOT flip the reauth
 * flag, so a temporary blip doesn't nag the owner to reconnect. Never throws — best-effort
 * observability that must not mask the original refresh error the caller will re-raise.
 */
async function stampRefreshFailure(
  connectionId: string,
  operatingCompanyId: string,
  error: unknown
): Promise<void> {
  const intuitStatus = (error as { intuitStatus?: number }).intuitStatus;
  const isAuthFailure = intuitStatus === 400 || intuitStatus === 401;
  const rawMessage = String((error as Error)?.message ?? "qbo_token_refresh_failed");
  const errorSummary = (
    intuitStatus ? `status=${intuitStatus} ${rawMessage}` : rawMessage
  ).slice(0, 500);
  try {
    await withLuciaBypass(async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [operatingCompanyId]);
      await client.query(
        `
          UPDATE integrations.qbo_connections
          SET
            last_refresh_error = $3,
            needs_reauth_at = CASE WHEN $4::boolean THEN COALESCE(needs_reauth_at, now()) ELSE needs_reauth_at END,
            updated_at = now()
          WHERE id = $1
            AND operating_company_id = $2
        `,
        [connectionId, operatingCompanyId, errorSummary, isAuthFailure]
      );
    });
    await appendSystemAudit(
      "integrations.qbo.refresh_failed",
      {
        connection_id: connectionId,
        operating_company_id: operatingCompanyId,
        intuit_status: intuitStatus ?? null,
        needs_reauth: isAuthFailure,
        error: errorSummary,
      },
      "warning"
    );
  } catch (stampError) {
    console.error("[QBO_OAUTH]", { step: "stamp_refresh_failure_failed", connectionId, err: String(stampError) });
  }
}

export async function refreshAccessToken(connectionId: string, operatingCompanyId: string, actorUserId?: string | null) {
  const connection = await getConnectionById(connectionId, operatingCompanyId);
  if (!connection || connection.revoked_at) throw new Error("qbo_connection_not_found");

  const refreshToken = decryptToken(connection.refresh_token);
  let payload: TokenExchangeResponse;
  try {
    payload = await tokenExchangeRequest(
      new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      })
    );
  } catch (error) {
    // Dead/expired refresh token or transient failure — record it so status stops
    // silently reporting "connected", then re-raise for the caller.
    await stampRefreshFailure(connectionId, operatingCompanyId, error);
    throw error;
  }

  const accessTokenEncrypted = encryptToken(payload.access_token);
  const refreshTokenEncrypted = encryptToken(payload.refresh_token);
  const accessTokenExpiresAt = expiryFromNow(Number(payload.expires_in ?? 3600));
  const refreshTokenExpiresAt = expiryFromNow(Number(payload.x_refresh_token_expires_in ?? 8_640_000));

  await withLuciaBypass(async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [operatingCompanyId]);
    await client.query(
      `
        UPDATE integrations.qbo_connections
        SET
          access_token = $2,
          refresh_token = $3,
          access_token_expires_at = $4,
          refresh_token_expires_at = $5,
          last_refreshed_at = now(),
          last_used_at = now(),
          needs_reauth_at = NULL,
          last_refresh_error = NULL,
          updated_at = now()
        WHERE id = $1
          AND operating_company_id = $6
      `,
      [connectionId, accessTokenEncrypted, refreshTokenEncrypted, accessTokenExpiresAt, refreshTokenExpiresAt, operatingCompanyId]
    );
  });

  if (actorUserId) {
    await withCurrentUser(actorUserId, async (client) => {
      await appendCrudAudit(
        client,
        actorUserId,
        "integrations.qbo.token_refreshed",
        { connection_id: connectionId, operating_company_id: connection.operating_company_id, realm_id: connection.realm_id },
        "info",
        "P5-T6-HOTFIX-QBO-OAUTH"
      );
    });
  } else {
    await appendSystemAudit("integrations.qbo.token_refreshed", {
      connection_id: connectionId,
      operating_company_id: connection.operating_company_id,
      realm_id: connection.realm_id,
    });
  }

  const updated = await getConnectionById(connectionId, operatingCompanyId);
  if (!updated) throw new Error("qbo_connection_refresh_failed");
  return updated;
}

export async function getValidAccessToken(operatingCompanyId: string) {
  const connection = await getActiveConnectionByCompany(operatingCompanyId);
  if (!connection) {
    throw new Error("QBO not authorized for this company. Please authorize via /admin/forensic-review.");
  }

  const expiresAt = new Date(connection.access_token_expires_at).getTime();
  const needsRefresh = Number.isNaN(expiresAt) || expiresAt <= Date.now() + 5 * 60 * 1000;
  const next = needsRefresh ? await refreshAccessToken(connection.id, operatingCompanyId) : connection;

  await withLuciaBypass(async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [operatingCompanyId]);
    await client.query(
      `UPDATE integrations.qbo_connections SET last_used_at = now(), updated_at = now() WHERE id = $1 AND operating_company_id = $2`,
      [next.id, operatingCompanyId]
    );
  });
  return {
    access_token: decryptToken(next.access_token),
    realm_id: next.realm_id,
    connection_id: next.id,
    refresh_token_expires_at: next.refresh_token_expires_at,
    last_used_at: next.last_used_at,
    last_refreshed_at: next.last_refreshed_at,
  };
}

export async function revokeConnection(connectionId: string, operatingCompanyId: string, userId: string) {
  const connection = await getConnectionById(connectionId, operatingCompanyId);
  if (!connection || connection.revoked_at) throw new Error("qbo_connection_not_found");

  const refreshToken = decryptToken(connection.refresh_token);
  await fetch(qboRevokeEndpoint(), {
    method: "POST",
    headers: {
      Authorization: basicClientAuthHeader(),
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({ token: refreshToken }),
  }).catch(() => {
    // Continue local revoke even if remote revoke fails.
  });

  await withCurrentUser(userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [connection.operating_company_id]);
    await client.query(`UPDATE integrations.qbo_connections SET revoked_at = now(), updated_at = now() WHERE id = $1`, [connectionId]);
    await appendCrudAudit(
      client,
      userId,
      "integrations.qbo.revoked",
      { connection_id: connectionId, operating_company_id: connection.operating_company_id, realm_id: connection.realm_id },
      "warning",
      "P5-T6-HOTFIX-QBO-OAUTH"
    );
  });
  return { ok: true };
}

/** True if the company has EVER had a QBO connection row (any state, incl. revoked). The disconnect
 *  watchdog uses this to skip NEVER-connected entities (e.g. parallel-books USMCA, which has no QBO
 *  company) so they don't get re-auth reminder emails forever. RLS on integrations.qbo_connections is
 *  operating_company_id-scoped (NOT lucia-bypassable), so we must set the GUC per company. */
export async function companyHasQboConnectionRecord(operatingCompanyId: string): Promise<boolean> {
  return withLuciaBypass(async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [operatingCompanyId]);
    const res = await client.query(
      `SELECT 1 FROM integrations.qbo_connections WHERE operating_company_id = $1 LIMIT 1`,
      [operatingCompanyId]
    );
    return res.rows.length > 0;
  });
}

export async function getQboConnectionStatus(operatingCompanyId: string) {
  const connection = await getActiveConnectionByCompany(operatingCompanyId);
  if (!connection) {
    return {
      connected: false,
      needs_reauth: false,
      needs_reauth_at: null,
      last_refresh_error: null,
      realm_id: null,
      refresh_token_expires_at: null,
      last_used_at: null,
      last_refreshed_at: null,
      connection_id: null,
    };
  }
  // A row exists but its refresh token is dead (invalid_grant on refresh) — reconciliation
  // has silently stopped. Report connected=false so the UI stops showing "connected" and
  // prompts a re-authorization instead.
  const needsReauth = Boolean(connection.needs_reauth_at);
  return {
    connected: !needsReauth,
    needs_reauth: needsReauth,
    needs_reauth_at: connection.needs_reauth_at,
    last_refresh_error: connection.last_refresh_error,
    realm_id: connection.realm_id,
    refresh_token_expires_at: connection.refresh_token_expires_at,
    last_used_at: connection.last_used_at,
    last_refreshed_at: connection.last_refreshed_at,
    connection_id: connection.id,
  };
}

/**
 * @deprecated Selects on `refresh_token_expires_at` — WRONG for the hourly token-refresh cron.
 * Refresh tokens last ~100 days, so a connection whose ~1h ACCESS token is already dead is never
 * returned here and its access token is never refreshed, silently going stale ~1h after each re-auth.
 * The token-refresh cron now uses {@link getConnectionsWithAccessTokenExpiringWithin} instead. Kept
 * only for backward compatibility; do NOT use it for the refresh cron (CI guard
 * verify-qbo-refresh-uses-access-token enforces this).
 */
export async function getConnectionsExpiringWithin(secondsAhead: number) {
  return withLuciaBypass(async (client) => {
    const companies = await client.query<{ id: string }>(
      `SELECT id::text AS id FROM org.companies WHERE is_active = true ORDER BY id`
    );

    const out: Array<{
      id: string;
      operating_company_id: string;
      realm_id: string;
      refresh_token_expires_at: string;
      revoked_at: string | null;
    }> = [];

    for (const company of companies.rows) {
      await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [company.id]);
      const res = await client.query<{
        id: string;
        operating_company_id: string;
        realm_id: string;
        refresh_token_expires_at: string;
        revoked_at: string | null;
      }>(
        `
          SELECT id, operating_company_id, realm_id, refresh_token_expires_at, revoked_at
          FROM integrations.qbo_connections
          WHERE revoked_at IS NULL
          ORDER BY authorized_at DESC, updated_at DESC
          LIMIT 1
        `
      );
      if (!res.rows.length) continue;
      const latest = res.rows[0];
      const isExpiringRes = await client.query<{ expiring: boolean }>(
        `
          SELECT ($1::timestamptz <= now() + ($2::int * interval '1 second')) AS expiring
        `,
        [latest.refresh_token_expires_at, secondsAhead]
      );
      if (isExpiringRes.rows[0]?.expiring) {
        out.push(latest);
      }
    }
    return out;
  });
}

/**
 * Selects EVERY non-revoked QBO connection whose ACCESS token is expired or expires within
 * `secondsAhead` seconds. This is the correct selector for the hourly token-refresh cron: it mirrors
 * the on-demand `getValidAccessToken` freshness test (`access_token_expires_at`), NOT the ~100-day
 * `refresh_token_expires_at`. The `<=` comparison self-heals connections whose access token is ALREADY
 * dead. There is intentionally NO `LIMIT 1` — all non-revoked connections across every entity (TRANSP,
 * TRK, future USMCA) are refreshed each tick. Per-company GUC is set so FORCE-RLS on
 * integrations.qbo_connections lets each company's rows be read (a raw cross-company SELECT returns 0).
 */
export async function getConnectionsWithAccessTokenExpiringWithin(secondsAhead: number) {
  return withLuciaBypass(async (client) => {
    const companies = await client.query<{ id: string }>(
      `SELECT id::text AS id FROM org.companies WHERE is_active = true ORDER BY id`
    );

    const out: Array<{
      id: string;
      operating_company_id: string;
      realm_id: string;
      access_token_expires_at: string;
      revoked_at: string | null;
    }> = [];

    for (const company of companies.rows) {
      await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [company.id]);
      const res = await client.query<{
        id: string;
        operating_company_id: string;
        realm_id: string;
        access_token_expires_at: string;
        revoked_at: string | null;
      }>(
        `
          SELECT id, operating_company_id, realm_id, access_token_expires_at, revoked_at
          FROM integrations.qbo_connections
          WHERE revoked_at IS NULL
            AND access_token_expires_at <= now() + ($1::int * interval '1 second')
          ORDER BY authorized_at DESC, updated_at DESC
        `,
        [secondsAhead]
      );
      for (const row of res.rows) out.push(row);
    }
    return out;
  });
}

