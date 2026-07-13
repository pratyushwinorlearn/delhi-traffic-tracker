import { NextResponse } from 'next/server';
import { Pool } from 'pg';

export const dynamic = 'force-dynamic';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

export async function GET() {
  try {
    const query = `
      SELECT timestamp_utc, current_speed_kmh, freeflow_speed_kmh, precipitation_mm
      FROM samples
      WHERE location_name = 'ITO Intersection'
      ORDER BY timestamp_utc ASC
      LIMIT 48;
    `;

    const { rows } = await pool.query(query);
    return NextResponse.json(rows);
  } catch (error) {
    console.error("History API Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}