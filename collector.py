"""
One-shot poller: reads config/locations.json, hits Open-Meteo (weather) and
TomTom (traffic) for each location, and writes a row per location to SQLite.

Meant to be run on a schedule (cron every 15-30 min), NOT as a long-running
daemon. Each invocation does one full pass and exits.

Usage:
    python collector.py
"""

import json
import logging
import os
import time
import requests
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv

from storage import get_connection, insert_sample
from traffic import get_traffic_flow

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
log = logging.getLogger(__name__)

BASE_DIR = Path(__file__).resolve().parent
LOCATIONS_FILE = BASE_DIR / "config" / "locations.json"

# TomTom allows 5 requests per second. A 0.5s delay is very safe.
REQUEST_DELAY_SECONDS = 0.5

def load_locations() -> list:
    with open(LOCATIONS_FILE) as f:
        return json.load(f)

def run_once() -> None:
    load_dotenv()

    locations = load_locations()
    conn = get_connection()
    timestamp = datetime.now(timezone.utc).isoformat()

    # --- STEP 1: BULK FETCH WEATHER ---
    # Open-Meteo allows querying multiple locations in a single request.
    log.info("Fetching batch weather data for all locations...")
    batch_weather = []
    try:
        lats = ",".join(str(loc["lat"]) for loc in locations)
        lons = ",".join(str(loc["lon"]) for loc in locations)
        weather_url = f"https://api.open-meteo.com/v1/forecast?latitude={lats}&longitude={lons}&current=precipitation,weather_code"
        
        resp = requests.get(weather_url, timeout=20)
        resp.raise_for_status()
        batch_weather = resp.json()
        log.info("Successfully fetched weather batch!")
    except Exception as e:
        log.error(f"Batch weather fetch completely failed: {e}")

    # --- STEP 2: LOOP AND FETCH TRAFFIC ---
    success_count = 0
    for i, loc in enumerate(locations):
        name = loc["name"]

        # 1. Safely extract weather from the batch list
        if batch_weather:
            # Open-Meteo returns a list for multiple locations, but a dict for a single location
            weather_node = batch_weather[i] if isinstance(batch_weather, list) else batch_weather
            try:
                rain = weather_node["current"].get("precipitation")
                code = weather_node["current"].get("weather_code")
                weather = {
                    "precipitation_mm": rain if rain is not None else 0.0,
                    "weather_code": code
                }
            except (KeyError, IndexError, TypeError):
                weather = {"precipitation_mm": 0.0, "weather_code": None}
        else:
            weather = {"precipitation_mm": 0.0, "weather_code": None}

        # 2. Fetch traffic from TomTom (Individual calls, protected by API Key)
        try:
            traffic = get_traffic_flow(loc["lat"], loc["lon"])
        except Exception as e:
            log.error(f"Traffic fetch failed for {name}: {e}")
            traffic = {
                "current_speed_kmh": None,
                "freeflow_speed_kmh": None,
                "confidence": None,
                "road_closure": None,
            }

        insert_sample(conn, timestamp, loc, weather, traffic)
        success_count += 1
        log.info(
            f"{name}: speed={traffic.get('current_speed_kmh')}km/h "
            f"(free-flow={traffic.get('freeflow_speed_kmh')}km/h), "
            f"rain={weather.get('precipitation_mm')}mm"
        )
        
        # Pause slightly to respect TomTom's rate limit
        time.sleep(REQUEST_DELAY_SECONDS)

    conn.close()
    log.info(f"Done. Recorded {success_count}/{len(locations)} locations at {timestamp}")

if __name__ == "__main__":
    run_once()