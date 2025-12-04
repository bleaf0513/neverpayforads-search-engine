"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Loader } from "@googlemaps/js-api-loader";
import { getBankLogo } from "@/lib/bank-logos";

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
  const [filters, setFilters] = useState({
    country: "",
    state: "",
    cardNumber: "",
    bankName: "",
    cardholder: "",
  });
    useEffect(() => {
    console.log("Google Map ID:", process.env.NEXT_PUBLIC_GOOGLE_MAP_ID);
  }, []);
  const [data, setData] = useState<{ rows: Card[]; total: number }>({
    rows: [],
    total: 0,
  });
  const [loading, setLoading] = useState(false);
  const [options, setOptions] = useState<{ countries: string[]; states: string[] }>({
    countries: [],
    states: [],
  });
  const [offset, setOffset] = useState(0);
  const limit = 100;
  const [showHeatmap, setShowHeatmap] = useState(false);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const heatmapRef = useRef<any>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [bankLogos, setBankLogos] = useState<Record<string, string | null>>({});
  const logoLoadingRef = useRef<Set<string>>(new Set());

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
    p.set("limit", String(limit));
    p.set("offset", String(offset));
    return p.toString();
  }, [filters, offset, limit, refreshKey]);

  // Fetch card data
  useEffect(() => {
    setLoading(true);
    fetch(`/api/cards?${queryString}`)
      .then((r) => r.json())
      .then((d) => setData(d))
      .finally(() => setLoading(false));
  }, [queryString]);

  // Fetch options
  useEffect(() => {
    const url = filters.country
      ? `/api/options?country=${encodeURIComponent(filters.country)}`
      : "/api/options";
    fetch(url)
      .then((r) => r.json())
      .then((d) => setOptions(d))
      .catch(() => {});
  }, [filters.country]);

  // Load bank logos
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

      const batchSize = 10;
      for (let i = 0; i < logosToLoad.length; i += batchSize) {
        const batch = logosToLoad.slice(i, i + batchSize);
        await Promise.all(
          batch.map(async ({ bankName, cardId }) => {
            try {
              const logo = await getBankLogo(bankName, null);
              const key = `${cardId}-${bankName}`;
              setBankLogos((prev) => (prev[key] ? prev : { ...prev, [key]: logo }));
            } catch {
              const key = `${cardId}-${bankName}`;
              setBankLogos((prev) => (prev[key] ? prev : { ...prev, [key]: null }));
            }
          })
        );
      }
    };

    loadLogos();
  }, [data.rows, bankLogos]);

  // Initialize map
  useEffect(() => {
    const initializeMap = async () => {
      await loader.load();
      const firstCard = data.rows.find((c) => c.latitude && c.longitude);
      const center = firstCard ? { lat: firstCard.latitude!, lng: firstCard.longitude! } : { lat: 0, lng: 0 };

      ["map-desktop", "map-mobile"].forEach((id) => {
        const el = document.getElementById(id);
        if (!el) return;

const map = new google.maps.Map(document.getElementById("map-desktop"), {
  center: { lat: 0, lng: 0 },
  zoom: 2,
  //mapId: process.env.NEXT_PUBLIC_GOOGLE_MAP_ID, // ✅ Add this
});
        if (id === "map-desktop") mapRef.current = map;

        // Add markers
        markersRef.current.forEach((m) => m.setMap(null));
        markersRef.current = data.rows
          .filter((c) => c.latitude && c.longitude)
          .map((c) => {
const marker = new google.maps.marker.AdvancedMarkerElement({
  map,
  position: { lat: c.latitude!, lng: c.longitude! },
  title: c.cardholder_name,
});


            const infoWindow = new google.maps.InfoWindow({
              content: `<div><strong>${c.cardholder_name}</strong><br/>${c.bank_name}<br/>${c.city || ''}, ${c.country_name || ''}</div>`,
            });

            marker.addListener("click", () => infoWindow.open(map, marker));
            return marker;
          });

        // Heatmap
        if (showHeatmap) {
          const heatmapData = data.rows
            .filter((c) => c.latitude && c.longitude)
            .map((c) => new google.maps.LatLng(c.latitude!, c.longitude!));

          if (heatmapRef.current) heatmapRef.current.setMap(null);
          heatmapRef.current = new google.maps.visualization.HeatmapLayer({ data: heatmapData, map });
        } else if (heatmapRef.current) {
          heatmapRef.current.setMap(null);
          heatmapRef.current = null;
        }
      });
    };

    initializeMap();
  }, [data.rows, showHeatmap, loader, refreshKey]);

  // Resize handling
  useEffect(() => {
    const handleResize = () => {
      if (mapRef.current) {
        google.maps.event.trigger(mapRef.current, "resize");
        const center = mapRef.current.getCenter();
        if (center) mapRef.current.setCenter(center);
      }
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const hasNext = offset + limit < data.total;
  const hasPrev = offset > 0;

  const getCardLogo = (card: Card): string | null => {
    const key = `${card.id}-${card.bank_name}`;
    return bankLogos[key] ?? card.bank_logo;
  };

  const onExportCsv = () => {
    const headers = [
      "bank_name",
      "card_number",
      "cardholder_name",
      "country_name",
      "state_name",
      "city",
      "expiry_date",
      "owner_email",
      "owner_phone",
    ];
    const lines = [headers.join(",")].concat(
      data.rows.map((r) => headers.map((h) => JSON.stringify((r as any)[h] ?? "")).join(","))
    );
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "cards.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // ------------------- FULL JSX LAYOUT -------------------
  return (
    <div className="min-h-screen bg-gray-50">
      {/* MOBILE LAYOUT */}
      <div className="lg:hidden">
        {/* Mobile Filters */}
        <div className="bg-white shadow-sm border-b border-gray-200 p-4">
          <h1 className="text-xl font-bold text-gray-900 mb-4 tracking-tight">
            Credit Card Database
          </h1>
          <details className="bg-gray-50 rounded-lg">
            <summary className="p-3 cursor-pointer font-semibold text-gray-800 flex items-center gap-2">
              🔍 Filters
              <span className="ml-auto text-xs text-gray-500">Tap to expand</span>
            </summary>
            <div className="p-4 space-y-3">
              {/* Country/State */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1 uppercase tracking-wider">
                    Country
                  </label>
                  <select
                    className="w-full border border-gray-300 rounded-md px-2 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    value={filters.country}
                    onChange={(e) => setFilters({ ...filters, country: e.target.value, state: "" })}
                  >
                    <option value="">All Countries</option>
                    {options?.countries?.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1 uppercase tracking-wider">
                    State
                  </label>
                  <select
                    className="w-full border border-gray-300 rounded-md px-2 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    value={filters.state}
                    onChange={(e) => setFilters({ ...filters, state: e.target.value })}
                  >
                    <option value="">All States</option>
                    {options?.states?.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Card Number, Bank, Cardholder */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1 uppercase tracking-wider">
                  Card Number
                </label>
                <input
                  className="w-full border border-gray-300 rounded-md px-2 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono"
                  placeholder="193"
                  value={filters.cardNumber}
                  onChange={(e) => setFilters({ ...filters, cardNumber: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1 uppercase tracking-wider">
                    Bank
                  </label>
                  <input
                    className="w-full border border-gray-300 rounded-md px-2 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="CIMB"
                    value={filters.bankName}
                    onChange={(e) => setFilters({ ...filters, bankName: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1 uppercase tracking-wider">
                    Cardholder
                  </label>
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

        {/* Mobile Map */}
        <div className="p-4">
          <div className="flex items-center gap-3 mb-2">
            <h3 className="text-base font-bold text-gray-900 flex items-center gap-2 tracking-tight">
              🌍 Geographic Distribution
            </h3>
            <label className="flex items-center gap-1 text-xs text-gray-600">
              <input
                type="radio"
                name="mapTypeMobile"
                checked={!showHeatmap}
                onChange={() => setShowHeatmap(false)}
              />
              <div className="w-2 h-2 rounded-full bg-blue-500"></div> Locations
            </label>
            <label className="flex items-center gap-1 text-xs text-gray-600">
              <input
                type="radio"
                name="mapTypeMobile"
                checked={showHeatmap}
                onChange={() => setShowHeatmap(true)}
              />
              <div className="w-2 h-2 rounded-full bg-red-500"></div> Density
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

        {/* Mobile Cards List */}
        <div className="p-4">
          {loading ? (
            <div className="text-gray-600 flex items-center gap-2">
              <div className="w-4 h-4 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin"></div>
              Loading...
            </div>
          ) : (
            <span className="font-medium">{data.total} records</span>
          )}
          <div className="mt-4 space-y-3">
            {data.rows.map((r) => (
              <div key={r.id} className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 flex gap-3">
                {getCardLogo(r) ? (
                  <img
                    className="h-10 w-10 rounded-lg object-contain border border-gray-200 p-1"
                    src={getCardLogo(r)!}
                    alt={r.bank_name}
                  />
                ) : (
                  <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-red-500 to-red-600 flex items-center justify-center text-white font-bold">
                    {r.bank_name?.charAt(0) || "B"}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-gray-900">{r.cardholder_name}</div>
                  <div className="text-xs font-medium text-gray-600">{r.bank_name}</div>
                  <div className="text-xs font-mono font-semibold text-gray-800">{r.card_number}</div>
                  <div className="text-xs text-gray-500">
                    🌍 {[r.city, r.state_name, r.country_name].filter(Boolean).join(", ") || "Unknown"}
                  </div>
                  <span className="inline-flex px-2 py-1 text-xs font-bold rounded-full bg-green-100 text-green-800">
                    {r.expiry_date}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* DESKTOP LAYOUT */}
      <div className="hidden lg:flex h-screen">
        {/* Sidebar Filters */}
        <div className="w-80 bg-white shadow-sm border-r border-gray-200 overflow-y-auto">
          <div className="p-6">
            <h1 className="text-2xl font-bold text-gray-900 mb-6 tracking-tight">
              Credit Card Database
            </h1>
            <div className="bg-gray-50 rounded-lg p-4 space-y-4">
              {/* Country */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-2 uppercase tracking-wider">
                  Country
                </label>
                <select
                  className="w-full border border-gray-300 rounded-md px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  value={filters.country}
                  onChange={(e) => setFilters({ ...filters, country: e.target.value, state: "" })}
                >
                  <option value="">All Countries</option>
                  {options?.countries?.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              {/* State */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-2 uppercase tracking-wider">
                  State
                </label>
                <select
                  className="w-full border border-gray-300 rounded-md px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  value={filters.state}
                  onChange={(e) => setFilters({ ...filters, state: e.target.value })}
                >
                  <option value="">All States</option>
                  {options?.states?.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              {/* Card Number */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-2 uppercase tracking-wider">
                  Card Number
                </label>
                <input
                  className="w-full border border-gray-300 rounded-md px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="193"
                  value={filters.cardNumber}
                  onChange={(e) => setFilters({ ...filters, cardNumber: e.target.value })}
                />
              </div>
              {/* Bank Name */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-2 uppercase tracking-wider">
                  Bank
                </label>
                <input
                  className="w-full border border-gray-300 rounded-md px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="CIMB"
                  value={filters.bankName}
                  onChange={(e) => setFilters({ ...filters, bankName: e.target.value })}
                />
              </div>
              {/* Cardholder */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-2 uppercase tracking-wider">
                  Cardholder
                </label>
                <input
                  className="w-full border border-gray-300 rounded-md px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Abdul"
                  value={filters.cardholder}
                  onChange={(e) => setFilters({ ...filters, cardholder: e.target.value })}
                />
              </div>
              {/* Export CSV */}
              <button
                className="w-full mt-4 px-3 py-2 text-sm font-semibold bg-blue-600 text-white rounded-md"
                onClick={onExportCsv}
              >
                📊 Export CSV
              </button>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex flex-col">
          {/* Map */}
          <div className="flex-1 p-4">
            <div className="flex items-center gap-3 mb-2">
              <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2 tracking-tight">
                🌍 Geographic Distribution
              </h3>
              <label className="flex items-center gap-1 text-xs text-gray-600">
                <input
                  type="radio"
                  name="mapType"
                  checked={!showHeatmap}
                  onChange={() => setShowHeatmap(false)}
                />
                <div className="w-2 h-2 rounded-full bg-blue-500"></div> Locations
              </label>
              <label className="flex items-center gap-1 text-xs text-gray-600">
                <input
                  type="radio"
                  name="mapType"
                  checked={showHeatmap}
                  onChange={() => setShowHeatmap(true)}
                />
                <div className="w-2 h-2 rounded-full bg-red-500"></div> Density
              </label>
            </div>
            <div id="map-desktop" className="w-full h-[450px]" />
          </div>

          {/* Cards Table */}
          <div className="p-4 overflow-y-auto flex-1">
            {loading ? (
              <div className="text-gray-600 flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin"></div>
                Loading...
              </div>
            ) : (
              <span className="font-medium">{data.total} records</span>
            )}

            <div className="mt-4 grid grid-cols-3 gap-4">
              {data.rows.map((r) => (
                <div key={r.id} className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 flex gap-3">
                  {getCardLogo(r) ? (
                    <img
                      className="h-10 w-10 rounded-lg object-contain border border-gray-200 p-1"
                      src={getCardLogo(r)!}
                      alt={r.bank_name}
                    />
                  ) : (
                    <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-red-500 to-red-600 flex items-center justify-center text-white font-bold">
                      {r.bank_name?.charAt(0) || "B"}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-gray-900">{r.cardholder_name}</div>
                    <div className="text-xs font-medium text-gray-600">{r.bank_name}</div>
                    <div className="text-xs font-mono font-semibold text-gray-800">{r.card_number}</div>
                    <div className="text-xs text-gray-500">
                      🌍 {[r.city, r.state_name, r.country_name].filter(Boolean).join(", ") || "Unknown"}
                    </div>
                    <span className="inline-flex px-2 py-1 text-xs font-bold rounded-full bg-green-100 text-green-800">
                      {r.expiry_date}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
