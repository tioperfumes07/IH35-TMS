#!/usr/bin/env node
/**
 * 0441-mod5-addtraining-drops-expiry
 *
 * Prevents AddTrainingModal from dropping expiry_date while the API and
 * downstream expiry surfaces continue to support it.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const LABEL = "verify:driver-training-expiry-field";

export function validate(modal, test) {
  const failures = [];

  if (!/const\s+\[expiryDate,\s*setExpiryDate\]\s*=\s*useState\(""\)/.test(modal)) {
    failures.push("AddTrainingModal must hold optional expiryDate state");
  }
  if (
    !/<DatePicker[\s\S]*?value=\{expiryDate\}[\s\S]*?onChange=\{setExpiryDate\}[\s\S]*?data-testid="add-training-expiry"/.test(
      modal,
    )
  ) {
    failures.push("AddTrainingModal must render an expiry DatePicker");
  }
  const inlinePayload = /createDriverTrainingRecord\(driverId,\s*companyId,\s*\{[\s\S]*?expiry_date:\s*expiryDate\s*\|\|\s*undefined[\s\S]*?\}\)/.test(
    modal,
  );
  const snapshottedPayload =
    /body:\s*\{[\s\S]*?expiry_date:\s*expiryDate\s*\|\|\s*undefined[\s\S]*?\}/.test(modal) &&
    /createDriverTrainingRecord\(input\.driverId,\s*input\.companyId,\s*input\.body\)/.test(modal);
  if (!inlinePayload && !snapshottedPayload) {
    failures.push("AddTrainingModal submit must include optional expiry_date in the create payload");
  }
  if (!/getByTestId\("add-training-expiry"\)/.test(test)) {
    failures.push("AddTrainingModal test must interact with the expiry DatePicker");
  }
  if (!/expiry_date:\s*expect\.stringMatching/.test(test)) {
    failures.push("AddTrainingModal test must assert expiry_date in the POST body");
  }

  return failures;
}

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

function runSelfTest() {
  const validModal = `
    const [expiryDate, setExpiryDate] = useState("");
    <DatePicker value={expiryDate} onChange={setExpiryDate} data-testid="add-training-expiry" />
    createDriverTrainingRecord(driverId, companyId, {
      training_name: resolvedTrainingName,
      expiry_date: expiryDate || undefined,
    });
  `;
  const validTest = `
    getByTestId("add-training-expiry");
    expect(body).toEqual({ expiry_date: expect.stringMatching(/^date$/) });
  `;

  const checks = [
    {
      name: "valid fixture passes",
      passed: validate(validModal, validTest).length === 0,
    },
    {
      name: "planted missing expiry DatePicker fails",
      passed: validate(validModal.replace('data-testid="add-training-expiry"', ""), validTest).some((failure) =>
        failure.includes("DatePicker"),
      ),
    },
    {
      name: "planted payload omission fails",
      passed: validate(validModal.replace("expiry_date: expiryDate || undefined,", ""), validTest).some((failure) =>
        failure.includes("create payload"),
      ),
    },
  ];
  const failed = checks.filter((check) => !check.passed);
  if (failed.length) {
    for (const check of failed) console.error(` - ${check.name}`);
    console.error(`${LABEL} --selftest FAIL`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS (${checks.length} checks)`);
}

if (process.argv.includes("--selftest")) {
  runSelfTest();
} else {
  const failures = validate(
    read("apps/frontend/src/components/drivers/AddTrainingModal.tsx"),
    read("apps/frontend/src/components/drivers/__tests__/AddTrainingModal.test.tsx"),
  );
  if (failures.length) {
    for (const failure of failures) console.error(` - ${failure}`);
    console.error(`${LABEL} FAIL`);
    process.exit(1);
  }
  console.log(`${LABEL} PASS`);
}
