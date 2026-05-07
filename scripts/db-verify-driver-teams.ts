import crypto from "node:crypto";
import dotenv from "dotenv";
import pg from "pg";

dotenv.config();

const { Pool } = pg;
const connectionString = process.env.DATABASE_DIRECT_URL;

if (!connectionString) {
  console.error("Missing DATABASE_DIRECT_URL in environment.");
  process.exit(1);
}

const pool = new Pool({ connectionString });
const suffix = crypto.randomUUID().slice(0, 8);
const createdUserIds: string[] = [];
const createdDriverIds: string[] = [];
const createdTeamIds: string[] = [];
const createdAccessPairs: Array<{ userId: string; companyId: string }> = [];

async function runWithBypass<T>(client: pg.PoolClient, fn: () => Promise<T>) {
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

async function runAsUser<T>(client: pg.PoolClient, userId: string, fn: () => Promise<T>) {
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

async function pass(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    console.log(`PASS: ${name}`);
    return true;
  } catch (error) {
    console.error(`FAIL: ${name} -> ${String((error as Error)?.message || error)}`);
    return false;
  }
}

const client = await pool.connect();
const results: boolean[] = [];

try {
  await client.query("SET ROLE ih35_app");

  const refs = await runWithBypass(client, async () => {
    const companiesRes = await client.query<{ id: string; code: string }>(
      `SELECT id, code FROM org.companies WHERE code IN ('TRK', 'TRANSP') ORDER BY code`
    );
    const byCode = new Map(companiesRes.rows.map((row) => [row.code, row.id]));
    const trkCompanyId = byCode.get("TRK");
    const transpCompanyId = byCode.get("TRANSP");
    if (!trkCompanyId || !transpCompanyId) throw new Error("TRK/TRANSP companies missing");

    const ownerRes = await client.query<{ id: string }>(`SELECT id FROM identity.users WHERE role = 'Owner' ORDER BY created_at LIMIT 1`);
    if (ownerRes.rows.length === 0) throw new Error("Owner user missing");
    return { ownerUserId: ownerRes.rows[0].id, trkCompanyId, transpCompanyId };
  });

  results.push(
    await pass("driver_teams table created with all required columns", async () => {
      await runWithBypass(client, async () => {
        const colsRes = await client.query<{ column_name: string }>(
          `
            SELECT column_name
            FROM information_schema.columns
            WHERE table_schema = 'mdata'
              AND table_name = 'driver_teams'
          `
        );
        const cols = new Set(colsRes.rows.map((row) => row.column_name));
        for (const required of [
          "id",
          "operating_company_id",
          "team_name",
          "primary_driver_id",
          "secondary_driver_id",
          "relationship",
          "notes",
          "is_active",
          "effective_from",
          "effective_to",
          "created_at",
          "updated_at",
          "created_by_user_id",
        ]) {
          if (!cols.has(required)) throw new Error(`missing column ${required}`);
        }
      });
    })
  );

  const fixture = await runWithBypass(client, async () => {
    const managerTranspRes = await client.query<{ id: string }>(
      `INSERT INTO identity.users (email, google_user_id, role, default_company_id) VALUES ($1,$2,'Manager',$3) RETURNING id`,
      [`team-mgr-transp-${suffix}@example.com`, `team-mgr-transp-${suffix}`, refs.transpCompanyId]
    );
    const managerTrkRes = await client.query<{ id: string }>(
      `INSERT INTO identity.users (email, google_user_id, role, default_company_id) VALUES ($1,$2,'Manager',$3) RETURNING id`,
      [`team-mgr-trk-${suffix}@example.com`, `team-mgr-trk-${suffix}`, refs.trkCompanyId]
    );
    const driverAUserRes = await client.query<{ id: string }>(
      `INSERT INTO identity.users (email, google_user_id, role, default_company_id) VALUES ($1,$2,'Driver',$3) RETURNING id`,
      [`team-driver-a-${suffix}@example.com`, `team-driver-a-${suffix}`, refs.transpCompanyId]
    );
    const driverBUserRes = await client.query<{ id: string }>(
      `INSERT INTO identity.users (email, google_user_id, role, default_company_id) VALUES ($1,$2,'Driver',$3) RETURNING id`,
      [`team-driver-b-${suffix}@example.com`, `team-driver-b-${suffix}`, refs.transpCompanyId]
    );
    const driverCUserRes = await client.query<{ id: string }>(
      `INSERT INTO identity.users (email, google_user_id, role, default_company_id) VALUES ($1,$2,'Driver',$3) RETURNING id`,
      [`team-driver-c-${suffix}@example.com`, `team-driver-c-${suffix}`, refs.transpCompanyId]
    );
    const driverDUserRes = await client.query<{ id: string }>(
      `INSERT INTO identity.users (email, google_user_id, role, default_company_id) VALUES ($1,$2,'Driver',$3) RETURNING id`,
      [`team-driver-d-${suffix}@example.com`, `team-driver-d-${suffix}`, refs.transpCompanyId]
    );
    const driverTrkUserRes = await client.query<{ id: string }>(
      `INSERT INTO identity.users (email, google_user_id, role, default_company_id) VALUES ($1,$2,'Driver',$3) RETURNING id`,
      [`team-driver-trk-${suffix}@example.com`, `team-driver-trk-${suffix}`, refs.trkCompanyId]
    );

    const ids = [
      managerTranspRes.rows[0].id,
      managerTrkRes.rows[0].id,
      driverAUserRes.rows[0].id,
      driverBUserRes.rows[0].id,
      driverCUserRes.rows[0].id,
      driverDUserRes.rows[0].id,
      driverTrkUserRes.rows[0].id,
    ];
    createdUserIds.push(...ids);

    const accessPairs = [
      { userId: managerTranspRes.rows[0].id, companyId: refs.transpCompanyId },
      { userId: managerTrkRes.rows[0].id, companyId: refs.trkCompanyId },
      { userId: driverAUserRes.rows[0].id, companyId: refs.transpCompanyId },
      { userId: driverBUserRes.rows[0].id, companyId: refs.transpCompanyId },
      { userId: driverCUserRes.rows[0].id, companyId: refs.transpCompanyId },
      { userId: driverDUserRes.rows[0].id, companyId: refs.transpCompanyId },
      { userId: driverTrkUserRes.rows[0].id, companyId: refs.trkCompanyId },
    ];
    for (const pair of accessPairs) {
      await client.query(
        `INSERT INTO org.user_company_access (user_id, company_id, granted_by_user_id) VALUES ($1,$2,$3) ON CONFLICT (user_id, company_id) DO NOTHING`,
        [pair.userId, pair.companyId, refs.ownerUserId]
      );
      createdAccessPairs.push(pair);
    }

    const makeDriver = async (identityUserId: string, first: string) => {
      const phone = `+1956${Math.floor(1000000 + Math.random() * 9000000)}`;
      const res = await client.query<{ id: string }>(
        `
          INSERT INTO mdata.drivers (
            identity_user_id, first_name, last_name, phone, status, created_by_user_id, updated_by_user_id
          ) VALUES ($1,$2,$3,$4,'Active',$5,$5)
          RETURNING id
        `,
        [identityUserId, first, "Team", phone, refs.ownerUserId]
      );
      const id = res.rows[0].id;
      createdDriverIds.push(id);
      return id;
    };

    return {
      managerTranspId: managerTranspRes.rows[0].id,
      managerTrkId: managerTrkRes.rows[0].id,
      driverAId: await makeDriver(driverAUserRes.rows[0].id, "DriverA"),
      driverBId: await makeDriver(driverBUserRes.rows[0].id, "DriverB"),
      driverCId: await makeDriver(driverCUserRes.rows[0].id, "DriverC"),
      driverDId: await makeDriver(driverDUserRes.rows[0].id, "DriverD"),
      driverTrkId: await makeDriver(driverTrkUserRes.rows[0].id, "DriverTRK"),
      driverAUserId: driverAUserRes.rows[0].id,
    };
  });

  results.push(
    await pass("chk_driver_teams_no_self_pair rejects same primary/secondary", async () => {
      await runAsUser(client, fixture.managerTranspId, async () => {
        try {
          await client.query(
            `
              INSERT INTO mdata.driver_teams (
                operating_company_id, team_name, primary_driver_id, secondary_driver_id, created_by_user_id
              ) VALUES ($1,$2,$3,$3,$4)
            `,
            [refs.transpCompanyId, `SelfPair-${suffix}`, fixture.driverAId, fixture.managerTranspId]
          );
          throw new Error("expected check violation for self pairing");
        } catch (error) {
          const code = (error as { code?: string }).code;
          if (code !== "23514") throw error;
        }
      });
    })
  );

  results.push(
    await pass("chk_driver_teams_effective_range rejects effective_to < effective_from", async () => {
      await runAsUser(client, fixture.managerTranspId, async () => {
        try {
          await client.query(
            `
              INSERT INTO mdata.driver_teams (
                operating_company_id, team_name, primary_driver_id, secondary_driver_id, effective_from, effective_to, created_by_user_id
              ) VALUES ($1,$2,$3,$4,$5,$6,$7)
            `,
            [refs.transpCompanyId, `DateRange-${suffix}`, fixture.driverAId, fixture.driverBId, "2026-05-20", "2026-05-10", fixture.managerTranspId]
          );
          throw new Error("expected check violation for effective range");
        } catch (error) {
          const code = (error as { code?: string }).code;
          if (code !== "23514") throw error;
        }
      });
    })
  );

  const baseTeam = await runAsUser(client, fixture.managerTranspId, async () => {
    const res = await client.query<{ id: string }>(
      `
        INSERT INTO mdata.driver_teams (
          operating_company_id, team_name, primary_driver_id, secondary_driver_id, relationship, created_by_user_id
        ) VALUES ($1,$2,$3,$4,$5,$6)
        RETURNING id
      `,
      [refs.transpCompanyId, `BaseTeam-${suffix}`, fixture.driverAId, fixture.driverBId, "partner", fixture.managerTranspId]
    );
    const id = res.rows[0].id;
    createdTeamIds.push(id);
    return id;
  });

  results.push(
    await pass("uniq_driver_in_active_team_primary blocks duplicate primary assignment", async () => {
      await runAsUser(client, fixture.managerTranspId, async () => {
        try {
          await client.query(
            `
              INSERT INTO mdata.driver_teams (
                operating_company_id, team_name, primary_driver_id, secondary_driver_id, created_by_user_id
              ) VALUES ($1,$2,$3,$4,$5)
            `,
            [refs.transpCompanyId, `DupPrimary-${suffix}`, fixture.driverAId, fixture.driverCId, fixture.managerTranspId]
          );
          throw new Error("expected unique violation on primary driver");
        } catch (error) {
          const code = (error as { code?: string }).code;
          if (code !== "23505") throw error;
        }
      });
    })
  );

  results.push(
    await pass("uniq_driver_in_active_team_secondary blocks duplicate secondary assignment", async () => {
      await runAsUser(client, fixture.managerTranspId, async () => {
        try {
          await client.query(
            `
              INSERT INTO mdata.driver_teams (
                operating_company_id, team_name, primary_driver_id, secondary_driver_id, created_by_user_id
              ) VALUES ($1,$2,$3,$4,$5)
            `,
            [refs.transpCompanyId, `DupSecondary-${suffix}`, fixture.driverCId, fixture.driverBId, fixture.managerTranspId]
          );
          throw new Error("expected unique violation on secondary driver");
        } catch (error) {
          const code = (error as { code?: string }).code;
          if (code !== "23505") throw error;
        }
      });
    })
  );

  results.push(
    await pass("Same driver cannot be primary in one team and secondary in another active team", async () => {
      await runAsUser(client, fixture.managerTranspId, async () => {
        try {
          await client.query(
            `
              INSERT INTO mdata.driver_teams (
                operating_company_id, team_name, primary_driver_id, secondary_driver_id, created_by_user_id
              ) VALUES ($1,$2,$3,$4,$5)
            `,
            [refs.transpCompanyId, `CrossSlot-${suffix}`, fixture.driverCId, fixture.driverAId, fixture.managerTranspId]
          );
          throw new Error("expected violation for cross-slot duplicate active driver");
        } catch (error) {
          const code = (error as { code?: string }).code;
          if (code !== "23505") throw error;
        }
      });
    })
  );

  results.push(
    await pass("RLS policies present on driver_teams", async () => {
      await runWithBypass(client, async () => {
        const policyRes = await client.query<{ policyname: string }>(
          `
            SELECT policyname
            FROM pg_policies
            WHERE schemaname = 'mdata'
              AND tablename = 'driver_teams'
          `
        );
        const names = new Set(policyRes.rows.map((row) => row.policyname));
        for (const required of ["driver_teams_select_office", "driver_teams_select_driver", "driver_teams_insert", "driver_teams_update"]) {
          if (!names.has(required)) throw new Error(`missing policy ${required}`);
        }
      });
    })
  );

  const trkTeam = await runAsUser(client, fixture.managerTrkId, async () => {
    const res = await client.query<{ id: string }>(
      `
        INSERT INTO mdata.driver_teams (
          operating_company_id, team_name, primary_driver_id, secondary_driver_id, relationship, created_by_user_id
        ) VALUES ($1,$2,$3,$4,$5,$6)
        RETURNING id
      `,
      [refs.trkCompanyId, `TRKTeam-${suffix}`, fixture.driverTrkId, fixture.driverDId, "partner", fixture.managerTrkId]
    );
    const id = res.rows[0].id;
    createdTeamIds.push(id);
    return id;
  });

  results.push(
    await pass("Office user sees teams in their company", async () => {
      await runAsUser(client, fixture.managerTranspId, async () => {
        const res = await client.query<{ id: string }>(`SELECT id FROM mdata.driver_teams ORDER BY id`);
        const ids = new Set(res.rows.map((row) => row.id));
        if (!ids.has(baseTeam)) throw new Error("manager TRANSP missing own team");
      });
    })
  );

  results.push(
    await pass("Driver sees only teams they are part of", async () => {
      await runAsUser(client, fixture.driverAUserId, async () => {
        const res = await client.query<{ id: string }>(`SELECT id FROM mdata.driver_teams ORDER BY id`);
        if (res.rows.length !== 1 || res.rows[0].id !== baseTeam) {
          throw new Error(`driver visibility mismatch: ${res.rows.map((r) => r.id).join(",")}`);
        }
      });
    })
  );

  results.push(
    await pass("Cross-company isolation enforced", async () => {
      await runAsUser(client, fixture.managerTranspId, async () => {
        const res = await client.query<{ id: string }>(`SELECT id FROM mdata.driver_teams WHERE id = $1`, [trkTeam]);
        if (res.rows.length !== 0) throw new Error("TRANSP manager should not see TRK team");
      });
    })
  );
} catch (error) {
  console.error(`FAIL: setup/flow failed -> ${String((error as Error)?.message || error)}`);
  results.push(false);
} finally {
  try {
    await client.query("RESET ROLE");
    await client.query("BEGIN");
    try {
      if (createdTeamIds.length > 0) await client.query(`DELETE FROM mdata.driver_teams WHERE id = ANY($1::uuid[])`, [createdTeamIds]);
      if (createdDriverIds.length > 0) await client.query(`DELETE FROM mdata.drivers WHERE id = ANY($1::uuid[])`, [createdDriverIds]);
      if (createdAccessPairs.length > 0) {
        for (const pair of createdAccessPairs) {
          await client.query(`DELETE FROM org.user_company_access WHERE user_id = $1 AND company_id = $2`, [pair.userId, pair.companyId]);
        }
      }
      if (createdUserIds.length > 0) await client.query(`DELETE FROM identity.users WHERE id = ANY($1::uuid[])`, [createdUserIds]);
      await client.query("COMMIT");
      console.log("PASS: cleanup driver teams fixtures");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  } catch (error) {
    console.error(`FAIL: cleanup driver teams fixtures -> ${String((error as Error)?.message || error)}`);
    results.push(false);
  }
  client.release();
  await pool.end();
}

if (results.every(Boolean)) {
  console.log("PASS: driver teams verification complete.");
  process.exit(0);
}

console.error("FAIL: driver teams verification failed.");
process.exit(1);
