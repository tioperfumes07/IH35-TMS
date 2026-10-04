export default {
  name: "verify:coa-card-to-register",
  run(ctx) {
    ctx.run("node", ["scripts/verify-coa-card-to-register.mjs"]);
  },
};
