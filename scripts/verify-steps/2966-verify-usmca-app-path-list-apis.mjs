export default {
  name: "2966-verify-usmca-app-path-list-apis",
  run(ctx) {
    return ctx.run("node", ["scripts/verify-usmca-app-path-list-apis.mjs"]);
  },
};
