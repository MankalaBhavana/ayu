from fastapi import APIRouter, Body, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session
from database import get_db
from deps import get_current_user, require_permissions
from common import log_audit_event, client_ip
import dropdown_service as ds

router = APIRouter(prefix="/api/config", tags=["config"])


@router.get("/dropdowns")
def list_dropdowns(category: str | None = None, active_only: bool = False,
                   user: dict = Depends(get_current_user)):
    return ds.get_all_dropdowns(category=category, active_only=active_only)


@router.post("/dropdowns")
def create_dropdown(request: Request, payload: dict = Body(...),
                    user: dict = Depends(get_current_user)):
    # Restrict dropdown configuration changes to authorized roles
    role = (user.get("role") or "").lower()
    perms = user.get("permissions") or []
    if role not in ("admin", "platform_admin", "employee") and "admin.use" not in perms and "settings.write" not in perms:
        raise HTTPException(status_code=403, detail="Only administrators can manage dropdown configurations.")
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
    role = (user.get("role") or "").lower()
    perms = user.get("permissions") or []
    if role not in ("admin", "platform_admin", "employee") and "admin.use" not in perms and "settings.write" not in perms:
        raise HTTPException(status_code=403, detail="Only administrators can manage dropdown configurations.")
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
    role = (user.get("role") or "").lower()
    perms = user.get("permissions") or []
    if role not in ("admin", "platform_admin", "employee") and "admin.use" not in perms and "settings.write" not in perms:
        raise HTTPException(status_code=403, detail="Only administrators can manage dropdown configurations.")
    try:
        res = ds.delete_dropdown_option(option_id, user)
        try:
            log_audit_event(None, user, client_ip(request), "delete_dropdown_option", "dropdown_configurations", str(option_id), res)
        except Exception:
            pass
        return res
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
