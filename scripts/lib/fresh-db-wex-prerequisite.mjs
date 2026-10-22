// 443.232: preserve the applied migration's bytes. 0067's unbound catalog seed
// needs the issuer that production already had before 202616030100 ran.
export const WEX_MIGRATION = '202616030100_england_wex_fuel_card_rail.sql';
export async function prepareFreshDbWexIssuer(client, { file, hostname }) {
  if (file !== WEX_MIGRATION || !['localhost', '127.0.0.1', '::1', '[::1]'].includes(hostname)) return;
  // A localhost tunnel must not turn into production authority.
  const target = await client.query("SELECT current_setting('neon.branch_id', true) AS branch");
  if (target.rows[0]?.branch !== null) throw new Error('WEX prerequisite requires isolated local PostgreSQL, not Neon');
  await client.query('BEGIN');
  try {
    await client.query("SET LOCAL lock_timeout = '5s'");
    await client.query("SET LOCAL app.bypass_rls = 'lucia'");
    // A fresh migration chain generates company UUIDs; use the same selector
    // as the immutable migration, not the production UUID.
    const companies = await client.query("SELECT id FROM org.companies WHERE code='USMCA' AND deactivated_at IS NULL");
    if (companies.rows.length > 1) throw new Error('WEX prerequisite: ambiguous company');
    if (!companies.rows.length) { await client.query('COMMIT'); return; }
    const company = companies.rows[0].id;
    await client.query("SELECT set_config('app.operating_company_id', $1, true)", [company]);
    // Only the untouched, active, unbound 0067 seed qualifies. Inactive cards or
    // a different issuer still reach the original migration's refusal unchanged.
    const seed = await client.query(`SELECT id FROM catalogs.fuel_card_types
      WHERE operating_company_id=$1 AND code='WEX' AND is_active
        AND issuer_vendor_id IS NULL AND display_name='WEX card'
      FOR UPDATE`, [company]);
    if (seed.rows.length === 1) {
      let vendor = await client.query(`SELECT id FROM mdata.vendors
        WHERE operating_company_id=$1 AND lower(btrim(vendor_name))='england logistics'`, [company]);
      if (vendor.rows.length > 1) throw new Error('WEX prerequisite: ambiguous issuer');
      if (!vendor.rows.length) vendor = await client.query(`INSERT INTO mdata.vendors
        (operating_company_id,vendor_name,vendor_type,vendor_category,source_system,is_sample_data)
        VALUES ($1,'England Logistics','Other','diesel','tms',false) RETURNING id`, [company]);
      await client.query(`UPDATE catalogs.fuel_card_types SET issuer_vendor_id=$1
        WHERE id=$2 AND operating_company_id=$3 AND issuer_vendor_id IS NULL`,
      [vendor.rows[0].id, seed.rows[0].id, company]);
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}
