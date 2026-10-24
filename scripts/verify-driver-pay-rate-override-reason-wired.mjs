#!/usr/bin/env node
/**
 * GO-21 B5 — a typed driver_pay_rate_per_mile on Book Load must be able to actually take effect.
 * book-load.service.ts's resolveDriverBasePayCents() ONLY honors a typed per-load rate when
 * load.driver_pay_rate_override_reason is a real (>= 10 char) reason — otherwise it silently falls
 * through to the driver's profile rate card. The column (mdata.loads.driver_pay_rate_override_reason,
 * migration 202613460001) and the resolver's read of it existed for days with NOTHING writing to
 * it anywhere: not the CREATE route schema, not the INSERT/UPDATE, not the frontend. The override
 * mechanism was permanently dead — every typed rate, forever, was discarded — while the operator
 * was shown a confident dollar preview computed FROM the typed (and doomed-to-be-ignored) rate.
 *
 * Guard asserts every link in the chain is present:
 *  1) apps/backend/.../book-load.service.ts: BookLoadInput type carries the field
 *  2) same file: writeC9HoldFieldsIfPresent's UPDATE writes driver_pay_rate_override_reason
 *  3) same file: the ACCT-F10159-class in-memory patch sets load.driver_pay_rate_override_reason
 *     (resolveDriverBasePayCents reads the in-memory object, not a fresh SELECT)
 *  4) apps/backend/.../loads.routes.ts: the CREATE (Book Load) Zod schema accepts the field
 *  5) apps/frontend/.../api/dispatch.ts: DispatchBookLoadPayload carries the field
 *  6) apps/frontend/.../BookLoadModalV4.tsx: form type + submit payload send it (only when a rate
 *     is actually typed)
 *  7) apps/frontend/.../BookLoadEquipmentSection.tsx: a typed rate has a registered reason input, or the rate
 *     control is read-only and unregistered (443.99 — see link 7 below)
 *
 * --selftest removes one link at a time in a scratch copy and expects each to redden alone.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-driver-pay-rate-override-reason-wired";

const FILES = {
  bookLoadService: "apps/backend/src/dispatch/book-load.service.ts",
  loadsRoutes: "apps/backend/src/dispatch/loads.routes.ts",
  dispatchApi: "apps/frontend/src/api/dispatch.ts",
  modal: "apps/frontend/src/pages/dispatch/components/BookLoadModalV4.tsx",
  equipmentSection: "apps/frontend/src/pages/dispatch/components/BookLoadEquipmentSection.tsx",
};

const CHECKS = [
  {
    label: "BookLoadInput type carries driver_pay_rate_override_reason",
    file: FILES.bookLoadService,
    test: (src) => /driver_pay_rate_override_reason\?:\s*string/.test(src),
  },
  {
    label: "writeC9HoldFieldsIfPresent's UPDATE writes driver_pay_rate_override_reason",
    file: FILES.bookLoadService,
    test: (src) => /driver_pay_rate_override_reason\s*=\s*\$\d+/.test(src),
  },
  {
    label: "in-memory load object is patched with driver_pay_rate_override_reason (ACCT-F10159 class)",
    file: FILES.bookLoadService,
    test: (src) => /load\.driver_pay_rate_override_reason\s*=\s*input\.driver_pay_rate_override_reason/.test(src),
  },
  {
    label: "loads.routes.ts CREATE schema accepts driver_pay_rate_override_reason",
    file: FILES.loadsRoutes,
    test: (src) => /driver_pay_rate_override_reason:\s*z\.string\(\)/.test(src),
  },
  {
    label: "frontend DispatchBookLoadPayload carries driver_pay_rate_override_reason",
    file: FILES.dispatchApi,
    test: (src) => /driver_pay_rate_override_reason\?:\s*string/.test(src),
  },
  {
    label: "BookLoadModalV4 form type carries driver_pay_rate_override_reason",
    file: FILES.modal,
    test: (src) => /driver_pay_rate_override_reason:\s*string;/.test(src),
  },
  {
    label: "BookLoadModalV4 submit payload sends driver_pay_rate_override_reason",
    file: FILES.modal,
    test: (src) => /driver_pay_rate_override_reason:\s*\n[\s\S]{0,200}values\.driver_pay_rate_override_reason/.test(src),
  },
  // 443.99 (CC-2) — link 7.
  //   old rule: BookLoadEquipmentSection must register an input for driver_pay_rate_override_reason.
  //   new rule: the section must not let the operator type a per-load rate without a reason path — EITHER a reason
  //             input is registered, OR the rate control is read-only and no input is registered for
  //             driver_pay_rate_per_mile at all (nothing typed, so nothing can be silently discarded).
  //   why: WIZ-32 / WIZ-16 (LST-F6134, #20187, 81101be203) made "Driver pay rate / mi" a read-only display of the
  //        driver's rate card — the load stores no override — and removed the reason input with it. The defect
  //        this guard exists for (a typed rate that is silently ignored) cannot occur with no typed rate. Not
  //        looser: re-registering an editable rate without the reason input fails, as before.
  {
    label: "BookLoadEquipmentSection: a typed rate has a registered reason input, or the rate is read-only and unregistered",
    file: FILES.equipmentSection,
    // 443.258-B: field fully absent — no registered rate = no silent discard, invariant satisfied.
    test: (src) =>
      /register\("driver_pay_rate_override_reason"\)/.test(src) ||
      (!/register\("driver_pay_rate_per_mile"/.test(src) &&
        (!/id="book-load-driver-pay-rate-per-mile"/.test(src) ||
         /id="book-load-driver-pay-rate-per-mile"[\s\S]{0,200}readOnly/.test(src))),
    // planted regression: add back a registered editable rate without a reason input
    plant: (src) =>
      src.includes('id="book-load-driver-pay-rate-per-mile"')
        ? src.replace(/register\("driver_pay_rate_override_reason"\)/g, "").replace(
            /id="book-load-driver-pay-rate-per-mile"/,
            'id="book-load-driver-pay-rate-per-mile" {...register("driver_pay_rate_per_mile")}',
          ).replace(/(id="book-load-driver-pay-rate-per-mile"[\s\S]{0,200}?)readOnly/, "$1")
        : src + '\n/* mutation-443258b */ <input id="book-load-driver-pay-rate-per-mile" {...register("driver_pay_rate_per_mile")} />',
  },
];

/** @param {string} root */
export function check(root = ROOT) {
  const errors = [];
  for (const c of CHECKS) {
    const filePath = path.join(root, c.file);
    if (!fs.existsSync(filePath)) {
      errors.push(`${c.file}: not found`);
      continue;
    }
    const src = fs.readFileSync(filePath, "utf8");
    if (!c.test(src)) {
      errors.push(`${c.file}: ${c.label} — MISSING`);
    }
  }
  return errors;
}

function selftest() {
  const tmp = fs.mkdtempSync(path.join(ROOT, "tmp-payrate-reason-"));
  let failMsg = null;
  try {
    const uniqueFiles = [...new Set(Object.values(FILES))];
    for (const f of uniqueFiles) {
      const dest = path.join(tmp, f);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(path.join(ROOT, f), dest);
    }

    // Baseline: everything present, must be clean.
    const baseline = check(tmp);
    if (baseline.length) {
      failMsg = `${LABEL} selftest FAIL — real repo already fails: ${baseline.join("; ")}`;
    } else {
      // Strip each link one at a time in isolated copies and confirm exactly that link reddens.
      let escaped = [];
      for (const c of CHECKS) {
        const isolated = fs.mkdtempSync(path.join(ROOT, "tmp-payrate-reason-iso-"));
        try {
          for (const f of uniqueFiles) {
            const dest = path.join(isolated, f);
            fs.mkdirSync(path.dirname(dest), { recursive: true });
            fs.copyFileSync(path.join(ROOT, f), dest);
          }
          const targetPath = path.join(isolated, c.file);
          let src = fs.readFileSync(targetPath, "utf8");
          src = c.plant ? c.plant(src) : src.replace(/driver_pay_rate_override_reason/g, "REDACTED_field_name");
          fs.writeFileSync(targetPath, src);
          const errs = check(isolated);
          if (!errs.some((e) => e.startsWith(c.file))) escaped.push(c.label);
        } finally {
          fs.rmSync(isolated, { recursive: true, force: true });
        }
      }
      if (escaped.length) {
        failMsg = `${LABEL} selftest FAIL — planted removal(s) escaped: ${escaped.join(" | ")}`;
      } else {
        console.log(`${LABEL} selftest PASS — ${CHECKS.length}/${CHECKS.length} planted removals each correctly reddened`);
      }
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  if (failMsg) {
    console.error(failMsg);
    process.exit(1);
  }
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const errors = check();
if (errors.length) {
  console.error(`${LABEL} FAIL:`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — driver_pay_rate_override_reason wired end to end (schema → INSERT → in-memory patch → frontend send)`);
