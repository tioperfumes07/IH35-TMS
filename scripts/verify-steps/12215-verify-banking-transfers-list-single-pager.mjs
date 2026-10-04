export default {
  name: "verify:banking-transfers-list-single-pager",
  run(ctx) {
    ctx.run("node", ["scripts/verify-banking-transfers-list-single-pager.mjs"]);
  },
};
