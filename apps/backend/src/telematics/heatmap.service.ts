export type HeatmapBucket = {
  lat_bucket: number;
  lng_bucket: number;
  hit_count: number;
};

export type HeatmapPoint = {
  lat: number;
  lng: number;
};

const BUCKET_SIZE = 0.001;

export function bucketCoordinate(value: number): number {
  return Number((Math.floor(value / BUCKET_SIZE) * BUCKET_SIZE).toFixed(3));
}

export function aggregateHeatmapBuckets(points: HeatmapPoint[]): HeatmapBucket[] {
  const counts = new Map<string, HeatmapBucket>();
  for (const point of points) {
    const latBucket = bucketCoordinate(point.lat);
    const lngBucket = bucketCoordinate(point.lng);
    const key = `${latBucket}:${lngBucket}`;
    const existing = counts.get(key);
    if (existing) existing.hit_count += 1;
    else counts.set(key, { lat_bucket: latBucket, lng_bucket: lngBucket, hit_count: 1 });
  }
  return Array.from(counts.values()).sort((a, b) => b.hit_count - a.hit_count);
}
