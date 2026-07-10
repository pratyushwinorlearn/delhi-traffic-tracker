import { NextResponse } from 'next/server';
import sqlite3 from 'sqlite3';
import path from 'path';

export async function GET() {
  // CORRECTED PATH: process.cwd() is the 'delhi-traffic-map' folder. 
  // We go up one level '../' to reach 'delhi-rain-traffic/traffic_weather.db'
  const dbPath = path.resolve(process.cwd(), '../traffic_weather.db');
  
  const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY);

  return new Promise((resolve, reject) => {
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

    db.all(query, [], (err, rows) => {
      if (err) {
        db.close();
        return resolve(NextResponse.json({ error: err.message }, { status: 500 }));
      }
      db.close();
      resolve(NextResponse.json(rows));
    });
  });
}