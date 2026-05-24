# CAP-HEATMAP Position Heatmap

- Adds `GET /api/v1/telematics/heatmap` with tenant-scoped bucketed GPS density output.
- Bucketing granularity is fixed at `0.001` degrees for now.
- Dispatch page now includes a `Show position heatmap` toggle and history range controls that load bucketed telemetry density.
