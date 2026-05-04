import crypto from "node:crypto";
import dotenv from "dotenv";
import pg from "pg";

dotenv.config();

const { Pool } = pg;
const connectionString = process.env.DATABASE_DIRECT_URL;
const apiBaseUrl = (process.env.API_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const verifyCode = process.env.TWILIO_TEST_VERIFY_CODE || "123456";

if (!connectionString) {
  console.error("Missing DATABASE_DIRECT_URL in environment.");
  process.exit(1);
}

const requiredTwilioVars = ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_VERIFY_SERVICE_SID"];
for (const key of requiredTwilioVars) {
  if (!process.env[key]) {
    console.error(`Missing ${key} in environment.`);
    process.exit(1);
  }
}

const pool = new Pool({ connectionString });
const suffix = crypto.randomUUID().slice(0, 8);
const fixturePhone = `+1956${Math.floor(1000000 + Math.random() * 9000000)}`;
const createdUserIds = [];

async function runWithBypass(client, fn) {
  await client.query("BEGIN");
  try {
    await client.query("SET LOCAL app.bypass_rls = 'lucia'");
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

async function apiJson(path, method, body) {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${path}: ${JSON.stringify(payload)}`);
  }
  return payload;
}

const client = await pool.connect();
const results = [];

try {
  await client.query("SET ROLE ih35_app");

  results.push(
    await pass("Migration 0012 applied: nullable email + phone columns", async () => {
      await runWithBypass(client, async () => {
        const colRes = await client.query(
          `
            SELECT column_name, is_nullable
            FROM information_schema.columns
            WHERE table_schema = 'identity'
              AND table_name = 'users'
              AND column_name IN ('email', 'phone', 'auth_phone_verified_at')
          `
        );
        const columns = new Map(colRes.rows.map((row) => [row.column_name, row.is_nullable]));
        if (!columns.has("phone") || !columns.has("auth_phone_verified_at")) {
          throw new Error("phone/auth_phone_verified_at columns missing");
        }
        if (columns.get("email") !== "YES") {
          throw new Error("identity.users.email must be nullable");
        }
      });
    })
  );

  let fixtureUserId = "";
  results.push(
    await pass("Create fixture driver auth user", async () => {
      await runWithBypass(client, async () => {
        const userRes = await client.query(
          `
            INSERT INTO identity.users (email, role, phone)
            VALUES (NULL, 'Driver', $1)
            RETURNING id
          `,
          [fixturePhone]
        );
        fixtureUserId = String(userRes.rows[0]?.id || "");
        if (!fixtureUserId) {
          throw new Error("failed to create fixture user");
        }
        createdUserIds.push(fixtureUserId);
      });
    })
  );

  let startResult;
  results.push(
    await pass("Phone start endpoint works (WhatsApp primary, SMS fallback allowed)", async () => {
      startResult = await apiJson("/api/v1/auth/phone/start", "POST", {
        phone: fixturePhone,
        channel: "whatsapp",
      });
      if (!startResult?.ok) {
        throw new Error("phone start returned non-ok response");
      }
      if (!["whatsapp", "sms"].includes(startResult.channel)) {
        throw new Error("unexpected delivery channel");
      }
    })
  );

  results.push(
    await pass("Phone verify endpoint accepts test OTP", async () => {
      const verifyRes = await apiJson("/api/v1/auth/phone/verify", "POST", {
        phone: fixturePhone,
        code: verifyCode,
      });
      if (!verifyRes?.ok || !verifyRes?.session?.id) {
        throw new Error("verify did not create session");
      }
    })
  );

  results.push(
    await pass("auth_phone_verified_at updated on successful verification", async () => {
      await runWithBypass(client, async () => {
        const res = await client.query(`SELECT auth_phone_verified_at FROM identity.users WHERE id = $1`, [fixtureUserId]);
        if (!res.rows[0]?.auth_phone_verified_at) {
          throw new Error("auth_phone_verified_at was not set");
        }
      });
    })
  );

  results.push(
    await pass("Audit events written for phone start and verify", async () => {
      await runWithBypass(client, async () => {
        const eventRes = await client.query(
          `
            SELECT event_class, payload
            FROM audit.audit_events
            WHERE source = 'BT-1-AUTH-DRIVER'
              AND event_class IN (
                'auth.phone.verification_started',
                'auth.phone.verification_fallback_sms',
                'auth.phone.verified'
              )
              AND payload ->> 'user_id' = $1
            ORDER BY created_at DESC
          `,
          [fixtureUserId]
        );
        const classes = new Set(eventRes.rows.map((row) => row.event_class));
        if (!classes.has("auth.phone.verified")) {
          throw new Error("auth.phone.verified audit event missing");
        }
        if (!classes.has("auth.phone.verification_started") && !classes.has("auth.phone.verification_fallback_sms")) {
          throw new Error("phone start/fallback audit event missing");
        }
      });
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
      if (createdUserIds.length > 0) {
        await client.query(`DELETE FROM identity.users WHERE id = ANY($1::uuid[])`, [createdUserIds]);
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
    console.log("PASS: cleanup phone auth fixtures");
  } catch (error) {
    console.error(`FAIL: cleanup phone auth fixtures -> ${String(error?.message || error)}`);
    results.push(false);
  }

  client.release();
  await pool.end();
}

if (results.every(Boolean)) {
  console.log("PASS: phone auth verification complete.");
  process.exit(0);
}

console.error("FAIL: phone auth verification failed.");
process.exit(1);
