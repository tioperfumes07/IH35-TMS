export default {
  name: "verify:task-link-contract",
  run(ctx) {
    ctx.run("node", ["scripts/verify-task-link-contract.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-task-link-contract.mjs"]);
  },
};
