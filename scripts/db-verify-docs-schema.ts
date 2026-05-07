// @ts-nocheck
import crypto from "node:crypto";
import dotenv from "dotenv";
import pg from "pg";
import { generatePresignedDownloadUrl, generatePresignedUploadUrl, verifyObjectExists, getObjectMetadata } from "../apps/backend/src/storage/r2-client.ts";

dotenv.config();

const { Pool } = pg;
const connectionString = process.env.DATABASE_DIRECT_URL;
if (!connectionString) {
  console.error("Missing DATABASE_DIRECT_URL in environment.");
  process.exit(1);
}

const pool = new Pool({ connectionString });
const client = await pool.connect();
const suffix = crypto.randomUUID().slice(0, 8);

const createdUserIds: string[] = [];
const createdCompanyIds: string[] = [];
const createdDriverIds: string[] = [];
const createdCustomerIds: string[] = [];
const createdFileIds: string[] = [];
const createdLinkIds: string[] = [];

async function runWithBypass(fn) {
  await client.query("BEGIN");
  try {
    await client.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);
    const result = await fn();
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

async function runAsUser(userId, fn) {
  await client.query("BEGIN");
  try {
    await client.query(`SELECT set_config('app.current_user_id', $1, true)`, [userId]);
    const result = await fn();
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

async function pass(name, fn) {
  try {
    await fn();
    console.log(`PASS: ${name}`);
    return true;
  } catch (error) {
    console.error(`FAIL: ${name} -> ${String(error?.message || error)}`);
    return false;
  }
}

const results: boolean[] = [];

try {
  await client.query("SET ROLE ih35_app");

  const refs = await runWithBypass(async () => {
    const ownerRes = await client.query(
      `INSERT INTO identity.users (email, google_user_id, role) VALUES ($1, $2, 'Owner') RETURNING id`,
      [`docs-owner-${suffix}@example.com`, `docs-owner-${suffix}`]
    );
    const adminRes = await client.query(
      `INSERT INTO identity.users (email, google_user_id, role) VALUES ($1, $2, 'Administrator') RETURNING id`,
      [`docs-admin-${suffix}@example.com`, `docs-admin-${suffix}`]
    );
    const managerRes = await client.query(
      `INSERT INTO identity.users (email, google_user_id, role) VALUES ($1, $2, 'Manager') RETURNING id`,
      [`docs-manager-${suffix}@example.com`, `docs-manager-${suffix}`]
    );
    const manager2Res = await client.query(
      `INSERT INTO identity.users (email, google_user_id, role) VALUES ($1, $2, 'Manager') RETURNING id`,
      [`docs-manager2-${suffix}@example.com`, `docs-manager2-${suffix}`]
    );
    const driverUserRes = await client.query(
      `INSERT INTO identity.users (email, google_user_id, role) VALUES ($1, $2, 'Driver') RETURNING id`,
      [`docs-driver-${suffix}@example.com`, `docs-driver-${suffix}`]
    );

    const ownerId = String(ownerRes.rows[0].id);
    const adminId = String(adminRes.rows[0].id);
    const managerId = String(managerRes.rows[0].id);
    const manager2Id = String(manager2Res.rows[0].id);
    const driverUserId = String(driverUserRes.rows[0].id);
    createdUserIds.push(ownerId, adminId, managerId, manager2Id, driverUserId);

    const companyRes = await client.query(
      `INSERT INTO org.companies (code, legal_name, short_name, company_type, is_active) VALUES ($1, $2, $3, 'operating_carrier', true) RETURNING id`,
      [`DOCS_${suffix.toUpperCase()}`, `Docs Verify ${suffix}`, `DOCS ${suffix}`]
    );
    const companyId = String(companyRes.rows[0].id);
    createdCompanyIds.push(companyId);

    await client.query(
      `INSERT INTO org.user_company_access (user_id, company_id) VALUES ($1, $5), ($2, $5), ($3, $5), ($4, $5)`,
      [adminId, managerId, manager2Id, driverUserId, companyId]
    );

    await client.query(`UPDATE identity.users SET default_company_id = $2 WHERE id = $1`, [ownerId, companyId]);
    await client.query(`UPDATE identity.users SET default_company_id = $2 WHERE id = $1`, [adminId, companyId]);
    await client.query(`UPDATE identity.users SET default_company_id = $2 WHERE id = $1`, [managerId, companyId]);
    await client.query(`UPDATE identity.users SET default_company_id = $2 WHERE id = $1`, [manager2Id, companyId]);
    await client.query(`UPDATE identity.users SET default_company_id = $2 WHERE id = $1`, [driverUserId, companyId]);

    const driverRes = await client.query(
      `
      INSERT INTO mdata.drivers (first_name, last_name, phone, status, identity_user_id, created_by_user_id, updated_by_user_id)
      VALUES ($1, $2, $3, 'Active', $4, $5, $5)
      RETURNING id
    `,
      [`Driver ${suffix}`, "Docs", `+1555${suffix.slice(0, 4)}`, driverUserId, ownerId]
    );
    const customerRes = await client.query(
      `
      INSERT INTO mdata.customers (customer_name, customer_type, operating_company_id, created_by_user_id, updated_by_user_id)
      VALUES ($1, 'broker', $2, $3, $3)
      RETURNING id
    `,
      [`Docs Customer ${suffix}`, companyId, ownerId]
    );

    const driverId = String(driverRes.rows[0].id);
    const customerId = String(customerRes.rows[0].id);
    createdDriverIds.push(driverId);
    createdCustomerIds.push(customerId);

    return { ownerId, adminId, managerId, manager2Id, driverUserId, driverId, customerId, companyId };
  });

  results.push(
    await pass("Schema exists: docs schema + docs.files + docs.file_links", async () => {
      await runWithBypass(async () => {
        const schemaRes = await client.query(`SELECT schema_name FROM information_schema.schemata WHERE schema_name = 'docs'`);
        if (schemaRes.rows.length !== 1) throw new Error("docs schema missing");
        const filesRes = await client.query(`SELECT to_regclass('docs.files') AS regclass`);
        const linksRes = await client.query(`SELECT to_regclass('docs.file_links') AS regclass`);
        if (!filesRes.rows[0]?.regclass) throw new Error("docs.files missing");
        if (!linksRes.rows[0]?.regclass) throw new Error("docs.file_links missing");
      });
    })
  );

  results.push(
    await pass("catalogs.file_categories pre-populated with 20 rows", async () => {
      await runWithBypass(async () => {
        const countRes = await client.query(`SELECT count(*)::int AS cnt FROM catalogs.file_categories`);
        const count = Number(countRes.rows[0]?.cnt ?? 0);
        if (count < 20) throw new Error(`expected at least 20 categories, got ${count}`);
      });
    })
  );

  results.push(
    await pass("Constraints exist: delete_consistency_files + version_consistency + entity_type check", async () => {
      await runWithBypass(async () => {
        const namedRes = await client.query(
          `
          SELECT conname
          FROM pg_constraint
          WHERE conname = ANY($1::text[])
        `,
          [["delete_consistency_files", "version_consistency"]]
        );
        const names = new Set(namedRes.rows.map((row) => row.conname));
        if (!names.has("delete_consistency_files")) throw new Error("delete_consistency_files missing");
        if (!names.has("version_consistency")) throw new Error("version_consistency missing");

        const entityCheckRes = await client.query(
          `
          SELECT pg_get_constraintdef(c.oid) AS def
          FROM pg_constraint c
          JOIN pg_class t ON t.oid = c.conrelid
          JOIN pg_namespace n ON n.oid = t.relnamespace
          WHERE n.nspname = 'docs'
            AND t.relname = 'file_links'
            AND c.contype = 'c'
        `
        );
        const hasEntityTypeCheck = entityCheckRes.rows.some((row) => String(row.def).includes("entity_type") && String(row.def).includes("driver"));
        if (!hasEntityTypeCheck) throw new Error("entity_type check missing");
      });
    })
  );

  let standaloneFileId = "";
  let driverFileId = "";
  let customerFileId = "";
  let pendingFileId = "";
  let pendingLinkId = "";
  let versionFileId = "";
  let softDeleteTargetId = "";
  let linkToSoftDeleteId = "";

  results.push(
    await pass("Prepare docs file fixtures", async () => {
      await runAsUser(refs.ownerId, async () => {
        const standaloneRes = await client.query(
          `
          INSERT INTO docs.files (
            operating_company_id, original_filename, mime_type, size_bytes, r2_key,
            upload_completed_at, uploader_user_id
          ) VALUES ($1, $2, $3, $4, $5, now(), $6)
          RETURNING id
        `,
          [refs.companyId, `standalone-${suffix}.pdf`, "application/pdf", 1111, `org/${refs.companyId}/files/standalone-${suffix}/v1/file.pdf`, refs.ownerId]
        );
        standaloneFileId = String(standaloneRes.rows[0].id);
        createdFileIds.push(standaloneFileId);

        const driverRes = await client.query(
          `
          INSERT INTO docs.files (
            operating_company_id, original_filename, mime_type, size_bytes, r2_key,
            upload_completed_at, uploader_user_id
          ) VALUES ($1, $2, $3, $4, $5, now(), $6)
          RETURNING id
        `,
          [refs.companyId, `driver-${suffix}.pdf`, "application/pdf", 2222, `org/${refs.companyId}/files/driver-${suffix}/v1/file.pdf`, refs.ownerId]
        );
        driverFileId = String(driverRes.rows[0].id);
        createdFileIds.push(driverFileId);

        const customerRes = await client.query(
          `
          INSERT INTO docs.files (
            operating_company_id, original_filename, mime_type, size_bytes, r2_key,
            upload_completed_at, uploader_user_id
          ) VALUES ($1, $2, $3, $4, $5, now(), $6)
          RETURNING id
        `,
          [refs.companyId, `customer-${suffix}.pdf`, "application/pdf", 3333, `org/${refs.companyId}/files/customer-${suffix}/v1/file.pdf`, refs.ownerId]
        );
        customerFileId = String(customerRes.rows[0].id);
        createdFileIds.push(customerFileId);

        const pendingRes = await client.query(
          `
          INSERT INTO docs.files (
            operating_company_id, original_filename, mime_type, size_bytes, r2_key,
            upload_completed_at, uploader_user_id
          ) VALUES ($1, $2, $3, $4, $5, NULL, $6)
          RETURNING id
        `,
          [refs.companyId, `pending-${suffix}.pdf`, "application/pdf", 4444, `org/${refs.companyId}/files/pending-${suffix}/v1/file.pdf`, refs.managerId]
        );
        pendingFileId = String(pendingRes.rows[0].id);
        createdFileIds.push(pendingFileId);

        softDeleteTargetId = customerFileId;
      });

      await runAsUser(refs.ownerId, async () => {
        const linkDriverRes = await client.query(
          `INSERT INTO docs.file_links (file_id, entity_type, entity_id, created_by_user_id) VALUES ($1, 'driver', $2, $3) RETURNING id`,
          [driverFileId, refs.driverId, refs.ownerId]
        );
        const linkCustomerRes = await client.query(
          `INSERT INTO docs.file_links (file_id, entity_type, entity_id, created_by_user_id) VALUES ($1, 'customer', $2, $3) RETURNING id`,
          [customerFileId, refs.customerId, refs.ownerId]
        );
        const pendingLinkRes = await client.query(
          `INSERT INTO docs.file_links (file_id, entity_type, entity_id, created_by_user_id) VALUES ($1, 'customer', $2, $3) RETURNING id`,
          [pendingFileId, refs.customerId, refs.ownerId]
        );
        pendingLinkId = String(pendingLinkRes.rows[0].id);
        linkToSoftDeleteId = String(linkCustomerRes.rows[0].id);
        createdLinkIds.push(String(linkDriverRes.rows[0].id), String(linkCustomerRes.rows[0].id), pendingLinkId);
      });
    })
  );

  results.push(
    await pass("RLS: Driver cannot SELECT standalone files", async () => {
      await runAsUser(refs.driverUserId, async () => {
        const res = await client.query(`SELECT count(*)::int AS cnt FROM docs.files WHERE id = $1`, [standaloneFileId]);
        if (Number(res.rows[0]?.cnt ?? 0) !== 0) throw new Error("driver should not see standalone file");
      });
    })
  );

  results.push(
    await pass("RLS: Driver can SELECT files linked to own driver record", async () => {
      await runAsUser(refs.driverUserId, async () => {
        const res = await client.query(`SELECT count(*)::int AS cnt FROM docs.files WHERE id = $1`, [driverFileId]);
        if (Number(res.rows[0]?.cnt ?? 0) !== 1) throw new Error("driver should see own linked file");
      });
    })
  );

  results.push(
    await pass("RLS: Manager can SELECT customer-linked files", async () => {
      await runAsUser(refs.managerId, async () => {
        const res = await client.query(`SELECT count(*)::int AS cnt FROM docs.files WHERE id = $1`, [customerFileId]);
        if (Number(res.rows[0]?.cnt ?? 0) !== 1) throw new Error("manager should see customer-linked file");
      });
    })
  );

  results.push(
    await pass("RLS: Owner can soft-delete; Manager cannot soft-delete", async () => {
      await runAsUser(refs.managerId, async () => {
        let blocked = false;
        try {
          const res = await client.query(
            `UPDATE docs.files SET deleted_at = now(), deleted_by_user_id = $2, delete_reason = 'manager delete attempt' WHERE id = $1 RETURNING id`,
            [softDeleteTargetId, refs.managerId]
          );
          if (res.rows.length === 0) blocked = true;
        } catch {
          blocked = true;
        }
        if (!blocked) throw new Error("manager should be blocked from soft-delete");
      });
      await runAsUser(refs.ownerId, async () => {
        const res = await client.query(
          `UPDATE docs.files SET deleted_at = now(), deleted_by_user_id = $2, delete_reason = 'owner approved delete' WHERE id = $1 RETURNING id`,
          [softDeleteTargetId, refs.ownerId]
        );
        if (res.rows.length !== 1) throw new Error("owner soft-delete should succeed");
      });
      await runAsUser(refs.ownerId, async () => {
        await client.query(`UPDATE docs.files SET deleted_at = NULL, deleted_by_user_id = NULL, delete_reason = NULL WHERE id = $1`, [softDeleteTargetId]);
      });
    })
  );

  results.push(
    await pass("Pending upload visibility follows include-incomplete query behavior", async () => {
      await runAsUser(refs.managerId, async () => {
        const uploaderView = await client.query(
          `
            SELECT count(*)::int AS cnt
            FROM docs.files
            WHERE id = $1
              AND (upload_completed_at IS NOT NULL OR uploader_user_id = $2)
          `,
          [pendingFileId, refs.managerId]
        );
        if (Number(uploaderView.rows[0]?.cnt ?? 0) !== 1) throw new Error("uploader should see own pending file with include-incomplete condition");
      });
      await runAsUser(refs.ownerId, async () => {
        const ownerView = await client.query(`SELECT count(*)::int AS cnt FROM docs.files WHERE id = $1`, [pendingFileId]);
        if (Number(ownerView.rows[0]?.cnt ?? 0) !== 1) throw new Error("owner should see pending file");
      });
      await runAsUser(refs.manager2Id, async () => {
        const nonUploaderView = await client.query(
          `
            SELECT count(*)::int AS cnt
            FROM docs.files
            WHERE id = $1
              AND (upload_completed_at IS NOT NULL OR uploader_user_id = $2)
          `,
          [pendingFileId, refs.manager2Id]
        );
        if (Number(nonUploaderView.rows[0]?.cnt ?? 0) !== 0) throw new Error("non-uploader manager should not see pending file with include-incomplete condition");
      });
    })
  );

  results.push(
    await pass("After upload_completed_at update file is visible in default complete-file query", async () => {
      await runAsUser(refs.ownerId, async () => {
        await client.query(`UPDATE docs.files SET upload_completed_at = now() WHERE id = $1`, [pendingFileId]);
      });
      await runAsUser(refs.manager2Id, async () => {
        const res = await client.query(`SELECT count(*)::int AS cnt FROM docs.files WHERE id = $1 AND upload_completed_at IS NOT NULL`, [pendingFileId]);
        if (Number(res.rows[0]?.cnt ?? 0) !== 1) throw new Error("file should be visible after upload completion");
      });
    })
  );

  results.push(
    await pass("Insert + soft-delete file_link behaves as expected", async () => {
      await runAsUser(refs.ownerId, async () => {
        const inserted = await client.query(
          `INSERT INTO docs.file_links (file_id, entity_type, entity_id, created_by_user_id) VALUES ($1, 'driver', $2, $3) RETURNING id`,
          [pendingFileId, refs.driverId, refs.ownerId]
        );
        const linkId = String(inserted.rows[0].id);
        createdLinkIds.push(linkId);
        const activeRes = await client.query(`SELECT count(*)::int AS cnt FROM docs.file_links WHERE id = $1 AND deleted_at IS NULL`, [linkId]);
        if (Number(activeRes.rows[0]?.cnt ?? 0) !== 1) throw new Error("new link should be active");
        await client.query(`UPDATE docs.file_links SET deleted_at = now(), deleted_by_user_id = $2 WHERE id = $1`, [linkId, refs.ownerId]);
        const hiddenRes = await client.query(`SELECT count(*)::int AS cnt FROM docs.file_links WHERE id = $1 AND deleted_at IS NULL`, [linkId]);
        if (Number(hiddenRes.rows[0]?.cnt ?? 0) !== 0) throw new Error("soft-deleted link should be hidden from default");
      });
    })
  );

  results.push(
    await pass("Version insert with parent_file_id and version_number=2 succeeds", async () => {
      await runAsUser(refs.ownerId, async () => {
        const res = await client.query(
          `
          INSERT INTO docs.files (
            operating_company_id, original_filename, mime_type, size_bytes, r2_key, upload_completed_at,
            parent_file_id, version_number, uploader_user_id
          ) VALUES ($1, $2, $3, $4, $5, now(), $6, 2, $7)
          RETURNING id
        `,
          [
            refs.companyId,
            `version2-${suffix}.pdf`,
            "application/pdf",
            5555,
            `org/${refs.companyId}/files/version2-${suffix}/v2/file.pdf`,
            pendingFileId,
            refs.ownerId,
          ]
        );
        versionFileId = String(res.rows[0].id);
        createdFileIds.push(versionFileId);
      });
    })
  );

  results.push(
    await pass("Version insert without parent_file_id and version_number=2 fails CHECK", async () => {
      await runAsUser(refs.ownerId, async () => {
        let failedAsExpected = false;
        try {
          await client.query(
            `
            INSERT INTO docs.files (
              operating_company_id, original_filename, mime_type, size_bytes, r2_key, upload_completed_at,
              parent_file_id, version_number, uploader_user_id
            ) VALUES ($1, $2, $3, $4, $5, now(), NULL, 2, $6)
          `,
            [refs.companyId, `bad-version-${suffix}.pdf`, "application/pdf", 6666, `org/${refs.companyId}/files/bad-version-${suffix}/v2/file.pdf`, refs.ownerId]
          );
        } catch (error) {
          if (String(error?.code) === "23514") failedAsExpected = true;
        }
        if (!failedAsExpected) throw new Error("expected version_consistency check violation");
      });
    })
  );

  results.push(
    await pass("R2 client functions are loadable", async () => {
      if (typeof generatePresignedUploadUrl !== "function") throw new Error("generatePresignedUploadUrl missing");
      if (typeof generatePresignedDownloadUrl !== "function") throw new Error("generatePresignedDownloadUrl missing");
      if (typeof verifyObjectExists !== "function") throw new Error("verifyObjectExists missing");
      if (typeof getObjectMetadata !== "function") throw new Error("getObjectMetadata missing");
    })
  );
} catch (error) {
  console.error(`FAIL: setup/flow failed -> ${String(error?.message || error)}`);
  results.push(false);
} finally {
  try {
    await client.query("RESET ROLE");
    await client.query("BEGIN");
    try {
      if (createdLinkIds.length > 0) await client.query(`DELETE FROM docs.file_links WHERE id = ANY($1::uuid[])`, [createdLinkIds]);
      if (createdFileIds.length > 0) await client.query(`DELETE FROM docs.files WHERE id = ANY($1::uuid[])`, [createdFileIds]);
      if (createdCustomerIds.length > 0) await client.query(`DELETE FROM mdata.customers WHERE id = ANY($1::uuid[])`, [createdCustomerIds]);
      if (createdDriverIds.length > 0) await client.query(`DELETE FROM mdata.drivers WHERE id = ANY($1::uuid[])`, [createdDriverIds]);
      if (createdUserIds.length > 0) {
        await client.query(`DELETE FROM org.user_company_access WHERE user_id = ANY($1::uuid[])`, [createdUserIds]);
        await client.query(`UPDATE identity.users SET default_company_id = NULL WHERE id = ANY($1::uuid[])`, [createdUserIds]);
        await client.query(`DELETE FROM identity.users WHERE id = ANY($1::uuid[])`, [createdUserIds]);
      }
      if (createdCompanyIds.length > 0) await client.query(`DELETE FROM org.companies WHERE id = ANY($1::uuid[])`, [createdCompanyIds]);
      await client.query("COMMIT");
      console.log("PASS: cleanup docs schema fixtures");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  } catch (error) {
    console.error(`FAIL: cleanup docs schema fixtures -> ${String(error?.message || error)}`);
    results.push(false);
  }
  client.release();
  await pool.end();
}

if (results.every(Boolean)) {
  console.log("PASS: docs schema verification complete.");
  process.exit(0);
}

console.error("FAIL: docs schema verification failed.");
process.exit(1);
