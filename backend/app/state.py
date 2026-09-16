"""Persistent state for the supported single-instance deployment."""
import json
import os
from pathlib import Path

from .config import settings


def state_path(name: str) -> str:
    root = Path(settings.state_dir) if settings.state_dir else Path(__file__).resolve().parents[1]
    root.mkdir(parents=True, exist_ok=True)
    return str(root / name)


def write_json(path: str, value) -> None:
    with open(path + '.tmp', 'w', encoding='utf-8') as stream:
        json.dump(value, stream)
        stream.flush()
        os.fsync(stream.fileno())
    os.replace(path + '.tmp', path)
