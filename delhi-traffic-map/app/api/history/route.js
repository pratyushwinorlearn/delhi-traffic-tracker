import { NextResponse } from 'next/server';
import { Pool } from 'pg';

export const dynamic = 'force-dynamic';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

export async function GET() {
  try {
    // Fetch the last 96 data points (24 hours at 15-min intervals) sorted by time
    const query = `
      SELECT timestamp_utc, current_speed_kmh, freeflow_speed_kmh, precipitation_mm
      FROM samples
<comment-tag id="1">      WHERE location_name = 'Film City Sector 16A, Noida'
      ORDER BY timestamp_utc ASC
      LIMIT 96;</comment-tag id="1" text="Update the historical data query to pull from one of your new Delhi locations, otherwise your trends chart will be completely empty! Also, since we changed the interval to 30 minutes, 24 hours of data is now exactly 48 data points, not 96.

      WHERE location_name = 'ITO Intersection'
      ORDER BY timestamp_utc ASC
      LIMIT 48;" type="suggestion">
    `;

    const { rows } = await pool.query(query);
    return NextResponse.json(rows);
  } catch (error) {
    console.error("History API Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}