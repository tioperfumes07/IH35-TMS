import type { FastifyReply } from "fastify";

export const DRIVER_CATALOGS_SUNSET = "Wed, 03 Sep 2026 00:00:00 GMT";

export function applyDriverCatalogDeprecation(
  reply: FastifyReply,
  urlSegment: string,
  successorListsSegment: string
) {
  console.warn(
    `[DEPRECATED] /lists/driver/${urlSegment} — use /lists/drivers/${successorListsSegment}`
  );
  reply.header("Deprecation", "true");
  reply.header("Link", `</api/v1/lists/drivers/${successorListsSegment}>; rel="successor-version"`);
  reply.header("Sunset", DRIVER_CATALOGS_SUNSET);
}
