export default {
  name: "verify:worm-applies-to-every-role",
  run(ctx) {
    ctx.run("node", ["scripts/verify-worm-applies-to-every-role.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-worm-applies-to-every-role.mjs"]);
  },
};
