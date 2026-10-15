import datetime
from sqlalchemy import text
from database import engine

DEFAULT_DROPDOWNS = [
    # Departments
    {"category": "departments", "value": "General Medicine", "label": "General Medicine", "sort_order": 1, "is_system": True},
    {"category": "departments", "value": "Cardiology", "label": "Cardiology", "sort_order": 2, "is_system": True},
    {"category": "departments", "value": "General Physician", "label": "General Physician", "sort_order": 3, "is_system": True},
    {"category": "departments", "value": "Orthopaedics", "label": "Orthopaedics", "sort_order": 4, "is_system": True},
    {"category": "departments", "value": "Paediatrics", "label": "Paediatrics", "sort_order": 5, "is_system": True},
    {"category": "departments", "value": "OP", "label": "Outpatient (OP)", "sort_order": 6, "is_system": True},
    {"category": "departments", "value": "Pharmacy", "label": "Pharmacy", "sort_order": 7, "is_system": True},
    {"category": "departments", "value": "Laboratory", "label": "Laboratory", "sort_order": 8, "is_system": True},
    {"category": "departments", "value": "Imaging / Radiology", "label": "Imaging / Radiology", "sort_order": 9, "is_system": True},

    # Visit Types
    {"category": "visit_types", "value": "OP", "label": "OP Visits", "sort_order": 1, "is_system": True},
    {"category": "visit_types", "value": "Follow-up", "label": "Follow-up", "sort_order": 2, "is_system": True},
    {"category": "visit_types", "value": "Review", "label": "Review", "sort_order": 3, "is_system": True},
    {"category": "visit_types", "value": "Re-visit", "label": "Re-visit", "sort_order": 4, "is_system": True},

    # Payment Modes
    {"category": "payment_modes", "value": "Cash", "label": "Cash", "sort_order": 1, "is_system": True},
    {"category": "payment_modes", "value": "UPI", "label": "UPI / QR Code", "sort_order": 2, "is_system": True},
    {"category": "payment_modes", "value": "Credit / Debit Card", "label": "Credit / Debit Card", "sort_order": 3, "is_system": True},
    {"category": "payment_modes", "value": "Bank transfer", "label": "Bank Transfer (NEFT/RTGS)", "sort_order": 4, "is_system": True},
    {"category": "payment_modes", "value": "Cheque", "label": "Cheque", "sort_order": 5, "is_system": True},

    # Refund Reasons
    {"category": "refund_reasons", "value": "Excess advance", "label": "Excess advance deposit", "sort_order": 1, "is_system": True},
    {"category": "refund_reasons", "value": "Procedure cancelled", "label": "Procedure cancelled by doctor", "sort_order": 2, "is_system": True},
    {"category": "refund_reasons", "value": "Early discharge", "label": "Early patient discharge", "sort_order": 3, "is_system": True},
    {"category": "refund_reasons", "value": "Billing adjustment", "label": "Billing / invoice adjustment", "sort_order": 4, "is_system": True},
    {"category": "refund_reasons", "value": "Consultation cancelled", "label": "Consultation cancelled / patient absent", "sort_order": 5, "is_system": True},

    # Return Reasons (Pharmacy)
    {"category": "return_reasons", "value": "Wrong medicine dispensed", "label": "Wrong medicine dispensed", "sort_order": 1, "is_system": True},
    {"category": "return_reasons", "value": "Excess prescribed quantity", "label": "Excess prescribed quantity", "sort_order": 2, "is_system": True},
    {"category": "return_reasons", "value": "Doctor stopped medication", "label": "Doctor stopped medication", "sort_order": 3, "is_system": True},
    {"category": "return_reasons", "value": "Adverse reaction", "label": "Adverse reaction / allergic", "sort_order": 4, "is_system": True},
    {"category": "return_reasons", "value": "Damaged packaging", "label": "Damaged strip or bottle", "sort_order": 5, "is_system": True},

    # Inventory Adjustment Reasons
    {"category": "adjustment_reasons", "value": "Damage / Breakage", "label": "Damage / Breakage", "sort_order": 1, "is_system": True},
    {"category": "adjustment_reasons", "value": "Expiry Write-off", "label": "Expiry Write-off", "sort_order": 2, "is_system": True},
    {"category": "adjustment_reasons", "value": "Physical Count Discrepancy", "label": "Physical Count Discrepancy", "sort_order": 3, "is_system": True},
    {"category": "adjustment_reasons", "value": "Correction of Data Entry", "label": "Correction of Data Entry", "sort_order": 4, "is_system": True},
    {"category": "adjustment_reasons", "value": "Supplier Replacement Sample", "label": "Supplier Replacement Sample", "sort_order": 5, "is_system": True},

    # Storage Locations
    {"category": "storage_locations", "value": "Main Central Pharmacy", "label": "Main Central Pharmacy", "sort_order": 1, "is_system": True},
    {"category": "storage_locations", "value": "Emergency Rack A", "label": "Emergency Rack A", "sort_order": 2, "is_system": True},
    {"category": "storage_locations", "value": "OT Storage 1", "label": "OT Storage 1", "sort_order": 3, "is_system": True},
    {"category": "storage_locations", "value": "OP Consultation Sub-store", "label": "OP Consultation Sub-store", "sort_order": 4, "is_system": True},

    # Dosage Forms
    {"category": "dosage_forms", "value": "Tablet", "label": "Tablet", "sort_order": 1, "is_system": True},
    {"category": "dosage_forms", "value": "Capsule", "label": "Capsule", "sort_order": 2, "is_system": True},
    {"category": "dosage_forms", "value": "Syrup / Suspension", "label": "Syrup / Suspension", "sort_order": 3, "is_system": True},
    {"category": "dosage_forms", "value": "Injection / IV", "label": "Injection / IV", "sort_order": 4, "is_system": True},
    {"category": "dosage_forms", "value": "Ointment / Gel", "label": "Ointment / Gel", "sort_order": 5, "is_system": True},

    # Unit Types
    {"category": "unit_types", "value": "Strip", "label": "Strip", "sort_order": 1, "is_system": True},
    {"category": "unit_types", "value": "Bottle", "label": "Bottle", "sort_order": 2, "is_system": True},
    {"category": "unit_types", "value": "Vial / Ampoule", "label": "Vial / Ampoule", "sort_order": 3, "is_system": True},
    {"category": "unit_types", "value": "Tube", "label": "Tube", "sort_order": 4, "is_system": True},
    {"category": "unit_types", "value": "Box", "label": "Box", "sort_order": 5, "is_system": True},

    # Counters
    {"category": "counters", "value": "Main Billing Counter", "label": "Main Billing Counter", "sort_order": 1, "is_system": True},
    {"category": "counters", "value": "Counter 1 - Main OPD", "label": "Counter 1 - Main OPD", "sort_order": 2, "is_system": True},
    {"category": "counters", "value": "Counter 2 - Pharmacy & Diagnostics", "label": "Counter 2 - Pharmacy & Diagnostics", "sort_order": 3, "is_system": True},

    # Cashiers (Billing & Accounts)
    {"category": "cashiers", "value": "Ramesh Kumar", "label": "Ramesh Kumar", "sort_order": 1, "is_system": False},
    {"category": "cashiers", "value": "Admin Cashier", "label": "Admin Cashier", "sort_order": 2, "is_system": False},
    {"category": "cashiers", "value": "Priya Sharma", "label": "Priya Sharma", "sort_order": 3, "is_system": False},
    {"category": "cashiers", "value": "K. Rajesh", "label": "K. Rajesh", "sort_order": 4, "is_system": False},
    {"category": "cashiers", "value": "employee", "label": "employee (Admin)", "sort_order": 5, "is_system": False},
]

def init_and_seed_dropdowns():
    """Initializes table and seeds default dropdown configurations if empty or missing items."""
    with engine.begin() as conn:
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS dropdown_configurations (
                id SERIAL PRIMARY KEY,
                category TEXT NOT NULL,
                value TEXT NOT NULL,
                label TEXT NOT NULL,
                is_active BOOLEAN NOT NULL DEFAULT TRUE,
                sort_order INTEGER NOT NULL DEFAULT 0,
                is_system BOOLEAN NOT NULL DEFAULT FALSE,
                hospital_id INTEGER DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                CONSTRAINT uq_category_value UNIQUE(category, value)
            );
            CREATE INDEX IF NOT EXISTS idx_dropdown_cat ON dropdown_configurations(category);
        """))

        # Seed defaults
        for item in DEFAULT_DROPDOWNS:
            conn.execute(text("""
                INSERT INTO dropdown_configurations (category, value, label, sort_order, is_system, is_active)
                VALUES (:category, :value, :label, :sort_order, :is_system, TRUE)
                ON CONFLICT (category, value) DO NOTHING
            """), item)

        # Sync existing department_master entries
        try:
            dept_rows = conn.execute(text("SELECT department_name FROM department_master WHERE department_name IS NOT NULL")).fetchall()
            for r in dept_rows:
                dname = r[0].strip()
                if dname:
                    conn.execute(text("""
                        INSERT INTO dropdown_configurations (category, value, label, sort_order, is_system, is_active)
                        VALUES ('departments', :name, :name, 10, FALSE, TRUE)
                        ON CONFLICT (category, value) DO NOTHING
                    """), {"name": dname})
        except Exception:
            pass

        # Sync active users as cashiers if not present
        try:
            user_rows = conn.execute(text("SELECT username, full_name FROM users WHERE status = 'active'")).fetchall()
            for u in user_rows:
                uname = (u[0] or "").strip()
                fname = (u[1] or "").strip() or uname
                if fname:
                    conn.execute(text("""
                        INSERT INTO dropdown_configurations (category, value, label, sort_order, is_system, is_active)
                        VALUES ('cashiers', :val, :lbl, 10, FALSE, TRUE)
                        ON CONFLICT (category, value) DO NOTHING
                    """), {"val": fname, "lbl": fname})
        except Exception:
            pass


def get_all_dropdowns(category: str = None, active_only: bool = False):
    """Fetches dropdown options grouped by category or for a specific category."""
    init_and_seed_dropdowns()
    query = "SELECT id, category, value, label, is_active, sort_order, is_system FROM dropdown_configurations WHERE 1=1"
    params = {}

    if category:
        query += " AND category = :cat"
        params["cat"] = category

    if active_only:
        query += " AND is_active = TRUE"

    query += " ORDER BY category ASC, sort_order ASC, label ASC"

    with engine.connect() as conn:
        rows = conn.execute(text(query), params).fetchall()
        result = {}
        for r in rows:
            c = r.category
            if c not in result:
                result[c] = []
            result[c].append({
                "id": r.id,
                "category": r.category,
                "value": r.value,
                "label": r.label,
                "is_active": r.is_active,
                "sort_order": r.sort_order,
                "is_system": r.is_system,
            })

        if category:
            return result.get(category, [])
        return result


def add_dropdown_option(payload: dict, user: dict):
    """Adds a new dropdown option and synchronizes shared tables."""
    init_and_seed_dropdowns()
    category = payload.get("category", "").strip().lower()
    value = payload.get("value", "").strip()
    label = payload.get("label", "").strip() or value
    sort_order = int(payload.get("sort_order") or 0)

    if not category or not value:
        raise ValueError("Category and value are required.")

    with engine.begin() as conn:
        # Check duplicate
        exists = conn.execute(text(
            "SELECT id FROM dropdown_configurations WHERE category = :cat AND LOWER(value) = LOWER(:val)"
        ), {"cat": category, "val": value}).fetchone()
        if exists:
            raise ValueError(f"An option with value '{value}' already exists in category '{category}'.")

        res = conn.execute(text("""
            INSERT INTO dropdown_configurations (category, value, label, sort_order, is_system, is_active)
            VALUES (:cat, :val, :lbl, :so, FALSE, TRUE)
            RETURNING id, category, value, label, is_active, sort_order, is_system
        """), {"cat": category, "val": value, "lbl": label, "so": sort_order}).fetchone()

        # If category is departments, sync with department_master
        if category == "departments":
            try:
                conn.execute(text("""
                    INSERT INTO department_master (department_name, hospital_id)
                    VALUES (:name, 1)
                """), {"name": value})
            except Exception:
                pass

        return {
            "id": res.id,
            "category": res.category,
            "value": res.value,
            "label": res.label,
            "is_active": res.is_active,
            "sort_order": res.sort_order,
            "is_system": res.is_system,
        }


def update_dropdown_option(option_id: int, payload: dict, user: dict):
    """Updates label, is_active, value, or sort_order for a dropdown option."""
    with engine.begin() as conn:
        curr = conn.execute(text(
            "SELECT * FROM dropdown_configurations WHERE id = :id"
        ), {"id": option_id}).fetchone()
        if not curr:
            raise ValueError("Dropdown option not found.")

        label = payload.get("label", curr.label).strip()
        is_active = payload.get("is_active", curr.is_active)
        sort_order = payload.get("sort_order", curr.sort_order)
        value = payload.get("value", curr.value).strip() if not curr.is_system else curr.value

        conn.execute(text("""
            UPDATE dropdown_configurations
            SET label = :lbl, value = :val, is_active = :act, sort_order = :so, updated_at = CURRENT_TIMESTAMP
            WHERE id = :id
        """), {"lbl": label, "val": value, "act": is_active, "so": sort_order, "id": option_id})

        return {
            "id": option_id,
            "category": curr.category,
            "value": value,
            "label": label,
            "is_active": is_active,
            "sort_order": sort_order,
            "is_system": curr.is_system,
        }


def delete_dropdown_option(option_id: int, user: dict):
    """Deletes or deactivates a dropdown option to preserve historical data references."""
    with engine.begin() as conn:
        curr = conn.execute(text(
            "SELECT * FROM dropdown_configurations WHERE id = :id"
        ), {"id": option_id}).fetchone()
        if not curr:
            raise ValueError("Dropdown option not found.")

        # If system option, soft-deactivate instead of hard delete
        if curr.is_system:
            conn.execute(text(
                "UPDATE dropdown_configurations SET is_active = FALSE WHERE id = :id"
            ), {"id": option_id})
            return {"id": option_id, "action": "deactivated", "message": "System options cannot be permanently deleted. Marked inactive."}

        # Check references in database to prevent broken references
        cat = curr.category
        val = curr.value
        in_use = False

        if cat == "departments":
            cnt1 = conn.execute(text("SELECT COUNT(*) FROM appointments WHERE LOWER(department) = LOWER(:v)"), {"v": val}).scalar()
            cnt2 = conn.execute(text("SELECT COUNT(*) FROM doctor_schedules WHERE LOWER(department) = LOWER(:v)"), {"v": val}).scalar()
            in_use = (cnt1 > 0 or cnt2 > 0)
        elif cat == "visit_types":
            cnt = conn.execute(text("SELECT COUNT(*) FROM appointments WHERE LOWER(visit_type) = LOWER(:v)"), {"v": val}).scalar()
            in_use = cnt > 0
        elif cat == "cashiers":
            cnt1 = conn.execute(text("SELECT COUNT(*) FROM cashier_sessions WHERE LOWER(cashier_name) = LOWER(:v) OR LOWER(cashier_username) = LOWER(:v)"), {"v": val}).scalar()
            cnt2 = conn.execute(text("SELECT COUNT(*) FROM financial_receipts WHERE LOWER(created_by) = LOWER(:v)"), {"v": val}).scalar()
            cnt3 = conn.execute(text("SELECT COUNT(*) FROM invoices WHERE LOWER(created_by) = LOWER(:v)"), {"v": val}).scalar()
            in_use = (cnt1 > 0 or cnt2 > 0 or cnt3 > 0)

        if in_use:
            conn.execute(text(
                "UPDATE dropdown_configurations SET is_active = FALSE WHERE id = :id"
            ), {"id": option_id})
            return {"id": option_id, "action": "deactivated", "message": f"Option '{val}' is referenced by historical records. Deactivated to preserve data consistency."}

        conn.execute(text("DELETE FROM dropdown_configurations WHERE id = :id"), {"id": option_id})
        return {"id": option_id, "action": "deleted", "message": f"Option '{val}' deleted successfully."}
