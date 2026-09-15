"""Local private file storage behind a small interface (later S3 swap).

Files live outside frontend/public. Stored names are server-generated; client
paths are never trusted. Content type and size are validated on save.
"""

import os
import uuid

from fastapi import UploadFile

from .config import settings
from .deps import error

MAX_IMAGE_BYTES = 5 * 1024 * 1024
MAX_VOICE_BYTES = 10 * 1024 * 1024

IMAGE_TYPES = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/heic": ".heic"}
VOICE_TYPES = {"audio/webm": ".webm", "audio/mp4": ".m4a", "audio/mpeg": ".mp3", "audio/ogg": ".ogg", "audio/wav": ".wav"}

# Magic-number sniffing beats trusting the declared content type.
IMAGE_MAGICS = ((b"\xff\xd8\xff", ".jpg"), (b"\x89PNG\r\n\x1a\n", ".png"))
VOICE_MAGICS = ((b"OggS", ".ogg"), (b"ID3", ".mp3"), (b"RIFF", ".wav"))


def _uploads_root() -> str:
    return os.path.abspath(settings.upload_dir)


def sniff_extension(data: bytes, declared: str, allowed: dict[str, str]) -> str | None:
    if declared in allowed:
        return allowed[declared]
    for magic, ext in IMAGE_MAGICS + VOICE_MAGICS:
        if data.startswith(magic) and ext in allowed.values():
            return ext
    # WebM/M4A detection via container markers
    if b"\x1a\x45\xdf\xa3" in data[:64] and ".webm" in allowed.values():
        return ".webm"
    if data[4:8] == b"ftyp" and ".m4a" in allowed.values():
        return ".m4a"
    return None


async def save_upload(upload: UploadFile, kind: str) -> dict:
    """kind: 'image' or 'voice'. Returns metadata for Images/Voice_notes rows."""
    allowed = IMAGE_TYPES if kind == "image" else VOICE_TYPES
    limit = MAX_IMAGE_BYTES if kind == "image" else MAX_VOICE_BYTES
    data = await upload.read(limit + 1)
    if len(data) == 0:
        raise error(400, "Empty file")
    if len(data) > limit:
        raise error(413, f"File too large. Maximum {limit // (1024 * 1024)} MB.")
    ext = sniff_extension(data, upload.content_type or "", allowed)
    if ext is None:
        raise error(400, f"Unsupported {kind} file type")

    object_id = uuid.uuid4().hex
    sub = "images" if kind == "image" else "voice"
    directory = os.path.join(_uploads_root(), sub)
    os.makedirs(directory, exist_ok=True)
    stored_name = f"{object_id}{ext}"
    with open(os.path.join(directory, stored_name), "wb") as f:
        f.write(data)
    return {"object_name": f"{sub}/{stored_name}", "size": len(data), "content_type": upload.content_type or ext}


def open_stored(object_name: str):
    """Opens a stored object after checking the path stays inside uploads root."""
    root = _uploads_root()
    full = os.path.abspath(os.path.join(root, object_name))
    if not full.startswith(root + os.sep):
        raise error(400, "Invalid object name")
    if not os.path.isfile(full):
        raise error(404, "File not found")
    return full


def delete_stored(object_name: str) -> None:
    """Best-effort removal for orphaned uploads. Referenced files are never deleted
    here; callers decide reference safety."""
    try:
        full = open_stored(object_name)
        os.remove(full)
    except Exception:
        pass
