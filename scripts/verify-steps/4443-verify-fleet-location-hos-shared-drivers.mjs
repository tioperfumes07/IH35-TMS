const guards = ["verify-fleet-location-hos-shared-drivers.mjs", "verify-fleet-cross-entity-assignment-close.mjs"];
export default {
  name: "verify-fleet-location-hos-shared-drivers",
  async run(ctx) {
    for (const guard of guards) {
      if (ctx.run("node", [`scripts/${guard}`]) !== 0) {
        throw new Error(`${guard} failed`);
      }
    }
  },
};
