ALTER TABLE safety.driver_safety_profiles ENABLE ROW LEVEL SECURITY;

ALTER TABLE safety.driver_qualification_files ENABLE ROW LEVEL SECURITY;
CREATE POLICY driver_qualification_files_tenant_scope ON safety.driver_qualification_files FOR ALL USING (true);

ALTER TABLE safety.medical_cards ENABLE ROW LEVEL SECURITY;
CREATE POLICY medical_cards_tenant_scope ON safety.medical_cards FOR ALL USING (true);

ALTER TABLE safety.background_checks ENABLE ROW LEVEL SECURITY;
CREATE POLICY background_checks_tenant_scope ON safety.background_checks FOR ALL USING (true);

ALTER TABLE safety.training_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY training_records_tenant_scope ON safety.training_records FOR ALL USING (true);

ALTER TABLE safety.driver_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY driver_documents_tenant_scope ON safety.driver_documents FOR ALL USING (true);
