export default {
  name: "verify-drivers-training-crud-on-profile",
  run(ctx) {
    if (ctx.run("npm", ["run", "verify:drivers-training-crud-on-profile"]) !== 0) {
      throw new Error("verify-drivers-training-crud-on-profile failed");
    }
  },
};
