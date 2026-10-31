-- ====================================================================
-- Migration: Pharmacy & Purchase Request Schema Alignment (AYU HMS)
-- Adds columns required by the application code that were missing from
-- the ORM model (and therefore from fresh databases).
-- Fully idempotent: safe to run on both fresh and existing databases.
-- ====================================================================

-- 1. pharmacy_sales: External (walk-in) sale columns
--    Used by: pharmacy dispense, pharmacy summary, pharmacy reports,
--    external customer search, and pharmacy billing.

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'pharmacy_sales' AND column_name = 'sale_type'
    ) THEN
        ALTER TABLE pharmacy_sales ADD COLUMN sale_type TEXT DEFAULT 'internal';
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'pharmacy_sales' AND column_name = 'customer_name'
    ) THEN
        ALTER TABLE pharmacy_sales ADD COLUMN customer_name TEXT;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'pharmacy_sales' AND column_name = 'customer_age'
    ) THEN
        ALTER TABLE pharmacy_sales ADD COLUMN customer_age TEXT;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'pharmacy_sales' AND column_name = 'customer_dob'
    ) THEN
        ALTER TABLE pharmacy_sales ADD COLUMN customer_dob TEXT;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'pharmacy_sales' AND column_name = 'customer_mobile'
    ) THEN
        ALTER TABLE pharmacy_sales ADD COLUMN customer_mobile TEXT;
    END IF;
END $$;

-- 2. purchase_request_items: strength_form and unit columns
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'purchase_request_items' AND column_name = 'strength_form'
    ) THEN
        ALTER TABLE purchase_request_items ADD COLUMN strength_form TEXT;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'purchase_request_items' AND column_name = 'unit'
    ) THEN
        ALTER TABLE purchase_request_items ADD COLUMN unit TEXT;
    END IF;
END $$;

-- 3. Indexes for new pharmacy_sales columns (query performance)
CREATE INDEX IF NOT EXISTS idx_pharmacy_sales_sale_type ON pharmacy_sales(sale_type);
CREATE INDEX IF NOT EXISTS idx_pharmacy_sales_customer_mobile ON pharmacy_sales(customer_mobile)
    WHERE customer_mobile IS NOT NULL;
