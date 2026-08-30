#!/usr/bin/env node
/**
 * FACT-RESERVE-01 + FACT-RESERVE-02 — static-shape guard.
 *
 * The complement bug BALANCES (cash identical), so only a source guard catches it.
 * After the independent-pct fix, omitted factor_fee_pct / UI 92/8/0 still prices money.
 */
import { readFileSync } from "node:fs";

const ROUTES_FILE = "apps/backend/src/accounting/factoring-advances.routes.ts";
const MODAL_FILE = "apps/frontend/src/pages/accounting/SubmitFactoringModal.tsx";

function analyze(src, modalSrc) {
  const failures = [];

  if (!/const reserveAmount = Math\.round\(\(invoiceTotalCents \* Number\(body\.data\.reserve_pct\)\) \/ 100\);/.test(src)) {
    failures.push(`${ROUTES_FILE}: reserveAmount is not computed independently from reserve_pct`);
  }
  if (!/const feeAmount = Math\.round\(\(invoiceTotalCents \* Number\(body\.data\.factor_fee_pct\)\) \/ 100\);/.test(src)) {
    failures.push(`${ROUTES_FILE}: feeAmount must use required factor_fee_pct (no ?? 0 omit-to-zero)`);
  }
  if (/invoiceTotalCents\s*-\s*advanceAmount/.test(src) && /const reserveAmount/.test(src)) {
    if (/const reserveAmount = Math\.max\(0, invoiceTotalCents - advanceAmount\)/.test(src) ||
        /const reserveAmount = [^\n]*invoiceTotalCents - advanceAmount/.test(src)) {
      failures.push(`${ROUTES_FILE}: reserveAmount has reverted to the complement (total - advance) formula`);
    }
  }
  if (/const reserveAmount = Math\.max\(0, invoiceTotalCents - advanceAmount\);/.test(src)) {
    failures.push(`${ROUTES_FILE}: reserveAmount has reverted to the old "whatever's left after advance" formula`);
  }

  const createInsertMatch = src.match(/INSERT INTO accounting\.factoring_advances \(([\s\S]*?)\)\s*\n\s*VALUES/);
  if (!createInsertMatch || !/factor_fee_cents/.test(createInsertMatch[1])) {
    failures.push(`${ROUTES_FILE}: factor_fee_cents is missing from the factoring_advances INSERT column list`);
  }
  if (!/feeAmount,\s*\n\s*body\.data\.notes/.test(src) && !/feeAmount,\s*\n\s*body\.data\.notes \?\? null/.test(src)) {
    if (!src.includes("          feeAmount,\n          body.data.notes")) {
      failures.push(`${ROUTES_FILE}: feeAmount is not bound as a parameter to the INSERT`);
    }
  }
  if (/factor_fee_cents[\s\S]{0,400}VALUES[\s\S]{0,500}?,\s*0,\s*\n\s*(?:body\.data\.notes|user\.uuid)/.test(src)) {
    failures.push(`${ROUTES_FILE}: factor_fee_cents is written as a literal 0`);
  }

  const createIdx = src.indexOf("const createBodySchema");
  if (createIdx !== -1) {
    const nextConst = src.indexOf("\nconst ", createIdx + 1);
    const block = src.slice(createIdx, nextConst === -1 ? undefined : nextConst);
    if (/factor_fee_pct:[\s\S]*?\.optional\(\)\.default\(0\)/.test(block)) {
      failures.push(`${ROUTES_FILE}: createBodySchema factor_fee_pct must not optional().default(0)`);
    }
  }

  if (modalSrc) {
    if (/useState\("92"\)/.test(modalSrc) || /useState\("8"\)/.test(modalSrc)) {
      failures.push(`${MODAL_FILE}: must not seed advance 92 / reserve 8`);
    }
    if (/const \[factorFeePct, setFactorFeePct\] = useState\("0"\)/.test(modalSrc)) {
      failures.push(`${MODAL_FILE}: must not seed factorFeePct to 0`);
    }
    if (modalSrc.includes("return activeFactors[0] ?? null")) {
      failures.push(`${MODAL_FILE}: must not silent-fallback to activeFactors[0]`);
    }
  }

  return failures;
}

function readAll() {
  return {
    src: readFileSync(ROUTES_FILE, "utf8"),
    modalSrc: readFileSync(MODAL_FILE, "utf8"),
  };
}

function selftest() {
  const { src, modalSrc } = readAll();
  const good = analyze(src, modalSrc);
  if (good.length > 0) {
    console.error("verify-factoring-advance-reserve-fee-independent --selftest: FAIL on the real (good) file");
    for (const f of good) console.error(`  - ${f}`);
    process.exit(1);
  }

  const mutations = [
    {
      name: "reserveAmount reverts to invoiceTotal - advanceAmount",
      apply: (s, m) => [
        s.replace(
          "const reserveAmount = Math.round((invoiceTotalCents * Number(body.data.reserve_pct)) / 100);",
          "const reserveAmount = Math.max(0, invoiceTotalCents - advanceAmount);"
        ),
        m,
      ],
    },
    {
      name: "feeAmount uses omit-to-zero ?? 0",
      apply: (s, m) => [
        s.replace(
          "const feeAmount = Math.round((invoiceTotalCents * Number(body.data.factor_fee_pct)) / 100);",
          "const feeAmount = Math.round((invoiceTotalCents * Number(body.data.factor_fee_pct ?? 0)) / 100);"
        ),
        m,
      ],
    },
    {
      name: "factor_fee_cents dropped from the INSERT column list",
      apply: (s, m) => [s.replace(/(\s*)factor_fee_cents,(\s*\n\s*notes,)/, "$1$2"), m],
    },
    {
      name: "feeAmount replaced with literal 0 in INSERT params",
      apply: (s, m) => [s.replace("          feeAmount,\n          body.data.notes ?? null,", "          0,\n          body.data.notes ?? null,"), m],
    },
    {
      name: "zod default(0) on factor_fee_pct",
      apply: (s, m) => [
        s.replace(
          "factor_fee_pct: z.coerce.number().min(0).max(100),",
          "factor_fee_pct: z.coerce.number().min(0).max(100).optional().default(0),"
        ),
        m,
      ],
    },
    {
      name: "modal seeds 92/8/0",
      apply: (s, m) => [
        s,
        m.replace('useState("")', 'useState("92")').replace(/const \[reservePct, setReservePct\] = useState\(""\)/, 'const [reservePct, setReservePct] = useState("8")').replace(/const \[factorFeePct, setFactorFeePct\] = useState\(""\)/, 'const [factorFeePct, setFactorFeePct] = useState("0")'),
      ],
    },
  ];

  let allCaught = true;
  for (const mut of mutations) {
    const [mutated, mutModal] = mut.apply(src, modalSrc);
    if (mutated === src && mutModal === modalSrc) {
      console.error(`verify-factoring-advance-reserve-fee-independent --selftest: mutation had no effect -- ${mut.name}`);
      allCaught = false;
      continue;
    }
    const failures = analyze(mutated, mutModal);
    if (failures.length === 0) {
      console.error(`verify-factoring-advance-reserve-fee-independent --selftest: NOT CAUGHT -- ${mut.name}`);
      allCaught = false;
    } else {
      console.log(`  caught: ${mut.name}`);
    }
  }

  if (!allCaught) process.exit(1);
  console.log(`SELFTEST PASS: ${mutations.length}/${mutations.length} planted regressions caught.`);
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  const { src, modalSrc } = readAll();
  const failures = analyze(src, modalSrc);
  if (failures.length > 0) {
    console.error("verify-factoring-advance-reserve-fee-independent: FAIL");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(
    "verify-factoring-advance-reserve-fee-independent: OK -- independent rsv/fee pcts, no complement, no omit-to-zero, no 92/8/0 seeds"
  );
}
