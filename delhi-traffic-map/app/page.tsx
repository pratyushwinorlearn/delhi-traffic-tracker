'use client';

import { useState, useEffect, useRef } from 'react';

// TypeScript interface for our traffic data
interface TrafficData {
  id: number;
  location_name: string;
  lat: number;
  lon: number;
  current_speed_kmh: number;
  freeflow_speed_kmh: number;
  precipitation_mm: number;
  timestamp_utc: string;
}

// Updated fallback mock data for Noida Sector 16A
const MOCK_DATA: TrafficData[] = [
  { id: 1, location_name: "Film City Sector 16A, Noida", lat: 28.5682, lon: 77.3143, current_speed_kmh: 18, freeflow_speed_kmh: 35, precipitation_mm: 0.0, timestamp_utc: new Date().toISOString() },
];

export default function Home() {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markersLayerRef = useRef<any>(null);

  const [trafficData, setTrafficData] = useState<TrafficData[]>([]);
  const [isRaining, setIsRaining] = useState(false);
  const [leafletLoaded, setLeafletLoaded] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string>('');

  // 1. Fetch data from SQLite API
  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch('/api/traffic');
        if (!res.ok) throw new Error("API not available");
        const data = await res.json();
        // Fallback to mock data if the database returns an empty array
        setTrafficData(data.length > 0 ? data : MOCK_DATA);
      } catch (error) {
        console.log("Using mock data as fallback for preview environment.");
        setTrafficData(MOCK_DATA);
      }
    };
    
    fetchData();
    const interval = setInterval(fetchData, 300000); 
    return () => clearInterval(interval);
  }, []);

  // 2. Dynamically load the Mapping Library (Leaflet JS & CSS) to avoid bundler errors
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(link);

    const script = document.createElement('script');
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.onload = () => setLeafletLoaded(true);
    document.head.appendChild(script);

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // 3. Initialize the Map and Render Traffic Markers
  useEffect(() => {
    if (!leafletLoaded || !mapContainerRef.current || trafficData.length === 0) return;

    const L = (window as any).L;
    const tomTomKey = process.env.NEXT_PUBLIC_TOMTOM_KEY;

    // Initialize map only once
    if (!mapInstanceRef.current) {
      // UPDATED VIEWPORT: Centered exactly on Noida Sector 16A, zoomed in closer
      mapInstanceRef.current = L.map(mapContainerRef.current, {
        zoomControl: false 
      }).setView([28.5682, 77.3143], 14); 

      // Apply a sleek Dark Mode Map tile layer completely free (CartoDB Dark Matter)
      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; OpenStreetMap &copy; CARTO',
        subdomains: 'abcd',
        maxZoom: 20
      }).addTo(mapInstanceRef.current);

      // TRAFFIC LAYER: This paints the red/yellow/green lines on all roads!
      if (tomTomKey) {
        L.tileLayer(`https://api.tomtom.com/traffic/map/4/tile/flow/relative0/{z}/{x}/{y}.png?key=${tomTomKey}`, {
          maxZoom: 20,
          opacity: 0.8,
          attribution: '&copy; TomTom Traffic'
        }).addTo(mapInstanceRef.current);
      }

      L.control.zoom({ position: 'bottomright' }).addTo(mapInstanceRef.current);

      // Create a layer group specifically for our markers
      markersLayerRef.current = L.layerGroup().addTo(mapInstanceRef.current);
    }

    // Clear existing markers before drawing new ones
    markersLayerRef.current.clearLayers();

    let raining = false;

    trafficData.forEach(loc => {
      if (loc.precipitation_mm > 0) raining = true;

      const flowRatio = loc.current_speed_kmh / loc.freeflow_speed_kmh;
      // Red for heavy jam, Yellow for moderate, Green for free flowing
      const zoneColor = flowRatio < 0.5 ? '#ef4444' : flowRatio < 0.8 ? '#eab308' : '#22c55e';
      
      // Calculate the "Spike": How much slower is it right now compared to free flow?
      const delayPercentage = Math.round((1 - flowRatio) * 100);

      // Create a glowing zone instead of a tiny dot
      const marker = L.circle([loc.lat, loc.lon], {
        radius: 400, // Size in meters
        fillColor: zoneColor,
        color: zoneColor,
        weight: 1,
        opacity: 0.8,
        fillOpacity: 0.3
      });

      // Construct the HTML payload for the popup
      const popupContent = `
        <div style="font-family: sans-serif; padding: 6px; min-width: 180px;">
          <h3 style="font-weight: bold; font-size: 16px; margin: 0 0 8px 0; color: #111;">${loc.location_name}</h3>
          
          <div style="background: #f3f4f6; padding: 8px; border-radius: 6px; margin-bottom: 8px;">
            <p style="margin: 0 0 4px 0; font-size: 12px; color: #666; text-transform: uppercase; letter-spacing: 0.5px;">Live Impact</p>
            <p style="margin: 0; font-size: 20px; font-weight: 800; color: ${zoneColor};">${delayPercentage > 0 ? `+${delayPercentage}% Slower` : 'Clear'}</p>
          </div>

          <div style="display: flex; justify-content: space-between; margin: 8px 0; padding-bottom: 8px; border-bottom: 1px solid #eee;">
            <div>
              <p style="margin: 0; font-size: 11px; color: #666;">Current</p>
              <p style="margin: 0; font-size: 14px; font-weight: bold;">${loc.current_speed_kmh} <span style="font-size:10px; font-weight:normal;">km/h</span></p>
            </div>
            <div style="text-align: right;">
              <p style="margin: 0; font-size: 11px; color: #666;">Normal</p>
              <p style="margin: 0; font-size: 14px; font-weight: bold; color: #16a34a;">${loc.freeflow_speed_kmh} <span style="font-size:10px; font-weight:normal;">km/h</span></p>
            </div>
          </div>
          
          ${loc.precipitation_mm > 0 ? `
            <div style="background: #eff6ff; padding: 6px; border-radius: 4px; border: 1px solid #bfdbfe;">
              <p style="margin: 0; font-size: 12px; font-weight: 600; color: #1d4ed8;">🌧️ Rain: ${loc.precipitation_mm}mm/hr</p>
            </div>
          ` : ''}
        </div>
      `;

      marker.bindPopup(popupContent);
      marker.addTo(markersLayerRef.current);
    });

    setIsRaining(raining);
    if (trafficData.length > 0 && trafficData[0].timestamp_utc) {
      setLastUpdated(new Date(trafficData[0].timestamp_utc).toLocaleTimeString());
    }

  }, [leafletLoaded, trafficData]);

  return (
    <main className="w-screen h-screen relative bg-black overflow-hidden">
      
      {/* Background Full-Screen Map */}
      <div ref={mapContainerRef} className="absolute inset-0 z-0" />

      {/* Floating Glassmorphism Dashboard Overlay (High z-index to stay above the map) */}
      <div className="absolute top-6 left-6 w-96 bg-black/70 backdrop-blur-md border border-white/10 rounded-2xl p-6 text-white shadow-[0_0_40px_rgba(0,0,0,0.8)] z-[1000] font-sans">
        {/* Updated Title */}
        <h1 className="text-2xl font-bold mb-1 tracking-tight">Noida Sector 16A Traffic</h1>
        <p className="text-sm text-gray-400 mb-6">Real-time rain impact vs normal flow</p>

        <div className="space-y-4">
          <div className="flex justify-between items-center p-4 bg-white/5 rounded-xl border border-white/5">
            <span className="text-gray-300">City Flow Lines</span>
            <span className="flex items-center gap-2 text-sm font-semibold text-green-400">
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.8)]" />
              TomTom Live
            </span>
          </div>

          <div className="flex justify-between items-center p-4 bg-white/5 rounded-xl border border-white/5">
            <span className="text-gray-300">Weather Condition</span>
            <span className={`text-sm font-semibold ${isRaining ? 'text-blue-400 drop-shadow-md' : 'text-gray-200'}`}>
              {isRaining ? '🌧️ Active Precipitation' : '☀️ Dry Conditions'}
            </span>
          </div>

          <div className="p-4 bg-white/5 rounded-xl border border-white/5">
            <span className="text-gray-300 block mb-1">Monitored Data Zones</span>
            <span className="text-3xl font-light">{trafficData.length}</span>
            <span className="text-sm text-gray-400 ml-2">recording to SQLite</span>
          </div>
        </div>

        <div className="mt-6 text-xs text-gray-500 text-center">
          Last recorded data point: {lastUpdated || 'Connecting...'}
        </div>
      </div>
    </main>
  );
}