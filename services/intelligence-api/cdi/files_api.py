"""Company Files HTTP surface (doc 17, ADR-018). User routes need a verified ERP delegation (called by the ERP BFF);
console routes need a curator. Nothing here changes ERP."""

from typing import Annotated, Literal
from urllib.parse import quote
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel, ConfigDict, Field

from . import files
from .agent.console import curator
from .agent.erp_client import ERPAgentError
from .delegation import delegated_actor
from .extract import ExtractError

router = APIRouter(prefix="/api/files")
console = APIRouter(prefix="/api/console/files")
ENTITY_TYPE = r"^[a-z_]{2,40}$"


def _call(fn, *args, **kwargs):
    try:
        return fn(*args, **kwargs)
    except files.FilesError as exc:
        raise HTTPException(exc.status, str(exc)) from exc
    except ExtractError as exc:
        raise HTTPException(422, str(exc)) from exc
    except ERPAgentError as exc:
        raise HTTPException(403 if exc.status in (401, 403) else 502, "ERP menolak atau belum dapat dihubungi") from exc


def _link(entity_type, entity_id, label=None, href=None):
    if not entity_type or not entity_id:
        return None
    return {
        "type": entity_type,
        "id": str(entity_id),
        "label": (label or "")[:200] or None,
        "href": (href or "")[:300] or None,
    }


@router.get("/kinds")
def kinds(user=Depends(delegated_actor)):
    access = _call(files.access_of, user)
    return {
        "kinds": files.catalog()["kinds"],
        "access": {k: access.get(k) for k in ("owner", "general", "divisions", "commercial", "personal")},
    }


@router.post("", status_code=201)
def upload(
    file: UploadFile = File(...),
    kind: str = Form(..., max_length=40),
    access_class: str | None = Form(default=None, max_length=20),
    owner_division: str | None = Form(default=None, max_length=40),
    title: str | None = Form(default=None, max_length=200),
    entity_type: str | None = Form(default=None, pattern=ENTITY_TYPE),
    entity_id: UUID | None = Form(default=None),
    entity_label: str | None = Form(default=None, max_length=200),
    entity_href: str | None = Form(default=None, max_length=300),
    user=Depends(delegated_actor),
):
    body = file.file.read(files.MAX_BYTES + 1)
    return _call(
        files.create_managed,
        user,
        file.filename or "berkas",
        body,
        kind=kind,
        access_class=access_class,
        owner_division=owner_division,
        title=title,
        link=_link(entity_type, entity_id, entity_label, entity_href),
    )


class SaveAttachment(BaseModel):
    model_config = ConfigDict(extra="forbid")
    dataset_id: UUID
    kind: str = Field(max_length=40)
    access_class: Literal["general", "division", "commercial", "personal"] | None = None
    owner_division: str | None = Field(default=None, max_length=40)
    title: str | None = Field(default=None, max_length=200)


@router.post("/from-attachment", status_code=201)
def save_attachment(body: SaveAttachment, user=Depends(delegated_actor)):
    """M6.x: save an Agent attachment (working context) as a governed Company File, explicitly and reviewed."""
    return _call(
        files.save_attachment,
        user,
        str(body.dataset_id),
        kind=body.kind,
        access_class=body.access_class,
        owner_division=body.owner_division,
        title=body.title,
    )


@router.get("")
def search(
    q: Annotated[str, Query(max_length=200)] = "",
    kind: Annotated[list[str] | None, Query()] = None,
    entity_type: Annotated[str | None, Query(pattern=ENTITY_TYPE)] = None,
    entity_id: UUID | None = None,
    limit: Annotated[int, Query(ge=1, le=50)] = 20,
    user=Depends(delegated_actor),
):
    entity = {"type": entity_type, "id": str(entity_id)} if entity_type and entity_id else None
    return {"items": _call(files.search, user, q.strip(), kinds=kind, entity=entity, limit=limit, purpose="ui")}


@router.get("/{file_id}")
def detail(file_id: UUID, user=Depends(delegated_actor)):
    return _call(files.detail, user, str(file_id))


@router.get("/{file_id}/content")
def content(file_id: UUID, action: Literal["preview", "download"] = "download", user=Depends(delegated_actor)):
    body, media, name = _call(files.content, user, str(file_id), action)
    return Response(
        body,
        media_type=media or "application/octet-stream",
        headers={"Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "X-File-Name": quote(name)},
    )


@router.post("/{file_id}/opened")
def opened(file_id: UUID, user=Depends(delegated_actor)):
    """An ERP-origin file opened from Company Files: logged; returns where ERP opens it."""
    return {"open_url": _call(files.log_open, user, str(file_id))}


@router.post("/{file_id}/versions", status_code=201)
def new_version(file_id: UUID, file: UploadFile = File(...), user=Depends(delegated_actor)):
    return _call(files.add_version, user, str(file_id), file.filename or "berkas", file.file.read(files.MAX_BYTES + 1))


class Action(BaseModel):
    model_config = ConfigDict(extra="forbid")
    action: Literal["withdraw", "reclassify", "link"]
    access_class: Literal["general", "division", "commercial", "personal"] | None = None
    owner_division: str | None = Field(default=None, max_length=40)
    entity_type: str | None = Field(default=None, pattern=ENTITY_TYPE)
    entity_id: UUID | None = None
    entity_label: str | None = Field(default=None, max_length=200)
    entity_href: str | None = Field(default=None, max_length=300)


@router.post("/{file_id}")
def act(file_id: UUID, body: Action, user=Depends(delegated_actor)):
    link = _link(body.entity_type, body.entity_id, body.entity_label, body.entity_href)
    if body.action == "link" and not link:
        raise HTTPException(422, "Pilih record untuk ditautkan")
    return _call(
        files.act,
        user,
        str(file_id),
        body.action,
        access_class=body.access_class,
        owner_division=body.owner_division,
        link=link,
    )


# ── Brain Console ──────────────────────────────────────────────────────────────────────────────────────────────────
@console.get("")
def overview(user=Depends(curator)):
    return files.console_overview()


@console.post("/{file_id}/versions/{version}/retry")
def retry(file_id: UUID, version: int, user=Depends(curator)):
    if not files.retry(str(file_id), version):
        raise HTTPException(409, "Only a failed version can be retried")
    return {"queued": True}


@console.post("/{file_id}/withdraw")
def withdraw(file_id: UUID, user=Depends(curator)):
    if not files.withdraw_held(str(file_id)):
        raise HTTPException(409, "Only a held file can be withdrawn here")
    return {"withdrawn": True}
