'use client';

import { useState, useEffect, useRef } from 'react';
import { ComposedChart, Line, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

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

// Defaulting to Delhi location
const MOCK_DATA: TrafficData[] = [
  { id: 1, location_name: "ITO Intersection", lat: 28.6284, lon: 77.2404, current_speed_kmh: 18, freeflow_speed_kmh: 35, precipitation_mm: 0.0, timestamp_utc: new Date().toISOString() },
];

export default function Home() {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markersLayerRef = useRef<any>(null);

  const [trafficData, setTrafficData] = useState<TrafficData[]>([]);
  const [historyData, setHistoryData] = useState<any[]>([]);
  const [selectedLocation, setSelectedLocation] = useState<string>("ITO Intersection");
  const [isRaining, setIsRaining] = useState(false);
  const [leafletLoaded, setLeafletLoaded] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string>('');
  const [showChart, setShowChart] = useState(false);

  // Fetch Live Data
  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch('/api/traffic');
        if (!res.ok) throw new Error("API not available");
        const data = await res.json();
        setTrafficData(data.length > 0 ? data : MOCK_DATA);
      } catch (error) {
        setTrafficData(MOCK_DATA);
      }
    };
    fetchData();
    const interval = setInterval(fetchData, 300000); 
    return () => clearInterval(interval);
  }, []);

  // Fetch Historical Data for Chart
  useEffect(() => {
    if (!showChart) return;
    const fetchHistory = async () => {
      try {
        const res = await fetch(`/api/history?location=${encodeURIComponent(selectedLocation)}`);
        const data = await res.json();
        
        // Format time for the chart X-axis
        const formatted = data.map((d: any) => ({
          ...d,
          time: new Date(d.timestamp_utc).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }));
        setHistoryData(formatted);
      } catch (err) {
        console.error("Failed to fetch history");
      }
    };
    fetchHistory();
  }, [showChart, selectedLocation]);

  // Dynamically load Leaflet
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

  // Initialize Map
  useEffect(() => {
    if (!leafletLoaded || !mapContainerRef.current || trafficData.length === 0) return;
    const L = (window as any).L;
    const tomTomKey = process.env.NEXT_PUBLIC_TOMTOM_KEY;

    if (!mapInstanceRef.current) {
      // Centered over Delhi
      mapInstanceRef.current = L.map(mapContainerRef.current, { zoomControl: false }).setView([28.6284, 77.2404], 11);
      
      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; OpenStreetMap &copy; CARTO',
        subdomains: 'abcd',
        maxZoom: 20
      }).addTo(mapInstanceRef.current);

      if (tomTomKey) {
        L.tileLayer(`https://api.tomtom.com/traffic/map/4/tile/flow/relative0/{z}/{x}/{y}.png?key=${tomTomKey}`, {
          maxZoom: 20, opacity: 0.8
        }).addTo(mapInstanceRef.current);
      }
      L.control.zoom({ position: 'bottomright' }).addTo(mapInstanceRef.current);
      markersLayerRef.current = L.layerGroup().addTo(mapInstanceRef.current);
    }

    markersLayerRef.current.clearLayers();
    let raining = false;

    trafficData.forEach(loc => {
      if (loc.precipitation_mm > 0) raining = true;
      const flowRatio = loc.current_speed_kmh / loc.freeflow_speed_kmh;
      const zoneColor = flowRatio < 0.5 ? '#ef4444' : flowRatio < 0.8 ? '#eab308' : '#22c55e';
      const delayPercentage = Math.round((1 - flowRatio) * 100);

      const marker = L.circle([loc.lat, loc.lon], {
        radius: 250, fillColor: zoneColor, color: zoneColor, weight: 2, opacity: 0.8, fillOpacity: 0.5
      });

      // Make circles clickable to change the graph!
      marker.on('click', () => {
        setSelectedLocation(loc.location_name);
        setShowChart(true);
      });

      const popupContent = `
        <div style="font-family: sans-serif; padding: 6px; min-width: 180px;">
          <h3 style="font-weight: bold; font-size: 16px; margin: 0 0 8px 0; color: #111;">${loc.location_name}</h3>
          <div style="background: #f3f4f6; padding: 8px; border-radius: 6px; margin-bottom: 8px;">
            <p style="margin: 0 0 4px 0; font-size: 12px; color: #666; text-transform: uppercase;">Live Impact</p>
            <p style="margin: 0; font-size: 20px; font-weight: 800; color: ${zoneColor};">${delayPercentage > 0 ? `+${delayPercentage}% Slower` : 'Clear'}</p>
          </div>
          <div style="display: flex; justify-content: space-between; margin: 8px 0; padding-bottom: 8px; border-bottom: 1px solid #eee;">
            <div>
              <p style="margin: 0; font-size: 11px; color: #666;">Current</p>
              <p style="margin: 0; font-size: 14px; font-weight: bold;">${loc.current_speed_kmh} km/h</p>
            </div>
            <div style="text-align: right;">
              <p style="margin: 0; font-size: 11px; color: #666;">Normal</p>
              <p style="margin: 0; font-size: 14px; font-weight: bold; color: #16a34a;">${loc.freeflow_speed_kmh} km/h</p>
            </div>
          </div>
        </div>
      `;
      marker.bindPopup(popupContent);
      marker.addTo(markersLayerRef.current);
    });

    if (trafficData.length > 0) {
      const group = L.featureGroup(markersLayerRef.current.getLayers());
      mapInstanceRef.current.fitBounds(group.getBounds(), { padding: [50, 50], maxZoom: 15 });
    }

    setIsRaining(raining);
    if (trafficData.length > 0 && trafficData[0].timestamp_utc) {
      setLastUpdated(new Date(trafficData[0].timestamp_utc).toLocaleTimeString());
    }
  }, [leafletLoaded, trafficData]);

  // FIXED Tooltip rendering logic to grab values by specific names instead of array index
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const rainData = payload.find((p: any) => p.dataKey === 'precipitation_mm')?.value || 0;
      const normalData = payload.find((p: any) => p.dataKey === 'freeflow_speed_kmh')?.value || 0;
      const liveData = payload.find((p: any) => p.dataKey === 'current_speed_kmh')?.value || 0;

      return (
        <div className="bg-black/90 border border-white/10 p-3 rounded-lg shadow-xl text-xs font-sans">
          <p className="text-gray-400 mb-2">{label}</p>
          <p className="text-green-400">Normal Speed: <span className="font-bold">{normalData} km/h</span></p>
          <p className="text-red-400 mb-2">Live Speed: <span className="font-bold">{liveData} km/h</span></p>
          {rainData > 0 && (
            <p className="text-blue-400 pt-2 border-t border-white/10 mt-2">Rain: {rainData} mm/hr</p>
          )}
        </div>
      );
    }
    return null;
  };

  return (
    <main className="w-screen h-screen relative bg-black overflow-hidden font-sans">
      <div ref={mapContainerRef} className="absolute inset-0 z-0" />

      <div className={`absolute top-6 left-6 ${showChart ? 'w-[600px]' : 'w-96'} transition-all duration-300 ease-in-out bg-black/80 backdrop-blur-xl border border-white/10 rounded-2xl p-6 text-white shadow-[0_0_40px_rgba(0,0,0,0.8)] z-[1000]`}>
        <div className="flex justify-between items-start mb-6">
          <div>
            <h1 className="text-2xl font-bold mb-1 tracking-tight">Delhi NCR Live Map</h1>
            <p className="text-sm text-gray-400">Real-time rain impact vs normal flow</p>
          </div>
          <button 
            onClick={() => setShowChart(!showChart)}
            className="px-4 py-2 bg-white/10 hover:bg-white/20 border border-white/10 rounded-lg text-sm font-medium transition-colors"
          >
            {showChart ? 'Hide Trends' : 'View Trends \u2192'}
          </button>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-4">
          <div className="p-4 bg-white/5 rounded-xl border border-white/5">
            <span className="text-gray-400 text-xs uppercase tracking-wider block mb-2">Flow Status</span>
            <span className="flex items-center gap-2 text-sm font-semibold text-green-400">
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.8)]" />
              TomTom Live
            </span>
          </div>
          <div className="p-4 bg-white/5 rounded-xl border border-white/5">
            <span className="text-gray-400 text-xs uppercase tracking-wider block mb-2">Weather</span>
            <span className={`text-sm font-semibold ${isRaining ? 'text-blue-400 drop-shadow-md' : 'text-gray-200'}`}>
              {isRaining ? '🌧️ Rain Detected' : '☀️ Dry'}
            </span>
          </div>
        </div>

        {showChart && (
          <div className="mt-6 pt-6 border-t border-white/10 animate-in fade-in slide-in-from-top-4 duration-500">
            <h3 className="text-sm font-semibold text-gray-300 mb-4">Timeline: <span className="text-white">{selectedLocation}</span></h3>
            {historyData.length < 2 ? (
              <div className="h-48 flex items-center justify-center text-sm text-gray-500">
                Waiting for GitHub Actions to collect more data points...
              </div>
            ) : (
              <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={historyData} margin={{ top: 5, right: 0, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                    <XAxis dataKey="time" stroke="#888" fontSize={11} tickMargin={10} minTickGap={30} />
                    <YAxis yAxisId="left" stroke="#888" fontSize={11} domain={[0, 50]} />
                    <YAxis yAxisId="right" orientation="right" stroke="#60a5fa" fontSize={11} domain={[0, 'auto']} hide />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: '12px' }} />
                    <Area yAxisId="right" type="monotone" dataKey="precipitation_mm" fill="#3b82f6" stroke="none" opacity={0.15} name="Rainfall (mm)" />
                    <Line yAxisId="left" type="monotone" dataKey="freeflow_speed_kmh" stroke="#22c55e" strokeWidth={2} strokeDasharray="5 5" dot={false} name="Normal Flow" />
                    <Line yAxisId="left" type="monotone" dataKey="current_speed_kmh" stroke="#ef4444" strokeWidth={2} dot={false} name="Live Speed" />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* THE NEW LIVE BOTTLENECK LEADERBOARD */}
            <div className="mt-6 pt-4 border-t border-white/10">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Live Top Bottlenecks</h3>
              <div className="space-y-2">
                {[...trafficData]
                  .map(d => ({ ...d, delay: Math.round((1 - d.current_speed_kmh / d.freeflow_speed_kmh) * 100) }))
                  .sort((a, b) => b.delay - a.delay)
                  .slice(0, 3) // Show the top 3 worst areas
                  .map((loc, i) => (
                    <div 
                      key={loc.id} 
                      onClick={() => setSelectedLocation(loc.location_name)}
                      className="flex justify-between items-center bg-white/5 p-2.5 rounded-lg cursor-pointer hover:bg-white/10 transition-colors border border-white/5"
                    >
                      <span className="text-sm text-gray-200 truncate pr-2">
                        <span className="text-gray-500 font-mono mr-2">#{i+1}</span>
                        {loc.location_name}
                      </span>
                      <span className="text-sm font-bold text-red-400">+{loc.delay}%</span>
                    </div>
                  ))}
              </div>
            </div>

          </div>
        )}

        <div className="mt-4 text-xs text-gray-500 text-center">
          Last recorded data point: {lastUpdated || 'Connecting...'}
        </div>
      </div>
    </main>
  );
}