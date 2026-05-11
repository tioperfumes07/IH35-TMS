type RunnerHealth = {
  initialized: boolean;
  last_tick_at: string | null;
  error: string | null;
};

type RunnerState = {
  forensic_runner: RunnerHealth;
  sync_queue_runner: RunnerHealth;
  token_refresh_cron: RunnerHealth;
  server_started_at: string;
};

const runnerState: RunnerState = {
  forensic_runner: { initialized: false, last_tick_at: null, error: null },
  sync_queue_runner: { initialized: false, last_tick_at: null, error: null },
  token_refresh_cron: { initialized: false, last_tick_at: null, error: null },
  server_started_at: new Date().toISOString(),
};

export type RunnerKey = keyof Omit<RunnerState, "server_started_at">;

export function markRunnerInitialized(key: RunnerKey) {
  runnerState[key].initialized = true;
  runnerState[key].error = null;
}

export function markRunnerTick(key: RunnerKey) {
  runnerState[key].last_tick_at = new Date().toISOString();
}

export function markRunnerFailed(key: RunnerKey, error: unknown) {
  runnerState[key].error = String((error as Error)?.message ?? error ?? "unknown_error");
}

export function getRunnerState() {
  return {
    forensic_runner: { ...runnerState.forensic_runner },
    sync_queue_runner: { ...runnerState.sync_queue_runner },
    token_refresh_cron: { ...runnerState.token_refresh_cron },
    server_started_at: runnerState.server_started_at,
  };
}
