-- CAP-13-DOT seed: replicated per tenant for strict tenant isolation.
-- Uses coarse square polygons around known TX inspection corridors.
INSERT INTO geo.geofences (
  operating_company_id,
  label,
  location_kind,
  location_ref_id,
  vertices_json,
  is_active,
  created_by_user_uuid,
  updated_by_user_uuid
)
SELECT
  c.id,
  seed.label,
  'dot_inspection_station',
  NULL,
  seed.vertices::jsonb,
  true,
  NULL,
  NULL
FROM org.companies c
CROSS JOIN (
  VALUES
    ('Laredo DOT Station', '[{"lat":27.5259,"lng":-99.4896},{"lat":27.5259,"lng":-99.4860},{"lat":27.5230,"lng":-99.4860},{"lat":27.5230,"lng":-99.4896}]'),
    ('Falfurrias DOT Station', '[{"lat":27.2266,"lng":-98.1489},{"lat":27.2266,"lng":-98.1451},{"lat":27.2238,"lng":-98.1451},{"lat":27.2238,"lng":-98.1489}]'),
    ('Hebbronville DOT Station', '[{"lat":27.3117,"lng":-98.6850},{"lat":27.3117,"lng":-98.6814},{"lat":27.3090,"lng":-98.6814},{"lat":27.3090,"lng":-98.6850}]'),
    ('Encinal DOT Station', '[{"lat":28.0430,"lng":-99.3589},{"lat":28.0430,"lng":-99.3551},{"lat":28.0402,"lng":-99.3551},{"lat":28.0402,"lng":-99.3589}]'),
    ('Cotulla DOT Station', '[{"lat":28.4355,"lng":-99.2338},{"lat":28.4355,"lng":-99.2298},{"lat":28.4326,"lng":-99.2298},{"lat":28.4326,"lng":-99.2338}]')
) AS seed(label, vertices)
WHERE NOT EXISTS (
  SELECT 1
  FROM geo.geofences g
  WHERE g.operating_company_id = c.id
    AND g.location_kind = 'dot_inspection_station'
    AND lower(g.label) = lower(seed.label)
);
