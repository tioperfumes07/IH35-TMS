/**
 * GAP-70 EDI Setup Service — partner registration and connectivity tests.
 */

export type EdiConnectionType = "as2" | "ftp" | "sftp" | "api";

export type DbClient = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[]; rowCount?: number }>;
};

export type EdiPartnerInput = {
  operating_company_id: string;
  partner_name: string;
  isa_qualifier: string;
  isa_id: string;
  gs_qualifier: string;
  gs_id: string;
  connection_type: EdiConnectionType;
  connection_config: Record<string, unknown>;
  supported_transactions?: string[];
};

export type EdiPartner = EdiPartnerInput & {
  uuid: string;
  is_active: boolean;
  created_at: string;
};

export type ConnectionTestResult = {
  ok: boolean;
  message: string;
  latency_ms?: number;
};

export async function addEdiPartner(client: DbClient, input: EdiPartnerInput): Promise<string> {
  const res = await client.query<{ uuid: string }>(
    `
      INSERT INTO integrations.edi_partners (
        operating_company_id,
        partner_name,
        isa_qualifier,
        isa_id,
        gs_qualifier,
        gs_id,
        connection_type,
        connection_config,
        supported_transactions
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::text[])
      RETURNING uuid
    `,
    [
      input.operating_company_id,
      input.partner_name,
      input.isa_qualifier,
      input.isa_id,
      input.gs_qualifier,
      input.gs_id,
      input.connection_type,
      JSON.stringify(input.connection_config ?? {}),
      input.supported_transactions ?? ["204", "214", "210", "990"],
    ]
  );
  return res.rows[0]!.uuid;
}

export async function listPartners(client: DbClient, operatingCompanyId: string): Promise<EdiPartner[]> {
  const res = await client.query<EdiPartner>(
    `
      SELECT
        uuid,
        operating_company_id,
        partner_name,
        isa_qualifier,
        isa_id,
        gs_qualifier,
        gs_id,
        connection_type,
        connection_config,
        supported_transactions,
        is_active,
        created_at::text
      FROM integrations.edi_partners
      WHERE operating_company_id = $1
        AND is_active = true
      ORDER BY partner_name ASC
    `,
    [operatingCompanyId]
  );
  return res.rows;
}

export async function getPartnerByUuid(
  client: DbClient,
  operatingCompanyId: string,
  partnerUuid: string
): Promise<EdiPartner | null> {
  const res = await client.query<EdiPartner>(
    `
      SELECT
        uuid,
        operating_company_id,
        partner_name,
        isa_qualifier,
        isa_id,
        gs_qualifier,
        gs_id,
        connection_type,
        connection_config,
        supported_transactions,
        is_active,
        created_at::text
      FROM integrations.edi_partners
      WHERE operating_company_id = $1
        AND uuid = $2
      LIMIT 1
    `,
    [operatingCompanyId, partnerUuid]
  );
  return res.rows[0] ?? null;
}

export async function testConnection(
  client: DbClient,
  operatingCompanyId: string,
  partnerUuid: string
): Promise<ConnectionTestResult> {
  const partner = await getPartnerByUuid(client, operatingCompanyId, partnerUuid);
  if (!partner) {
    return { ok: false, message: "Partner not found" };
  }

  const started = Date.now();
  const config = partner.connection_config ?? {};

  switch (partner.connection_type) {
    case "api": {
      const endpoint = String(config.endpoint ?? "").trim();
      if (!endpoint) return { ok: false, message: "API endpoint missing in connection_config" };
      return { ok: true, message: `API endpoint configured: ${endpoint}`, latency_ms: Date.now() - started };
    }
    case "as2":
      return {
        ok: Boolean(config.as2_url && config.certificate_id),
        message: config.as2_url ? "AS2 URL present (cert exchange required for live test)" : "AS2 URL missing",
        latency_ms: Date.now() - started,
      };
    case "ftp":
    case "sftp": {
      const host = String(config.host ?? "").trim();
      if (!host) return { ok: false, message: `${partner.connection_type.toUpperCase()} host missing` };
      return { ok: true, message: `${partner.connection_type.toUpperCase()} host configured: ${host}`, latency_ms: Date.now() - started };
    }
    default:
      return { ok: false, message: `Unsupported connection type: ${partner.connection_type}` };
  }
}
