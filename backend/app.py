from __future__ import annotations

import csv
import os
from datetime import datetime
from typing import Optional, List, Dict, Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

# -----------------------------
# Paths
# -----------------------------
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.abspath(os.path.join(BASE_DIR, ".."))
DATA_DIR = os.path.join(PROJECT_ROOT, "data")

AC_STATE_PATH = os.path.join(DATA_DIR, "ac_state.csv")
COMMAND_LOG_PATH = os.path.join(DATA_DIR, "command_log.csv")
TEMP_HISTORY_PATH = os.path.join(DATA_DIR, "temperature_history.csv")

# -----------------------------
# App
# -----------------------------
app = FastAPI(title="3D Building AC Dashboard API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # for dev; tighten later
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# -----------------------------
# Models
# -----------------------------
class CommandRequest(BaseModel):
    user: str = Field(default="Admin")
    ac_id: str
    action: str = Field(description="set_temp | set_status | set_mode")
    value: str | float | int
    note: Optional[str] = None


def _now_str() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def _read_csv_as_dicts(path: str) -> List[Dict[str, str]]:
    if not os.path.exists(path):
        raise HTTPException(status_code=500, detail=f"Missing file: {os.path.basename(path)}")
    with open(path, "r", newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        return list(reader)


def _write_dicts_to_csv(path: str, rows: List[Dict[str, Any]], fieldnames: List[str]) -> None:
    tmp = path + ".tmp"
    with open(tmp, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for r in rows:
            writer.writerow({k: r.get(k, "") for k in fieldnames})
    os.replace(tmp, path)


def _append_command_log(row: Dict[str, Any]) -> None:
    # Ensure command_log exists with header
    file_exists = os.path.exists(COMMAND_LOG_PATH)
    fieldnames = ["timestamp", "user", "command", "ac_id", "old_value", "new_value", "status"]

    if not file_exists:
        os.makedirs(os.path.dirname(COMMAND_LOG_PATH), exist_ok=True)
        with open(COMMAND_LOG_PATH, "w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()

    with open(COMMAND_LOG_PATH, "a", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writerow({k: row.get(k, "") for k in fieldnames})


def _validate_action(action: str) -> str:
    action = action.strip().lower()
    if action not in {"set_temp", "set_status", "set_mode"}:
        raise HTTPException(status_code=400, detail="Invalid action. Use: set_temp | set_status | set_mode")
    return action


def _validate_and_normalize_value(action: str, value: Any) -> Any:
    # Simple safety rules (demo)
    if action == "set_temp":
        try:
            v = float(value)
        except Exception:
            raise HTTPException(status_code=400, detail="set_temp value must be a number")
        if v < 16 or v > 30:
            raise HTTPException(status_code=400, detail="Temperature out of allowed range (16–30)")
        return round(v, 1)

    if action == "set_status":
        v = str(value).strip().upper()
        if v not in {"ON", "OFF"}:
            raise HTTPException(status_code=400, detail="set_status value must be ON or OFF")
        return v

    if action == "set_mode":
        v = str(value).strip().capitalize()
        if v not in {"Cooling", "Heating", "Fan"}:
            raise HTTPException(status_code=400, detail="set_mode value must be Cooling/Heating/Fan")
        return v

    return value


# -----------------------------
# Routes
# -----------------------------
@app.get("/health")
def health():
    return {"ok": True, "time": _now_str()}


@app.get("/ac")
def get_all_ac():
    """
    Returns current snapshot of all AC units (from ac_state.csv)
    """
    rows = _read_csv_as_dicts(AC_STATE_PATH)
    return {"timestamp": _now_str(), "items": rows}


@app.get("/ac/{ac_id}")
def get_one_ac(ac_id: str):
    rows = _read_csv_as_dicts(AC_STATE_PATH)
    for r in rows:
        if r.get("ac_id") == ac_id:
            return {"item": r}
    raise HTTPException(status_code=404, detail="AC not found")


@app.get("/history/{ac_id}")
def get_history(ac_id: str, limit: int = 720):
    """
    Returns last N points from temperature_history.csv.
    With 5s interval: 720 points ~= 1 hour.
    """
    all_rows = _read_csv_as_dicts(TEMP_HISTORY_PATH)
    filtered = [r for r in all_rows if r.get("ac_id") == ac_id]
    if not filtered:
        raise HTTPException(status_code=404, detail="No history for this AC")
    return {"ac_id": ac_id, "items": filtered[-limit:]}


@app.post("/command")
def apply_command(cmd: CommandRequest):
    """
    Updates ac_state.csv and appends to command_log.csv
    """
    action = _validate_action(cmd.action)
    new_value = _validate_and_normalize_value(action, cmd.value)

    rows = _read_csv_as_dicts(AC_STATE_PATH)
    if not rows:
        raise HTTPException(status_code=500, detail="ac_state.csv has no rows")

    # Find target row
    idx = None
    for i, r in enumerate(rows):
        if r.get("ac_id") == cmd.ac_id:
            idx = i
            break
    if idx is None:
        raise HTTPException(status_code=404, detail="AC not found")

    target = rows[idx]
    before = None

    if action == "set_temp":
        before = target.get("set_temp", "")
        target["set_temp"] = str(new_value)

    elif action == "set_status":
        before = target.get("status", "")
        target["status"] = str(new_value)

    elif action == "set_mode":
        before = target.get("mode", "")
        target["mode"] = str(new_value)

    # Keep a fresh timestamp in snapshot
    target["timestamp"] = _now_str()
    rows[idx] = target

    # Write back using same headers as file
    fieldnames = list(rows[0].keys())
    _write_dicts_to_csv(AC_STATE_PATH, rows, fieldnames)

    # Create a human-readable command text for logs
    cmd_text = cmd.note
    if not cmd_text:
        cmd_text = f"{action} {cmd.ac_id} -> {new_value}"

    _append_command_log({
        "timestamp": _now_str(),
        "user": cmd.user,
        "command": cmd_text,
        "ac_id": cmd.ac_id,
        "old_value": before,
        "new_value": new_value,
        "status": "Applied",
    })

    return {"ok": True, "ac_id": cmd.ac_id, "action": action, "new_value": new_value}