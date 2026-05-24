import { describe, expect, it } from "vitest";
import { aggregateHeatmapBuckets } from "../src/telematics/heatmap.service.js";

describe("heatmap aggregator", () => {
  it("groups nearby points into 0.001 degree buckets", () => {
    const rows = aggregateHeatmapBuckets([
      { lat: 30.26721, lng: -97.74319 },
      { lat: 30.26729, lng: -97.74311 },
      { lat: 30.26801, lng: -97.74202 },
      { lat: 30.26808, lng: -97.74207 },
    ]);

    expect(rows[0]).toMatchObject({
      lat_bucket: 30.267,
      lng_bucket: -97.744,
      hit_count: 2,
    });
    expect(rows[1]).toMatchObject({
      lat_bucket: 30.268,
      lng_bucket: -97.743,
      hit_count: 2,
    });
  });
});
