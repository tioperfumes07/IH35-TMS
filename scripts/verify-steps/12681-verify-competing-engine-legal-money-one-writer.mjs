export default {
  name: "verify:competing-engine-legal-money-one-writer",
  run(ctx) {
    ctx.run("node", ["scripts/verify-competing-engine-legal-money-one-writer.mjs"]);
  },
};
