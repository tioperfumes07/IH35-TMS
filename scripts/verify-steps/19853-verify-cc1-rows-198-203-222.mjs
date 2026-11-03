export default {
  name: "verify:verify-cc1-rows-198-203-222",
  run(ctx) {
    ctx.run("node", ["scripts/verify-cc1-rows-198-203-222.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-cc1-rows-198-203-222.mjs"]);
  },
};
