"""
Turns collected samples into the "normal day vs rainy day" multiplier per
location. Run this manually, any time, once you have enough data
(ideally several distinct rain events, not just one storm).

Usage:
    python analyze.py
    python analyze.py --rain-threshold 2.0
"""

import argparse
import sqlite3

import pandas as pd

from storage import DB_FILE


def load_samples(db_file: str = DB_FILE) -> pd.DataFrame:
    conn = sqlite3.connect(db_file)
    df = pd.read_sql_query("SELECT * FROM samples", conn, parse_dates=["timestamp_utc"])
    conn.close()
    return df


def compute_multipliers(df: pd.DataFrame, rain_threshold_mm: float = 1.0,
                         min_confidence: float = 0.5) -> pd.DataFrame:
    """
    For each location, compares the average congestion ratio
    (freeflow_speed / current_speed - so higher means worse traffic)
    on rainy samples vs dry samples, controlling for hour-of-day and
    day-of-week so we're not comparing rainy rush hour to a calm Sunday.
    """
    df = df.dropna(subset=["current_speed_kmh", "freeflow_speed_kmh"]).copy()
    df = df[df["current_speed_kmh"] > 0]

    if "confidence" in df.columns:
        df = df[df["confidence"].fillna(1.0) >= min_confidence]

    df["is_rain"] = df["precipitation_mm"].fillna(0) >= rain_threshold_mm
    df["congestion_ratio"] = df["freeflow_speed_kmh"] / df["current_speed_kmh"]
    df["hour"] = df["timestamp_utc"].dt.hour
    df["dow"] = df["timestamp_utc"].dt.dayofweek

    grouped = (
        df.groupby(["location_name", "hour", "dow", "is_rain"])["congestion_ratio"]
        .mean()
        .reset_index()
    )

    pivot = grouped.pivot_table(
        index=["location_name", "hour", "dow"],
        columns="is_rain",
        values="congestion_ratio",
    )

    # Guard against buckets that only ever saw rain or only ever saw dry
    if True not in pivot.columns or False not in pivot.columns:
        raise RuntimeError(
            "Not enough data yet - need both rain and dry samples for the "
            "same hour/day-of-week buckets. Keep collecting."
        )

    pivot = pivot.rename(columns={True: "rain_ratio", False: "dry_ratio"}).dropna()
    pivot["multiplier"] = pivot["rain_ratio"] / pivot["dry_ratio"]

    summary = (
        pivot.groupby("location_name")
        .agg(
            avg_multiplier=("multiplier", "mean"),
            buckets_compared=("multiplier", "count"),
        )
        .sort_values("avg_multiplier", ascending=False)
    )
    return summary


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--rain-threshold", type=float, default=1.0,
        help="mm/hour precipitation above which a sample counts as 'rain' (default: 1.0)",
    )
    args = parser.parse_args()

    df = load_samples()
    if df.empty:
        print("No data yet - let the collector run for a while first.")
        return

    print(f"Loaded {len(df)} samples across {df['location_name'].nunique()} locations.\n")
    summary = compute_multipliers(df, rain_threshold_mm=args.rain_threshold)
    pd.set_option("display.float_format", "{:.2f}".format)
    print("Top rain choke points (by avg. congestion multiplier, rain vs dry):\n")
    print(summary)


if __name__ == "__main__":
    main()
