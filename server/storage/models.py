"""Domain models and constants for the photography-agent store."""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any, Optional


MAX_CHANNELS = 10
CHANNEL_IDS = tuple(range(1, MAX_CHANNELS + 1))
MAX_WAITING = 10

CHANNEL_STATUSES = ("idle", "busy", "paused", "error", "offline")
TASK_STATUSES = ("queued", "running", "succeeded", "failed", "cancelled")
CONVERSATION_ROLES = ("user", "assistant", "system", "tool")

# Channels that reject NEW dispatch while still keeping existing queued work.
DISPATCH_BLOCKED_STATUSES = frozenset({"paused", "offline"})


def _clean(value: Any) -> Any:
    if isinstance(value, dict):
        return {k: _clean(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_clean(v) for v in value]
    return value


@dataclass
class Project:
    id: str
    name: str
    briefing: str = ""
    constraints: Optional[str] = None
    style: Optional[str] = None
    deliverables: Optional[str] = None
    extra: Optional[dict[str, Any]] = None
    created_at: str = ""
    updated_at: str = ""

    def to_dict(self) -> dict[str, Any]:
        data = asdict(self)
        data["extra"] = _clean(self.extra) if self.extra is not None else None
        return data


@dataclass
class ChannelSnapshot:
    id: int
    status: str
    current_task_id: Optional[str] = None
    waiting_count: int = 0
    waiting: list[str] = field(default_factory=list)
    last_error: Optional[str] = None
    updated_at: str = ""

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class Task:
    id: str
    project_id: str
    channel_id: int
    prompt: str
    payload: Optional[dict[str, Any]] = None
    priority: int = 0
    status: str = "queued"
    attempt: int = 1
    origin_task_id: Optional[str] = None
    error: Optional[str] = None
    created_at: str = ""
    updated_at: str = ""
    started_at: Optional[str] = None
    finished_at: Optional[str] = None

    def to_dict(self) -> dict[str, Any]:
        data = asdict(self)
        data["payload"] = _clean(self.payload) if self.payload is not None else None
        return data


@dataclass
class Conversation:
    id: str
    project_id: str
    content: str
    role: str = "user"
    task_id: Optional[str] = None
    channel_id: Optional[int] = None
    created_at: str = ""

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)
