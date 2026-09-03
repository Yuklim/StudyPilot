"""Authenticated original-file download. Return only verified byte snapshots."""

from urllib.parse import quote
from uuid import UUID

from fastapi import APIRouter, Request
from starlette.responses import Response

from studypilot.api.resources import failure
from studypilot.application.files import FileService
from studypilot.modules.resources.contracts import ResourceError

router = APIRouter(prefix="/api/v1/files", redirect_slashes=False)


@router.get("/{file_id}/download")
def download_file(request: Request, file_id: str) -> Response:
    try:
        try:
            identity = UUID(file_id)
        except ValueError:
            raise ResourceError("FILE_NOT_FOUND", 404) from None
        service: FileService = request.app.state.files
        row, data = service.download(identity)
        return Response(
            content=data,
            headers={
                "Content-Type": row.media_type,
                "Content-Disposition": (
                    'attachment; filename="original-file"; '
                    f"filename*=UTF-8''{quote(row.original_name, safe='')}"
                ),
                "X-Content-Type-Options": "nosniff",
                "Cache-Control": "private, no-store",
            },
        )
    except ResourceError as error:
        return failure(request, error)
    except Exception:
        return failure(request, ResourceError("UNKNOWN_ERROR", 500))
