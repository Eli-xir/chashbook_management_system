"""Local private file storage behind a small interface (later S3 swap).

Files live outside frontend/public. Stored names are server-generated; client
paths are never trusted. Content type and size are validated on save.
"""

import os
import uuid
import re
from functools import lru_cache
from starlette.concurrency import run_in_threadpool
from fastapi.responses import FileResponse, RedirectResponse

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
    for magic, ext in IMAGE_MAGICS + VOICE_MAGICS:
        if data.startswith(magic) and ext in allowed.values() and (ext != '.wav' or data[8:12] == b'WAVE'):
            return ext
    if data.startswith(b'RIFF') and data[8:12] == b'WEBP' and '.webp' in allowed.values():
        return '.webp'
    if data[4:8] == b'ftyp' and data[8:12] in (b'heic', b'heix', b'mif1') and '.heic' in allowed.values():
        return '.heic'
    if len(data) > 1 and data[0] == 0xff and data[1] & 0xe0 == 0xe0 and '.mp3' in allowed.values():
        return '.mp3'
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
    stored_name = f"{object_id}{ext}"
    object_name = f"{sub}/{stored_name}"
    content_type = next(mime for mime, suffix in allowed.items() if suffix == ext)
    if settings.storage_backend == "s3":
        await run_in_threadpool(s3_client().put_object, Bucket=settings.s3_bucket,
                                Key=object_name, Body=data, ContentType=content_type,
                                ServerSideEncryption="AES256", CacheControl="private, no-store")
    else:
        directory = os.path.join(_uploads_root(), sub)
        os.makedirs(directory, exist_ok=True)
        with open(os.path.join(directory, stored_name), "wb") as f:
            f.write(data)
    return {"object_name": object_name, "size": len(data), "content_type": content_type}


@lru_cache
def s3_client():
    import boto3
    from botocore.config import Config
    return boto3.client("s3", region_name=settings.aws_region,
                        config=Config(signature_version="s3v4", connect_timeout=5, read_timeout=20,
                                      retries={"max_attempts": 2}))


def validate_key(object_name: str) -> None:
    if not re.fullmatch(r"(?:images|voice)/[a-f0-9]{32}\.[a-z0-9]+", object_name):
        raise error(400, "Invalid object name")


def stored_response(object_name: str):
    """Call only AFTER the route has authorized the user for this attachment."""
    headers = {"Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
               "Referrer-Policy": "no-referrer"}
    if settings.storage_backend == "s3":
        validate_key(object_name)
        url = s3_client().generate_presigned_url("get_object", Params={
            "Bucket": settings.s3_bucket, "Key": object_name,
            "ResponseCacheControl": "private, no-store",
        }, ExpiresIn=60)
        return RedirectResponse(url, status_code=307, headers=headers)
    return FileResponse(open_stored(object_name), headers=headers)


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
        if settings.storage_backend == "s3":
            validate_key(object_name)
            s3_client().delete_object(Bucket=settings.s3_bucket, Key=object_name)
            return
        full = open_stored(object_name)
        os.remove(full)
    except Exception:
        pass
