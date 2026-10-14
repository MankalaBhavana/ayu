"""Real, per-patient chronological journey (registration through discharge/
disposition) with an itemized financial summary, payments list, and document
availability -- assembled from the hospital's real transactional tables
(admissions, appointments, encounters, diag_orders/items, pharmacy_sales,
bed_allocations, invoices, invoice_payments). Nothing here is sample data:
an event, a charge, or a document only appears if a real row backs it.
"""
from datetime import datetime, timedelta

from legacy_sql import get_connection


def _iso(value):
    if value is None:
        return None
    if hasattr(value, "isoformat"):
        return value.isoformat()
    return str(value)


def _split_dt(value):
    """('2026-09-20', '08:45') from a date/datetime, or (None, None)."""
    iso = _iso(value)
    if not iso:
        return None, None
    return iso[:10], (iso[11:16] if len(iso) > 10 else "00:00")


def _patient_name(row):
    return " ".join(p for p in [row.get("name"), row.get("last_name")] if p).strip() or row.get("patient_id")


def list_patient_journey_encounters(db, patient_id):
    """Every real outpatient visit for this patient (OP appointment and
    Follow-up / Re-visit encounters), newest first -- powers the encounter selector.
    IP admissions are preserved in the DB for IPD workflows but excluded from OP Patient Journey."""
    with get_connection(db) as conn:
        cursor = conn.cursor()
        encounters = []

        cursor.execute(
            """
            SELECT id, status, department, doctor_name, visit_type, appointment_kind, notes, consultation_fee, created_at, token_no,
                   COALESCE(
                       CASE 
                           WHEN CAST(appointment_date AS time) != '00:00:00' THEN appointment_date
                           WHEN created_at IS NOT NULL THEN
                               (DATE(appointment_date) + CAST(timezone('Asia/Kolkata', created_at) AS time))
                           ELSE appointment_date
                       END,
                       appointment_date
                   ) AS effective_appointment_date
            FROM appointments
            WHERE patient_id = ? AND LOWER(COALESCE(visit_type, '')) != 'emergency' AND LOWER(COALESCE(visit_type, '')) != 'ip'
            ORDER BY effective_appointment_date DESC, id DESC
            """,
            (patient_id,),
        )
        for row in cursor.fetchall():
            is_followup = (row.get("visit_type") or "").lower() in ("re-visit", "revisit", "follow_up", "follow up") or (row.get("appointment_kind") or "").lower() == "follow_up"
            encounters.append({
                "key": f"OP:{row['id']}",
                "encounter_type": "OP",
                "encounter_id": row["id"],
                "label": f"OP · APT-{row['id']}",
                "start": _iso(row["effective_appointment_date"]),
                "end": _iso(row["effective_appointment_date"]),
                "status": (row["status"] or "scheduled").replace("_", " ").title(),
                "ward": None,
                "bed_no": None,
                "visit_type": "Follow-up" if is_followup else "New Patient",
            })

        cursor.execute(
            """
            SELECT id, arrival_at, disposition, disposition_at
            FROM encounters WHERE patient_id = ? AND encounter_type = 'EMERGENCY'
            ORDER BY arrival_at DESC
            """,
            (patient_id,),
        )
        for row in cursor.fetchall():
            encounters.append({
                "key": f"ER:{row['id']}",
                "encounter_type": "EMERGENCY",
                "encounter_id": row["id"],
                "label": f"Emergency · ENC-{row['id']}",
                "start": _iso(row["arrival_at"]),
                "end": _iso(row["disposition_at"]),
                "status": (row["disposition"] or "Active").replace("_", " ").title(),
                "ward": None,
                "bed_no": None,
            })

        encounters.sort(key=lambda e: e["start"] or "", reverse=True)

        # If no formal admission or appointment exists, check for standalone outpatient pharmacy sales, lab orders, or invoices
        cursor.execute(
            """
            SELECT MIN(sold_at) AS first_sale, MAX(sold_at) AS last_sale, COUNT(*) AS cnt
            FROM pharmacy_sales WHERE patient_id = ? AND admission_id IS NULL
            """,
            (patient_id,),
        )
        pharm_enc = cursor.fetchone()

        cursor.execute(
            """
            SELECT MIN(created_at) AS first_ord, MAX(created_at) AS last_ord, COUNT(*) AS cnt
            FROM diag_orders WHERE patient_id = ? AND admission_id IS NULL
            """,
            (patient_id,),
        )
        diag_enc = cursor.fetchone()

        cursor.execute(
            """
            SELECT MIN(created_at) AS first_inv, MAX(created_at) AS last_inv, COUNT(*) AS cnt
            FROM invoices WHERE patient_id = ? AND (appointment_id IS NULL OR appointment_id = 0)
            """,
            (patient_id,),
        )
        inv_enc = cursor.fetchone()

        has_op = any(e["encounter_type"] == "OP" for e in encounters)
        if not has_op and ((pharm_enc and pharm_enc["cnt"] > 0) or (diag_enc and diag_enc["cnt"] > 0) or (inv_enc and inv_enc["cnt"] > 0)):
            start_dt = _iso((pharm_enc or {}).get("first_sale") or (diag_enc or {}).get("first_ord") or (inv_enc or {}).get("first_inv"))
            end_dt = _iso((pharm_enc or {}).get("last_sale") or (diag_enc or {}).get("last_ord") or (inv_enc or {}).get("last_inv"))
            encounters.append({
                "key": "OP:0",
                "encounter_type": "OP",
                "encounter_id": 0,
                "label": "Outpatient Services",
                "start": start_dt,
                "end": end_dt,
                "status": "Active",
                "ward": None,
                "bed_no": None,
            })

        return encounters


def _first_ever(encounters, key):
    """True if `key` (e.g. 'IP:96') is the chronologically earliest real
    visit this patient has -- the only case 'Patient registered' belongs in
    this encounter's own timeline, rather than repeating it on every visit."""
    dated = [e for e in encounters if e["start"]]
    if not dated:
        return True
    earliest = min(dated, key=lambda e: e["start"])
    return earliest["key"] == key


def _diag_scope_rows(cursor, encounter_type, appointment_id, admission_id, patient_id=None):
    if encounter_type == "IP":
        cursor.execute(
            """
            SELECT oi.id AS item_id, oi.service_name, oi.department_type, oi.amount, oi.discharge_invoice_id,
                   o.id AS order_id, o.confirmed_at
            FROM diag_order_items oi JOIN diag_orders o ON o.id = oi.order_id
            WHERE (o.admission_id = ? OR (o.patient_id = ? AND o.encounter_type = 'IP'))
              AND o.status = 'confirmed' AND oi.cancelled_at IS NULL
            """,
            (admission_id, patient_id),
        )
    else:
        if appointment_id and appointment_id != 0:
            cursor.execute(
                """
                SELECT oi.id AS item_id, oi.service_name, oi.department_type, oi.amount, o.invoice_id AS discharge_invoice_id,
                       o.id AS order_id, o.confirmed_at
                FROM diag_order_items oi JOIN diag_orders o ON o.id = oi.order_id
                WHERE (o.appointment_id = ? OR (o.patient_id = ? AND o.admission_id IS NULL))
                  AND o.status = 'confirmed' AND oi.cancelled_at IS NULL
                """,
                (appointment_id, patient_id),
            )
        else:
            cursor.execute(
                """
                SELECT oi.id AS item_id, oi.service_name, oi.department_type, oi.amount, o.invoice_id AS discharge_invoice_id,
                       o.id AS order_id, o.confirmed_at
                FROM diag_order_items oi JOIN diag_orders o ON o.id = oi.order_id
                WHERE o.patient_id = ? AND o.admission_id IS NULL AND o.status = 'confirmed' AND oi.cancelled_at IS NULL
                """,
                (patient_id,),
            )
    return cursor.fetchall()


def get_patient_journey(db, patient_id, encounter_type=None, encounter_id=None):
    with get_connection(db) as conn:
        cursor = conn.cursor()

        cursor.execute("SELECT * FROM patients WHERE patient_id = ?", (patient_id,))
        patient_row = cursor.fetchone()
        if not patient_row:
            return None
        patient = dict(patient_row)

        encounters = list_patient_journey_encounters(db, patient_id)
        if not encounters:
            return {
                "patient": {
                    "patient_id": patient_id, "name": _patient_name(patient),
                    "age": patient.get("age"), "gender": patient.get("gender"),
                },
                "encounters": [], "selected": None, "events": [],
                "financial_summary": {"categories": [], "total_charges": 0, "payments_received": 0, "outstanding": 0, "status": "N/A"},
                "payments": [], "documents": [],
            }

        selected = None
        if encounter_type and encounter_id:
            selected = next((e for e in encounters if e["encounter_type"] == encounter_type and str(e["encounter_id"]) == str(encounter_id)), None)
        if not selected:
            selected = encounters[0]

        etype = selected["encounter_type"]
        eid = selected["encounter_id"]
        is_first = _first_ever(encounters, selected["key"])

        events = []
        invoice_ids = set()
        doctor_name = None
        admission_id = None
        appointment_id = None

        if etype == "IP":
            admission_id = eid
            cursor.execute("SELECT * FROM admissions WHERE id = ?", (admission_id,))
            admission = dict(cursor.fetchone() or {})
            cursor.execute(
                "SELECT * FROM bed_allocations WHERE admission_id = ? ORDER BY allocated_at DESC LIMIT 1",
                (admission_id,),
            )
            bed = cursor.fetchone()
            bed = dict(bed) if bed else None
            doctor_name = (bed or {}).get("assigned_doctor")

            adm_date, adm_time = _split_dt(admission.get("admission_date"))
            if is_first:
                reg_date, reg_time = _split_dt(patient.get("created_at"))
                events.append({"date": reg_date, "time": reg_time, "type": "registration",
                                "title": "Patient registered", "subtitle": f"Registration completed · {patient_id}",
                                "charge": None, "received": None})
            events.append({
                "date": adm_date, "time": adm_time, "type": "admission", "title": "Inpatient admission",
                "subtitle": f"ADM-{admission_id}" + (f" · {bed['ward']} · Bed {bed['bed_no']}" if bed else ""),
                "charge": None, "received": None,
            })
            if doctor_name:
                events.append({"date": adm_date, "time": adm_time, "type": "consultation",
                                "title": "Doctor consultation", "subtitle": f"Attending: {doctor_name}",
                                "charge": None, "received": None})

            items = _diag_scope_rows(cursor, "IP", None, admission_id)
            for it in items:
                dept = (it["department_type"] or "").upper()
                cursor.execute("SELECT * FROM diag_specimens WHERE order_item_id = ? ORDER BY id LIMIT 1", (it["item_id"],))
                specimen = cursor.fetchone()
                cursor.execute("SELECT * FROM diag_imaging_exams WHERE order_item_id = ? ORDER BY id LIMIT 1", (it["item_id"],))
                exam = cursor.fetchone()
                cursor.execute("SELECT * FROM diag_reports WHERE order_item_id = ? ORDER BY version DESC LIMIT 1", (it["item_id"],))
                report = cursor.fetchone()

                if dept == "LAB" and specimen and specimen["collected_at"]:
                    d, t = _split_dt(specimen["collected_at"])
                    events.append({"date": d, "time": t, "type": "lab_collected", "title": "Laboratory sample collected",
                                    "subtitle": f"{it['service_name']} · {specimen['specimen_no']}", "charge": float(it["amount"] or 0), "received": None})
                if dept == "IMAGING" and exam and exam["completed_at"]:
                    d, t = _split_dt(exam["completed_at"])
                    events.append({"date": d, "time": t, "type": "imaging_completed", "title": "Imaging examination completed",
                                    "subtitle": it["service_name"], "charge": float(it["amount"] or 0), "received": None})
                if report and report["status"] == "released" and report["released_at"]:
                    d, t = _split_dt(report["released_at"])
                    label = "Laboratory report released" if dept == "LAB" else "Imaging report released"
                    events.append({"date": d, "time": t, "type": "report_released", "title": label,
                                    "subtitle": f"{it['service_name']} · Authorized report", "charge": None, "received": None,
                                    "report_id": report["id"]})
                if it["discharge_invoice_id"]:
                    invoice_ids.add(it["discharge_invoice_id"])

            cursor.execute(
                "SELECT * FROM pharmacy_sales WHERE admission_id = ? ORDER BY sold_at",
                (admission_id,),
            )
            pharmacy_rows = [dict(r) for r in cursor.fetchall()]
            grouped = {}
            for r in pharmacy_rows:
                key = _iso(r["sold_at"])
                grouped.setdefault(key, []).append(r)
                if r.get("invoice_id"):
                    invoice_ids.add(r["invoice_id"])
            for sold_at, lines in grouped.items():
                d, t = _split_dt(sold_at)
                total = sum(float(l["amount"] or 0) for l in lines)
                events.append({
                    "date": d, "time": t, "type": "pharmacy_issued", "title": "Pharmacy medicines issued",
                    "subtitle": f"Billed to admission · {len(lines)} item(s)", "charge": total, "received": None,
                    "items": [{"name": l["medicine_name"], "quantity": l["quantity"], "unit_price": float(l["unit_price"] or 0), "amount": float(l["amount"] or 0)} for l in lines],
                })

            bed_total = float(bed["total_amount"] or 0) if bed and bed.get("status") == "released" else 0.0
            discharge_date = admission.get("discharge_date")
            if discharge_date and bed:
                d, t = _split_dt(bed.get("released_at") or discharge_date)
                if bed_total:
                    events.append({"date": d, "time": t, "type": "room_charges", "title": "Room & nursing charges posted",
                                    "subtitle": f"{bed['ward']} · {bed.get('total_days') or ''} day(s)", "charge": bed_total, "received": None})

            if discharge_date:
                cursor.execute(
                    "SELECT id, invoice_no, total_amount, paid_amount, due_amount, invoice_type, created_at FROM invoices "
                    "WHERE patient_id = ? AND module = 'IP' AND (id = ANY(?) OR invoice_type = 'DISCHARGE')",
                    (patient_id, list(invoice_ids) or [-1]),
                )
            else:
                cursor.execute(
                    "SELECT id, invoice_no, total_amount, paid_amount, due_amount, invoice_type, created_at FROM invoices "
                    "WHERE patient_id = ? AND module = 'IP' AND id = ANY(?)",
                    (patient_id, list(invoice_ids) or [-1]),
                )
            for inv in cursor.fetchall():
                invoice_ids.add(inv["id"])

            discharge_invoice = None
            for iid in list(invoice_ids):
                cursor.execute("SELECT * FROM invoices WHERE id = ?", (iid,))
                inv = cursor.fetchone()
                if inv and inv["invoice_type"] == "DISCHARGE":
                    discharge_invoice = dict(inv)

            if discharge_invoice:
                cursor.execute("SELECT * FROM invoice_payments WHERE invoice_id = ? ORDER BY created_at", (discharge_invoice["id"],))
                for pay in cursor.fetchall():
                    d, t = _split_dt(pay["created_at"])
                    events.append({"date": d, "time": t, "type": "payment", "title": "Final payment received",
                                    "subtitle": f"{(pay['payment_mode'] or 'cash').upper()} · Receipt PMT-{pay['id']}",
                                    "charge": None, "received": float(pay["amount"] or 0)})
                if discharge_date:
                    d, t = _split_dt(discharge_invoice.get("created_at"))
                    events.append({"date": d, "time": t, "type": "discharge", "title": "Discharged home",
                                    "subtitle": "Discharge summary available · Bed released", "charge": None, "received": None})

            for iid in invoice_ids:
                if discharge_invoice and iid == discharge_invoice["id"]:
                    continue
                cursor.execute("SELECT * FROM invoice_payments WHERE invoice_id = ? ORDER BY created_at", (iid,))
                for pay in cursor.fetchall():
                    d, t = _split_dt(pay["created_at"])
                    events.append({"date": d, "time": t, "type": "payment", "title": "Deposit received",
                                    "subtitle": f"{(pay['payment_mode'] or 'cash').upper()} · Receipt PMT-{pay['id']}",
                                    "charge": None, "received": float(pay["amount"] or 0)})

            lab_total = sum(float(it["amount"] or 0) for it in items if (it["department_type"] or "").upper() == "LAB")
            imaging_total = sum(float(it["amount"] or 0) for it in items if (it["department_type"] or "").upper() == "IMAGING")
            pharmacy_total = sum(float(r["amount"] or 0) for r in pharmacy_rows)
            categories = [c for c in [
                ("Laboratory", lab_total), ("Imaging", imaging_total),
                ("Pharmacy", pharmacy_total), ("Room & nursing", bed_total),
            ] if c[1] > 0]

            cursor.execute("SELECT * FROM prescriptions WHERE admission_id = ? LIMIT 1", (admission_id,))
            prescription = cursor.fetchone()
            documents = [
                {"type": "prescription", "label": "Prescription", "available": bool(prescription), "ref": prescription["id"] if prescription else None},
                {"type": "lab_report", "label": "Lab report", "available": any(e["type"] == "report_released" and "Laboratory" in e["title"] for e in events), "ref": None},
                {"type": "imaging_report", "label": "Imaging report", "available": any(e["type"] == "report_released" and "Imaging" in e["title"] for e in events), "ref": None},
                {"type": "pharmacy_slip", "label": "Pharmacy issue slip", "available": len(pharmacy_rows) > 0, "ref": None},
                {"type": "final_bill", "label": "Final bill", "available": discharge_invoice is not None, "ref": discharge_invoice["id"] if discharge_invoice else None},
                {"type": "discharge_summary", "label": "Discharge summary", "available": bool(discharge_date), "ref": admission_id},
            ]

        elif etype == "OP":
            appointment_id = eid
            appt = {}
            if appointment_id and appointment_id != 0:
                cursor.execute(
                    """
                    SELECT id, status, department, doctor_name, visit_type, appointment_kind, notes, consultation_fee, created_at, token_no,
                           COALESCE(
                               CASE 
                                   WHEN CAST(appointment_date AS time) != '00:00:00' THEN appointment_date
                                   WHEN created_at IS NOT NULL THEN
                                       (DATE(appointment_date) + CAST(timezone('Asia/Kolkata', created_at) AS time))
                                   ELSE appointment_date
                               END,
                               appointment_date
                           ) AS effective_appointment_date
                    FROM appointments WHERE id = ?
                    """,
                    (appointment_id,),
                )
                appt_row = cursor.fetchone()
                appt = dict(appt_row or {})
            doctor_name = appt.get("doctor_name")
            appt_date, appt_time = _split_dt(appt.get("effective_appointment_date") or appt.get("created_at") or appt.get("appointment_date") or patient.get("created_at"))
            appt_day = (appt.get("effective_appointment_date") or appt.get("appointment_date") or "")
            appt_day_str = appt_day[:10] if isinstance(appt_day, str) else _iso(appt_day)[:10] if appt_day else ""

            if is_first:
                reg_date, reg_time = _split_dt(patient.get("created_at"))
                events.append({"date": reg_date, "time": reg_time, "type": "registration",
                                "title": "Patient registered", "subtitle": f"Registration completed · {patient_id}",
                                "charge": None, "received": None})

            consultation_fee = 0.0
            if appt_day_str:
                cursor.execute(
                    "SELECT * FROM invoices WHERE patient_id = ? AND module = 'OP' AND DATE(created_at) = ? ORDER BY created_at LIMIT 1",
                    (patient_id, appt_day_str),
                )
                consultation_invoice = cursor.fetchone()
                consultation_fee = float(consultation_invoice["total_amount"] or 0) if consultation_invoice else float(appt.get("consultation_fee") or 0)
                if consultation_invoice:
                    invoice_ids.add(consultation_invoice["id"])

            notes = appt.get("notes") or ""
            is_followup = (
                (appt.get("visit_type") or "").lower() in ("re-visit", "revisit", "follow_up", "follow up")
                or (appt.get("appointment_kind") or "").lower() == "follow_up"
            )

            # 1. Vitals event extraction (from patient_vitals table or parsed from notes)
            v_row = None
            try:
                cursor.execute(
                    """
                    SELECT * FROM patient_vitals
                    WHERE patient_id = ? AND (
                        encounter_id = ?
                        OR DATE(COALESCE(recorded_at, record_time, created_at)) = DATE(?)
                    )
                    ORDER BY id DESC LIMIT 1
                    """,
                    (patient_id, appointment_id, appt_day_str or appt.get("created_at")),
                )
                v_row = cursor.fetchone()
            except Exception as e:
                print(f"[WARN] Failed to query patient_vitals: {e}")
            bp = v_row["bp"] if v_row and v_row["bp"] else None
            pulse = v_row["pulse"] if v_row and v_row["pulse"] else None
            temp = v_row["temperature"] if v_row and v_row["temperature"] else None
            spo2 = v_row["spo2"] if v_row and v_row["spo2"] else None
            height = v_row["height"] if v_row and v_row["height"] else None
            weight = v_row["weight"] if v_row and v_row["weight"] else None

            if not any([bp, pulse, temp, spo2, height, weight]) and appt_day_str:
                cursor.execute(
                    """
                    SELECT notes FROM admissions
                    WHERE patient_id = ? AND DATE(admission_date) = DATE(?)
                    ORDER BY admission_date DESC LIMIT 1
                    """,
                    (patient_id, appt_day_str),
                )
                adm_row = cursor.fetchone()
                if adm_row and adm_row["notes"]:
                    notes = f"{notes}\n{adm_row['notes']}"

            if notes and not (bp and temp and pulse):
                import re
                bp_m = re.search(r"BP:\s*([^\s|]+)", notes, re.I)
                temp_m = re.search(r"Temp(?:erature)?:\s*([^\s|]+)", notes, re.I)
                pulse_m = re.search(r"Pulse:\s*([^\s|]+)", notes, re.I)
                spo2_m = re.search(r"SpO2:\s*([^\s|]+)", notes, re.I)
                h_m = re.search(r"Height:\s*([^\s|]+)", notes, re.I)
                w_m = re.search(r"Weight:\s*([^\s|]+)", notes, re.I)
                if not bp and bp_m: bp = bp_m.group(1).strip()
                if not temp and temp_m: temp = temp_m.group(1).strip()
                if not pulse and pulse_m: pulse = pulse_m.group(1).strip()
                if not spo2 and spo2_m: spo2 = spo2_m.group(1).strip()
                if not height and h_m: height = h_m.group(1).strip()
                if not weight and w_m: weight = w_m.group(1).strip()

            if any([bp, pulse, temp, spo2, height, weight]):
                v_parts = []
                if bp: v_parts.append(f"BP: {bp} mmHg")
                if pulse: v_parts.append(f"Pulse: {pulse} bpm")
                if temp: v_parts.append(f"Temp: {temp}°F")
                if spo2: v_parts.append(f"SpO2: {spo2}%")
                if weight: v_parts.append(f"Weight: {weight} kg")
                if height: v_parts.append(f"Height: {height} cm")
                events.append({
                    "date": appt_date, "time": appt_time, "type": "vitals",
                    "title": "Vitals recorded", "subtitle": " · ".join(v_parts),
                    "charge": None, "received": None,
                })

            # 2. Consultation event
            revisit_notes = None
            if "[Re-visit Notes]" in notes:
                revisit_notes = notes.split("[Re-visit Notes]")[-1].strip()
            elif "Current Symptoms:" in notes:
                import re
                sym_m = re.search(r"Current Symptoms:\s*([^|]+)", notes)
                if sym_m:
                    revisit_notes = sym_m.group(1).strip()
            elif notes and not notes.startswith("[Re-visit Details]"):
                revisit_notes = notes.strip()

            consult_title = "Follow-up consultation" if is_followup else "Doctor consultation"
            parts = [f"{appt.get('department') or 'General'} · {doctor_name or 'Duty doctor'}"]
            if appt.get("token_no"):
                parts.append(f"Token {appt['token_no']}")
            if revisit_notes:
                parts.append(f"Complaint: {revisit_notes}")
            consult_subtitle = " · ".join(parts)

            if appointment_id and appointment_id != 0:
                events.append({
                    "date": appt_date, "time": appt_time, "type": "consultation",
                    "title": consult_title, "subtitle": consult_subtitle,
                    "charge": consultation_fee or None, "received": None,
                })

            items = _diag_scope_rows(cursor, "OP", appointment_id, None, patient_id=patient_id)
            for it in items:
                dept = (it["department_type"] or "").upper()
                cursor.execute("SELECT * FROM diag_specimens WHERE order_item_id = ? ORDER BY id LIMIT 1", (it["item_id"],))
                specimen = cursor.fetchone()
                cursor.execute("SELECT * FROM diag_imaging_exams WHERE order_item_id = ? ORDER BY id LIMIT 1", (it["item_id"],))
                exam = cursor.fetchone()
                cursor.execute("SELECT * FROM diag_reports WHERE order_item_id = ? ORDER BY version DESC LIMIT 1", (it["item_id"],))
                report = cursor.fetchone()
                if dept == "LAB" and specimen and specimen["collected_at"]:
                    d, t = _split_dt(specimen["collected_at"])
                    events.append({"date": d, "time": t, "type": "lab_collected", "title": "Laboratory sample collected",
                                    "subtitle": f"{it['service_name']} · {specimen['specimen_no']}", "charge": float(it["amount"] or 0), "received": None})
                if dept == "IMAGING" and exam and exam["completed_at"]:
                    d, t = _split_dt(exam["completed_at"])
                    events.append({"date": d, "time": t, "type": "imaging_completed", "title": "Imaging examination completed",
                                    "subtitle": it["service_name"], "charge": float(it["amount"] or 0), "received": None})
                if report and report["status"] == "released" and report["released_at"]:
                    d, t = _split_dt(report["released_at"])
                    label = "Laboratory report released" if dept == "LAB" else "Imaging report released"
                    events.append({"date": d, "time": t, "type": "report_released", "title": label,
                                    "subtitle": f"{it['service_name']} · Authorized report", "charge": None, "received": None,
                                    "report_id": report["id"]})
                if it["discharge_invoice_id"]:
                    invoice_ids.add(it["discharge_invoice_id"])

            # Query all pharmacy sales for this outpatient visit
            cursor.execute(
                "SELECT * FROM pharmacy_sales WHERE patient_id = ? AND admission_id IS NULL "
                "AND billing_type NOT IN ('EMERGENCY', 'EMERGENCY_ACCOUNT', 'EMERGENCY_IMMEDIATE') ORDER BY sold_at ASC",
                (patient_id,),
            )
            pharmacy_rows = [dict(r) for r in cursor.fetchall()]
            grouped = {}
            for r in pharmacy_rows:
                key = _iso(r["sold_at"])
                grouped.setdefault(key, []).append(r)
                if r.get("invoice_id"):
                    invoice_ids.add(r["invoice_id"])
            for sold_at, lines in grouped.items():
                d, t = _split_dt(sold_at)
                total = sum(float(l["amount"] or 0) for l in lines)
                events.append({
                    "date": d, "time": t, "type": "pharmacy_issued", "title": "Pharmacy medicines issued",
                    "subtitle": f"Medicine sale · {len(lines)} item(s)", "charge": total, "received": total,
                    "items": [{"name": l["medicine_name"], "quantity": l["quantity"], "unit_price": float(l["unit_price"] or 0), "amount": float(l["amount"] or 0)} for l in lines],
                })

            # Check invoices associated with patient across modules (lab, pharmacy, appointments)
            cursor.execute(
                """
                SELECT id, invoice_no, total_amount, paid_amount, module, created_at
                FROM invoices
                WHERE patient_id = ? AND (
                    (appointment_id = ? AND ? <> 0)
                    OR UPPER(COALESCE(module, '')) IN ('LAB', 'DIAGNOSTICS', 'PHARMACY', 'RADIOLOGY')
                    OR invoice_no ILIKE 'INV-LAB-%'
                    OR invoice_no ILIKE 'INV-DIAG-%'
                    OR invoice_no ILIKE 'INV-PHARM-%'
                )
                """,
                (patient_id, appointment_id or -1, appointment_id or 0),
            )
            for inv in cursor.fetchall():
                invoice_ids.add(inv["id"])
                inv_mod = (inv.get("module") or "").upper()
                inv_no = inv.get("invoice_no") or f"INV-{inv['id']}"
                d, t = _split_dt(inv.get("created_at"))
                if ("LAB" in inv_mod or "DIAG" in inv_mod or "INV-LAB" in inv_no) and not any(e.get("type") in ("lab_collected", "report_released") for e in events):
                    events.append({
                        "date": d, "time": t, "type": "lab_collected", "title": "Diagnostic laboratory service",
                        "subtitle": f"Bill {inv_no}", "charge": float(inv["total_amount"] or 0),
                        "received": float(inv["paid_amount"] or 0),
                    })

            for iid in list(invoice_ids):
                cursor.execute("SELECT * FROM invoice_payments WHERE invoice_id = ? ORDER BY created_at", (iid,))
                for pay in cursor.fetchall():
                    d, t = _split_dt(pay["created_at"])
                    events.append({"date": d, "time": t, "type": "payment", "title": "Payment received",
                                    "subtitle": f"{(pay['payment_mode'] or 'cash').upper()} · Receipt PMT-{pay['id']}",
                                    "charge": None, "received": float(pay["amount"] or 0)})

            lab_total = sum(float(it["amount"] or 0) for it in items if (it["department_type"] or "").upper() == "LAB")
            imaging_total = sum(float(it["amount"] or 0) for it in items if (it["department_type"] or "").upper() == "IMAGING")
            pharmacy_total = sum(float(r["amount"] or 0) for r in pharmacy_rows)
            if lab_total == 0:
                cursor.execute("SELECT COALESCE(SUM(total_amount), 0) AS val FROM invoices WHERE patient_id = ? AND (UPPER(COALESCE(module, '')) IN ('LAB', 'DIAGNOSTICS') OR invoice_no ILIKE 'INV-LAB-%')", (patient_id,))
                lab_total = float(cursor.fetchone()["val"] or 0)
            if pharmacy_total == 0:
                cursor.execute("SELECT COALESCE(SUM(total_amount), 0) AS val FROM invoices WHERE patient_id = ? AND (UPPER(COALESCE(module, '')) = 'PHARMACY' OR invoice_no ILIKE 'INV-PHARM-%')", (patient_id,))
                pharmacy_total = float(cursor.fetchone()["val"] or 0)

            categories = [c for c in [
                ("Follow-up Fee" if is_followup else "Consultation", consultation_fee),
                ("Laboratory", lab_total), ("Imaging", imaging_total), ("Pharmacy", pharmacy_total),
            ] if c[1] > 0]

            rx_date = appt_day_str or (str(appt.get("effective_appointment_date") or appt.get("appointment_date"))[:10] if (appt.get("effective_appointment_date") or appt.get("appointment_date")) else None)
            if rx_date:
                cursor.execute(
                    """
                    SELECT * FROM prescriptions
                    WHERE patient_id = ? AND (
                        appointment_id = ?
                        OR (appointment_id IS NULL AND DATE(created_at) = DATE(?))
                    )
                    ORDER BY created_at ASC
                    """,
                    (patient_id, appointment_id, rx_date),
                )
            else:
                cursor.execute(
                    """
                    SELECT * FROM prescriptions
                    WHERE patient_id = ? AND appointment_id = ?
                    ORDER BY created_at ASC
                    """,
                    (patient_id, appointment_id),
                )
            prescriptions_rows = [dict(r) for r in cursor.fetchall()]

            for p in prescriptions_rows:
                rx_id = p["id"]
                cursor.execute(
                    "SELECT * FROM prescription_medicines WHERE prescription_id = ? ORDER BY id",
                    (rx_id,),
                )
                med_rows = [dict(m) for m in cursor.fetchall()]
                if not med_rows:
                    cursor.execute(
                        "SELECT * FROM prescription_items WHERE prescription_id = ? ORDER BY id",
                        (rx_id,),
                    )
                    med_rows = [dict(m) for m in cursor.fetchall()]

                med_items = []
                for med in med_rows:
                    med_name = med.get("medicine_name") or med.get("name") or "Medicine"
                    dosage = med.get("dosage") or ""
                    freq = med.get("frequency") or ""
                    dur = med.get("duration") or ""
                    inst = med.get("instructions") or ""
                    details = [x for x in [dosage, freq, inst] if x]
                    desc = f"{med_name} ({' · '.join(details)})" if details else med_name
                    dur_val = int(dur) if str(dur).isdigit() else 1
                    med_items.append({
                        "name": desc,
                        "quantity": dur_val,
                        "unit_price": 0.0,
                        "amount": 0.0,
                    })

                p_doc = p.get("doctor_name") or doctor_name or "Consultant"
                sub_parts = [f"Prescribed by: {p_doc}"]
                if p.get("department"):
                    sub_parts.append(p["department"])
                if p.get("diagnosis"):
                    sub_parts.append(f"Diagnosis: {p['diagnosis']}")
                if p.get("advice"):
                    sub_parts.append(f"Advice: {p['advice']}")
                if p.get("follow_up_date"):
                    sub_parts.append(f"Follow-up: {_iso(p['follow_up_date'])[:10]}")

                rx_date, rx_time = _split_dt(p.get("created_at") or appt.get("effective_appointment_date") or appt.get("created_at"))
                events.append({
                    "date": rx_date,
                    "time": rx_time,
                    "type": "prescription",
                    "title": "Doctor prescription",
                    "subtitle": " · ".join(sub_parts),
                    "charge": None,
                    "received": None,
                    "items": med_items,
                })

            has_rx = len(prescriptions_rows) > 0
            first_rx_id = prescriptions_rows[0]["id"] if has_rx else None
            documents = [
                {"type": "prescription", "label": "Prescription", "available": has_rx, "ref": first_rx_id},
                {"type": "lab_report", "label": "Lab report", "available": (lab_total > 0 or any(e["type"] in ("report_released", "lab_collected") for e in events)), "ref": None},
                {"type": "imaging_report", "label": "Imaging report", "available": (imaging_total > 0 or any(e["type"] == "report_released" and "Imaging" in e["title"] for e in events)), "ref": None},
                {"type": "pharmacy_slip", "label": "Pharmacy issue slip", "available": (len(pharmacy_rows) > 0 or pharmacy_total > 0), "ref": None},
                {"type": "final_bill", "label": "Final bill", "available": len(invoice_ids) > 0, "ref": None},
            ]

        else:  # EMERGENCY
            cursor.execute("SELECT * FROM encounters WHERE id = ?", (eid,))
            enc = dict(cursor.fetchone() or {})
            appointment_id = enc.get("appointment_id")
            doctor_name = enc.get("attending_doctor")
            arr_date, arr_time = _split_dt(enc.get("arrival_at"))

            if is_first:
                reg_date, reg_time = _split_dt(patient.get("created_at"))
                events.append({"date": reg_date, "time": reg_time, "type": "registration",
                                "title": "Patient registered", "subtitle": f"Registration completed · {patient_id}",
                                "charge": None, "received": None})
            events.append({"date": arr_date, "time": arr_time, "type": "emergency_registration", "title": "Emergency registration",
                            "subtitle": f"{enc.get('triage_priority') or 'Unclassified'} · {enc.get('chief_complaint') or '-'}",
                            "charge": None, "received": None})

            cursor.execute("SELECT * FROM patient_vitals WHERE encounter_id = ? ORDER BY id", (eid,))
            for v in cursor.fetchall():
                d, t = _split_dt(v["recorded_at"])
                if not d:
                    d, t = arr_date, arr_time
                events.append({"date": d, "time": t, "type": "vitals", "title": "Vitals recorded",
                                "subtitle": f"BP {v['bp'] or '-'} · Pulse {v['pulse'] or '-'} · SpO2 {v['spo2'] or '-'}%",
                                "charge": None, "received": None})

            items = _diag_scope_rows(cursor, "OP", appointment_id, None) if appointment_id else []
            for it in items:
                dept = (it["department_type"] or "").upper()
                cursor.execute("SELECT * FROM diag_specimens WHERE order_item_id = ? ORDER BY id LIMIT 1", (it["item_id"],))
                specimen = cursor.fetchone()
                cursor.execute("SELECT * FROM diag_imaging_exams WHERE order_item_id = ? ORDER BY id LIMIT 1", (it["item_id"],))
                exam = cursor.fetchone()
                cursor.execute("SELECT * FROM diag_reports WHERE order_item_id = ? ORDER BY version DESC LIMIT 1", (it["item_id"],))
                report = cursor.fetchone()
                if dept == "LAB" and specimen and specimen["collected_at"]:
                    d, t = _split_dt(specimen["collected_at"])
                    events.append({"date": d, "time": t, "type": "lab_collected", "title": "STAT laboratory sample collected",
                                    "subtitle": f"{it['service_name']} · {specimen['specimen_no']}", "charge": float(it["amount"] or 0), "received": None})
                if dept == "IMAGING" and exam and exam["completed_at"]:
                    d, t = _split_dt(exam["completed_at"])
                    events.append({"date": d, "time": t, "type": "imaging_completed", "title": "STAT imaging completed",
                                    "subtitle": it["service_name"], "charge": float(it["amount"] or 0), "received": None})
                if report and report["status"] == "released" and report["released_at"]:
                    d, t = _split_dt(report["released_at"])
                    label = "Laboratory report released" if dept == "LAB" else "Imaging report released"
                    events.append({"date": d, "time": t, "type": "report_released", "title": label,
                                    "subtitle": f"{it['service_name']} · Authorized report", "charge": None, "received": None,
                                    "report_id": report["id"]})
                cursor.execute(
                    "SELECT * FROM diag_critical_alerts WHERE order_item_id = ? ORDER BY raised_at",
                    (it["item_id"],),
                )
                for alert in cursor.fetchall():
                    d, t = _split_dt(alert["raised_at"])
                    events.append({"date": d, "time": t, "type": "critical_alert", "title": "Critical result flagged",
                                    "subtitle": alert["notes"] or "Critical value", "charge": None, "received": None})
                    if alert["resolved_at"]:
                        d2, t2 = _split_dt(alert["resolved_at"])
                        events.append({"date": d2, "time": t2, "type": "critical_ack", "title": "Critical result acknowledged",
                                        "subtitle": f"Contacted: {alert['contacted_person'] or '-'}", "charge": None, "received": None})
                if it["discharge_invoice_id"]:
                    invoice_ids.add(it["discharge_invoice_id"])

            cursor.execute(
                "SELECT * FROM pharmacy_sales WHERE patient_id = ? AND billing_type IN ('EMERGENCY', 'EMERGENCY_ACCOUNT', 'EMERGENCY_IMMEDIATE')"
                " AND sold_at >= ? AND sold_at <= ?",
                (patient_id, enc.get("arrival_at"), enc.get("disposition_at") or datetime.now()),
            )
            pharmacy_rows = [dict(r) for r in cursor.fetchall()]
            grouped = {}
            for r in pharmacy_rows:
                key = _iso(r["sold_at"])
                grouped.setdefault(key, []).append(r)
                if r.get("invoice_id"):
                    invoice_ids.add(r["invoice_id"])
            for sold_at, lines in grouped.items():
                d, t = _split_dt(sold_at)
                total = sum(float(l["amount"] or 0) for l in lines)
                events.append({
                    "date": d, "time": t, "type": "pharmacy_issued", "title": "Emergency pharmacy issued",
                    "subtitle": f"{len(lines)} item(s)", "charge": total, "received": total,
                    "items": [{"name": l["medicine_name"], "quantity": l["quantity"], "unit_price": float(l["unit_price"] or 0), "amount": float(l["amount"] or 0)} for l in lines],
                })

            if appointment_id:
                cursor.execute("SELECT id FROM invoices WHERE patient_id = ? AND appointment_id = ?", (patient_id, appointment_id))
                for inv in cursor.fetchall():
                    invoice_ids.add(inv["id"])
            for iid in list(invoice_ids):
                cursor.execute("SELECT * FROM invoice_payments WHERE invoice_id = ? ORDER BY created_at", (iid,))
                for pay in cursor.fetchall():
                    d, t = _split_dt(pay["created_at"])
                    events.append({"date": d, "time": t, "type": "payment", "title": "Payment received",
                                    "subtitle": f"{(pay['payment_mode'] or 'cash').upper()} · Receipt PMT-{pay['id']}",
                                    "charge": None, "received": float(pay["amount"] or 0)})

            if enc.get("disposition"):
                d, t = _split_dt(enc.get("disposition_at"))
                events.append({"date": d, "time": t, "type": "disposition", "title": "Disposition recorded",
                                "subtitle": f"{enc['disposition'].title()}" + (f" · {enc['disposition_notes']}" if enc.get("disposition_notes") else ""),
                                "charge": None, "received": None})

            lab_total = sum(float(it["amount"] or 0) for it in items if (it["department_type"] or "").upper() == "LAB")
            imaging_total = sum(float(it["amount"] or 0) for it in items if (it["department_type"] or "").upper() == "IMAGING")
            pharmacy_total = sum(float(r["amount"] or 0) for r in pharmacy_rows)
            categories = [c for c in [("Laboratory", lab_total), ("Imaging", imaging_total), ("Pharmacy", pharmacy_total)] if c[1] > 0]

            documents = [
                {"type": "lab_report", "label": "Lab report", "available": any(e["type"] == "report_released" and "Laboratory" in e["title"] for e in events), "ref": None},
                {"type": "imaging_report", "label": "Imaging report", "available": any(e["type"] == "report_released" and "Imaging" in e["title"] for e in events), "ref": None},
                {"type": "pharmacy_slip", "label": "Pharmacy issue slip", "available": len(pharmacy_rows) > 0, "ref": None},
                {"type": "final_bill", "label": "Final bill", "available": len(invoice_ids) > 0, "ref": None},
            ]

        total_charges = payments_received = outstanding = 0.0
        for iid in invoice_ids:
            cursor.execute("SELECT total_amount, paid_amount, due_amount FROM invoices WHERE id = ?", (iid,))
            inv = cursor.fetchone()
            if inv:
                total_charges += float(inv["total_amount"] or 0)
                payments_received += float(inv["paid_amount"] or 0)
                outstanding += float(inv["due_amount"] or 0)

        categories_sum = sum(amount for _, amount in categories)
        if categories_sum > total_charges:
            unaccounted = categories_sum - total_charges
            total_charges += unaccounted
            pharm_paid = sum(float(r.get("amount") or 0) for r in pharmacy_rows if not r.get("invoice_id"))
            payments_received += min(unaccounted, pharm_paid)
            outstanding = max(0.0, total_charges - payments_received)

        cursor.execute(
            "SELECT ip.id, ip.invoice_id, ip.amount, ip.payment_mode, ip.created_at, i.invoice_no "
            "FROM invoice_payments ip JOIN invoices i ON i.id = ip.invoice_id WHERE ip.invoice_id = ANY(?) ORDER BY ip.created_at",
            (list(invoice_ids) or [-1],),
        )
        payments = [
            {"date": _split_dt(p["created_at"])[0], "time": _split_dt(p["created_at"])[1],
             "mode": (p["payment_mode"] or "cash").title(), "reference": f"PMT-{p['id']}",
             "invoice_no": p["invoice_no"], "amount": float(p["amount"] or 0)}
            for p in cursor.fetchall()
        ]

        # Nursing Station shift notes -- inpatient ward activity, shown for
        # the admission currently selected in the encounter picker (notes
        # never explicitly linked to an admission still show, since they're
        # this patient's care record regardless of which stay they're
        # viewing).
        if admission_id:
            cursor.execute(
                "SELECT * FROM nursing_care_logs WHERE patient_id = ? AND (admission_id = ? OR admission_id IS NULL) ORDER BY id",
                (patient_id, admission_id),
            )
        else:
            cursor.execute(
                "SELECT * FROM nursing_care_logs WHERE patient_id = ? AND admission_id IS NULL ORDER BY id",
                (patient_id,),
            )
        for note in cursor.fetchall():
            nd, nt = _split_dt(note["created_at"]) if note["created_at"] else (_iso(note["log_date"]), note["log_time"])
            events.append({
                "date": nd, "time": nt, "type": "nursing_note",
                "title": f"Nursing note · {note['activity'] or 'Shift update'}",
                "subtitle": f"{note['nurse_name'] or 'Nurse'}" + (f" — {note['remarks']}" if note["remarks"] else ""),
                "charge": None, "received": None,
            })

        # Pharmacy and Diagnostic (lab/imaging/reports/critical-value alerts)
        # are deliberately not shown on this timeline -- the underlying
        # records still live in their own modules, this view just doesn't
        # surface them here.
        _excluded_types = {"pharmacy_issued", "lab_collected", "report_released", "imaging_completed", "critical_alert", "critical_ack"}
        events = [e for e in events if e.get("date") and e.get("type") not in _excluded_types]
        events.sort(key=lambda e: (e["date"], e.get("time") or ""))

        return {
            "patient": {
                "patient_id": patient_id, "name": _patient_name(patient),
                "age": patient.get("age"), "gender": patient.get("gender"),
            },
            "encounters": encounters,
            "selected": selected,
            "doctor_name": doctor_name,
            "events": events,
            "financial_summary": {
                "categories": [{"label": label, "amount": amount} for label, amount in categories],
                "total_charges": round(total_charges, 2),
                "payments_received": round(payments_received, 2),
                "outstanding": round(outstanding, 2),
                "status": "Settled" if outstanding <= 0 and total_charges > 0 else ("Pending" if total_charges > 0 else "No charges"),
            },
            "payments": payments,
            "documents": documents,
        }
