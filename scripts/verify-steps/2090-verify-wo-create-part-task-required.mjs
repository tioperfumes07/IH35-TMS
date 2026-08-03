export default {
  name: "verify-wo-create-part-task-required",
  async run(ctx) {
    ctx.run("node", ["scripts/verify-wo-create-part-task-required.mjs"]);
    ctx.run("node", ["scripts/verify-wo-create-part-task-required.mjs", "--selftest"]);
  },
};
