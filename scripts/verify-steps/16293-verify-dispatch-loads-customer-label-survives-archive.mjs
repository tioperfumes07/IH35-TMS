export default {
  name: "verify:dispatch-loads-customer-label-survives-archive",
  run(ctx) {
    ctx.run("node", ["scripts/verify-dispatch-loads-customer-label-survives-archive.mjs"]);
  },
};
