export function TypeSpecsSection({ specs }: { specs: Record<string, unknown> }) {
  const fields = [
    ["Length (ft)", specs.length_ft],
    ["Width (ft)", specs.width_ft],
    ["Height (ft)", specs.height_ft],
    ["Max payload (lbs)", specs.max_payload_lbs],
    ["Axles", specs.axle_count],
    ["Suspension", specs.suspension_type],
    ["Tires", specs.tire_size],
  ];
  return (
    <section className="rounded border border-gray-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-gray-800">Type &amp; specs</h2>
      <dl className="mt-2 grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
        {fields.map(([label, value]) => (
          <div key={String(label)}>
            <dt className="text-gray-500">{String(label)}</dt>
            <dd className="font-medium text-gray-900">{String(value ?? "—")}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
