/**
 * Shared route-handler capture stub for unit tests that register Fastify routes against a fake app.
 *
 * WHY THIS EXISTS
 * ---------------
 * Fastify's shorthand route methods are OVERLOADED:
 *
 *   app.get(path, handler)
 *   app.get(path, options, handler)      // <- options carries config.rateLimit, schema, preHandler, …
 *
 * Test stubs across this repo were hand-written as `{ get: (_p, h) => { handler = h } }`, which models
 * ONLY the 2-argument form. The moment a route legitimately gains an options object the captured
 * "handler" becomes that options object and every test in the file dies with
 * `TypeError: handler is not a function` — a failure that points at the test harness, not at the code
 * change that triggered it.
 *
 * That is not hypothetical. `verify-new-auth-routes-rate-limited` (verify-step 2214) requires
 * `config.rateLimit` on authorized routes, because the rate-limit plugin is registered `global: false`
 * (opt-in) and an unlimited authorized route has NO limit at all. So the guard actively pushes routes
 * from the 2-arg form to the 3-arg form — and every hand-rolled 2-arg stub is a scheduled breakage.
 *
 * The fix is to model the real signature ONCE: the handler is the LAST function argument, whatever its
 * position. Capturing by shape rather than by index makes the stub immune to options being added,
 * removed, or reordered.
 */

/** A captured Fastify-style route handler. Kept loose on purpose — unit stubs pass hand-built reqs. */
export type CapturedHandler = (req: any, reply: any) => unknown | Promise<unknown>;

/** The HTTP verbs Fastify exposes as shorthand route methods. */
const ROUTE_METHODS = ["get", "post", "put", "patch", "delete", "head", "options", "all"] as const;

export type RouteMethod = (typeof ROUTE_METHODS)[number];

export type CapturedRoute = {
  method: RouteMethod;
  path: string;
  /** The registration options object, when the route was registered with the 3-arg form. */
  options: Record<string, unknown> | undefined;
  handler: CapturedHandler;
};

export type RouteCapture = {
  /**
   * The fake Fastify app to hand to a `registerXxxRoutes(app)` function.
   * Typed `any` because callers cast to `never`/`FastifyInstance`; it implements only what stubs need.
   */
  app: any;
  /** Every route registered, in registration order. */
  routes: CapturedRoute[];
  /**
   * The handler of the FIRST registered route — the common case for single-route modules.
   * Throws with a useful message instead of yielding `undefined` when nothing registered.
   */
  handler: () => CapturedHandler;
  /**
   * The handler for a specific route. `path` matches exactly; `method` narrows when a path is
   * registered for more than one verb. Throws listing what WAS registered when there is no match,
   * so a renamed route fails loudly rather than silently capturing the wrong handler.
   */
  handlerFor: (path: string, method?: RouteMethod) => CapturedHandler;
};

/**
 * Build a fake Fastify app that records route registrations.
 *
 * Handles BOTH `app.get(path, handler)` and `app.get(path, options, handler)` by taking the last
 * function argument as the handler — so adding `{ config: { rateLimit: … } }` to a route can never
 * again break the tests that cover it.
 */
export function captureRoutes(): RouteCapture {
  const routes: CapturedRoute[] = [];

  const register = (method: RouteMethod) => (path: string, ...rest: unknown[]) => {
    // The handler is the LAST function argument. Everything before it that is a plain object is the
    // registration options. Capturing by shape (not by index) is the whole point of this helper.
    const handlerIdx = rest.map((a) => typeof a === "function").lastIndexOf(true);
    if (handlerIdx === -1) {
      throw new Error(
        `captureRoutes: app.${method}(${JSON.stringify(path)}, …) was registered with no function argument. ` +
          `Received ${rest.length} argument(s) of type: [${rest.map((a) => typeof a).join(", ")}].`,
      );
    }
    const options = rest
      .slice(0, handlerIdx)
      .find((a) => a !== null && typeof a === "object" && !Array.isArray(a)) as
      | Record<string, unknown>
      | undefined;

    routes.push({ method, path, options, handler: rest[handlerIdx] as CapturedHandler });
  };

  const app: Record<string, unknown> = {};
  for (const method of ROUTE_METHODS) app[method] = register(method);

  const describeRegistered = () =>
    routes.length === 0
      ? "no routes were registered"
      : `registered: ${routes.map((r) => `${r.method.toUpperCase()} ${r.path}`).join(", ")}`;

  return {
    app,
    routes,
    handler: () => {
      if (routes.length === 0) {
        throw new Error(`captureRoutes: no route handler captured — ${describeRegistered()}.`);
      }
      return routes[0]!.handler;
    },
    handlerFor: (path: string, method?: RouteMethod) => {
      const match = routes.find((r) => r.path === path && (method === undefined || r.method === method));
      if (!match) {
        throw new Error(
          `captureRoutes: no ${method ? `${method.toUpperCase()} ` : ""}route registered at ${JSON.stringify(path)} — ${describeRegistered()}.`,
        );
      }
      return match.handler;
    },
  };
}
