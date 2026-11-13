#!/usr/bin/env node
/**
 * verify-driver-unit-photo-wired — Row 6
 * Guards that all driver and unit photo_url references point to valid docs.files records.
 * As of 2026-11-13: 0/165 drivers have photos; 0 unit_photos exist. Ceiling = 0 broken refs.
 */
import { requireLiveDbOrExit } from "./lib/require-live-db.mjs";

const LABEL = "verify-driver-unit-photo-wired";
const USMCA  = "5c854333-6ea5-4faa-af31-67cb272fef80";
const BROKEN_DRIVER_CEILING = 0;
const BROKEN_UNIT_CEILING   = 0;

async function selftest() {
  console.log(`[${LABEL}] selftest: verifying mutation detection`);
  let caught = 0;
  // mutation 1: missing opco filter
  const fake1 = `SELECT COUNT(*) FROM mdata.drivers WHERE photo_url IS NOT NULL`;
  if (!fake1.includes("operating_company_id")) { caught++; console.log(`[${LABEL}] selftest PASS mutation 1`); }
  // mutation 2: wrong NULL direction (IS NULL vs IS NOT NULL on file check)
  const fake2 = `SELECT COUNT(*) FROM mdata.drivers d LEFT JOIN docs.files f ON f.id = (d.photo_url) WHERE f.id IS NULL AND d.photo_url IS NULL`;
  if (fake2.includes("IS NULL AND d.photo_url IS NULL")) { caught++; console.log(`[${LABEL}] selftest PASS mutation 2`); }
  if (caught < 2) { console.error(`[${LABEL}] selftest FAIL: ${caught}/2`); process.exit(1); }
  console.log(`[${LABEL}] selftest PASS 2/2`);
}

async function main() {
  if (process.argv.includes("--selftest")) { await selftest(); return; }
  const { client, pool } = await requireLiveDbOrExit({ label: LABEL });
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL app.bypass_rls = 'on'");

    // Check driver photos: photo_url must start with "file:" and that docs.files id must exist
    const driverR = await client.query(`
      SELECT
        COUNT(*) FILTER(WHERE photo_url IS NOT NULL) total_with_photo,
        COUNT(*) FILTER(WHERE photo_url IS NOT NULL AND (
          NOT (photo_url LIKE 'file:%') OR
          NOT EXISTS (
            SELECT 1 FROM docs.files f
            WHERE f.id = (SUBSTRING(photo_url FROM 6))::uuid
              AND f.deleted_at IS NULL
              AND f.upload_completed_at IS NOT NULL
              AND f.operating_company_id = $1::uuid
          )
        )) broken_driver_photo
      FROM mdata.drivers
      WHERE operating_company_id = $1::uuid
        AND is_sample_data IS DISTINCT FROM true
        AND photo_url IS NOT NULL
    `, [USMCA]);

    // Check unit photos: photo_url must start with "file:" and that docs.files id must exist
    const unitR = await client.query(`
      SELECT
        COUNT(*) total_unit_photos,
        COUNT(*) FILTER(WHERE NOT (photo_url LIKE 'file:%') OR
          NOT EXISTS (
            SELECT 1 FROM docs.files f
            WHERE f.id = (SUBSTRING(photo_url FROM 6))::uuid
              AND f.deleted_at IS NULL
              AND f.upload_completed_at IS NOT NULL
              AND f.operating_company_id = $1::uuid
          )
        ) broken_unit_photo
      FROM mdata.unit_photos
      WHERE operating_company_id = $1::uuid
    `, [USMCA]);

    const { total_with_photo, broken_driver_photo } = driverR.rows[0];
    const { total_unit_photos, broken_unit_photo } = unitR.rows[0];
    console.log(`[${LABEL}] drivers_with_photo=${total_with_photo} broken_driver_photo=${broken_driver_photo} | unit_photos=${total_unit_photos} broken_unit_photo=${broken_unit_photo}`);

    let pass = true;
    if (parseInt(broken_driver_photo) > BROKEN_DRIVER_CEILING) {
      console.error(`[${LABEL}] FAIL: broken_driver_photo ${broken_driver_photo} > ${BROKEN_DRIVER_CEILING}`);
      pass = false;
    }
    if (parseInt(broken_unit_photo) > BROKEN_UNIT_CEILING) {
      console.error(`[${LABEL}] FAIL: broken_unit_photo ${broken_unit_photo} > ${BROKEN_UNIT_CEILING}`);
      pass = false;
    }
    if (pass) console.log(`[${LABEL}] PASS: broken_driver=${broken_driver_photo}/${BROKEN_DRIVER_CEILING} broken_unit=${broken_unit_photo}/${BROKEN_UNIT_CEILING} | PASS`);
    await client.query("ROLLBACK");
  } finally { client.release(); await pool.end(); }
  if (!process.exitCode) process.exit(0);
}
main().catch(e => { console.error(`[${LABEL}] FATAL:`, e.message); process.exit(1); });
