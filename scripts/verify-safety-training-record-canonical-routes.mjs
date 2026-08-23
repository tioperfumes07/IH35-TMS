import fs from "node:fs";

const source = fs.readFileSync("apps/frontend/src/components/shared/EntityLink.tsx", "utf8");
const trainingRoutes = fs.readFileSync("apps/backend/src/mdata/driver-training.routes.ts", "utf8");

function failures(text, routes = trainingRoutes) {
  const errors = [];
  if (!/case "training_record":\s*return `\/safety\/training\/records\?training_id=\$\{id\}`/.test(text)) {
    errors.push("training record detail link is not on the mounted canonical route");
  }
  if (!/case "training_records_driver":\s*return `\/safety\/training\/records\?driver_id=\$\{id\}`/.test(text)) {
    errors.push("driver reverse link is not on the mounted canonical route");
  }
  if (/\/safety\/training-records\?/.test(text)) errors.push("legacy unmounted training-records route remains");
  const start = routes.indexOf('app.get("/api/v1/mdata/drivers/:id/training"');
  const route = start < 0 ? "" : routes.slice(start, start + 2600);
  const parentIndex = route.indexOf("FROM mdata.drivers d");
  const childIndex = route.indexOf("FROM safety.training_records");
  if (!/d\.operating_company_id = \$2::uuid[\s\S]*dca\.company_id = \$2::uuid[\s\S]*dca\.is_authorized = true[\s\S]*dca\.deactivated_at IS NULL/.test(route)) {
    errors.push("training reverse GET must verify driver ownership/active authorization in selected company");
  }
  if (!/if \(driver\.rowCount === 0\) return null;[\s\S]*if \(rows === null\) return reply\.code\(404\)\.send\(\{ error: "mdata_driver_not_found" \}\)/.test(route)) {
    errors.push("training reverse GET must return honest driver-not-found before empty rows");
  }
  if (parentIndex < 0 || childIndex < 0 || parentIndex > childIndex) {
    errors.push("training parent scope must be checked before child rows");
  }
  return errors;
}

if (process.argv.includes("--selftest")) {
  const broken = source.replaceAll("/safety/training/records?", "/safety/training-records?");
  const routeMutations = [
    trainingRoutes.replace("d.operating_company_id = $2::uuid", "TRUE"),
    trainingRoutes.replace('return reply.code(404).send({ error: "mdata_driver_not_found" })', "return { rows: [] }"),
    trainingRoutes.replace("if (driver.rowCount === 0) return null;", ""),
  ];
  if (
    failures(source).length ||
    failures(broken).length < 3 ||
    routeMutations.some((mutant) => mutant === trainingRoutes || failures(source, mutant).length === 0)
  ) {
    console.error("verify-safety-training-record-canonical-routes selftest FAIL");
    process.exit(1);
  }
  console.log("verify-safety-training-record-canonical-routes selftest PASS — route + 3 scope/404 mutations turn red");
  process.exit(0);
}

const errors = failures(source);
if (errors.length) {
  console.error(`verify-safety-training-record-canonical-routes FAIL:\n- ${errors.join("\n- ")}`);
  process.exit(1);
}
console.log("verify-safety-training-record-canonical-routes PASS — training links target mounted canonical route");
