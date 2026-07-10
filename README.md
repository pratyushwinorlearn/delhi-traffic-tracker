# Delhi Rain Choke Points

Collects live traffic + rainfall data at 15 known Delhi waterlogging hotspots,
so you can compute an actual "Xx normal, 3x on rainy days" multiplier per
location instead of guessing — for the "top 10 Delhi rain choke points" piece.

## How it works

Every time `collector.py` runs, it does one pass over all 15 locations in
`config/locations.json` and records, per location:

- **Traffic**: current speed vs. free-flow speed (TomTom Traffic Flow API)
- **Weather**: rainfall right now, mm/hour (Open-Meteo)

...into a local SQLite file (`traffic_weather.db`). Run it on a schedule
(cron, every 15-30 min) and over the rest of this monsoon season you'll build
up enough rain + dry samples to compute a real multiplier with `analyze.py`.

## 1. Setup

```bash
cd delhi-rain-traffic
pip install -r requirements.txt --break-system-packages   # or use a venv
cp .env.example .env
```

Get a free TomTom API key (no credit card needed):
1. Sign up at https://developer.tomtom.com/
2. Create an API key from the dashboard
3. Paste it into `.env` as `TOMTOM_API_KEY=...`

Open-Meteo (the weather source) needs no key or signup at all.

## 2. Test it once

```bash
python collector.py
```

You should see one log line per location with current speed and rainfall.
Check `traffic_weather.db` got created (any SQLite viewer, or `sqlite3
traffic_weather.db "select count(*) from samples;"`).

## 3. Schedule it (this is the part that matters)

A single run is useless — you need weeks of samples spanning both rain and
dry conditions at the same hours of day. Put this on whatever machine stays
on 24/7 (your DigitalOcean droplet is perfect for this, same as where Pratify
runs).

Every 20 minutes via cron:

```bash
crontab -e
# add this line:
*/20 * * * * cd /path/to/delhi-rain-traffic && /usr/bin/python3 collector.py >> collector.log 2>&1
```

**Budget check:** 15 locations × 3 runs/hour × 24 hours = 1,080 TomTom calls/day
and ~1,080 Open-Meteo calls/day — comfortably inside TomTom's ~2,500/day free
tier and Open-Meteo's ~10,000/day free tier, with headroom to add more
locations later if you want.

Let this run continuously through the rest of the monsoon (typically into
September) — you want multiple distinct rain events, not just one storm, or
your "3x" number is really just "that one Tuesday's number."

## 4. Analyze once you have data

```bash
python analyze.py
python analyze.py --rain-threshold 2.0   # tune what counts as "rain"
```

This groups samples by hour-of-day and day-of-week, compares average
congestion (rain vs. dry) within each bucket, then averages across buckets
per location — so a rainy 6pm is only ever compared to a dry 6pm, never to a
calm Sunday morning. Output is your locations ranked by real, computed
multiplier. It'll refuse to run (on purpose) until there's enough overlap
between rain and dry samples per location — that's expected early on.

## Notes on rigor for the write-up

- **Coordinates are one carriageway, not the whole junction.** TomTom's Flow
  API returns data for the nearest road segment to the point you send. Before
  you fully commit, sanity-check each point on Google Maps and nudge it onto
  the actual lane/direction you care about — a point 50m off can land you on
  a side road with unrelated traffic.
- **`confidence`** (0–1, in the DB) reflects how much real floating-car data
  backs that speed reading. `analyze.py` already filters out low-confidence
  samples by default.
- **15 candidates, not 10 on purpose** — you'll likely find a couple of these
  don't show a strong rain effect once you have real numbers, or that a
  couple of surprises show up. Better to over-sample now and cut to your
  final 10 once the data's in than to have committed too early.
- These 15 locations came from Delhi Traffic Police / PWD monsoon hotspot
  advisories (169–448 flagged citywide) and recent rain-event news reports —
  a credible starting point, but your computed multipliers are the actual
  new contribution of the piece.
