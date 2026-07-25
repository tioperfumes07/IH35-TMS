export default {
  name: "verify:journal-entries-type-fk",
  async run(ctx) {
    ctx.run("node", ["scripts/verify-journal-entries-type-fk.mjs"]);
  },
};
