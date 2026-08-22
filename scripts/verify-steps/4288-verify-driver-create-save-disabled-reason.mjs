export default {
  name: "verify:driver-create-save-disabled-reason",
  run(ctx) {
    ctx.run("node", ["scripts/verify-driver-create-save-disabled-reason.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-driver-create-save-disabled-reason.mjs"]);
  },
};
