export default {
  name: "verify:qbo-ap-pull-dbflag",
  run(ctx) {
    ctx.run("node", ["scripts/verify-qbo-ap-pull-dbflag.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-qbo-ap-pull-dbflag.mjs"]);
  },
};
