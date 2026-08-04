export default {
  name: "verify-lst-link02-catalog-application-refs",
  run(ctx) {
    return ctx.run("node", ["scripts/verify-lst-link02-catalog-application-refs.mjs"]);
  },
};
