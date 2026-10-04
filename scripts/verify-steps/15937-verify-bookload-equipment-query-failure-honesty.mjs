export default {
  name: "verify:bookload-equipment-query-failure-honesty",
  run(ctx) {
    ctx.run("node", ["scripts/verify-bookload-equipment-query-failure-honesty.mjs"]);
  },
};
