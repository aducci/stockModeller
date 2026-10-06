-- Tenant isolation (design/03-platform/architecture.md §3, ADR-008): row-level security on every tenant table.
-- The application works as role connectome_app with app.workspace_id set per transaction.
-- Login roles used by the app are granted connectome_app; table owners are subject to the policies too (FORCE).

DO $$
BEGIN
  CREATE ROLE connectome_app NOLOGIN;
EXCEPTION
  WHEN duplicate_object OR unique_violation THEN NULL;  -- roles are cluster-wide; another database created it
END
$$;

GRANT USAGE ON SCHEMA public TO connectome_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO connectome_app;

DROP POLICY IF EXISTS tenant_isolation ON object;  -- the pattern from the initial schema; recreated below

DO $$
DECLARE
  t record;
BEGIN
  FOR t IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'workspace_id' AND NOT a.attisdropped
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t.relname);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t.relname);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I
         USING (workspace_id = current_setting(''app.workspace_id'', true))
         WITH CHECK (workspace_id = current_setting(''app.workspace_id'', true))',
      t.relname);
  END LOOP;
END
$$;

ALTER TABLE workspace ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON workspace
  USING (id = current_setting('app.workspace_id', true))
  WITH CHECK (id = current_setting('app.workspace_id', true));

-- group_member has no workspace_id: it is visible when its group is (user_group is itself isolated).
ALTER TABLE group_member ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_member FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON group_member
  USING (EXISTS (SELECT 1 FROM user_group g WHERE g.id = group_id))
  WITH CHECK (EXISTS (SELECT 1 FROM user_group g WHERE g.id = group_id));

-- app_user is global (one person can belong to several workspaces) and is not row-isolated.
