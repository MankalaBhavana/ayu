from fastapi import APIRouter, Body, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session
from database import get_db
from deps import get_current_user, require_permissions
from common import log_audit_event, client_ip
import dropdown_service as ds

router = APIRouter(prefix="/api/config", tags=["config"])

# Pharmacy-owned lists that pharmacy staff may manage from Pharmacy → Settings.
PHARMACY_CATEGORIES = {"dosage_forms", "unit_types", "storage_locations"}


def _ensure_can_manage(user: dict, category: str | None = None):
    role = (user.get("role") or "").lower()
    perms = user.get("permissions") or []
    if role in ("admin", "platform_admin", "employee") or "admin.use" in perms or "settings.write" in perms:
        return
    if (category or "").strip().lower() in PHARMACY_CATEGORIES and "pharmacy.write" in perms:
        return
    raise HTTPException(status_code=403, detail="Only administrators can manage dropdown configurations.")


@router.get("/dropdowns")
def list_dropdowns(category: str | None = None, active_only: bool = False,
                   user: dict = Depends(get_current_user)):
    return ds.get_all_dropdowns(category=category, active_only=active_only)


@router.post("/dropdowns")
def create_dropdown(request: Request, payload: dict = Body(...),
                    user: dict = Depends(get_current_user)):
    # Restrict dropdown configuration changes to authorized roles
    _ensure_can_manage(user, payload.get("category"))
    try:
        res = ds.add_dropdown_option(payload, user)
        try:
            log_audit_event(None, user, client_ip(request), "create_dropdown_option", "dropdown_configurations", str(res.get("id")), res)
        except Exception:
            pass
        return res
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/dropdowns/{option_id}")
def update_dropdown(option_id: int, request: Request, payload: dict = Body(...),
                    user: dict = Depends(get_current_user)):
    _ensure_can_manage(user, ds.get_option_category(option_id))
    try:
        res = ds.update_dropdown_option(option_id, payload, user)
        try:
            log_audit_event(None, user, client_ip(request), "update_dropdown_option", "dropdown_configurations", str(option_id), res)
        except Exception:
            pass
        return res
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/dropdowns/{option_id}")
def delete_dropdown(option_id: int, request: Request,
                    user: dict = Depends(get_current_user)):
    _ensure_can_manage(user, ds.get_option_category(option_id))
    try:
        res = ds.delete_dropdown_option(option_id, user)
        try:
            log_audit_event(None, user, client_ip(request), "delete_dropdown_option", "dropdown_configurations", str(option_id), res)
        except Exception:
            pass
        return res
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
