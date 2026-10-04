export default {
  name: "verify:da-test-scheduler-company-lifecycle",
  run(ctx) {
    ctx.run("node", ["scripts/verify-da-test-scheduler-company-lifecycle.mjs"]);
  },
};
