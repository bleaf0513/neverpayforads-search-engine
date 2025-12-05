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
  const infoWindowRef = useRef<any>(null);
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
      const batchSize = 10;
      for (let i = 0; i < logosToLoad.length; i += batchSize) {
        const batch = logosToLoad.slice(i, i + batchSize);
        await Promise.all(
          batch.map(async ({ bankName, cardId }) => {
            try {
              const logo = await getBankLogo(bankName, null);
              const key = `${cardId}-${bankName}`;
              setBankLogos((prev) => {
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
  }, [data.rows]);

  useEffect(() => {
    let map: any;
    let heatmap: any;

    const initializeMap = async () => {
      try {
        await loader.load();
        const mapEl = document.getElementById(window.innerWidth >= 1024 ? 'map-desktop' : 'map-mobile');
        if (!mapEl) return;

        map = new google.maps.Map(mapEl, { center: { lat: 0, lng: 0 }, zoom: 2 });
        mapRef.current = map;

        markersRef.current.forEach((m) => m.setMap(null));
        markersRef.current = [];

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

    setTimeout(initializeMap, 0);

    return () => {
      markersRef.current.forEach((m) => m.setMap(null));
      markersRef.current = [];
      if (heatmapRef.current) {
        heatmapRef.current.setMap(null);
        heatmapRef.current = null;
      }
    };
  }, [loader, data.rows, showHeatmap]);

  // --- NEW: Auto-move map to filtered points ---
  useEffect(() => {
    const map = mapRef.current;
    if (!map || typeof google === 'undefined') return;

    const points = data.rows
      .filter(c => {
        const matchCountry = !filters.country || c.country_name === filters.country;
        const matchState = !filters.state || c.state_name === filters.state;
        const matchCard = !filters.cardNumber || c.card_number.includes(filters.cardNumber);
        const matchBank = !filters.bankName || c.bank_name.includes(filters.bankName);
        const matchHolder = !filters.cardholder || c.cardholder_name.includes(filters.cardholder);
        return matchCountry && matchState && matchCard && matchBank && matchHolder && c.latitude && c.longitude;
      })
      .map(c => new google.maps.LatLng(c.latitude!, c.longitude!));

    if (points.length === 0) {
      map.setCenter({ lat: 0, lng: 0 });
      map.setZoom(2);
    } else if (points.length === 1) {
      map.panTo(points[0]);
      map.setZoom(8);
    } else {
      const bounds = new google.maps.LatLngBounds();
      points.forEach(p => bounds.extend(p));
      map.fitBounds(bounds);
      setTimeout(() => {
        const center = bounds.getCenter();
        if (center) map.panTo(center);
      }, 200);
    }
  }, [filters, data.rows]);

  const hasNext = offset + limit < data.total;
  const hasPrev = offset > 0;

  const getCardLogo = (card: Card): string | null => {
    const key = `${card.id}-${card.bank_name}`;
    if (bankLogos[key]) return bankLogos[key];
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
      {/* ... Your entire mobile + desktop JSX layout here ... */}
      {/* No changes to the layout code are needed */}
    </div>
  );
}
