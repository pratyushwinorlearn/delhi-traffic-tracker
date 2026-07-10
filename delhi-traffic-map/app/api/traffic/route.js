import { NextResponse } from 'next/server';
import { Pool } from 'pg';

// 1. THIS IS THE MAGIC LINE TO FIX THE VERCEL BUILD
export const dynamic = 'force-dynamic';

// Initialize the Postgres connection pool to Supabase
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false // Supabase requires SSL connections
  }
});

export async function GET() {
  try {
    // Get the most recent data point for each location
    const query = `
      SELECT t1.*
      FROM samples t1
      INNER JOIN (
          SELECT location_name, MAX(timestamp_utc) as max_time
          FROM samples
          GROUP BY location_name
      ) t2 ON t1.location_name = t2.location_name AND t1.timestamp_utc = t2.max_time;
    `;

    // Query Postgres instead of SQLite
    const { rows } = await pool.query(query);
    
    return NextResponse.json(rows);
  } catch (error) {
    console.error("Database Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}