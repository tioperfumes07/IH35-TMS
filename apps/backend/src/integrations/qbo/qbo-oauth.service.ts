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
  authorized_by_user_id: string | null;
  authorized_at: string;
  revoked_at: string | null;
  created_at: string;
  updated_at: string;
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
  const explicit = (process.env.QBO_OAUTH_REDIRECT_URI ?? "").trim();
  if (explicit) return explicit;
  const webhookBase = (process.env.WEBHOOK_BASE_URL ?? "").trim();
  if (!webhookBase) throw new Error("QBO_OAUTH_REDIRECT_URI or WEBHOOK_BASE_URL is required");
  return `${webhookBase.replace(/\/$/, "")}/api/v1/integrations/qbo/oauth-callback`;
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

async function getConnectionById(connectionId: string) {
  return withLuciaBypass(async (client) => {
    const res = await client.query<QboConnectionRow>(`SELECT * FROM integrations.qbo_connections WHERE id = $1 LIMIT 1`, [connectionId]);
    return res.rows[0] ?? null;
  });
}

function expiryFromNow(seconds: number) {
  return new Date(Date.now() + seconds * 1000).toISOString();
}

export function buildAuthorizationUrl(operatingCompanyId: string, redirectUri = redirectUriFromEnv()) {
  const clientId = requireEnv("QBO_CLIENT_ID");
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
  const response = await fetch(qboTokenEndpoint(), {
    method: "POST",
    headers: {
      Authorization: basicClientAuthHeader(),
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: form,
  });
  const payload = (await response.json()) as Partial<TokenExchangeResponse>;
  if (!response.ok || !payload.access_token || !payload.refresh_token) {
    throw new Error(`QBO token exchange failed: status=${response.status}`);
  }
  return payload as TokenExchangeResponse;
}

export async function exchangeAuthCodeForTokens(
  code: string,
  realmId: string,
  operatingCompanyId: string,
  userId: string,
  redirectUri = redirectUriFromEnv()
) {
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
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);
    const existing = await client.query<{ id: string }>(
      `
        SELECT id
        FROM integrations.qbo_connections
        WHERE operating_company_id = $1
          AND realm_id = $2
          AND revoked_at IS NULL
        LIMIT 1
      `,
      [operatingCompanyId, realmId]
    );

    if (existing.rows[0]?.id) {
      const id = existing.rows[0].id;
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
            authorized_by_user_id = $6,
            authorized_at = now(),
            updated_at = now(),
            revoked_at = NULL
          WHERE id = $1
        `,
        [id, accessTokenEncrypted, refreshTokenEncrypted, accessTokenExpiresAt, refreshTokenExpiresAt, userId]
      );
      return id;
    }

    const insert = await client.query<{ id: string }>(
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
          updated_at
        )
        VALUES ($1,$2,$3,$4,$5,$6,now(),now(),$7,now(),now(),now())
        RETURNING id
      `,
      [operatingCompanyId, realmId, accessTokenEncrypted, refreshTokenEncrypted, accessTokenExpiresAt, refreshTokenExpiresAt, userId]
    );
    return insert.rows[0]?.id ?? null;
  });

  if (!saved) throw new Error("failed_to_store_qbo_connection");
  await withCurrentUser(userId, async (client) => {
    await appendCrudAudit(
      client,
      userId,
      "integrations.qbo.authorized",
      { operating_company_id: operatingCompanyId, realm_id: realmId, connection_id: saved },
      "info",
      "P5-T6-HOTFIX-QBO-OAUTH"
    );
  });
  return getConnectionById(saved);
}

export async function refreshAccessToken(connectionId: string, actorUserId?: string | null) {
  const connection = await getConnectionById(connectionId);
  if (!connection || connection.revoked_at) throw new Error("qbo_connection_not_found");

  const refreshToken = decryptToken(connection.refresh_token);
  const payload = await tokenExchangeRequest(
    new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    })
  );

  const accessTokenEncrypted = encryptToken(payload.access_token);
  const refreshTokenEncrypted = encryptToken(payload.refresh_token);
  const accessTokenExpiresAt = expiryFromNow(Number(payload.expires_in ?? 3600));
  const refreshTokenExpiresAt = expiryFromNow(Number(payload.x_refresh_token_expires_in ?? 8_640_000));

  await withLuciaBypass(async (client) => {
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
          updated_at = now()
        WHERE id = $1
      `,
      [connectionId, accessTokenEncrypted, refreshTokenEncrypted, accessTokenExpiresAt, refreshTokenExpiresAt]
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

  const updated = await getConnectionById(connectionId);
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
  const next = needsRefresh ? await refreshAccessToken(connection.id) : connection;

  await withLuciaBypass((client) =>
    client.query(`UPDATE integrations.qbo_connections SET last_used_at = now(), updated_at = now() WHERE id = $1`, [next.id])
  );
  return {
    access_token: decryptToken(next.access_token),
    realm_id: next.realm_id,
    connection_id: next.id,
    refresh_token_expires_at: next.refresh_token_expires_at,
    last_used_at: next.last_used_at,
    last_refreshed_at: next.last_refreshed_at,
  };
}

export async function revokeConnection(connectionId: string, userId: string) {
  const connection = await getConnectionById(connectionId);
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
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [connection.operating_company_id]);
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

export async function getQboConnectionStatus(operatingCompanyId: string) {
  const connection = await getActiveConnectionByCompany(operatingCompanyId);
  if (!connection) {
    return {
      connected: false,
      realm_id: null,
      refresh_token_expires_at: null,
      last_used_at: null,
      last_refreshed_at: null,
      connection_id: null,
    };
  }
  return {
    connected: true,
    realm_id: connection.realm_id,
    refresh_token_expires_at: connection.refresh_token_expires_at,
    last_used_at: connection.last_used_at,
    last_refreshed_at: connection.last_refreshed_at,
    connection_id: connection.id,
  };
}

export async function getConnectionsExpiringWithin(secondsAhead: number) {
  return withLuciaBypass(async (client) => {
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
          AND refresh_token_expires_at <= now() + ($1::int * interval '1 second')
        ORDER BY refresh_token_expires_at ASC
      `,
      [secondsAhead]
    );
    return res.rows;
  });
}

