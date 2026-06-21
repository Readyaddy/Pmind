"""
Local-only structured logging of LLM interactions, for debugging.

DISABLED by default. Enable by setting PMIND_DEBUG_LOG=1 in your local backend
environment (e.g. in backend/.env). When enabled, every event — the incoming
chat (full message history), each LLM request, each streamed turn (text +
stop_reason), tool calls and their results, the synthesis fallback, the final
text, and the provider finish_reason — is appended as one JSON object per line
to:

    <PMIND_LOG_DIR or ./logs>/llm-YYYY-MM-DD.jsonl

Read it live with:  tail -f backend/logs/llm-*.jsonl

Do NOT enable in production: payloads include full prompts and document content.
"""
import json
import os
import threading
from datetime import datetime, timezone
from pathlib import Path

_TRUE = {"1", "true", "yes", "on"}
_ENABLED = os.getenv("PMIND_DEBUG_LOG", "").strip().lower() in _TRUE
_LOG_DIR = Path(os.getenv("PMIND_LOG_DIR", "logs"))
_MAX_FIELD = int(os.getenv("PMIND_LOG_MAX_FIELD", "200000"))
_lock = threading.Lock()


def enabled() -> bool:
    return _ENABLED


def _truncate(obj):
    """Recursively cap very large strings so the log stays readable."""
    if isinstance(obj, str):
        if len(obj) <= _MAX_FIELD:
            return obj
        return obj[:_MAX_FIELD] + f"...[+{len(obj) - _MAX_FIELD} chars truncated]"
    if isinstance(obj, dict):
        return {k: _truncate(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_truncate(v) for v in obj]
    return obj


def log_event(event: str, **fields) -> None:
    """Append one event to today's JSONL log. Never raises."""
    if not _ENABLED:
        return
    ts = datetime.now(timezone.utc).isoformat()
    try:
        line = json.dumps({"ts": ts, "event": event, **_truncate(fields)},
                          ensure_ascii=False, default=str)
    except Exception as e:
        line = json.dumps({"ts": ts, "event": event, "log_error": str(e)})
    with _lock:
        try:
            _LOG_DIR.mkdir(parents=True, exist_ok=True)
            path = _LOG_DIR / f"llm-{datetime.now(timezone.utc):%Y-%m-%d}.jsonl"
            with path.open("a", encoding="utf-8") as f:
                f.write(line + "\n")
        except Exception:
            pass  # logging must never break a request
