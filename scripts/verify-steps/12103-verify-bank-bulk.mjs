export default {
  name: "verify:bank-bulk",
  run(ctx) {
    ctx.run("node", ["scripts/verify-bank-bulk.mjs"]);
  },
};
