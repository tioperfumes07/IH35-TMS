const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function assertTenantContext(
  operating_company_id: unknown,
  cron_name: string
): asserts operating_company_id is string {
  if (
    operating_company_id === null ||
    operating_company_id === undefined ||
    typeof operating_company_id !== "string" ||
    operating_company_id.length === 0
  ) {
    throw new Error(
      `[${cron_name}] Refusing to run with empty operating_company_id. ` +
        "This indicates scheduler context corruption. See B-017."
    );
  }
  if (!UUID_RE.test(operating_company_id)) {
    throw new Error(
      `[${cron_name}] Refusing to run with malformed operating_company_id: ` +
        `${operating_company_id}. See B-017.`
    );
  }
}
