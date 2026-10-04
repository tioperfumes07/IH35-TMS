export default {
  name: "verify:create-driver-company-lifecycle",
  run(ctx) {
    ctx.run("node", ["scripts/verify-create-driver-company-lifecycle.mjs"]);
  },
};
