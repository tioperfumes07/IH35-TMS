export default {
  name: "verify:auto-deduction-policy-driver-label-survives-archive",
  run(ctx) {
    ctx.run("node", ["scripts/verify-auto-deduction-policy-driver-label-survives-archive.mjs"]);
  },
};
