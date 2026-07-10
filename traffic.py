"""
Traffic signal via TomTom Traffic Flow API.
Free tier: ~2,500 requests/day, no credit card needed.
Sign up at https://developer.tomtom.com/ to get a key, then set TOMTOM_API_KEY.
"""

import os
import requests

TOMTOM_FLOW_URL = "https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/10/json"


def get_traffic_flow(lat: float, lon: float, api_key: str = None, timeout: int = 10) -> dict:
    """
    Returns current speed vs free-flow speed for the road segment nearest
    to (lat, lon). This is the core "how bad is traffic right now" signal.
    """
    api_key = api_key or os.environ.get("TOMTOM_API_KEY")
    if not api_key:
        raise RuntimeError("TOMTOM_API_KEY not set (see .env.example)")

    params = {"point": f"{lat},{lon}", "key": api_key}
    resp = requests.get(TOMTOM_FLOW_URL, params=params, timeout=timeout)
    resp.raise_for_status()
    seg = resp.json().get("flowSegmentData", {})
    return {
        "current_speed_kmh": seg.get("currentSpeed"),
        "freeflow_speed_kmh": seg.get("freeFlowSpeed"),
        "confidence": seg.get("confidence"),
        "road_closure": bool(seg.get("roadClosure", False)),
    }
