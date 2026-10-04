export default {
  name: "verify:rtd-clearinghouse-company-lifecycle",
  run(ctx) {
    ctx.run("node", ["scripts/verify-rtd-clearinghouse-company-lifecycle.mjs"]);
  },
};
