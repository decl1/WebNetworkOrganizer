"""Sysinfo router: custom per-host console parameters and their values."""

from fastapi import APIRouter, HTTPException

from ..schemas.sysinfo import (
    SysInfoCheckOut,
    SysInfoParamOut,
    SysInfoParamsReplace,
    SysInfoResultOut,
)
from ..services import hosts_service, sysinfo_service

router = APIRouter(tags=["sysinfo"])


@router.get("/api/hosts/{host_id}/sysinfo", response_model=SysInfoCheckOut)
def get_sysinfo(host_id: int) -> SysInfoCheckOut:
    """Evaluate all sysinfo parameters of a host over SSH."""
    result = sysinfo_service.check_sysinfo(host_id)
    if result is None:
        raise HTTPException(status_code=404, detail="Host not found")
    return SysInfoCheckOut(
        error=result["error"],
        results=[SysInfoResultOut(**item) for item in result["results"]],
    )


@router.get("/api/hosts/{host_id}/sysinfo/params", response_model=list[SysInfoParamOut])
def get_sysinfo_params(host_id: int) -> list[SysInfoParamOut]:
    """Return the sysinfo parameter definitions of a host (seeding defaults when it has none)."""
    if hosts_service.get_host(host_id) is None:
        raise HTTPException(status_code=404, detail="Host not found")
    return [SysInfoParamOut(**row) for row in sysinfo_service.list_params(host_id)]


@router.put("/api/hosts/{host_id}/sysinfo/params", response_model=list[SysInfoParamOut])
def put_sysinfo_params(host_id: int, body: SysInfoParamsReplace) -> list[SysInfoParamOut]:
    """Replace all sysinfo parameters of a host."""
    if hosts_service.get_host(host_id) is None:
        raise HTTPException(status_code=404, detail="Host not found")
    rows = sysinfo_service.replace_params(host_id, [param.model_dump() for param in body.params])
    return [SysInfoParamOut(**row) for row in rows]