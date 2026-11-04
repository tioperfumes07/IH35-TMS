export default {
  name: "verify:verify-rows-97-157-163-3",
  run(ctx) {
    ctx.run("node", ["scripts/verify-rows-97-157-163-3.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-rows-97-157-163-3.mjs"]);
  },
};
