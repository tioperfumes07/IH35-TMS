export default {
  name: "verify:training-record-company-lifecycle",
  run(ctx) {
    ctx.run("node", ["scripts/verify-training-record-company-lifecycle.mjs"]);
  },
};
