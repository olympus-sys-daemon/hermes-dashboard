"""Home dashboard backend for the Hermes desktop app.

Port of ~/dashboard-v2/server.py into gateway routes, mounted at /api/plugins/hermes-dashboard/.
Home Assistant only: all reads and writes go through HA's REST API. The HA token is read from
~/.hermes/.env and never leaves this process. Controls: light only (power, brightness, scene).
Plugs and climate are display-only. Every write is checked against an allow-list.
"""
import datetime
import json
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from fastapi import APIRouter, Body, HTTPException

router = APIRouter()

_ENV_FILE = Path.home() / ".hermes" / ".env"


def _load_env():
    env = {}
    try:
        text = _ENV_FILE.read_text(encoding="utf-8")
    except OSError:
        return env
    for line in text.splitlines():
        if "=" in line and not line.lstrip().startswith("#"):
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip().strip("\"'")
    return env


def _ha_config():
    env = _load_env()
    if not env.get("HASS_URL") or not env.get("HASS_TOKEN"):
        raise HTTPException(status_code=503, detail="HASS_URL or HASS_TOKEN missing from ~/.hermes/.env")
    return env["HASS_URL"].rstrip("/"), env["HASS_TOKEN"]


# entity -> (label, power W, kWh today, kWh month)
PLUGS = {
    "switch.computers": ("Computers", "sensor.computers_current_consumption", "sensor.computers_today_s_consumption", "sensor.computers_this_month_s_consumption"),
    "switch.monitors": ("Monitors", "sensor.monitors_current_consumption", "sensor.monitors_today_s_consumption", "sensor.monitors_this_month_s_consumption"),
    "switch.tv": ("TV", "sensor.tv_current_consumption", "sensor.tv_today_s_consumption", "sensor.tv_this_month_s_consumption"),
    "switch.homelab": ("Homelab", "sensor.homelab_current_consumption", "sensor.homelab_today_s_consumption", "sensor.homelab_this_month_s_consumption"),
}
# HA light entity -> display name. Only these entities can be controlled.
LIGHTS = {
    "light.wiz_rgbw_tunable_d1d37c": {"name": "Bedroom"},
    "light.wiz_rgbww_tunable_6348c6_powercalc": {"name": "Kitchen"},
}
EFFECTS = {"Night light", "Daylight"}
WEATHER = "weather.forecast_home"
CLIMATE = {
    "Bedroom": ("sensor.bedroom_sensor_temperature", "sensor.bedroom_sensor_humidity"),
    "Bathroom": ("sensor.sonoff_snzb_02d_temperature", "sensor.sonoff_snzb_02d_humidity"),
}
HISTORY_ENTITIES = sorted({p[1] for p in PLUGS.values()} | {t for (t, _) in CLIMATE.values()})

# ---- Home Assistant access (one bulk states call, cached 2 s) ----
_SC = {"t": 0.0, "d": {}}


def ha(method, path, body=None):
    base, token = _ha_config()
    req = urllib.request.Request(
        base + path, method=method,
        data=json.dumps(body).encode() if body is not None else None,
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=10) as r:
        return json.loads(r.read() or b"null")


def states_now():
    if time.time() - _SC["t"] > 2:
        _SC["d"] = {e["entity_id"]: e for e in ha("GET", "/api/states")}
        _SC["t"] = time.time()
    return _SC["d"]


def get(eid):
    return states_now().get(eid) or {"state": "unavailable", "attributes": {}}


def num(eid):
    try:
        return float(get(eid)["state"])
    except (TypeError, ValueError):
        return None


def light_view(entity):
    # State comes from HA's own light entity. Its brightness is 0-255 and its effect is the scene name.
    st = get(entity)
    base = {"id": entity, "name": LIGHTS[entity]["name"]}
    if st["state"] in ("unavailable", "unknown"):
        return {**base, "state": "unavailable", "brightness": None, "effect": None}
    if st["state"] != "on":
        return {**base, "state": "off", "brightness": None, "effect": None}
    attrs = st.get("attributes", {})
    return {**base, "state": "on",
            "brightness": attrs.get("brightness"),
            "effect": attrs.get("effect") or None}


def all_lights():
    return [light_view(e) for e in LIGHTS]


# ---- History: allow-listed, cached 4 min, downsampled, stats from full data ----
_HC = {}


def _stats(pts, end_dt):
    vals = [v for _, v in pts]
    if not vals:
        return None
    total = acc = 0.0
    for i, (t, v) in enumerate(pts):
        t0 = datetime.datetime.fromisoformat(t)
        t1 = datetime.datetime.fromisoformat(pts[i + 1][0]) if i + 1 < len(pts) else end_dt
        dt = (t1 - t0).total_seconds()
        if dt > 0:
            acc += v * dt
            total += dt
    return {"min": min(vals), "max": max(vals), "avg": round(acc / total, 2) if total else None}


def series(entity, hours):
    key = (entity, hours)
    hit = _HC.get(key)
    if hit and time.time() - hit[0] < 240:
        return hit[1]
    try:
        end_dt = datetime.datetime.now(datetime.timezone.utc)
        start = (end_dt - datetime.timedelta(hours=hours)).strftime("%Y-%m-%dT%H:%M:%SZ")
        data = ha("GET", f"/api/history/period/{start}?filter_entity_id={entity}"
                         "&minimal_response&no_attributes&significant_changes_only")
        pts = []
        for ser in (data or []):
            for p in ser:
                try:
                    v = float(p["state"])
                except (KeyError, TypeError, ValueError):
                    continue
                t = p.get("last_changed") or p.get("last_updated")
                if t:
                    pts.append((t, round(v, 2)))
        st = _stats(pts, end_dt)
        step = max(1, len(pts) // 240)
        out = [[t, v] for t, v in pts[::step]]
        if pts and out[-1][0] != pts[-1][0]:
            out.append([pts[-1][0], pts[-1][1]])
        res = {"points": out, "stats": st}
    except Exception as ex:
        res = {"points": [], "stats": None, "error": str(ex)[:120]}
    _HC[key] = (time.time(), res)
    return res


def history_all(hours):
    with ThreadPoolExecutor(max_workers=6) as ex:
        results = list(ex.map(lambda e: series(e, hours), HISTORY_ENTITIES))
    return dict(zip(HISTORY_ENTITIES, results))


def snapshot():
    w = get(WEATHER)["attributes"]
    return {
        "generated": datetime.datetime.now().isoformat(timespec="seconds"),
        "weather": {"state": get(WEATHER)["state"], "temperature": w.get("temperature"),
                    "humidity": w.get("humidity"), "wind_speed": w.get("wind_speed")},
        "lights": all_lights(),
        "plugs": [{"id": e, "name": n, "on": get(e)["state"] == "on", "state": get(e)["state"],
                   "watts": num(pw), "kwh_today": num(kd), "kwh_month": num(km), "series": pw}
                  for e, (n, pw, kd, km) in PLUGS.items()],
        "climate": [{"name": n, "temp": num(t), "hum": num(h), "series": t}
                    for n, (t, h) in CLIMATE.items()],
    }


# ---- Routes (mounted at /api/plugins/hermes-dashboard/) ----
@router.get("/snapshot")
def get_snapshot():
    try:
        return snapshot()
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e)[:200])


@router.get("/history")
def get_history(hours: int = 24):
    hours = min(max(hours, 1), 168)
    try:
        return {"hours": hours, "generated": datetime.datetime.now().isoformat(timespec="seconds"),
                "series": history_all(hours)}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e)[:200])


def _check_light(entity):
    if entity not in LIGHTS:
        raise HTTPException(status_code=403, detail="not allowed")


@router.post("/light/toggle")
def light_toggle(body: dict = Body(...)):
    e = body.get("entity")
    _check_light(e)
    try:
        ha("POST", "/api/services/light/toggle", {"entity_id": e})
    except Exception as ex:
        raise HTTPException(status_code=502, detail=str(ex)[:200])
    return {"ok": True}


@router.post("/light/brightness")
def light_brightness(body: dict = Body(...)):
    e = body.get("entity")
    _check_light(e)
    try:
        b = max(1, min(255, int(body["value"])))
    except (KeyError, TypeError, ValueError):
        raise HTTPException(status_code=400, detail="value must be an integer")
    try:
        ha("POST", "/api/services/light/turn_on", {"entity_id": e, "brightness": b})
    except Exception as ex:
        raise HTTPException(status_code=502, detail=str(ex)[:200])
    return {"ok": True}


@router.post("/light/effect")
def light_effect(body: dict = Body(...)):
    e = body.get("entity")
    _check_light(e)
    if body.get("value") not in EFFECTS:
        raise HTTPException(status_code=403, detail="not allowed")
    try:
        ha("POST", "/api/services/light/turn_on", {"entity_id": e, "effect": body["value"]})
    except Exception as ex:
        raise HTTPException(status_code=502, detail=str(ex)[:200])
    return {"ok": True}
