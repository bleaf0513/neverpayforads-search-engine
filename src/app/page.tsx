"use client";
import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader } from '@googlemaps/js-api-loader';
import { getBankLogo } from '@/lib/bank-logos';
declare const google: any;

type Card = {
  id: number;
  card_number: string;
  cardholder_name: string;
  bank_name: string;
  bank_logo: string | null;
  expiry_date: string | null;
  country_code: string | null;
  country_name: string | null;
  state_code: string | null;
  state_name: string | null;
  city: string | null;
  owner_phone: string | null;
  owner_email: string | null;
  latitude: number | null;
  longitude: number | null;
};

export default function Home() {
  const [filters, setFilters] = useState({ country: '', state: '', cardNumber: '', bankName: '', cardholder: '' });
  const [data, setData] = useState<{ rows: Card[]; total: number }>({ rows: [], total: 0 });
  const [loading, setLoading] = useState(false);
  const [options, setOptions] = useState<{ countries: string[]; states: string[] }>({ countries: [], states: [] });
  const [offset, setOffset] = useState(0);
  const limit = 100;
  const [showHeatmap, setShowHeatmap] = useState(false);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const heatmapRef = useRef<any>(null);
  const lastMapContainerRef = useRef<HTMLElement | null>(null);
  const infoWindowRef = useRef<any>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [bankLogos, setBankLogos] = useState<Record<string, string | null>>({});
  const logoLoadingRef = useRef<Set<string>>(new Set());
  const canvasResizeObserverRef = useRef<ResizeObserver | null>(null);
  const loader = useMemo(
    () =>
      new Loader({
        apiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY!,
        version: "weekly",
        libraries: ["visualization", "marker"],
      }),
    []
  );

  const queryString = useMemo(() => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(filters)) if (v) p.set(k, v);
    p.set('limit', String(limit));
    p.set('offset', String(offset));
    return p.toString();
  }, [filters, offset, limit, refreshKey]);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/cards?${queryString}`)
      .then((r) => r.json())
      .then((d) => setData(d))
      .finally(() => setLoading(false));
  }, [queryString]);

  useEffect(() => {
    const url = filters.country ? `/api/options?country=${encodeURIComponent(filters.country)}` : '/api/options';
    fetch(url)
      .then((r) => r.json())
      .then((d) => setOptions(d))
      .catch(() => {});
  }, [filters.country]);

  // Load bank logos for cards that don't have them
  useEffect(() => {
    const loadLogos = async () => {
      const logosToLoad: Array<{ bankName: string; cardId: number }> = [];

      data.rows.forEach((card) => {
        const key = `${card.id}-${card.bank_name}`;
        if (!card.bank_logo && !bankLogos[key] && !logoLoadingRef.current.has(key)) {
          logosToLoad.push({ bankName: card.bank_name, cardId: card.id });
          logoLoadingRef.current.add(key);
        }
      });

      if (logosToLoad.length === 0) return;

      // Load logos in parallel (with a limit to avoid too many requests)
      const batchSize = 10;
      for (let i = 0; i < logosToLoad.length; i += batchSize) {
        const batch = logosToLoad.slice(i, i + batchSize);
        await Promise.all(
          batch.map(async ({ bankName, cardId }) => {
            try {
              const logo = await getBankLogo(bankName, null);
              const key = `${cardId}-${bankName}`;
              setBankLogos((prev) => {
                // Only update if not already set
                if (prev[key]) return prev;
                return { ...prev, [key]: logo };
              });
            } catch (error) {
              console.error(`Failed to load logo for ${bankName}:`, error);
              const key = `${cardId}-${bankName}`;
              setBankLogos((prev) => {
                if (prev[key]) return prev;
                return { ...prev, [key]: null };
              });
            }
          })
        );
      }
    };

    loadLogos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.rows]);

  useEffect(() => {
    // Wait for DOM to be ready

    // Initialize map (left intentionally minimal — preserve any existing initialization elsewhere)
useEffect(() => {
  let map: any;
  let heatmap: any;

  const initializeMap = async () => {
    try {
      await loader.load();

      // Choose correct container
      const mapEl = document.getElementById(window.innerWidth >= 1024 ? 'map-desktop' : 'map-mobile');
      if (!mapEl) return;

      // Initialize map
      map = new google.maps.Map(mapEl, {
        center: { lat: 0, lng: 0 },
        zoom: 2,
      });
      mapRef.current = map;

      // Clear old markers
      markersRef.current.forEach((m) => m.setMap(null));
      markersRef.current = [];

      // Add markers
      data.rows.forEach((card) => {
        if (card.latitude && card.longitude) {
          const marker = new google.maps.Marker({
            position: { lat: card.latitude, lng: card.longitude },
            map,
            title: card.cardholder_name,
          });
          markersRef.current.push(marker);
        }
      });

      // Add heatmap if selected
      if (showHeatmap) {
        heatmap = new google.maps.visualization.HeatmapLayer({
          data: data.rows
            .filter(c => c.latitude && c.longitude)
            .map(c => new google.maps.LatLng(c.latitude!, c.longitude!)),
          map,
        });
        heatmapRef.current = heatmap;
      }
    } catch (err) {
      console.error('Google Maps failed to initialize', err);
    }
  };

  // Run after component mounts
  setTimeout(initializeMap, 0);

  return () => {
    // Cleanup
    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = [];
    if (heatmapRef.current) {
      heatmapRef.current.setMap(null);
      heatmapRef.current = null;
    }
  };
}, [loader, data.rows, showHeatmap]);

    // Handle window resize to fix blank screen issue with debouncing
    let resizeTimeout: NodeJS.Timeout | null = null;

    const handleResize = () => {
      // Clear existing timeout
      if (resizeTimeout) {
        clearTimeout(resizeTimeout);
      }

      // Debounce resize handler
      resizeTimeout = setTimeout(() => {
        // Handle Google Maps resize
        if (mapRef.current && typeof google !== 'undefined' && google.maps) {
          try {
            // Get the current visible map container
            const currentEl = (() => {
              const candidates = [
                document.getElementById('map-desktop') as HTMLElement | null,
                document.getElementById('map-mobile') as HTMLElement | null,
              ].filter(Boolean) as HTMLElement[];

              return candidates.find(
                (node) =>
                  node &&
                  node.offsetParent !== null &&
                  node.clientWidth > 0 &&
                  node.clientHeight > 0
              );
            })();

            if (currentEl && currentEl.clientWidth > 0 && currentEl.clientHeight > 0) {
              if (mapRef.current.getDiv) {
                const mapDiv = mapRef.current.getDiv();
                if (
                  mapDiv &&
                  mapDiv.offsetParent !== null &&
                  mapDiv.clientWidth > 0 &&
                  mapDiv.clientHeight > 0
                ) {
                  // Force redraw by updating center
                  const center = mapRef.current.getCenter();
                  if (center) {
                    mapRef.current.setCenter(center);
                  }

                  // Small retry to force refresh
                  setTimeout(() => {
                    if (mapRef.current && mapRef.current.setCenter) {
                      const c = mapRef.current.getCenter && mapRef.current.getCenter();
                      if (c) mapRef.current.setCenter(c);
                    }
                  }, 50);
                } else {
                  // Map div is not visible - wait a bit and try resize again
                  // Don't reinitialize immediately as it might cause white screen
                  setTimeout(() => {
                    if (mapRef.current && typeof google !== 'undefined' && google.maps) {
                      try {
                        const c = mapRef.current.getCenter && mapRef.current.getCenter();
                        if (c) mapRef.current.setCenter(c);
                      } catch (e) {
                        console.warn('Map resize failed, may need reinitialization');
                      }
                    }
                  }, 200);
                }
              } else {
                // Fallback: just trigger resize
                try {
                  google.maps.event.trigger(mapRef.current, 'resize');
                } catch (e) {
                  // ignore
                }
              }
            }
          } catch (err) {
            console.warn('Resize handler error', err);
          }
        }
      }, 150); // Wait 150ms after resize stops
    };

    window.addEventListener('resize', handleResize);

    // Cleanup function
    return () => {
      window.removeEventListener('resize', handleResize);
      if (resizeTimeout) {
        clearTimeout(resizeTimeout);
      }
      if (canvasResizeObserverRef.current) {
        canvasResizeObserverRef.current.disconnect();
        canvasResizeObserverRef.current = null;
      }
      // Cleanup canvas resize handlers
      if ((window as any).__canvasResizeCleanup) {
        (window as any).__canvasResizeCleanup();
        delete (window as any).__canvasResizeCleanup;
      }
    };
  }, [data, showHeatmap]);

  const hasNext = offset + limit < data.total;
  const hasPrev = offset > 0;

  // Helper function to get logo for a card
  const getCardLogo = (card: Card): string | null => {
    const key = `${card.id}-${card.bank_name}`;
    // First check if we have a fetched logo
    if (bankLogos[key]) {
      return bankLogos[key];
    }
    // Fall back to original logo
    return card.bank_logo;
  };

  function onExportCsv() {
    const headers = ['bank_name','card_number','cardholder_name','country_name','state_name','city','expiry_date','owner_email','owner_phone'];
    const lines = [headers.join(',')].concat(
      data.rows.map((r) => headers.map((h) => JSON.stringify((r as any)[h] ?? '')).join(','))
    );
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'cards.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Mobile Layout */}
      <div className="lg:hidden">
        <div className="bg-white shadow-sm border-b border-gray-200 p-4">
          <h1 className="text-xl font-bold text-gray-900 mb-4 tracking-tight">Credit Card Database</h1>

          {/* Mobile Filters - Collapsible */}
          <details className="bg-gray-50 rounded-lg">
            <summary className="p-3 cursor-pointer font-semibold text-gray-800 flex items-center gap-2">
              🔍 Filters
              <span className="ml-auto text-xs text-gray-500">Tap to expand</span>
            </summary>
            <div className="p-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1 uppercase tracking-wider">Country</label>
                  <select
                    className="w-full border border-gray-300 rounded-md px-2 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    value={filters.country}
                    onChange={(e) => setFilters({ ...filters, country: e.target.value, state: '' })}
                  >
                    <option value="">All Countries</option>
                    {options?.countries?.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1 uppercase tracking-wider">State</label>
                  <select
                    className="w-full border border-gray-300 rounded-md px-2 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    value={filters.state}
                    onChange={(e) => setFilters({ ...filters, state: e.target.value })}
                  >
                    <option value="">All States</option>
                    {options?.states?.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1 uppercase tracking-wider">Card Number</label>
                <input
                  className="w-full border border-gray-300 rounded-md px-2 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono"
                  placeholder="193"
                  value={filters.cardNumber}
                  onChange={(e) => setFilters({ ...filters, cardNumber: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1 uppercase tracking-wider">Bank</label>
                  <input
                    className="w-full border border-gray-300 rounded-md px-2 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="CIMB"
                    value={filters.bankName}
                    onChange={(e) => setFilters({ ...filters, bankName: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1 uppercase tracking-wider">Cardholder</label>
                  <input
                    className="w-full border border-gray-300 rounded-md px-2 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Abdul"
                    value={filters.cardholder}
                    onChange={(e) => setFilters({ ...filters, cardholder: e.target.value })}
                  />
                </div>
              </div>
            </div>
          </details>
        </div>

        {/* Mobile Content */}
        <div className="p-4 space-y-4">
          {/* Mobile Map */}
          <div className="flex items-center gap-3">
            <h3 className="text-base font-bold text-gray-900 flex items-center gap-2 tracking-tight">
              🌍 Geographic Distribution
            </h3>
            <label className="flex items-center gap-1 text-xs text-gray-600">
              <input type="radio" name="mapTypeMobile" checked={!showHeatmap} onChange={() => setShowHeatmap(false)} />
              <div className="w-2 h-2 rounded-full bg-blue-500"></div>
              Locations
            </label>
            <label className="flex items-center gap-1 text-xs text-gray-600">
              <input type="radio" name="mapTypeMobile" checked={showHeatmap} onChange={() => setShowHeatmap(true)} />
              <div className="w-2 h-2 rounded-full bg-red-500"></div>
              Density
            </label>
            <button
              className="ml-auto px-3 py-1 text-xs font-semibold bg-blue-600 text-white rounded-md"
              onClick={onExportCsv}
            >
              📊 Export
            </button>
          </div>
          <div id="map-mobile" className="w-full h-[300px]" />
        </div>

        {/* Mobile Results */}
        <div className="p-4">
          <div className="flex items-center justify-between text-sm">
            <div className="text-gray-600">
              {loading && (
                <span className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin"></div>
                  Loading...
                </span>
              )}
              {!loading && <span className="font-medium">{data.total} records</span>}
            </div>
            {data.total > limit && (
              <div className="flex items-center gap-1">
                <button
                  disabled={!hasPrev}
                  className={`px-2 py-1 text-xs font-semibold border rounded transition-all ${!hasPrev ? 'opacity-50 cursor-not-allowed border-gray-200 text-gray-400' : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`}
                  onClick={() => setOffset(Math.max(0, offset - limit))}
                >
                  ‹
                </button>
                <span className="text-xs text-gray-500 px-2 font-mono">
                  {Math.floor(offset / limit) + 1}/{Math.ceil(data.total / limit)}
                </span>
                <button
                  disabled={!hasNext}
                  className={`px-2 py-1 text-xs font-semibold border rounded transition-all ${!hasNext ? 'opacity-50 cursor-not-allowed border-gray-200 text-gray-400' : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`}
                  onClick={() => setOffset(offset + limit)}
                >
                  ›
                </button>
              </div>
            )}
          </div>

          {/* Mobile Cards */}
          <div className="mt-4 space-y-3">
            {data?.rows?.map((r) => (
              <div key={r.id} className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0">
                    {getCardLogo(r) ? (
                      <img
                        className="h-10 w-10 rounded-lg object-contain border border-gray-200 p-1 bg-white"
                        src={getCardLogo(r)!}
                        alt={r.bank_name}
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          target.style.display = 'none';
                          const fallback = target.nextElementSibling as HTMLElement;
                          if (fallback) fallback.style.display = 'flex';
                        }}
                      />
                    ) : null}
                    {!getCardLogo(r) && (
                      <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-red-500 to-red-600 flex items-center justify-center">
                        <span className="text-white text-xs font-bold">
                          {r.bank_name?.charAt(0) || 'B'}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-gray-900 mb-1">{r.cardholder_name}</div>
                    <div className="text-xs font-medium text-gray-600 mb-2">{r.bank_name}</div>
                    <div className="text-xs font-mono font-semibold text-gray-800 mb-2 tracking-wider">{r.card_number}</div>
                    <div className="flex items-center justify-between">
                      <div className="text-xs text-gray-500 flex items-center gap-1">
                        🌍 {[r.city, r.country_name].filter(Boolean).join(', ') || 'Unknown'}
                      </div>
                      <span className="inline-flex px-2 py-1 text-xs font-bold rounded-full bg-green-100 text-green-800">
                        {r.expiry_date}
                      </span>
                    </div>
                    <div className="mt-2 space-y-1">
                      {r.owner_email && (
                        <div className="text-xs text-gray-500 flex items-center gap-1">
                          📧 {r.owner_email}
                        </div>
                      )}
                      {r.owner_phone && (
                        <div className="text-xs text-gray-500 flex items-center gap-1">
                          📱 {r.owner_phone}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Desktop Layout */}
      <div className="hidden lg:flex h-screen">
        {/* Fixed Sidebar */}
        <div className="w-80 bg-white shadow-sm border-r border-gray-200 overflow-y-auto">
          <div className="p-6">
            <h1 className="text-2xl font-bold text-gray-900 mb-6 tracking-tight">Credit Card Database</h1>
            <div className="bg-gray-50 rounded-lg p-4">
              <h2 className="text-base font-semibold text-gray-800 mb-4 flex items-center gap-2 tracking-wide">
                🔍 Advanced Filters
              </h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-2 uppercase tracking-wider">Country</label>
                  <select
                    className="w-full border border-gray-300 rounded-md px-3 py-2.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                    value={filters.country}
                    onChange={(e) => setFilters({ ...filters, country: e.target.value, state: '' })}
                  >
                    <option value="">All Countries</option>
                    {options?.countries?.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-2 uppercase tracking-wider">State</label>
                  <select
                    className="w-full border border-gray-300 rounded-md px-3 py-2.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                    value={filters.state}
                    onChange={(e) => setFilters({ ...filters, state: e.target.value })}
                  >
                    <option value="">All States</option>
                    {options?.states?.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-2 uppercase tracking-wider">Card Number</label>
                  <input
                    className="w-full border border-gray-300 rounded-md px-3 py-2.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all font-mono"
                    placeholder="193"
                    value={filters.cardNumber}
                    onChange={(e) => setFilters({ ...filters, cardNumber: e.target.value })}
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-2 uppercase tracking-wider">Bank Name</label>
                  <input
                    className="w-full border border-gray-300 rounded-md px-3 py-2.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                    placeholder="CIMB"
                    value={filters.bankName}
                    onChange={(e) => setFilters({ ...filters, bankName: e.target.value })}
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-2 uppercase tracking-wider">Cardholder Name</label>
                  <input
                    className="w-full border border-gray-300 rounded-md px-3 py-2.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                    placeholder="Abdul"
                    value={filters.cardholder}
                    onChange={(e) => setFilters({ ...filters, cardholder: e.target.value })}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Main Content - THIS WILL NOW TAKE FULL REMAINING WIDTH */}
        <div className="flex-1 min-w-0 overflow-auto p-6">
          <div className="space-y-6 w-full">
            {/* Map Card */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200">
              <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
                <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2 tracking-tight">
                  🌍 Geographic Distribution
                </h3>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-2 text-sm text-gray-600">
                      <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                      Card Locations
                      <input type="radio" name="mapTypeDesktop" className="hidden" checked={!showHeatmap} onChange={() => setShowHeatmap(false)} />
                    </label>
                    <label className="flex items-center gap-2 text-sm text-gray-600">
                      <div className="w-3 h-3 rounded-full bg-red-500"></div>
                      High Density
                      <input type="radio" name="mapTypeDesktop" className="hidden" checked={showHeatmap} onChange={() => setShowHeatmap(true)} />
                    </label>
                  </div>
                  <div className="flex gap-2">
                    <button
                      className="px-4 py-2 text-sm font-semibold bg-gray-100 hover:bg-gray-200 rounded-md transition-all flex items-center gap-2 tracking-wide"
                      onClick={() => setRefreshKey((k) => k + 1)}
                    >
                      🔄 Refresh
                    </button>
                    <button
                      className="px-4 py-2 text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-all flex items-center gap-2 tracking-wide shadow-sm"
                      onClick={onExportCsv}
                    >
                      📊 Export Data
                    </button>
                  </div>
                </div>
              </div>
              <div id="map-desktop" className="w-full h-[400px]" />
            </div>

            {/* Results Summary */}
            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-600">
                {loading && (
                  <span className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin"></div>
                    Loading...
                  </span>
                )}
              </div>
              {data.total > limit && (
                <div className="flex items-center gap-2">
                  <button
                    disabled={!hasPrev}
                    className={`px-4 py-2 text-sm font-semibold border rounded-md transition-all ${!hasPrev ? 'opacity-50 cursor-not-allowed border-gray-200 text-gray-400' : 'border-gray-300 text-gray-700 hover:bg-gray-50 hover:border-gray-400'}`}
                    onClick={() => setOffset(Math.max(0, offset - limit))}
                  >
                    Previous
                  </button>
                  <span className="text-sm text-gray-500 px-3 font-mono font-medium">
                    {Math.floor(offset / limit) + 1} of {Math.ceil(data.total / limit)}
                  </span>
                  <button
                    disabled={!hasNext}
                    className={`px-4 py-2 text-sm font-semibold border rounded-md transition-all ${!hasNext ? 'opacity-50 cursor-not-allowed border-gray-200 text-gray-400' : 'border-gray-300 text-gray-700 hover:bg-gray-50 hover:border-gray-400'}`}
                    onClick={() => setOffset(offset + limit)}
                  >
                    Next
                  </button>
                </div>
              )}
            </div>

            {/* Credit Card Records Table */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-200">
                <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2 tracking-tight">
                  💳 Credit Card Records
                </h3>
                <p className="text-sm text-gray-500 mt-1 font-medium">
                  Showing {offset + 1} - {Math.min(offset + limit, data.total)} of {data.total} records
                </p>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">Bank</th>
                      <th className="px-6 py-3 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">Card Number</th>
                      <th className="px-6 py-3 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">Cardholder</th>
                      <th className="px-6 py-3 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">Location</th>
                      <th className="px-6 py-3 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">Expiry</th>
                      <th className="px-6 py-3 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">Contact</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {data?.rows?.map((r, i) => (
                      <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            <div className="flex-shrink-0 h-12 w-12">
                              {getCardLogo(r) ? (
                                <img
                                  className="h-12 w-12 rounded-lg object-contain border border-gray-200 p-1 bg-white"
                                  src={getCardLogo(r)!}
                                  alt={r.bank_name}
                                  onError={(e) => {
                                    const target = e.target as HTMLImageElement;
                                    target.style.display = 'none';
                                    const fallback = target.nextElementSibling as HTMLElement;
                                    if (fallback) fallback.style.display = 'flex';
                                  }}
                                />
                              ) : null}
                              {!getCardLogo(r) && (
                                <div className="h-12 w-12 rounded-lg bg-gradient-to-br from-red-500 to-red-600 flex items-center justify-center shadow-sm">
                                  <span className="text-white text-sm font-bold">
                                    {r.bank_name?.charAt(0) || 'B'}
                                  </span>
                                </div>
                              )}
                            </div>
                            <div className="ml-4">
                              <div className="text-sm font-semibold text-gray-900 tracking-tight">{r.bank_name}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-mono font-semibold text-gray-900 tracking-wider">
                            {r.card_number}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-gray-900">{r.cardholder_name}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900 flex items-center gap-1">
                            🌍 {[r.city, r.state_name || r.state_code, r.country_name || r.country_code].filter(Boolean).join(', ') || 'Unknown'}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="inline-flex px-3 py-1 text-xs font-bold rounded-full bg-green-100 text-green-800 tracking-wide">
                            {r.expiry_date}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          <div className="space-y-1">
                            <div className="flex items-center gap-1 font-medium">
                              📧 {r.owner_email}
                            </div>
                            <div className="flex items-center gap-1 font-medium">
                              📱 {r.owner_phone}
                            </div>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
