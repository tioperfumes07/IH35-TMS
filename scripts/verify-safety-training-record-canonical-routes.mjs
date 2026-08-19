import fs from "node:fs";

const source = fs.readFileSync("apps/frontend/src/components/shared/EntityLink.tsx", "utf8");

function failures(text) {
  const errors = [];
  if (!/case "training_record":\s*return `\/safety\/training\/records\?training_id=\$\{id\}`/.test(text)) {
    errors.push("training record detail link is not on the mounted canonical route");
  }
  if (!/case "training_records_driver":\s*return `\/safety\/training\/records\?driver_id=\$\{id\}`/.test(text)) {
    errors.push("driver reverse link is not on the mounted canonical route");
  }
  if (/\/safety\/training-records\?/.test(text)) errors.push("legacy unmounted training-records route remains");
  return errors;
}

if (process.argv.includes("--selftest")) {
  const broken = source.replaceAll("/safety/training/records?", "/safety/training-records?");
  if (failures(source).length || failures(broken).length < 3) {
    console.error("verify-safety-training-record-canonical-routes selftest FAIL");
    process.exit(1);
  }
  console.log("verify-safety-training-record-canonical-routes selftest PASS — legacy-route mutation turns red");
  process.exit(0);
}

const errors = failures(source);
if (errors.length) {
  console.error(`verify-safety-training-record-canonical-routes FAIL:\n- ${errors.join("\n- ")}`);
  process.exit(1);
}
console.log("verify-safety-training-record-canonical-routes PASS — training links target mounted canonical route");
