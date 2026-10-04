export default {
  name: "verify:banking-fromto-derived",
  run(ctx) {
    ctx.run("node", ["scripts/verify-banking-fromto-derived.mjs"]);
  },
};
