/**
 * BLOCK-05 — Per-dependency circuit breaker (opossum).
 */
import CircuitBreaker from "opossum";

export type ExternalDep = "qbo" | "samsara" | "plaid" | "sentry" | "openai" | "comdata" | "relay";

export type BreakerState = "closed" | "open" | "halfOpen";

export type BreakerConfig = {
  enabled: boolean;
  timeout: number;
  errorThresholdPercentage: number;
  resetTimeout: number;
  volumeThreshold: number;
  rollingCountTimeout: number;
  rollingCountBuckets: number;
  fallbackMode: "throw" | "skip";
};

const DEFAULTS: Omit<BreakerConfig, "enabled" | "fallbackMode"> = {
  timeout: 30_000,
  errorThresholdPercentage: 100,
  resetTimeout: 30_000,
  volumeThreshold: 5,
  rollingCountTimeout: 30_000,
  rollingCountBuckets: 6,
};

export const BREAKER_CONFIGS: Record<ExternalDep, BreakerConfig> = {
  qbo: { ...DEFAULTS, enabled: true, volumeThreshold: 5, rollingCountTimeout: 30_000, resetTimeout: 60_000, errorThresholdPercentage: 50, fallbackMode: "throw" },
  samsara: { ...DEFAULTS, enabled: true, volumeThreshold: 3, rollingCountTimeout: 30_000, resetTimeout: 30_000, errorThresholdPercentage: 50, fallbackMode: "throw" },
  plaid: { ...DEFAULTS, enabled: true, volumeThreshold: 5, rollingCountTimeout: 60_000, resetTimeout: 120_000, fallbackMode: "throw" },
  sentry: { ...DEFAULTS, enabled: false, volumeThreshold: 999, fallbackMode: "throw" },
  openai: { ...DEFAULTS, enabled: true, volumeThreshold: 3, rollingCountTimeout: 60_000, resetTimeout: 60_000, fallbackMode: "skip" },
  comdata: { ...DEFAULTS, enabled: true, volumeThreshold: 5, rollingCountTimeout: 60_000, resetTimeout: 90_000, fallbackMode: "throw" },
  relay: { ...DEFAULTS, enabled: true, volumeThreshold: 5, rollingCountTimeout: 60_000, resetTimeout: 90_000, fallbackMode: "throw" },
};

export type BreakerTransitionEvent = {
  dep: ExternalDep;
  from: BreakerState;
  to: BreakerState;
  at: string;
};

type TransitionListener = (event: BreakerTransitionEvent) => void;

const listeners = new Set<TransitionListener>();
const breakers = new Map<ExternalDep, CircuitBreaker<[() => Promise<unknown>], unknown>>();

function mapState(breaker: CircuitBreaker): BreakerState {
  if (breaker.opened) return breaker.halfOpen ? "halfOpen" : "open";
  return "closed";
}

export function onBreakerTransition(listener: TransitionListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emitTransition(dep: ExternalDep, from: BreakerState, to: BreakerState) {
  if (from === to) return;
  const event: BreakerTransitionEvent = { dep, from, to, at: new Date().toISOString() };
  for (const listener of listeners) {
    try {
      listener(event);
    } catch {
      /* observability must not break callers */
    }
  }
  console.info({ circuit_breaker: event }, "circuit_breaker_state_transition");
}

function getBreaker(dep: ExternalDep): CircuitBreaker<[() => Promise<unknown>], unknown> {
  const existing = breakers.get(dep);
  if (existing) return existing;

  const config = BREAKER_CONFIGS[dep];
  const breaker = new CircuitBreaker(async (operation: () => Promise<unknown>) => operation(), {
    timeout: config.timeout,
    errorThresholdPercentage: config.errorThresholdPercentage,
    resetTimeout: config.resetTimeout,
    volumeThreshold: config.volumeThreshold,
    rollingCountTimeout: config.rollingCountTimeout,
    rollingCountBuckets: config.rollingCountBuckets,
    name: `ih35-${dep}`,
  });

  let lastState: BreakerState = mapState(breaker);
  const refresh = () => {
    const next = mapState(breaker);
    emitTransition(dep, lastState, next);
    lastState = next;
  };

  breaker.on("open", refresh);
  breaker.on("halfOpen", refresh);
  breaker.on("close", refresh);

  breakers.set(dep, breaker);
  return breaker;
}

export class CircuitBreakerOpenError extends Error {
  readonly dep: ExternalDep;

  constructor(dep: ExternalDep) {
    super(`circuit_breaker_open:${dep}`);
    this.name = "CircuitBreakerOpenError";
    this.dep = dep;
  }
}

function isOpenError(error: unknown): boolean {
  return error instanceof Error && (error.message.includes("Breaker is open") || error.message.includes("Semaphore locked"));
}

export async function withCircuitBreaker<T>(dep: ExternalDep, fn: () => Promise<T>): Promise<T> {
  const config = BREAKER_CONFIGS[dep];
  if (!config.enabled) return fn();

  const breaker = getBreaker(dep);
  try {
    return (await breaker.fire(fn)) as T;
  } catch (error) {
    if (isOpenError(error) || (breaker.opened && !breaker.halfOpen)) {
      if (config.fallbackMode === "skip") return undefined as T;
      throw new CircuitBreakerOpenError(dep);
    }
    throw error;
  }
}

export function getBreakerState(dep: ExternalDep): BreakerState {
  const breaker = breakers.get(dep);
  if (!breaker) return "closed";
  return mapState(breaker);
}

export async function resetAllBreakersForTests() {
  for (const breaker of breakers.values()) {
    await breaker.shutdown();
  }
  breakers.clear();
  listeners.clear();
}

/** Alias for tests/docs. */
export const dependencyCircuitConfigs = BREAKER_CONFIGS;

export function circuitBreakerState(dep: ExternalDep) {
  const breaker = breakers.get(dep);
  const config = BREAKER_CONFIGS[dep];
  if (!breaker) {
    return { dependency: dep, mode: config.enabled ? "idle" : "passthrough", opened: false, halfOpen: false, closed: true };
  }
  return { dependency: dep, mode: "active", opened: breaker.opened, halfOpen: breaker.halfOpen, closed: breaker.closed };
}
