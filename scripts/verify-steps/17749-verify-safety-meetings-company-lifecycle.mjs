export default {
  name: "verify:safety-meetings-company-lifecycle",
  run(ctx) {
    ctx.run("node", ["scripts/verify-safety-meetings-company-lifecycle.mjs"]);
  },
};
