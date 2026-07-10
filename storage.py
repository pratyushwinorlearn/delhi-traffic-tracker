"""
Cloud PostgreSQL storage.
Connects to Supabase so Vercel and Render can share the same data.
"""

import os
import psycopg2
from dotenv import load_dotenv

# Load the DATABASE_URL from your .env file
load_dotenv()
DATABASE_URL = os.getenv("DATABASE_URL")

# Notice we changed 'id INTEGER PRIMARY KEY AUTOINCREMENT' to 'id SERIAL PRIMARY KEY' for Postgres
SCHEMA = """
CREATE TABLE IF NOT EXISTS samples (
    id SERIAL PRIMARY KEY,
    timestamp_utc TEXT NOT NULL,
    location_name TEXT NOT NULL,
    lat REAL NOT NULL,
    lon REAL NOT NULL,
    current_speed_kmh REAL,
    freeflow_speed_kmh REAL,
    confidence REAL,
    road_closure INTEGER,
    precipitation_mm REAL,
    weather_code INTEGER
);
"""

def get_connection():
    if not DATABASE_URL:
        raise ValueError("Missing DATABASE_URL environment variable!")
    
    # Connect to Supabase
    conn = psycopg2.connect(DATABASE_URL)
    with conn.cursor() as cur:
        cur.execute(SCHEMA)
    conn.commit()
    return conn


def insert_sample(conn, timestamp_utc: str, location: dict,
                  weather: dict, traffic: dict) -> None:
    # Postgres uses %s instead of ? for inserting variables
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO samples (
                timestamp_utc, location_name, lat, lon,
                current_speed_kmh, freeflow_speed_kmh, confidence, road_closure,
                precipitation_mm, weather_code
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (
                timestamp_utc,
                location["name"],
                location["lat"],
                location["lon"],
                traffic.get("current_speed_kmh"),
                traffic.get("freeflow_speed_kmh"),
                traffic.get("confidence"),
                int(traffic.get("road_closure") or 0),
                weather.get("precipitation_mm"),
                weather.get("weather_code"),
            ),
        )
    conn.commit()