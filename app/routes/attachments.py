import hashlib
import re
from pathlib import PurePosixPath
from urllib.parse import quote

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from fastapi.responses import Response
from sqlalchemy import func, select

from app.db import audit, get_db, lock_configuration
from app.models import Attachment, LeaveRequest, new_id
from app.permissions import can_view_private, managed_departments
from app.security import current_user
from app.uploads import bounded_file, parse_document

router = APIRouter(prefix="/api/requests", tags=["Justificantes"])


def accessible(db, me, request_id):
    item = db.get(LeaveRequest, request_id)
    if not item or not can_view_private(me, item, managed_departments(db, me)):
        raise HTTPException(404, "Solicitud no encontrada")
    return item


def attachment_json(item):
    return {
        "id": item.id,
        "filename": item.filename,
        "mimeType": item.mime_type,
        "sizeBytes": item.size_bytes,
        "uploadedBy": item.uploaded_by,
        "uploadedAt": item.uploaded_at.isoformat(),
    }


@router.get("/{request_id}/attachments")
def list_attachments(request_id: str, me=Depends(current_user), db=Depends(get_db)):
    accessible(db, me, request_id)
    rows = db.scalars(
        select(Attachment)
        .where(Attachment.request_id == request_id)
        .order_by(Attachment.uploaded_at)
    )
    return {"attachments": [attachment_json(row) for row in rows]}


@router.post("/{request_id}/attachments")
def upload_attachment(
    request_id: str,
    request: Request,
    file: UploadFile = File(),
    me=Depends(current_user),
    db=Depends(get_db),
):
    item = accessible(db, me, request_id)
    if item.type != "baja":
        raise HTTPException(400, "Solo se pueden adjuntar justificantes a bajas por enfermedad")
    data = bounded_file(file)
    inspected = parse_document("attachment", data, file.filename or "justificante")
    if file.content_type not in {inspected["mime"], "application/octet-stream"}:
        raise HTTPException(415, "El tipo declarado no coincide con el contenido real del archivo")
    lock_configuration(db)
    accessible(db, me, request_id)
    count, total = db.execute(
        select(func.count(), func.coalesce(func.sum(Attachment.size_bytes), 0)).where(
            Attachment.request_id == request_id
        )
    ).one()
    settings = request.app.state.settings
    if (
        count >= settings.max_attachments_per_request
        or total + len(data) > settings.max_attachment_bytes_per_request
    ):
        raise HTTPException(409, "Se ha alcanzado el límite de justificantes de esta solicitud")
    filename = PurePosixPath((file.filename or "justificante").replace("\\", "/")).name
    filename = re.sub(r"[\x00-\x1f\x7f\";]", "", filename)[:180] or "justificante"
    if not filename.lower().endswith(inspected["extension"]):
        filename += inspected["extension"]
    item = Attachment(
        id=new_id(),
        request_id=request_id,
        filename=filename,
        mime_type=inspected["mime"],
        size_bytes=len(data),
        data=data,
        sha256=hashlib.sha256(data).hexdigest(),
        uploaded_by=me.name,
    )
    db.add(item)
    db.flush()
    audit(
        db,
        me,
        "attachment.uploaded",
        request_id,
        {"attachment_id": item.id, "size_bytes": len(data)},
        request,
    )
    db.commit()
    return attachment_json(item)


@router.get("/{request_id}/attachments/{attachment_id}")
def download_attachment(
    request_id: str,
    attachment_id: str,
    request: Request,
    me=Depends(current_user),
    db=Depends(get_db),
):
    accessible(db, me, request_id)
    item = db.scalar(
        select(Attachment).where(
            Attachment.id == attachment_id, Attachment.request_id == request_id
        )
    )
    if not item:
        raise HTTPException(404, "Justificante no encontrado")
    audit(db, me, "attachment.downloaded", request_id, {"attachment_id": item.id}, request)
    db.commit()
    return Response(
        item.data,
        media_type=item.mime_type,
        headers={
            "Content-Disposition": "attachment; filename=justificante; filename*=UTF-8''"
            + quote(item.filename),
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
        },
    )
