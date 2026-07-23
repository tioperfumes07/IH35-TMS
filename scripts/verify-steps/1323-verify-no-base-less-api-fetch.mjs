export default {
  name: "verify:no-base-less-api-fetch",
  run(ctx) {
    ctx.run("node", ["scripts/verify-no-base-less-api-fetch.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-no-base-less-api-fetch.mjs"]);
  },
};
