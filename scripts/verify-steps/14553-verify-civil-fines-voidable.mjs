export default {
  name: "verify:civil-fines-voidable",
  run(ctx) {
    ctx.run("node", ["scripts/verify-civil-fines-voidable.mjs"]);
  },
};
