export default {
  name: "verify-drivers-profile-action-bar",
  run(ctx) {
    if (ctx.run("npm", ["run", "verify:drivers-profile-action-bar"]) !== 0) {
      return 1;
    }
    return 0;
  },
};
