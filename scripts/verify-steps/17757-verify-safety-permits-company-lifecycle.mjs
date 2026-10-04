export default {
  name: "verify:safety-permits-company-lifecycle",
  run(ctx) {
    ctx.run("node", ["scripts/verify-safety-permits-company-lifecycle.mjs"]);
  },
};
