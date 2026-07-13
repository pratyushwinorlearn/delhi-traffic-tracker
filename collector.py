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
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv

from storage import get_connection, insert_sample
from traffic import get_traffic_flow
from weather import get_current_weather

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
log = logging.getLogger(__name__)

BASE_DIR = Path(__file__).resolve().parent
LOCATIONS_FILE = BASE_DIR / "config" / "locations.json"

# Increased to 1.5s to prevent Open-Meteo API rate limit timeouts across 50 locations
REQUEST_DELAY_SECONDS = 1.5


def load_locations() -> list:
    with open(LOCATIONS_FILE) as f:
        return json.load(f)


def run_once() -> None:
    load_dotenv()  # picks up TOMTOM_API_KEY from a local .env if present

    locations = load_locations()
    conn = get_connection()
    timestamp = datetime.now(timezone.utc).isoformat()

    success_count = 0
    for loc in locations:
        name = loc["name"]

        try:
            weather = get_current_weather(loc["lat"], loc["lon"])
        except Exception as e:
            log.error(f"Weather fetch failed for {name}: {e}")
            # Default precipitation to 0.0 instead of None to prevent chart rendering breaks
            weather = {"precipitation_mm": 0.0, "weather_code": None}

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
        time.sleep(REQUEST_DELAY_SECONDS)

    conn.close()
    log.info(f"Done. Recorded {success_count}/{len(locations)} locations at {timestamp}")


if __name__ == "__main__":
    run_once()