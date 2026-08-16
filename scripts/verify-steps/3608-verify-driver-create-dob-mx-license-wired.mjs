// verify-steps wrapper — LV-DRIVER-DOB-SILENTLY-DROPPED · claim 3608
export default {
  name: "verify-driver-create-dob-mx-license-wired",
  run(ctx) {
    ctx.run("node", ["scripts/verify-driver-create-dob-mx-license-wired.mjs"]);
  },
};
