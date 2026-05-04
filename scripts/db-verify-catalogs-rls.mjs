import dotenv from "dotenv";
import pg from "pg";
import crypto from "node:crypto";

dotenv.config();

const { Pool } = pg;
const connectionString = process.env.DATABASE_DIRECT_URL;

if (!connectionString) {
  console.error("Missing DATABASE_DIRECT_URL in environment.");
  process.exit(1);
}

const pool = new Pool({ connectionString });
const suffix = crypto.randomUUID().slice(0, 8);

const createdUserIds = [];
const fixtureIds = {};
const managerRowIds = {};
const accountantRowIds = {};

function makeCode(prefix) {
  return `${prefix}-${suffix}`;
}

function isDeniedError(err) {
  const msg = String(err?.message || "").toLowerCase();
  return (
    msg.includes("row-level security") ||
    msg.includes("permission denied") ||
    msg.includes("violates row-level security policy")
  );
}

async function runWithBypass(client, fn) {
  await client.query("BEGIN");
  try {
    await client.query("SET LOCAL app.bypass_rls = 'lucia'");
    const result = await fn();
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  }
}

async function runAsUser(client, userId, fn) {
  await client.query("BEGIN");
  try {
    await client.query(`SET LOCAL app.current_user_id = '${userId}'`);
    const result = await fn();
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  }
}

async function pass(name, fn) {
  try {
    await fn();
    console.log(`PASS: ${name}`);
    return true;
  } catch (err) {
    console.error(`FAIL: ${name} -> ${String(err?.message || err)}`);
    return false;
  }
}

const tableConfigs = [
  {
    name: "accounts",
    bypassInsert: (ctx) => ({
      sql: `
        INSERT INTO catalogs.accounts (
          account_number, account_name, account_type, notes, created_by_user_id, updated_by_user_id
        ) VALUES ($1, $2, 'Asset', $3, $4, $4)
        RETURNING id
      `,
      values: [makeCode("1000"), `Fixture Account ${ctx.suffix}`, "fixture", ctx.ownerUserId],
    }),
    managerInsert: (ctx) => ({
      sql: `
        INSERT INTO catalogs.accounts (
          account_number, account_name, account_type, notes, created_by_user_id, updated_by_user_id
        ) VALUES ($1, $2, 'Income', $3, $4, $4)
        RETURNING id
      `,
      values: [makeCode("2000"), `Manager Account ${ctx.suffix}`, "manager insert", ctx.managerUserId],
    }),
    accountantInsert: (ctx) => ({
      sql: `
        INSERT INTO catalogs.accounts (
          account_number, account_name, account_type, notes, created_by_user_id, updated_by_user_id
        ) VALUES ($1, $2, 'Expense', $3, $4, $4)
        RETURNING id
      `,
      values: [makeCode("3000"), `Accountant Account ${ctx.suffix}`, "accountant insert", ctx.accountantUserId],
    }),
    driverInsert: (ctx) => ({
      sql: `
        INSERT INTO catalogs.accounts (
          account_number, account_name, account_type, notes, created_by_user_id, updated_by_user_id
        ) VALUES ($1, $2, 'Liability', $3, $4, $4)
        RETURNING id
      `,
      values: [makeCode("4000"), `Driver Account ${ctx.suffix}`, "driver insert", ctx.driverUserId],
    }),
    managerUpdate: () => ({ sql: `UPDATE catalogs.accounts SET notes = 'manager updated' WHERE id = $1` }),
    driverUpdate: () => ({ sql: `UPDATE catalogs.accounts SET notes = 'driver updated' WHERE id = $1` }),
  },
  {
    name: "classes",
    bypassInsert: (ctx) => ({
      sql: `
        INSERT INTO catalogs.classes (
          class_name, class_code, notes, created_by_user_id, updated_by_user_id
        ) VALUES ($1, $2, $3, $4, $4)
        RETURNING id
      `,
      values: [`Fixture Class ${ctx.suffix}`, makeCode("FIX-CLS"), "fixture", ctx.ownerUserId],
    }),
    managerInsert: (ctx) => ({
      sql: `
        INSERT INTO catalogs.classes (
          class_name, class_code, notes, created_by_user_id, updated_by_user_id
        ) VALUES ($1, $2, $3, $4, $4)
        RETURNING id
      `,
      values: [`Manager Class ${ctx.suffix}`, makeCode("MGR-CLS"), "manager insert", ctx.managerUserId],
    }),
    accountantInsert: (ctx) => ({
      sql: `
        INSERT INTO catalogs.classes (
          class_name, class_code, notes, created_by_user_id, updated_by_user_id
        ) VALUES ($1, $2, $3, $4, $4)
        RETURNING id
      `,
      values: [`Accountant Class ${ctx.suffix}`, makeCode("ACC-CLS"), "accountant insert", ctx.accountantUserId],
    }),
    driverInsert: (ctx) => ({
      sql: `
        INSERT INTO catalogs.classes (
          class_name, class_code, notes, created_by_user_id, updated_by_user_id
        ) VALUES ($1, $2, $3, $4, $4)
        RETURNING id
      `,
      values: [`Driver Class ${ctx.suffix}`, makeCode("DRV-CLS"), "driver insert", ctx.driverUserId],
    }),
    managerUpdate: () => ({ sql: `UPDATE catalogs.classes SET notes = 'manager updated' WHERE id = $1` }),
    driverUpdate: () => ({ sql: `UPDATE catalogs.classes SET notes = 'driver updated' WHERE id = $1` }),
  },
  {
    name: "items",
    bypassInsert: (ctx) => ({
      sql: `
        INSERT INTO catalogs.items (
          item_name, item_code, item_type, default_income_account_id, default_expense_account_id,
          default_class_id, notes, created_by_user_id, updated_by_user_id
        ) VALUES ($1, $2, 'Service', $3, $3, $4, $5, $6, $6)
        RETURNING id
      `,
      values: [
        `Fixture Item ${ctx.suffix}`,
        makeCode("FIX-ITEM"),
        ctx.fixtureIds.accounts,
        ctx.fixtureIds.classes,
        "fixture",
        ctx.ownerUserId,
      ],
    }),
    managerInsert: (ctx) => ({
      sql: `
        INSERT INTO catalogs.items (
          item_name, item_code, item_type, default_income_account_id, default_expense_account_id,
          default_class_id, notes, created_by_user_id, updated_by_user_id
        ) VALUES ($1, $2, 'NonInventory', $3, $3, $4, $5, $6, $6)
        RETURNING id
      `,
      values: [
        `Manager Item ${ctx.suffix}`,
        makeCode("MGR-ITEM"),
        ctx.fixtureIds.accounts,
        ctx.fixtureIds.classes,
        "manager insert",
        ctx.managerUserId,
      ],
    }),
    accountantInsert: (ctx) => ({
      sql: `
        INSERT INTO catalogs.items (
          item_name, item_code, item_type, default_income_account_id, default_expense_account_id,
          default_class_id, notes, created_by_user_id, updated_by_user_id
        ) VALUES ($1, $2, 'Charge', $3, $3, $4, $5, $6, $6)
        RETURNING id
      `,
      values: [
        `Accountant Item ${ctx.suffix}`,
        makeCode("ACC-ITEM"),
        ctx.fixtureIds.accounts,
        ctx.fixtureIds.classes,
        "accountant insert",
        ctx.accountantUserId,
      ],
    }),
    driverInsert: (ctx) => ({
      sql: `
        INSERT INTO catalogs.items (
          item_name, item_code, item_type, default_income_account_id, default_expense_account_id,
          default_class_id, notes, created_by_user_id, updated_by_user_id
        ) VALUES ($1, $2, 'Discount', $3, $3, $4, $5, $6, $6)
        RETURNING id
      `,
      values: [
        `Driver Item ${ctx.suffix}`,
        makeCode("DRV-ITEM"),
        ctx.fixtureIds.accounts,
        ctx.fixtureIds.classes,
        "driver insert",
        ctx.driverUserId,
      ],
    }),
    managerUpdate: () => ({ sql: `UPDATE catalogs.items SET notes = 'manager updated' WHERE id = $1` }),
    driverUpdate: () => ({ sql: `UPDATE catalogs.items SET notes = 'driver updated' WHERE id = $1` }),
  },
  {
    name: "payment_terms",
    bypassInsert: (ctx) => ({
      sql: `
        INSERT INTO catalogs.payment_terms (
          terms_name, days_until_due, notes, created_by_user_id, updated_by_user_id
        ) VALUES ($1, 30, $2, $3, $3)
        RETURNING id
      `,
      values: [`Fixture Terms ${ctx.suffix}`, "fixture", ctx.ownerUserId],
    }),
    managerInsert: (ctx) => ({
      sql: `
        INSERT INTO catalogs.payment_terms (
          terms_name, days_until_due, notes, created_by_user_id, updated_by_user_id
        ) VALUES ($1, 15, $2, $3, $3)
        RETURNING id
      `,
      values: [`Manager Terms ${ctx.suffix}`, "manager insert", ctx.managerUserId],
    }),
    accountantInsert: (ctx) => ({
      sql: `
        INSERT INTO catalogs.payment_terms (
          terms_name, days_until_due, notes, created_by_user_id, updated_by_user_id
        ) VALUES ($1, 7, $2, $3, $3)
        RETURNING id
      `,
      values: [`Accountant Terms ${ctx.suffix}`, "accountant insert", ctx.accountantUserId],
    }),
    driverInsert: (ctx) => ({
      sql: `
        INSERT INTO catalogs.payment_terms (
          terms_name, days_until_due, notes, created_by_user_id, updated_by_user_id
        ) VALUES ($1, 3, $2, $3, $3)
        RETURNING id
      `,
      values: [`Driver Terms ${ctx.suffix}`, "driver insert", ctx.driverUserId],
    }),
    managerUpdate: () => ({ sql: `UPDATE catalogs.payment_terms SET notes = 'manager updated' WHERE id = $1` }),
    driverUpdate: () => ({ sql: `UPDATE catalogs.payment_terms SET notes = 'driver updated' WHERE id = $1` }),
  },
  {
    name: "posting_templates",
    bypassInsert: (ctx) => ({
      sql: `
        INSERT INTO catalogs.posting_templates (
          template_name, template_code, debit_account_id, credit_account_id,
          default_class_id, default_memo, is_active, created_by_user_id, updated_by_user_id
        ) VALUES ($1, $2, $3, $4, $5, $6, true, $7, $7)
        RETURNING id
      `,
      values: [
        `Fixture Template ${ctx.suffix}`,
        makeCode("FIX-TPL"),
        ctx.fixtureIds.accounts,
        ctx.managerRowIds.accounts,
        ctx.fixtureIds.classes,
        "fixture memo",
        ctx.ownerUserId,
      ],
    }),
    managerInsert: (ctx) => ({
      sql: `
        INSERT INTO catalogs.posting_templates (
          template_name, template_code, debit_account_id, credit_account_id,
          default_class_id, default_memo, is_active, created_by_user_id, updated_by_user_id
        ) VALUES ($1, $2, $3, $4, $5, $6, true, $7, $7)
        RETURNING id
      `,
      values: [
        `Manager Template ${ctx.suffix}`,
        makeCode("MGR-TPL"),
        ctx.managerRowIds.accounts,
        ctx.accountantRowIds.accounts,
        ctx.fixtureIds.classes,
        "manager memo",
        ctx.managerUserId,
      ],
    }),
    accountantInsert: (ctx) => ({
      sql: `
        INSERT INTO catalogs.posting_templates (
          template_name, template_code, debit_account_id, credit_account_id,
          default_class_id, default_memo, is_active, created_by_user_id, updated_by_user_id
        ) VALUES ($1, $2, $3, $4, $5, $6, true, $7, $7)
        RETURNING id
      `,
      values: [
        `Accountant Template ${ctx.suffix}`,
        makeCode("ACC-TPL"),
        ctx.accountantRowIds.accounts,
        ctx.fixtureIds.accounts,
        ctx.fixtureIds.classes,
        "accountant memo",
        ctx.accountantUserId,
      ],
    }),
    driverInsert: (ctx) => ({
      sql: `
        INSERT INTO catalogs.posting_templates (
          template_name, template_code, debit_account_id, credit_account_id,
          default_class_id, default_memo, is_active, created_by_user_id, updated_by_user_id
        ) VALUES ($1, $2, $3, $4, $5, $6, true, $7, $7)
        RETURNING id
      `,
      values: [
        `Driver Template ${ctx.suffix}`,
        makeCode("DRV-TPL"),
        ctx.fixtureIds.accounts,
        ctx.managerRowIds.accounts,
        ctx.fixtureIds.classes,
        "driver memo",
        ctx.driverUserId,
      ],
    }),
    managerUpdate: () => ({ sql: `UPDATE catalogs.posting_templates SET default_memo = 'manager updated' WHERE id = $1` }),
    driverUpdate: () => ({ sql: `UPDATE catalogs.posting_templates SET default_memo = 'driver updated' WHERE id = $1` }),
  },
  {
    name: "account_role_bindings",
    bypassInsert: (ctx) => ({
      sql: `
        INSERT INTO catalogs.account_role_bindings (
          role_key, account_id, description, created_by_user_id, updated_by_user_id
        ) VALUES ('ar_clearing', $1, $2, $3, $3)
        RETURNING id
      `,
      values: [ctx.fixtureIds.accounts, "fixture", ctx.ownerUserId],
    }),
    managerInsert: (ctx) => ({
      sql: `
        INSERT INTO catalogs.account_role_bindings (
          role_key, account_id, description, created_by_user_id, updated_by_user_id
        ) VALUES ('ap_clearing', $1, $2, $3, $3)
        RETURNING id
      `,
      values: [ctx.managerRowIds.accounts, "manager insert", ctx.managerUserId],
    }),
    accountantInsert: (ctx) => ({
      sql: `
        INSERT INTO catalogs.account_role_bindings (
          role_key, account_id, description, created_by_user_id, updated_by_user_id
        ) VALUES ('cash_dip', $1, $2, $3, $3)
        RETURNING id
      `,
      values: [ctx.accountantRowIds.accounts, "accountant insert", ctx.accountantUserId],
    }),
    driverInsert: (ctx) => ({
      sql: `
        INSERT INTO catalogs.account_role_bindings (
          role_key, account_id, description, created_by_user_id, updated_by_user_id
        ) VALUES ('cash_payroll', $1, $2, $3, $3)
        RETURNING id
      `,
      values: [ctx.fixtureIds.accounts, "driver insert", ctx.driverUserId],
    }),
    managerUpdate: () => ({ sql: `UPDATE catalogs.account_role_bindings SET description = 'manager updated' WHERE id = $1` }),
    driverUpdate: () => ({ sql: `UPDATE catalogs.account_role_bindings SET description = 'driver updated' WHERE id = $1` }),
  },
];

const client = await pool.connect();
const results = [];

try {
  await client.query("SET ROLE ih35_app");

  const userIds = await runWithBypass(client, async () => {
    const owner = await client.query(
      `INSERT INTO identity.users (email, google_user_id, role) VALUES ($1, $2, 'Owner') RETURNING id`,
      [`catal-owner-${suffix}@example.com`, `catal-owner-${suffix}`]
    );
    const manager = await client.query(
      `INSERT INTO identity.users (email, google_user_id, role) VALUES ($1, $2, 'Manager') RETURNING id`,
      [`catal-manager-${suffix}@example.com`, `catal-manager-${suffix}`]
    );
    const driver = await client.query(
      `INSERT INTO identity.users (email, google_user_id, role) VALUES ($1, $2, 'Driver') RETURNING id`,
      [`catal-driver-${suffix}@example.com`, `catal-driver-${suffix}`]
    );
    const accountant = await client.query(
      `INSERT INTO identity.users (email, google_user_id, role) VALUES ($1, $2, 'Accountant') RETURNING id`,
      [`catal-accountant-${suffix}@example.com`, `catal-accountant-${suffix}`]
    );
    return {
      ownerUserId: String(owner.rows[0].id),
      managerUserId: String(manager.rows[0].id),
      driverUserId: String(driver.rows[0].id),
      accountantUserId: String(accountant.rows[0].id),
    };
  });

  createdUserIds.push(userIds.ownerUserId, userIds.managerUserId, userIds.driverUserId, userIds.accountantUserId);

  for (const cfg of tableConfigs) {
    const ctx = {
      suffix,
      ...userIds,
      fixtureIds,
      managerRowIds,
      accountantRowIds,
    };

    results.push(
      await pass(`${cfg.name}: bypass fixture insert`, async () => {
        const fixtureId = await runWithBypass(client, async () => {
          const q = cfg.bypassInsert(ctx);
          const res = await client.query(q.sql, q.values);
          return String(res.rows[0].id);
        });
        fixtureIds[cfg.name] = fixtureId;
      })
    );

    results.push(
      await pass(`${cfg.name}: driver SELECT succeeds`, async () => {
        await runAsUser(client, userIds.driverUserId, async () => {
          const res = await client.query(`SELECT id FROM catalogs.${cfg.name} WHERE id = $1`, [fixtureIds[cfg.name]]);
          if ((res.rowCount ?? 0) !== 1) {
            throw new Error("expected driver to read fixture row");
          }
        });
      })
    );

    results.push(
      await pass(`${cfg.name}: driver INSERT rejected`, async () => {
        await runAsUser(client, userIds.driverUserId, async () => {
          const q = cfg.driverInsert(ctx);
          try {
            await client.query(q.sql, q.values);
            throw new Error("driver insert unexpectedly succeeded");
          } catch (err) {
            if (!isDeniedError(err)) throw err;
          }
        });
      })
    );

    results.push(
      await pass(`${cfg.name}: manager INSERT succeeds`, async () => {
        const managerId = await runAsUser(client, userIds.managerUserId, async () => {
          const q = cfg.managerInsert(ctx);
          const res = await client.query(q.sql, q.values);
          return String(res.rows[0].id);
        });
        managerRowIds[cfg.name] = managerId;
      })
    );

    results.push(
      await pass(`${cfg.name}: accountant INSERT succeeds`, async () => {
        const accountantId = await runAsUser(client, userIds.accountantUserId, async () => {
          const q = cfg.accountantInsert(ctx);
          const res = await client.query(q.sql, q.values);
          return String(res.rows[0].id);
        });
        accountantRowIds[cfg.name] = accountantId;
      })
    );

    results.push(
      await pass(`${cfg.name}: manager UPDATE succeeds`, async () => {
        await runAsUser(client, userIds.managerUserId, async () => {
          const q = cfg.managerUpdate(ctx);
          const res = await client.query(q.sql, [managerRowIds[cfg.name]]);
          if ((res.rowCount ?? 0) !== 1) {
            throw new Error(`expected manager update rowCount=1 got ${res.rowCount}`);
          }
        });
      })
    );

    results.push(
      await pass(`${cfg.name}: driver UPDATE rejected`, async () => {
        await runAsUser(client, userIds.driverUserId, async () => {
          const q = cfg.driverUpdate(ctx);
          try {
            const res = await client.query(q.sql, [managerRowIds[cfg.name]]);
            if ((res.rowCount ?? 0) !== 0) {
              throw new Error(`driver update unexpectedly affected ${res.rowCount} rows`);
            }
          } catch (err) {
            if (!isDeniedError(err)) throw err;
          }
        });
      })
    );
  }
} catch (err) {
  console.error(`FAIL: setup/test execution -> ${String(err?.message || err)}`);
  results.push(false);
} finally {
  try {
    await client.query("RESET ROLE");
    await client.query("BEGIN");
    try {
      if (fixtureIds.account_role_bindings || managerRowIds.account_role_bindings || accountantRowIds.account_role_bindings) {
        await client.query(
          `DELETE FROM catalogs.account_role_bindings WHERE id = ANY($1::uuid[])`,
          [[fixtureIds.account_role_bindings, managerRowIds.account_role_bindings, accountantRowIds.account_role_bindings].filter(Boolean)]
        );
      }
      if (fixtureIds.posting_templates || managerRowIds.posting_templates || accountantRowIds.posting_templates) {
        await client.query(
          `DELETE FROM catalogs.posting_templates WHERE id = ANY($1::uuid[])`,
          [[fixtureIds.posting_templates, managerRowIds.posting_templates, accountantRowIds.posting_templates].filter(Boolean)]
        );
      }
      if (fixtureIds.items || managerRowIds.items || accountantRowIds.items) {
        await client.query(
          `DELETE FROM catalogs.items WHERE id = ANY($1::uuid[])`,
          [[fixtureIds.items, managerRowIds.items, accountantRowIds.items].filter(Boolean)]
        );
      }
      if (fixtureIds.payment_terms || managerRowIds.payment_terms || accountantRowIds.payment_terms) {
        await client.query(
          `DELETE FROM catalogs.payment_terms WHERE id = ANY($1::uuid[])`,
          [[fixtureIds.payment_terms, managerRowIds.payment_terms, accountantRowIds.payment_terms].filter(Boolean)]
        );
      }
      if (fixtureIds.classes || managerRowIds.classes || accountantRowIds.classes) {
        await client.query(
          `DELETE FROM catalogs.classes WHERE id = ANY($1::uuid[])`,
          [[fixtureIds.classes, managerRowIds.classes, accountantRowIds.classes].filter(Boolean)]
        );
      }
      if (fixtureIds.accounts || managerRowIds.accounts || accountantRowIds.accounts) {
        await client.query(
          `DELETE FROM catalogs.accounts WHERE id = ANY($1::uuid[])`,
          [[fixtureIds.accounts, managerRowIds.accounts, accountantRowIds.accounts].filter(Boolean)]
        );
      }
      if (createdUserIds.length > 0) {
        await client.query(`DELETE FROM identity.users WHERE id = ANY($1::uuid[])`, [createdUserIds]);
      }
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    }
    console.log("PASS: cleanup catalogs fixtures");
  } catch (err) {
    console.error(`FAIL: cleanup catalogs fixtures -> ${String(err?.message || err)}`);
    results.push(false);
  }

  client.release();
  await pool.end();
}

if (results.every(Boolean)) {
  console.log("PASS: catalogs RLS verification complete.");
  process.exit(0);
}

console.error("FAIL: catalogs RLS verification failed.");
process.exit(1);
