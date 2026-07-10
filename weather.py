"""
Weather signal via Open-Meteo (https://open-meteo.com).
Free, no API key, no signup required for non-commercial use (~10,000 req/day).
"""

import requests

OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast"


def get_current_weather(lat: float, lon: float, timeout: int = 10) -> dict:
    """
    Returns current precipitation (mm in the last hour) and WMO weather code
    for a single point. No API key needed.
    """
    params = {
        "latitude": lat,
        "longitude": lon,
        "current": "precipitation,rain,weather_code",
        "timezone": "Asia/Kolkata",
    }
    resp = requests.get(OPEN_METEO_URL, params=params, timeout=timeout)
    resp.raise_for_status()
    current = resp.json().get("current", {})
    return {
        "precipitation_mm": current.get("precipitation"),
        "rain_mm": current.get("rain"),
        "weather_code": current.get("weather_code"),
    }
