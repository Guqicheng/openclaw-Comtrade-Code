# ===== backend/session_store.py =====
# 分析会话：按 analysis_id 缓存 COMTRADE reader，替代模块级全局变量。

from __future__ import annotations

import secrets
import time
from dataclasses import dataclass
from threading import Lock
from typing import Any

MAX_SESSIONS = 32
SESSION_TTL_SEC = 8 * 3600


@dataclass
class AnalysisSession:
    reader: Any
    cfg_path: str | None = None
    dat_path: str | None = None
    created_at: float = 0.0

    def __post_init__(self) -> None:
        if not self.created_at:
            self.created_at = time.time()


_lock = Lock()
_sessions: dict[str, AnalysisSession] = {}


def _prune_locked(now: float | None = None) -> None:
    now = now or time.time()
    expired = [sid for sid, s in _sessions.items() if now - s.created_at > SESSION_TTL_SEC]
    for sid in expired:
        del _sessions[sid]
    while len(_sessions) > MAX_SESSIONS:
        oldest = min(_sessions.items(), key=lambda item: item[1].created_at)[0]
        del _sessions[oldest]


def create_session(reader: Any, cfg_path: str | None = None, dat_path: str | None = None) -> str:
    """注册 reader，返回 analysis_id。"""
    analysis_id = secrets.token_hex(16)
    with _lock:
        _prune_locked()
        _sessions[analysis_id] = AnalysisSession(
            reader=reader,
            cfg_path=cfg_path,
            dat_path=dat_path,
        )
    return analysis_id


def get_session(analysis_id: str) -> AnalysisSession | None:
    if not analysis_id:
        return None
    with _lock:
        _prune_locked()
        return _sessions.get(analysis_id)


def delete_session(analysis_id: str) -> None:
    with _lock:
        _sessions.pop(analysis_id, None)
