-- Single timestamp format for every module: convert every remaining
-- "timestamp without time zone" column in the application schema to TIMESTAMPTZ.
--
-- Existing naive values were always written as IST wall-clock time (the app
-- connects with TimeZone=Asia/Kolkata), so they are interpreted as Asia/Kolkata
-- during the conversion. No displayed date or time changes.
--
-- Idempotent: once converted, no "timestamp without time zone" columns remain,
-- so later runs are a no-op. Each table is rewritten once (all its columns in a
-- single ALTER TABLE).
DO $$
DECLARE
    tbl record;
BEGIN
    FOR tbl IN
        SELECT c.table_schema,
               c.table_name,
               string_agg(
                   format('ALTER COLUMN %I TYPE timestamptz USING %I AT TIME ZONE %L',
                          c.column_name, c.column_name, 'Asia/Kolkata'),
                   ', ' ORDER BY c.ordinal_position
               ) AS alter_clauses
        FROM information_schema.columns c
        JOIN information_schema.tables t
          ON t.table_schema = c.table_schema AND t.table_name = c.table_name
        WHERE c.table_schema = current_schema()
          AND t.table_type = 'BASE TABLE'
          AND c.data_type = 'timestamp without time zone'
        GROUP BY c.table_schema, c.table_name
    LOOP
        RAISE NOTICE 'Converting %.% timestamp columns to timestamptz', tbl.table_schema, tbl.table_name;
        EXECUTE format('ALTER TABLE %I.%I %s', tbl.table_schema, tbl.table_name, tbl.alter_clauses);
    END LOOP;
END $$;
