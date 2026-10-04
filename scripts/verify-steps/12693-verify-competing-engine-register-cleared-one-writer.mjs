export default {
  name: "verify:competing-engine-register-cleared-one-writer",
  run(ctx) {
    ctx.run("node", ["scripts/verify-competing-engine-register-cleared-one-writer.mjs"]);
  },
};
