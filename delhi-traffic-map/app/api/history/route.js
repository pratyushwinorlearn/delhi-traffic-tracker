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
      WHERE location_name = 'Film City Sector 16A, Noida'
      ORDER BY timestamp_utc ASC
      LIMIT 96;
    `;

    const { rows } = await pool.query(query);
    return NextResponse.json(rows);
  } catch (error) {
    console.error("History API Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}