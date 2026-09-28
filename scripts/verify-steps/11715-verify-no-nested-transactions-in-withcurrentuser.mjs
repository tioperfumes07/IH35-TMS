export default {
  name: "verify:no-nested-transactions-in-withcurrentuser",
  run(ctx) {
    ctx.run("node", ["scripts/verify-no-nested-transactions-in-withcurrentuser.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-no-nested-transactions-in-withcurrentuser.mjs"]);
  },
};
