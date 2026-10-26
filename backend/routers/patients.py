import csv
import io
import os
from datetime import datetime

from fastapi import APIRouter, Body, Depends, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from database import get_db
from deps import require_permissions, current_hospital_id, get_current_user
from common import rows_to_dicts, row_to_dict, validate_required_fields, log_audit_event, client_ip, normalize_payment_mode
import legacy_queries as lq
import patient_journey
from storage import ObjectStorage
from ocr import extract_text_from_image
from export_utils import generate_pdf, generate_word

router = APIRouter(prefix="/api", tags=["patients"])
STORAGE = ObjectStorage()

_COUNTRY_PHONE_RULES = {
    "+91": ("India", 10), "+1": ("USA/Canada", 10), "+44": ("United Kingdom", 10),
    "+971": ("UAE", 9), "+61": ("Australia", 9), "+65": ("Singapore", 8), "+974": ("Qatar", 8),
    "+966": ("Saudi Arabia", 9), "+968": ("Oman", 8), "+965": ("Kuwait", 8), "+880": ("Bangladesh", 10),
    "+94": ("Sri Lanka", 9), "+977": ("Nepal", 10),
}


def _normalize_phone_for_country(value, country_code=None, required=False, field_label="Mobile number"):
    from phone import normalize_phone_number
    code = str(country_code or "+91").strip() or "+91"
    val = str(value) if value is not None else ""
    digits = normalize_phone_number(val, code)
    if not digits:
        return ("", f"{field_label} is required.") if required else ("", None)
    country_name, exact_len = _COUNTRY_PHONE_RULES.get(code, _COUNTRY_PHONE_RULES["+91"])
    if code == "+91" and len(digits) == 11 and digits.startswith("0"):
        digits = digits[1:]
    if len(digits) != exact_len:
        return digits, f"{country_name} {code} mobile number must be exactly {exact_len} digits."
    return digits, None


def _validate_patient_registration_payload(payload, is_update=False):
    errors = {}
    first_name = str(payload.get("name") or "").strip()
    age = str(payload.get("age") or "").strip()
    phone_country_code = str(payload.get("phone_country_code") or payload.get("primary_country_code") or "+91").strip() or "+91"
    family_country_code = str(payload.get("family_country_code") or "+91").strip() or "+91"
    emergency_country_code = str(payload.get("emergency_country_code") or "+91").strip() or "+91"
    phone, phone_error = _normalize_phone_for_country(payload.get("phone"), phone_country_code, required=True, field_label="Primary mobile")
    family_mobile, family_mobile_error = _normalize_phone_for_country(payload.get("family_mobile"), family_country_code, required=False, field_label="Alternate mobile")
    emergency_mobile, emergency_mobile_error = _normalize_phone_for_country(payload.get("emergency_mobile"), emergency_country_code, required=False, field_label="Emergency mobile")

    address = str(payload.get("address") or "").strip()
    dob = str(payload.get("dob") or "").strip()

    if not first_name:
        errors["name"] = "First name is required."
    if dob:
        parts = dob.split("-")
        if len(parts) != 3 or len(parts[0]) != 4:
            errors["dob"] = "Date of Birth must have a 4-digit year (YYYY-MM-DD)."
        else:
            try:
                from datetime import date
                d_year = int(parts[0])
                d_month = int(parts[1])
                d_day = int(parts[2])
                b_date = date(d_year, d_month, d_day)
                if b_date > date.today():
                    errors["dob"] = "Date of Birth cannot be in the future."
                elif d_year < 1900:
                    errors["dob"] = "Date of Birth cannot be earlier than 1900."
            except Exception:
                errors["dob"] = "Invalid Date of Birth."
    if age:
        try:
            age_value = int(float(age))
            if age_value < 0 or age_value > 150:
                errors["age"] = "Age must be between 0 and 150."
        except (TypeError, ValueError):
            errors["age"] = "Age must be a valid number."
    if phone_error:
        errors["phone"] = phone_error
    if family_mobile_error:
        errors["family_mobile"] = family_mobile_error
    if emergency_mobile_error:
        errors["emergency_mobile"] = emergency_mobile_error
    return errors, phone, family_mobile, emergency_mobile


def _get_patient_or_404(db, patient_id, hospital_id):
    patient = lq.get_patient(db, patient_id, hospital_id=hospital_id)
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")
    return patient


@router.get("/patients")
def patients_list(q: str | None = None, visit_status: str | None = None, db: Session = Depends(get_db),
                   user: dict = Depends(require_permissions("patients.read")), hospital_id: int = Depends(current_hospital_id)):
    query = (q or "").strip()
    vs = (visit_status or "").strip().lower()
    patients = lq.search_patients(db, query, hospital_id=hospital_id, visit_status=vs) if query else lq.get_all_patients(db, hospital_id=hospital_id, visit_status=vs)
    return {"patients": rows_to_dicts(patients)}


@router.get("/insurance-providers")
def insurance_providers_list(db: Session = Depends(get_db), user: dict = Depends(get_current_user)):
    return {"providers": rows_to_dicts(lq.list_insurance_providers(db))}


@router.post("/insurance-providers")
def insurance_providers_create(request: Request, payload: dict = Body(...), db: Session = Depends(get_db),
                                user: dict = Depends(require_permissions("patients.write"))):
    validate_required_fields(payload, ["name"])
    try:
        provider = lq.create_insurance_provider(
            db, payload.get("name"),
            contact_person=payload.get("contact_person"),
            contact_phone=payload.get("contact_phone"),
            notes=payload.get("notes"),
            username=user.get("username"),
        )
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    log_audit_event(db, user, client_ip(request), "create", "insurance_providers", str(provider["id"]), {"name": provider["name"]})
    return {"provider": row_to_dict(provider)}


@router.get("/patients/next-id")
def patients_next_id(db: Session = Depends(get_db), user: dict = Depends(get_current_user),
                      hospital_id: int = Depends(current_hospital_id)):
    return {"patient_id": lq.generate_patient_id(db, hospital_id=hospital_id)}


@router.post("/patients")
def patients_create(request: Request, payload: dict = Body(...), db: Session = Depends(get_db),
                     user: dict = Depends(require_permissions("patients.write")), hospital_id: int = Depends(current_hospital_id)):
    validation_errors, normalized_phone, normalized_family_mobile, normalized_emergency_mobile = _validate_patient_registration_payload(payload)
    if validation_errors:
        raise HTTPException(status_code=400, detail={"error": "Patient registration validation failed.", "fields": validation_errors})

    duplicate = lq.check_duplicate_patient(db, payload.get("name"), payload.get("last_name"), payload.get("dob"),
                                            payload.get("gender"), normalized_phone, hospital_id=hospital_id)
    if duplicate:
        raise HTTPException(status_code=409, detail={
            "error": f"Patient already exists with UHID: {duplicate['patient_id']}.",
            "duplicate": row_to_dict(duplicate),
        })

    patient_id = lq.generate_patient_id(db, hospital_id=hospital_id)

    allergy_text = str(payload.get("allergies") or "").strip()
    no_known_allergies = bool(payload.get("no_known_allergies"))
    allergy_status = "has_allergies" if allergy_text else ("confirmed_none" if no_known_allergies else "not_recorded")

    data = {
        "patient_id": patient_id,
        "name": str(payload.get("name") or "").strip(),
        "middle_name": str(payload.get("middle_name") or "").strip() or None,
        "last_name": str(payload.get("last_name") or "").strip(),
        "dob": payload.get("dob") if payload.get("dob") else None,
        "age": int(float(payload.get("age"))) if payload.get("age") else None,
        "weight": float(payload.get("weight")) if payload.get("weight") else None,
        "height": float(payload.get("height")) if payload.get("height") else None,
        "gender": str(payload.get("gender") or "").strip() if payload.get("gender") else None,
        "pregnant": 1 if (str(payload.get("gender") or "").strip().lower() == "female" and payload.get("pregnant")) else 0,
        "allergies": allergy_text or None,
        "allergy_status": allergy_status,
        "symptoms": payload.get("symptoms") if payload.get("symptoms") else None,
        "phone": normalized_phone,
        "address": str(payload.get("address") or "").strip() if payload.get("address") else None,
        "emergency_contact": str(payload.get("emergency_contact") or "").strip() if payload.get("emergency_contact") else None,
        "emergency_relation": str(payload.get("emergency_relation") or "").strip() if payload.get("emergency_relation") else None,
        "family_mobile": normalized_family_mobile or None,
        "marital_status": str(payload.get("marital_status") or "").strip() or None,
        "nationality": str(payload.get("nationality") or "").strip() or None,
        "email": str(payload.get("email") or "").strip() or None,
        "emergency_mobile": normalized_emergency_mobile or None,
        "insurance_provider": str(payload.get("insurance_provider") or "").strip() or None,
        "insurance_policy_no": str(payload.get("insurance_policy_no") or "").strip() or None,
    }
    lq.add_patient(db, data, hospital_id=hospital_id)
    visit_type = str(payload.get("visit_type") or "OP").strip().upper()
    admission_id = lq.add_admission(db, patient_id, "Inpatient registration", hospital_id=hospital_id) if visit_type == "IP" else None
    log_audit_event(db, user, client_ip(request), "create", "patients", patient_id, {"admission_id": admission_id})
    return {"status": "ok", "patient_id": patient_id, "admission_id": admission_id}


@router.get("/patients/{patient_id}/last-consultation")
def get_patient_last_consultation(patient_id: str, db: Session = Depends(get_db),
                                   user: dict = Depends(require_permissions("patients.read")), hospital_id: int = Depends(current_hospital_id)):
    _get_patient_or_404(db, patient_id, hospital_id)
    appointments = lq.list_appointments(db, patient_id=patient_id)
    completed = [a for a in appointments if str(a["status"] or "").strip().lower() in ("completed", "finished", "consulted", "done")]
    if not completed:
        return None
    return row_to_dict(completed[-1])


@router.get("/patients/{patient_id}/active-admission")
def patient_active_admission(patient_id: str, db: Session = Depends(get_db),
                              user: dict = Depends(require_permissions("patients.read")), hospital_id: int = Depends(current_hospital_id)):
    _get_patient_or_404(db, patient_id, hospital_id)
    import legacy_sql
    with legacy_sql.get_connection(db) as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT a.id as admission_id, a.admission_date, a.notes,
                   b.id as allocation_id, b.ward, b.room_no, b.bed_no,
                   COALESCE(b.amount_per_day, b.daily_charge, 0) as amount_per_day,
                   b.allocated_at, b.status as bed_status, b.assigned_doctor
            FROM admissions a
            LEFT JOIN bed_allocations b ON (b.admission_id = a.id OR b.patient_id = a.patient_id) AND b.status = 'active'
            WHERE a.patient_id = ? AND a.discharge_date IS NULL AND COALESCE(a.notes, '') != 'Initial registration'
            ORDER BY a.admission_date DESC LIMIT 1
            """,
            (patient_id,),
        )
        row = cursor.fetchone()
        if row:
            return {
                "is_inpatient": True, "admission_id": row["admission_id"], "allocation_id": row["allocation_id"],
                "ward": row["ward"] or "General", "room_no": row["room_no"] or "", "bed_no": row["bed_no"] or "Pending Allotment",
                "amount_per_day": float(row["amount_per_day"] or 0),
                "allocated_at": str(row["allocated_at"]) if row["allocated_at"] else None,
                "admission_date": str(row["admission_date"]) if row["admission_date"] else None,
                "assigned_doctor": row["assigned_doctor"],
            }
        return {"is_inpatient": False}


@router.post("/patients/{patient_id}/verify-insurance")
def patients_verify_insurance(patient_id: str, request: Request, payload: dict = Body(default={}), db: Session = Depends(get_db),
                               user: dict = Depends(require_permissions("pharmacy.dispense")), hospital_id: int = Depends(current_hospital_id)):
    """Records that a staff member has checked this patient's insurance is
    active and covers the treatment -- same manual eligibility check any
    real pharmacy does (phone/portal with the TPA or insurer) before billing
    them. There is no live insurer API to call, so this is the honest
    record of that human verification step, not an automated pass/fail."""
    patient = lq.get_patient(db, patient_id, hospital_id=hospital_id)
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")
    if not patient["insurance_provider"] or not patient["insurance_policy_no"]:
        raise HTTPException(status_code=400, detail="This patient has no insurance provider/policy number on record. Update their registration first.")
    payload = payload or {}
    reference = str(payload.get("reference") or "").strip() or None
    username = user.get("username")
    import legacy_sql
    with legacy_sql.get_connection(db) as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            UPDATE patients
            SET insurance_verified = TRUE, insurance_verified_by = ?, insurance_verified_at = CURRENT_TIMESTAMP, insurance_verification_ref = ?
            WHERE patient_id = ? AND hospital_id = ?
            """,
            (username, reference, patient_id, hospital_id),
        )
        conn.commit()
    log_audit_event(db, user, client_ip(request), "verify", "patients", patient_id, {"insurance_provider": patient["insurance_provider"], "reference": reference})
    return {"status": "ok", "verified_by": username, "reference": reference}


@router.get("/patients/{patient_id}")
def patients_read(patient_id: str, db: Session = Depends(get_db), user: dict = Depends(require_permissions("patients.read")),
                   hospital_id: int = Depends(current_hospital_id)):
    patient = lq.get_patient_details(db, patient_id, hospital_id=hospital_id)
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")
    return {"patient": patient}


@router.get("/patients/{patient_id}/journey")
def patients_journey(patient_id: str, encounter_type: str | None = None, encounter_id: int | None = None,
                      db: Session = Depends(get_db), user: dict = Depends(require_permissions("patients.read"))):
    journey = patient_journey.get_patient_journey(db, patient_id, encounter_type, encounter_id)
    if journey is None:
        raise HTTPException(status_code=404, detail="Patient not found")
    return journey


@router.put("/patients/{patient_id}")
def patients_update(patient_id: str, request: Request, payload: dict = Body(...), db: Session = Depends(get_db),
                     user: dict = Depends(require_permissions("patients.write")), hospital_id: int = Depends(current_hospital_id)):
    _get_patient_or_404(db, patient_id, hospital_id)
    validation_errors, normalized_phone, normalized_family_mobile, normalized_emergency_mobile = _validate_patient_registration_payload(payload, is_update=True)
    if validation_errors:
        raise HTTPException(status_code=400, detail={"error": "Patient validation failed.", "fields": validation_errors})

    payload["phone"] = normalized_phone
    if normalized_family_mobile:
        payload["family_mobile"] = normalized_family_mobile
    if normalized_emergency_mobile:
        payload["emergency_mobile"] = normalized_emergency_mobile

    allergy_text = str(payload.get("allergies") or "").strip()
    no_known_allergies = bool(payload.get("no_known_allergies"))
    payload["allergy_status"] = "has_allergies" if allergy_text else ("confirmed_none" if no_known_allergies else "not_recorded")
    payload["allergies"] = allergy_text or None

    updated = lq.update_patient(db, patient_id, payload, hospital_id=hospital_id)
    if not updated:
        raise HTTPException(status_code=500, detail="Patient update failed")
    log_audit_event(db, user, client_ip(request), "update", "patients", patient_id, payload)
    return {"status": "ok"}


@router.delete("/patients/{patient_id}")
def patients_delete(patient_id: str, request: Request, db: Session = Depends(get_db),
                     user: dict = Depends(require_permissions("patients.write")), hospital_id: int = Depends(current_hospital_id)):
    if not lq.delete_patient(db, patient_id, hospital_id=hospital_id):
        raise HTTPException(status_code=404, detail="Patient not found")
    log_audit_event(db, user, client_ip(request), "delete", "patients", patient_id)
    return {"status": "ok"}


@router.get("/patients/{patient_id}/admissions")
def admissions_list(patient_id: str, db: Session = Depends(get_db), user: dict = Depends(require_permissions("patients.read")),
                     hospital_id: int = Depends(current_hospital_id)):
    _get_patient_or_404(db, patient_id, hospital_id)
    return {"admissions": rows_to_dicts(lq.get_admissions(db, patient_id, hospital_id=hospital_id))}


@router.post("/patients/{patient_id}/admissions")
def admissions_create(patient_id: str, request: Request, payload: dict = Body(...), db: Session = Depends(get_db),
                       user: dict = Depends(require_permissions("patients.write")), hospital_id: int = Depends(current_hospital_id)):
    patient = _get_patient_or_404(db, patient_id, hospital_id)
    notes = payload.get("notes", "")
    from routers.clinical import _validate_vitals_in_notes
    vitals_err = _validate_vitals_in_notes(notes)
    if vitals_err:
        raise HTTPException(status_code=400, detail=vitals_err)

    # Check if patient is already in queue with an active consultation for today
    now_dt = lq.current_ist_datetime() if hasattr(lq, "current_ist_datetime") else datetime.now()
    appointment_day = now_dt.strftime("%Y-%m-%d")
    with lq.get_connection(db) as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT id, status, token_no 
            FROM appointments 
            WHERE patient_id = ? 
              AND DATE(appointment_date) = DATE(?) 
              AND status IN ('scheduled', 'checked_in', 'in_consultation', 'waiting', 'arrived')
            ORDER BY id DESC LIMIT 1
            """,
            (patient_id, appointment_day),
        )
        active_appointment = cursor.fetchone()
        if active_appointment:
            raw_st = str(active_appointment["status"] or "waiting").lower()
            status_display = "In Consultation" if raw_st in ("in_consultation", "consulting") else "In Queue"
            token_display = f" (Token #{active_appointment['token_no']})" if active_appointment.get("token_no") else ""
            raise HTTPException(
                status_code=400,
                detail=f"Patient is already in queue{token_display} with status '{status_display}'. Please complete the existing consultation before creating a re-visit."
            )

    admission_id = lq.add_admission(db, patient_id, notes, hospital_id=hospital_id)
    log_audit_event(db, user, client_ip(request), "create", "admissions", str(admission_id), {"patient_id": patient_id})

    review_fee = payload.get("review_fee")
    doctor_name = payload.get("doctor_name")
    department = payload.get("department")
    invoice_id = None
    if review_fee:
        try:
            review_fee_val = float(review_fee)
            if review_fee_val > 0:
                payment_mode = normalize_payment_mode(payload.get("payment_mode"))
                invoice_no = f"INV-OP-{lq.current_ist_datetime().strftime('%Y%m%d%H%M%S%f')}"
                invoice_id = lq.create_invoice(db, {
                    "invoice_no": invoice_no, "patient_id": patient_id, "module": "OP",
                    "doctor_name": doctor_name, "total_amount": review_fee_val, "paid_amount": 0,
                    "advance_amount": 0, "refunded_amount": 0, "payment_status": "due", "created_by": user.get("username"),
                })
                lq.record_invoice_payment(db, invoice_id, {"amount": review_fee_val, "payment_mode": payment_mode})
        except (ValueError, TypeError):
            pass

    # Automatically create the OP appointment / queue token for this re-visit / follow-up
    # so it immediately appears in OP Queue Management
    appointment_id = None
    token_no = None
    try:
        patient_name = " ".join(p for p in [patient.get("name"), patient.get("middle_name"), patient.get("last_name")] if p).strip() or patient_id
        appointment_datetime_str = now_dt.strftime("%Y-%m-%d %H:%M:%S")
        fee_to_use = float(review_fee) if review_fee is not None else 0.0
        appointment_id, token_no = lq.create_appointment(db, {
            "patient_id": patient_id,
            "patient_name": patient_name,
            "visit_type": "Re-visit",
            "department": department or "General Medicine",
            "doctor_name": doctor_name or "General",
            "appointment_date": appointment_datetime_str,
            "status": "scheduled",
            "appointment_kind": "follow_up",
            "consultation_fee": fee_to_use,
            "notes": notes,
        })
        if invoice_id and appointment_id:
            try:
                with lq.get_connection(db) as conn:
                    conn.cursor().execute("UPDATE invoices SET appointment_id = ? WHERE id = ?", (appointment_id, invoice_id))
                    conn.commit()
            except Exception:
                pass

        # Record vitals into patient_vitals table if vitals exist in notes
        try:
            import re
            bp_m = re.search(r"BP:\s*([^\s|]+)", notes, re.I)
            pulse_m = re.search(r"Pulse:\s*([^\s|]+)", notes, re.I)
            temp_m = re.search(r"Temp(?:erature)?:\s*([^\s|]+)", notes, re.I)
            spo2_m = re.search(r"SpO2:\s*([^\s|]+)", notes, re.I)
            h_m = re.search(r"Height:\s*([^\s|]+)", notes, re.I)
            w_m = re.search(r"Weight:\s*([^\s|]+)", notes, re.I)
            if any([bp_m, pulse_m, temp_m, spo2_m, h_m, w_m]):
                with lq.get_connection(db) as conn:
                    conn.cursor().execute(
                        """
                        INSERT INTO patient_vitals (hospital_id, patient_id, patient_name, bp, pulse, temperature, spo2, height, weight, recorded_at, encounter_id, admission_id)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                        (hospital_id, patient_id, patient_name,
                         bp_m.group(1) if bp_m else None,
                         pulse_m.group(1) if pulse_m else None,
                         temp_m.group(1) if temp_m else None,
                         spo2_m.group(1) if spo2_m else None,
                         float(h_m.group(1)) if (h_m and h_m.group(1).replace(".", "", 1).isdigit()) else None,
                         float(w_m.group(1)) if (w_m and w_m.group(1).replace(".", "", 1).isdigit()) else None,
                         now_dt, appointment_id, admission_id)
                    )
                    conn.commit()
        except Exception as e:
            print(f"[WARN] Could not record vitals in patient_vitals: {e}")
    except HTTPException:
        raise
    except ValueError as val_err:
        raise HTTPException(status_code=400, detail=str(val_err))
    except Exception as exc:
        print(f"[ERROR] Could not auto-create re-visit appointment: {exc}")
        raise HTTPException(status_code=400, detail=f"Could not create queue appointment for re-visit: {exc}")

    return {"admission_id": admission_id, "appointment_id": appointment_id, "token_no": token_no}


@router.get("/patients/{patient_id}/documents")
def documents_list(patient_id: str, db: Session = Depends(get_db), user: dict = Depends(require_permissions("patients.read")),
                    hospital_id: int = Depends(current_hospital_id)):
    _get_patient_or_404(db, patient_id, hospital_id)
    return {"documents": rows_to_dicts(lq.get_documents(db, patient_id, hospital_id=hospital_id))}


@router.post("/patients/{patient_id}/documents")
def documents_create(patient_id: str, db: Session = Depends(get_db), user: dict = Depends(require_permissions("patients.write")),
                      hospital_id: int = Depends(current_hospital_id), file: UploadFile = File(...),
                      doc_type: str = Form("document"), admission_id: str | None = Form(None),
                      ocr_text: str = Form(""), ocr_language: str = Form("en")):
    _get_patient_or_404(db, patient_id, hospital_id)
    file_bytes = file.file.read()
    if len(file_bytes) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File is too large (max 10MB).")
    filepath = STORAGE.store(doc_type, file.filename or "document", file_bytes, file.content_type)
    document_id = lq.add_document(
        db, patient_id, int(admission_id) if admission_id else None, doc_type, filepath, ocr_text, ocr_language,
        file_name=file.filename, mime_type=file.content_type, file_data=None, hospital_id=hospital_id,
    )
    return {"document_id": document_id, "file_path": filepath, "stored_in_db": False}


@router.get("/documents/{document_id}/file")
def document_file(document_id: int, db: Session = Depends(get_db), user: dict = Depends(require_permissions("patients.read")),
                   hospital_id: int = Depends(current_hospital_id)):
    document = lq.get_document(db, document_id, hospital_id=hospital_id)
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    mime_type = document["mime_type"] or "application/octet-stream"
    file_name = document["file_name"] or os.path.basename(document["file_path"] or "") or "document.bin"

    file_data = document["file_data"]
    if file_data:
        return StreamingResponse(io.BytesIO(file_data), media_type=mime_type, headers={"Content-Disposition": f'inline; filename="{file_name}"'})
    file_bytes = STORAGE.read(document["file_path"])
    if file_bytes:
        return StreamingResponse(io.BytesIO(file_bytes), media_type=mime_type, headers={"Content-Disposition": f'inline; filename="{file_name}"'})
    raise HTTPException(status_code=404, detail="Document file content unavailable")


@router.delete("/documents/{document_id}")
def document_delete(document_id: int, db: Session = Depends(get_db), user: dict = Depends(require_permissions("patients.write")),
                     hospital_id: int = Depends(current_hospital_id)):
    document = lq.get_document(db, document_id, hospital_id=hospital_id)
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    if not lq.delete_document(db, document_id, hospital_id=hospital_id):
        raise HTTPException(status_code=404, detail="Document not found")
    STORAGE.delete(document["file_path"])
    return {"status": "ok"}


@router.post("/documents/{document_id}/ocr")
def document_process_ocr(document_id: int, payload: dict = Body(default={}), db: Session = Depends(get_db),
                          user: dict = Depends(require_permissions("patients.write")), hospital_id: int = Depends(current_hospital_id)):
    document = lq.get_document(db, document_id, hospital_id=hospital_id)
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    payload = payload if isinstance(payload, dict) else {}
    requested_language = payload.get("language") or document["ocr_language"] or "en"
    file_name = document["file_name"] or os.path.basename(document["file_path"] or "") or "document"

    file_bytes = document["file_data"]
    if not file_bytes:
        file_path = document["file_path"]
        if not file_path:
            raise HTTPException(status_code=404, detail="Document file content unavailable")
        file_bytes = STORAGE.read(file_path)
        if not file_bytes:
            raise HTTPException(status_code=404, detail="Document file content unavailable")

    ocr_text = extract_text_from_image(file_bytes, requested_language, document["doc_type"], filename=file_name)
    if isinstance(ocr_text, str) and ocr_text.startswith("OCR Error:"):
        raise HTTPException(status_code=400, detail=ocr_text)

    if not lq.update_document_ocr(db, document_id, ocr_text, requested_language, hospital_id=hospital_id):
        raise HTTPException(status_code=404, detail="Document not found")
    return {"document_id": document_id, "ocr_text": ocr_text, "ocr_language": requested_language, "updated": True}


@router.post("/ocr")
def ocr_extract(user: dict = Depends(require_permissions("patients.write")), file: UploadFile = File(...),
                 language: str = Form("en"), doc_type: str = Form("document")):
    content = file.file.read()
    text = extract_text_from_image(content, language, doc_type, filename=file.filename)
    return {"text": text}


@router.post("/export/pdf")
def export_pdf(payload: dict = Body(...), user: dict = Depends(require_permissions("patients.write"))):
    pdf_bytes = generate_pdf(payload.get("patient_name", ""), payload.get("doc_type", "document"), payload.get("ocr_text", ""), payload.get("date"))
    return StreamingResponse(io.BytesIO(pdf_bytes), media_type="application/pdf", headers={"Content-Disposition": 'attachment; filename="document.pdf"'})


@router.post("/export/word")
def export_word(payload: dict = Body(...), user: dict = Depends(require_permissions("patients.write"))):
    word_bytes = generate_word(payload.get("patient_name", ""), payload.get("doc_type", "document"), payload.get("ocr_text", ""), payload.get("date"))
    return StreamingResponse(io.BytesIO(word_bytes), media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                              headers={"Content-Disposition": 'attachment; filename="document.docx"'})


@router.get("/export/patients/csv")
def export_patients_csv(q: str | None = None, db: Session = Depends(get_db), user: dict = Depends(require_permissions("patients.read")),
                         hospital_id: int = Depends(current_hospital_id)):
    query = (q or "").strip()
    patients = lq.search_patients(db, query, hospital_id=hospital_id) if query else lq.get_all_patients(db, hospital_id=hospital_id)

    csv_stream = io.StringIO()
    writer = csv.writer(csv_stream)
    headers = ["patient_id", "name", "middle_name", "last_name", "dob", "age", "weight", "height", "gender",
               "pregnant", "allergies", "symptoms", "phone", "created_at", "updated_at"]
    writer.writerow(headers)
    for row in patients:
        item = row_to_dict(row)
        row_values = []
        for header in headers:
            val = item.get(header)
            if header == "pregnant":
                val = "" if str(item.get("gender") or "").strip().lower() != "female" else ("Yes" if val else "No")
            row_values.append(val if val is not None else "")
        writer.writerow(row_values)

    filename_suffix = lq.current_ist_datetime().strftime("%Y%m%d_%H%M%S")
    return StreamingResponse(io.BytesIO(csv_stream.getvalue().encode("utf-8-sig")), media_type="text/csv",
                              headers={"Content-Disposition": f'attachment; filename="patients_{filename_suffix}.csv"'})
