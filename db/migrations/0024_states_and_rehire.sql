BEGIN;

CREATE TABLE IF NOT EXISTS catalogs.us_states (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL CHECK (length(code) = 2),
  name text UNIQUE NOT NULL,
  region text NOT NULL CHECK (region IN ('Northeast', 'Midwest', 'South', 'West', 'Territory')),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE catalogs.us_states IS '50 states + DC + 5 territories. Code is 2-letter USPS abbreviation. Region used for analytics/reporting groupings.';

INSERT INTO catalogs.us_states (code, name, region) VALUES
  ('AL', 'Alabama', 'South'),
  ('AK', 'Alaska', 'West'),
  ('AZ', 'Arizona', 'West'),
  ('AR', 'Arkansas', 'South'),
  ('CA', 'California', 'West'),
  ('CO', 'Colorado', 'West'),
  ('CT', 'Connecticut', 'Northeast'),
  ('DE', 'Delaware', 'South'),
  ('DC', 'District of Columbia', 'South'),
  ('FL', 'Florida', 'South'),
  ('GA', 'Georgia', 'South'),
  ('HI', 'Hawaii', 'West'),
  ('ID', 'Idaho', 'West'),
  ('IL', 'Illinois', 'Midwest'),
  ('IN', 'Indiana', 'Midwest'),
  ('IA', 'Iowa', 'Midwest'),
  ('KS', 'Kansas', 'Midwest'),
  ('KY', 'Kentucky', 'South'),
  ('LA', 'Louisiana', 'South'),
  ('ME', 'Maine', 'Northeast'),
  ('MD', 'Maryland', 'South'),
  ('MA', 'Massachusetts', 'Northeast'),
  ('MI', 'Michigan', 'Midwest'),
  ('MN', 'Minnesota', 'Midwest'),
  ('MS', 'Mississippi', 'South'),
  ('MO', 'Missouri', 'Midwest'),
  ('MT', 'Montana', 'West'),
  ('NE', 'Nebraska', 'Midwest'),
  ('NV', 'Nevada', 'West'),
  ('NH', 'New Hampshire', 'Northeast'),
  ('NJ', 'New Jersey', 'Northeast'),
  ('NM', 'New Mexico', 'West'),
  ('NY', 'New York', 'Northeast'),
  ('NC', 'North Carolina', 'South'),
  ('ND', 'North Dakota', 'Midwest'),
  ('OH', 'Ohio', 'Midwest'),
  ('OK', 'Oklahoma', 'South'),
  ('OR', 'Oregon', 'West'),
  ('PA', 'Pennsylvania', 'Northeast'),
  ('RI', 'Rhode Island', 'Northeast'),
  ('SC', 'South Carolina', 'South'),
  ('SD', 'South Dakota', 'Midwest'),
  ('TN', 'Tennessee', 'South'),
  ('TX', 'Texas', 'South'),
  ('UT', 'Utah', 'West'),
  ('VT', 'Vermont', 'Northeast'),
  ('VA', 'Virginia', 'South'),
  ('WA', 'Washington', 'West'),
  ('WV', 'West Virginia', 'South'),
  ('WI', 'Wisconsin', 'Midwest'),
  ('WY', 'Wyoming', 'West'),
  ('PR', 'Puerto Rico', 'Territory'),
  ('VI', 'US Virgin Islands', 'Territory'),
  ('GU', 'Guam', 'Territory'),
  ('AS', 'American Samoa', 'Territory'),
  ('MP', 'Northern Mariana Islands', 'Territory')
ON CONFLICT (code) DO NOTHING;

GRANT SELECT ON catalogs.us_states TO ih35_app;
ALTER TABLE catalogs.us_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalogs.us_states FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS us_states_select_all ON catalogs.us_states;
CREATE POLICY us_states_select_all ON catalogs.us_states
  FOR SELECT TO ih35_app USING (true);

CREATE TABLE IF NOT EXISTS catalogs.mexico_states (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL CHECK (length(code) = 3),
  name text UNIQUE NOT NULL,
  region text NOT NULL CHECK (region IN ('Norte', 'Centro', 'Sur', 'Sureste', 'Bajio', 'Pacifico')),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE catalogs.mexico_states IS '31 estados + Ciudad de Mexico. Codes are ISO 3166-2:MX format (e.g. AGU, CMX, NLE).';

INSERT INTO catalogs.mexico_states (code, name, region) VALUES
  ('AGU', 'Aguascalientes', 'Bajio'),
  ('BCN', 'Baja California', 'Norte'),
  ('BCS', 'Baja California Sur', 'Norte'),
  ('CAM', 'Campeche', 'Sureste'),
  ('CHP', 'Chiapas', 'Sur'),
  ('CHH', 'Chihuahua', 'Norte'),
  ('CMX', 'Ciudad de México', 'Centro'),
  ('COA', 'Coahuila', 'Norte'),
  ('COL', 'Colima', 'Pacifico'),
  ('DUR', 'Durango', 'Norte'),
  ('GUA', 'Guanajuato', 'Bajio'),
  ('GRO', 'Guerrero', 'Sur'),
  ('HID', 'Hidalgo', 'Centro'),
  ('JAL', 'Jalisco', 'Pacifico'),
  ('MEX', 'Estado de México', 'Centro'),
  ('MIC', 'Michoacán', 'Pacifico'),
  ('MOR', 'Morelos', 'Centro'),
  ('NAY', 'Nayarit', 'Pacifico'),
  ('NLE', 'Nuevo León', 'Norte'),
  ('OAX', 'Oaxaca', 'Sur'),
  ('PUE', 'Puebla', 'Centro'),
  ('QUE', 'Querétaro', 'Bajio'),
  ('ROO', 'Quintana Roo', 'Sureste'),
  ('SLP', 'San Luis Potosí', 'Bajio'),
  ('SIN', 'Sinaloa', 'Pacifico'),
  ('SON', 'Sonora', 'Norte'),
  ('TAB', 'Tabasco', 'Sureste'),
  ('TAM', 'Tamaulipas', 'Norte'),
  ('TLA', 'Tlaxcala', 'Centro'),
  ('VER', 'Veracruz', 'Sureste'),
  ('YUC', 'Yucatán', 'Sureste'),
  ('ZAC', 'Zacatecas', 'Bajio')
ON CONFLICT (code) DO NOTHING;

GRANT SELECT ON catalogs.mexico_states TO ih35_app;
ALTER TABLE catalogs.mexico_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalogs.mexico_states FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mexico_states_select_all ON catalogs.mexico_states;
CREATE POLICY mexico_states_select_all ON catalogs.mexico_states
  FOR SELECT TO ih35_app USING (true);

ALTER TABLE mdata.drivers
  ADD COLUMN IF NOT EXISTS prior_driver_id uuid REFERENCES mdata.drivers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rehire_count int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_rehire boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN mdata.drivers.prior_driver_id IS 'Links to the prior mdata.drivers record if this driver is a rehire. Chain can be N levels deep (someone rehired 3 times has 3 records linked).';
COMMENT ON COLUMN mdata.drivers.rehire_count IS 'How many times this driver has been rehired. 0 for original record. Increments on each rehire.';
COMMENT ON COLUMN mdata.drivers.is_rehire IS 'True if this record was created via rehire flow (not first-time hire). Affects UI presentation and reporting.';

CREATE INDEX IF NOT EXISTS idx_drivers_prior_driver
  ON mdata.drivers (prior_driver_id)
  WHERE prior_driver_id IS NOT NULL;

COMMIT;
