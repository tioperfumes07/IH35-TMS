export default {
  name: "verify:journal-entry-types-real",
  run(ctx) {
    ctx.run("node", ["scripts/verify-journal-entry-types-real.mjs"]);
  },
};
