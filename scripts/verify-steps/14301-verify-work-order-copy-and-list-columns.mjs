export default {
  name: "verify:work-order-copy-and-list-columns",
  run(ctx) {
    ctx.run("node", ["scripts/verify-work-order-copy-and-list-columns.mjs"]);
  },
};
