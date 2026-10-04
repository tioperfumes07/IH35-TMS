export default {
  name: "verify:dispatch-list-hos-columns",
  run(ctx) {
    ctx.run("node", ["scripts/verify-dispatch-list-hos-columns.mjs"]);
  },
};
