export {
  BREAKER_CONFIGS,
  CircuitBreakerOpenError,
  circuitBreakerState,
  dependencyCircuitConfigs,
  getBreakerState,
  onBreakerTransition,
  resetAllBreakersForTests,
  withCircuitBreaker,
  type BreakerConfig,
  type BreakerState,
  type BreakerTransitionEvent,
  type ExternalDep,
} from "./registry.js";
