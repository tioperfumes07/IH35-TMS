export default {
  name: "verify:acct-surfaces-structural",
  async run(ctx) {
    ctx.run("node", ["scripts/verify-acct-surfaces-structural.mjs"]);
  },
};
