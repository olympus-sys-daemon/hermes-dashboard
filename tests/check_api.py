"""Offline checks for dashboard/plugin_api.py. Home Assistant is faked, so nothing touches the network.

Run from the repo root with the gateway's Python:
  $PY -I tests/check_api.py
Exit 0 means every check passed.
"""
import importlib.util
import sys
from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "dashboard" / "plugin_api.py"
spec = importlib.util.spec_from_file_location("plugin_api", SRC)
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

STATES = []
CALLS = []
FORECAST_CALLS = []
BED = "light.wiz_rgbw_tunable_d1d37c"
KIT = "light.wiz_rgbww_tunable_6348c6_powercalc"
PREFIX = "/api/plugins/hermes-dashboard"


def fake_ha(method, path, body=None):
    if method == "GET" and path == "/api/states":
        return list(STATES)
    if method == "POST" and "get_forecasts" in path:
        FORECAST_CALLS.append(path)
        return {"service_response": {}}
    if method == "GET" and path.startswith("/api/history/period"):
        return [[]]
    if method == "POST" and path.startswith("/api/services/light/"):
        CALLS.append((path, body))
        return None
    raise AssertionError(f"unexpected HA call: {method} {path}")


m.ha = fake_ha
app = FastAPI()
app.include_router(m.router, prefix=PREFIX)
client = TestClient(app)


def light_state(entity, state, **attrs):
    return {"entity_id": entity, "state": state, "attributes": attrs}


def base_states(bedroom, kitchen):
    STATES[:] = [
        {"entity_id": m.WEATHER, "state": "cloudy",
         "attributes": {"temperature": 11.5, "humidity": 70, "wind_speed": 9}},
        bedroom,
        kitchen,
    ]
    m._SC["t"] = 0.0


checks = []


def check(name):
    def wrap(fn):
        checks.append((name, fn))
        return fn
    return wrap


@check("weather is today only: no forecast key and no forecast fetch")
def _():
    FORECAST_CALLS.clear()
    base_states(light_state(BED, "on", brightness=128, effect="Daylight"), light_state(KIT, "off"))
    r = client.get(PREFIX + "/snapshot")
    assert r.status_code == 200, r.text
    assert "forecast" not in r.json()["weather"], r.json()["weather"]
    assert FORECAST_CALLS == [], FORECAST_CALLS


@check("lights: state, brightness and effect come from Home Assistant")
def _():
    base_states(light_state(BED, "on", brightness=128, effect="Daylight"), light_state(KIT, "off"))
    lights = {l["name"]: l for l in client.get(PREFIX + "/snapshot").json()["lights"]}
    assert lights["Bedroom"] == {"id": BED, "name": "Bedroom", "state": "on",
                                 "brightness": 128, "effect": "Daylight"}, lights["Bedroom"]
    assert lights["Kitchen"]["state"] == "off", lights["Kitchen"]


@check("lights: unavailable or unknown in HA shows unavailable")
def _():
    base_states(light_state(BED, "unavailable"), light_state(KIT, "unknown"))
    lights = {l["name"]: l for l in client.get(PREFIX + "/snapshot").json()["lights"]}
    assert lights["Bedroom"]["state"] == "unavailable", lights["Bedroom"]
    assert lights["Kitchen"]["state"] == "unavailable", lights["Kitchen"]


@check("no direct bulb code or LAN addresses left in the module")
def _():
    text = SRC.read_text(encoding="utf-8")
    assert not hasattr(m, "bulb_pilot")
    assert "192.168." not in text
    assert "38899" not in text


@check("guards: unknown entity, bad effect and bad brightness refused; nothing sent to HA")
def _():
    CALLS.clear()
    assert client.post(PREFIX + "/light/toggle", json={"entity": "switch.computers"}).status_code == 403
    assert client.post(PREFIX + "/light/effect", json={"entity": BED, "value": "Party"}).status_code == 403
    assert client.post(PREFIX + "/light/brightness", json={"entity": BED, "value": "abc"}).status_code == 400
    assert CALLS == [], CALLS


@check("allowed toggle reaches the Home Assistant light service")
def _():
    CALLS.clear()
    r = client.post(PREFIX + "/light/toggle", json={"entity": BED})
    assert r.status_code == 200, r.text
    assert CALLS == [("/api/services/light/toggle", {"entity_id": BED})], CALLS


@check("history returns series for the allow-listed sensors")
def _():
    r = client.get(PREFIX + "/history?hours=24")
    assert r.status_code == 200, r.text
    assert "sensor.bedroom_sensor_temperature" in r.json()["series"]


def main():
    failed = 0
    for name, fn in checks:
        try:
            fn()
            print(f"ok    {name}")
        except AssertionError as e:
            failed += 1
            print(f"FAIL  {name}: {e}")
    print("all ok" if not failed else f"{failed} failing")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
