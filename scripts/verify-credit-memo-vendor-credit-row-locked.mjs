#!/usr/bin/env node
/**
 * ACCT-F5639 — accounting.credit_memos and accounting.vendor_credits' /apply and /void endpoints read
 * their row with a plain SELECT (no FOR UPDATE), unlike every sibling void/apply writer in the
 * codebase (bills.service.ts, payments.routes.ts's ACCT-F5636 fix, every
 * governance/void-cancel-executors.ts executor — all SELECT ... FOR UPDATE). Under READ COMMITTED, a
 * concurrent /apply and /void on the same credit memo / vendor credit can both read the pre-mutation
 * state before either commits: the /void call's "reverse active applications" UPDATE (WHERE
 * credit_memo_id/credit_id = X AND voided_at IS NULL) then misses the just-applied row entirely —
 * invisible under READ COMMITTED — so the parent ends up status='voided' while a live, non-voided
 * application row still stands. Every downstream netting query (verify-ar-aging-credit-memo-netting,
 * verify-bill-payment-nets-vendor-credits, verify-customer-payment-apply-nets-credit-memos) keeps
 * counting that stranded application against the invoice/bill forever, permanently understating its
 * true open balance. A second, lower-severity manifestation of the same missing lock: two concurrent
 * /apply calls can each pass the over-apply check against the same stale amount_unapplied_cents and
 * jointly over-apply a credit beyond its face amount.
 *
 * Fix: FOR UPDATE on the initial SELECT in all four endpoints, plus a belt-and-suspenders
 * WHERE status <> 'voided' / rowCount === 0 check on the two void UPDATEs, mirroring the pattern
 * ACCT-F5636 already proved out on payments.routes.ts.
 */
import fs from "node:fs";

const ROUTES = [
  {
    file: "apps/backend/src/accounting/credit-memos.routes.ts",
    applyPath: "/api/v1/accounting/credit-memos/:id/apply",
    voidPath: "/api/v1/accounting/credit-memos/:id/void",
    voidedLiteral: "'voided'",
  },
  {
    file: "apps/backend/src/accounting/vendor-credits.routes.ts",
    applyPath: "/api/v1/accounting/vendor-credits/:id/apply",
    voidPath: "/api/v1/accounting/vendor-credits/:id/void",
    voidedLiteral: "'voided'",
  },
];

function extractRoute(src, path) {
  const escaped = path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`app\\.post\\(\\s*"${escaped}"[\\s\\S]*?\\n {2}\\}\\);`);
  const m = src.match(re);
  return m ? m[0] : null;
}

export function run(root = process.cwd()) {
  const failures = [];

  for (const cfg of ROUTES) {
    const src = fs.readFileSync(`${root}/${cfg.file}`, "utf8");

    const applyRoute = extractRoute(src, cfg.applyPath);
    if (!applyRoute) {
      failures.push(`${cfg.file}: could not locate the ${cfg.applyPath} route`);
    } else if (!/SELECT[\s\S]{0,300}?FOR UPDATE/.test(applyRoute)) {
      failures.push(`${cfg.file}: the /apply endpoint's initial SELECT must use FOR UPDATE to lock the row against a concurrent void`);
    }

    const voidRoute = extractRoute(src, cfg.voidPath);
    if (!voidRoute) {
      failures.push(`${cfg.file}: could not locate the ${cfg.voidPath} route`);
      continue;
    }
    if (!/SELECT[\s\S]{0,300}?FOR UPDATE/.test(voidRoute)) {
      failures.push(`${cfg.file}: the /void endpoint's initial SELECT must use FOR UPDATE to lock the row against a concurrent apply`);
    }
    if (!/status\s*<>\s*'voided'/.test(voidRoute)) {
      failures.push(`${cfg.file}: the /void endpoint's status-flip UPDATE must carry AND status <> 'voided' as a belt-and-suspenders guard alongside the row lock`);
    }
    if (!/rowCount\s*===\s*0/.test(voidRoute)) {
      failures.push(`${cfg.file}: a zero-row void UPDATE result (the race case) must be treated as already_voided, not silently ignored`);
    }
  }

  return failures;
}

if (process.argv.includes("--selftest")) {
  const tmp = fs.mkdtempSync("/tmp/verify-credit-memo-vendor-credit-lock-");
  const mk = (rel, body) => {
    fs.mkdirSync(`${tmp}/${rel.split("/").slice(0, -1).join("/")}`, { recursive: true });
    fs.writeFileSync(`${tmp}/${rel}`, body);
  };
  const goodFile = (applyPath, voidPath) => `
  app.post("${applyPath}", async (req, reply) => {
    const result = await withCompanyScope(user.uuid, opco, async (client) => {
      const creditRes = await client.query(
        \`SELECT id, status FROM accounting.credit_memos WHERE id = $1 LIMIT 1 FOR UPDATE\`,
        []
      );
    });
  });

  app.post("${voidPath}", async (req, reply) => {
    const result = await withCompanyScope(user.uuid, opco, async (client) => {
      const creditRes = await client.query(
        \`SELECT id, status FROM accounting.credit_memos WHERE id = $1 LIMIT 1 FOR UPDATE\`,
        []
      );
      const flipped = await client.query(
        \`UPDATE accounting.credit_memos SET status = 'voided' WHERE id = $1 AND status <> 'voided'\`,
        []
      );
      if (flipped.rowCount === 0) return { code: 409, error: "already_voided" };
    });
  });
`;

  for (const cfg of ROUTES) {
    mk(cfg.file, goodFile(cfg.applyPath, cfg.voidPath));
  }
  if (run(tmp).length) throw new Error("PASS fail: " + run(tmp).join("; "));

  // Regression 1: FOR UPDATE dropped from the /apply endpoint.
  mk(
    ROUTES[0].file,
    goodFile(ROUTES[0].applyPath, ROUTES[0].voidPath).replace(
      "WHERE id = $1 LIMIT 1 FOR UPDATE`,\n        []\n      );\n    });\n  });",
      "WHERE id = $1 LIMIT 1`,\n        []\n      );\n    });\n  });"
    )
  );
  let f = run(tmp);
  if (!f.length) throw new Error("FAIL fail (regression 1): missing FOR UPDATE on /apply should be caught");
  mk(ROUTES[0].file, goodFile(ROUTES[0].applyPath, ROUTES[0].voidPath)); // restore

  // Regression 2: FOR UPDATE dropped from the /void endpoint.
  mk(
    ROUTES[0].file,
    goodFile(ROUTES[0].applyPath, ROUTES[0].voidPath).replace(
      "WHERE id = $1 LIMIT 1 FOR UPDATE`,\n        []\n      );\n      const flipped",
      "WHERE id = $1 LIMIT 1`,\n        []\n      );\n      const flipped"
    )
  );
  f = run(tmp);
  if (!f.length) throw new Error("FAIL fail (regression 2): missing FOR UPDATE on /void should be caught");
  mk(ROUTES[0].file, goodFile(ROUTES[0].applyPath, ROUTES[0].voidPath)); // restore

  // Regression 3: the belt-and-suspenders status <> 'voided' guard dropped from the void UPDATE.
  mk(
    ROUTES[0].file,
    goodFile(ROUTES[0].applyPath, ROUTES[0].voidPath).replace(" AND status <> 'voided'", "")
  );
  f = run(tmp);
  if (!f.length) throw new Error("FAIL fail (regression 3): missing status <> 'voided' guard should be caught");
  mk(ROUTES[0].file, goodFile(ROUTES[0].applyPath, ROUTES[0].voidPath)); // restore

  // Regression 4: the zero-row void UPDATE result is silently ignored.
  mk(
    ROUTES[0].file,
    goodFile(ROUTES[0].applyPath, ROUTES[0].voidPath).replace(
      'if (flipped.rowCount === 0) return { code: 409, error: "already_voided" };\n    ',
      ""
    )
  );
  f = run(tmp);
  if (!f.length) throw new Error("FAIL fail (regression 4): silently ignored zero-row void UPDATE should be caught");

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log("verify-credit-memo-vendor-credit-row-locked --selftest OK");
} else {
  const f = run();
  if (f.length) {
    console.error(f.join("\n"));
    process.exit(1);
  }
  console.log("verify-credit-memo-vendor-credit-row-locked — OK");
}
