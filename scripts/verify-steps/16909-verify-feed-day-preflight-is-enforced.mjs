export default {
  name: "verify:feed-day-preflight-is-enforced",
  run(ctx) {
    ctx.run("node", ["scripts/verify-feed-day-preflight-is-enforced.mjs"]);
  },
};
