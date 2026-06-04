export default {
  name: "verify-dvir-schema-presence",
  async run(ctx) {
    if (ctx.run("npm", ["run", "verify:dvir-schema-presence"]) !== 0) {
      ctx.fail("verify:dvir-schema-presence failed");
    }
  },
};
