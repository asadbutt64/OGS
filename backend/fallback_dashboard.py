"""
backend/fallback_dashboard.py
==============================
Lightweight FastAPI router that exposes recent tier-fallback log events as
JSON. Mount this in app.py to activate the /api/logs/fallback-events endpoint.

Fallback events are written to backend/logs/fallback_events.jsonl by the
structured logging handler configured in app.py startup.
"""

import os
import json
import datetime
from fastapi import APIRouter

router = APIRouter()

LOG_DIR = os.path.join(os.path.dirname(__file__), "logs")
FALLBACK_LOG_PATH = os.path.join(LOG_DIR, "fallback_events.jsonl")

MAX_EVENTS = 200  # Maximum recent events to return


@router.get("/api/logs/fallback-events")
def get_fallback_events(limit: int = 50):
    """
    Returns the most recent tier-fallback events logged by the expression
    resolution pipeline.  Events are stored as newline-delimited JSON records
    in backend/logs/fallback_events.jsonl.

    Query params:
        limit (int): number of events to return, newest first (default 50, max 200)
    """
    limit = min(limit, MAX_EVENTS)

    if not os.path.exists(FALLBACK_LOG_PATH):
        return {
            "count": 0,
            "events": [],
            "note": "No fallback events recorded yet. Log file does not exist.",
            "log_path": FALLBACK_LOG_PATH
        }

    events = []
    try:
        with open(FALLBACK_LOG_PATH, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    events.append(json.loads(line))
                except json.JSONDecodeError:
                    pass
    except OSError as e:
        return {"error": f"Could not read log file: {e}"}

    # Return newest first, limited count
    events_reversed = list(reversed(events[-MAX_EVENTS:]))[:limit]

    return {
        "count": len(events_reversed),
        "total_logged": len(events),
        "events": events_reversed,
        "log_path": FALLBACK_LOG_PATH,
        "fetched_at": datetime.datetime.utcnow().isoformat() + "Z"
    }


@router.delete("/api/logs/fallback-events")
def clear_fallback_events():
    """Truncates the fallback log file (useful for testing / fresh start)."""
    if os.path.exists(FALLBACK_LOG_PATH):
        with open(FALLBACK_LOG_PATH, "w") as f:
            f.truncate(0)
        return {"cleared": True, "message": "Fallback event log cleared."}
    return {"cleared": False, "message": "Log file did not exist."}
