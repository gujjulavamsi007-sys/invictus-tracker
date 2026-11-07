import React, { useEffect, useMemo, useRef, useState } from 'react';
import maplibregl, { type Map as MapLibreMap, type Marker as MapLibreMarker } from 'maplibre-gl';
import { AppLauncher } from '@capacitor/app-launcher';
import { Capacitor } from '@capacitor/core';
import {
  ArrowDownUp, Building2, Check, Clock3, Edit3,
  LocateFixed, MapPin, Navigation, Route as RouteIcon, Save, Search,
  Trash2, UserRound, X
} from 'lucide-react';
import {
  buildGoogleMapsDirectionsUrl, buildOsrmRouteUrl, buildPhotonSearchUrl,
  comparePlannedAndActualDistance, DEFAULT_GEOCODER_URL, DEFAULT_MAP_STYLE_URL,
  DEFAULT_ROUTING_URL, findMatchingMapClient,
  getLocationSuggestionId, isValidCoordinates, MAP_CLIENTS_STORAGE_KEY,
  MAP_DISMISSED_SUGGESTIONS_STORAGE_KEY, normalizeMapClient, normalizeOsrmRoute,
  normalizePhotonFeature, normalizeSavedMapClients, shouldSuggestMapClientSave
} from './mapLogic.mjs';
import 'maplibre-gl/dist/maplibre-gl.css';
import './maps.css';

type Coordinate = { lat: number; lon: number };
type MapClient = {
  id: string; name: string; business: string; address: string;
  lat: number; lon: number; notes: string; createdAt: string; updatedAt: string;
};
type MapPlace = Coordinate & { id: string; name: string; business?: string; address: string; clientId?: string };
type PlannedRoute = ReturnType<typeof normalizeOsrmRoute>;
type ActualTrip = { id: string | number; date?: string; totalKm?: number; visitor?: string; fromLoc?: string; toLoc?: string };
type ClientForm = { id?: string; name: string; business: string; address: string; lat: string; lon: string; notes: string };

const mapStyleUrl = import.meta.env.VITE_MAP_STYLE_URL || DEFAULT_MAP_STYLE_URL;
const geocoderUrl = import.meta.env.VITE_GEOCODER_URL || DEFAULT_GEOCODER_URL;
const routingUrl = import.meta.env.VITE_ROUTING_URL || DEFAULT_ROUTING_URL;
const HYDERABAD_CENTER: [number, number] = [78.4867, 17.385];

async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
  try { return await fetch(url, { ...options, signal: controller.signal }); }
  finally { window.clearTimeout(timeoutId); }
}

function readClients(): MapClient[] {
  try { return normalizeSavedMapClients(JSON.parse(localStorage.getItem(MAP_CLIENTS_STORAGE_KEY) || '[]')); }
  catch { return []; }
}

function readDismissedSuggestions(): Set<string> {
  try {
    const parsed = JSON.parse(localStorage.getItem(MAP_DISMISSED_SUGGESTIONS_STORAGE_KEY) || '[]');
    return new Set(Array.isArray(parsed) ? parsed.filter(value => typeof value === 'string') : []);
  } catch { return new Set(); }
}

function placeFromClient(client: MapClient): MapPlace {
  return { id: `client-${client.id}`, clientId: client.id, name: client.name, business: client.business, address: client.address, lat: client.lat, lon: client.lon };
}

function formatDuration(minutes: number) {
  const rounded = Math.max(1, Math.round(minutes));
  const hours = Math.floor(rounded / 60);
  const rest = rounded % 60;
  return hours ? `${hours} hr${hours > 1 ? 's' : ''}${rest ? ` ${rest} min` : ''}` : `${rest} min`;
}

function MapScreen({
  getCurrentLocation,
  officeLocation,
  trips
}: {
  getCurrentLocation: () => Promise<Coordinate>;
  officeLocation: Coordinate | null;
  trips: ActualTrip[];
}) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<MapLibreMarker[]>([]);
  const [mapReady, setMapReady] = useState(false);
  const [clients, setClients] = useState<MapClient[]>(readClients);
  const [currentLocation, setCurrentLocation] = useState<Coordinate | null>(null);
  const [locationError, setLocationError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<MapPlace[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [selectedPlace, setSelectedPlace] = useState<MapPlace | null>(null);
  const [plannedRoute, setPlannedRoute] = useState<PlannedRoute>(null);
  const [isRouting, setIsRouting] = useState(false);
  const [routeError, setRouteError] = useState('');
  const [expandedDirections, setExpandedDirections] = useState(false);
  const [isClientListOpen, setIsClientListOpen] = useState(false);
  const [savePromptPlace, setSavePromptPlace] = useState<MapPlace | null>(null);
  const [clientForm, setClientForm] = useState<ClientForm | null>(null);
  const [compareTripId, setCompareTripId] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    try { localStorage.setItem(MAP_CLIENTS_STORAGE_KEY, JSON.stringify(clients)); }
    catch (error) { console.error('Could not save client locations', error); setNotice('Could not save this client on the phone. Please check available storage.'); }
  }, [clients]);

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;
    const initialCenter = isValidCoordinates(officeLocation) ? [officeLocation.lon, officeLocation.lat] as [number, number] : HYDERABAD_CENTER;
    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: mapStyleUrl,
      center: initialCenter,
      zoom: 12,
      cooperativeGestures: true
    });
    mapRef.current = map;
    let displayErrorReported = false;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false, visualizePitch: false }), 'top-right');
    map.once('load', () => {
      if (mapRef.current !== map) return;
      map.addSource('planned-route', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({
        id: 'planned-route-casing', type: 'line', source: 'planned-route',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': '#ffffff', 'line-width': 10, 'line-opacity': 0.92 }
      });
      map.addLayer({
        id: 'planned-route-line', type: 'line', source: 'planned-route',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': '#087f9b', 'line-width': 6, 'line-opacity': 0.96 }
      });
      setMapReady(true);
    });
    map.on('error', event => {
      if ((event as any)?.error) {
        console.warn('Map display service reported an error', (event as any).error);
        if (!displayErrorReported) {
          displayErrorReported = true;
          setNotice('Map tiles could not load. Check your connection and try again.');
        }
        setMapReady(true);
      }
    });
    return () => {
      markersRef.current.forEach(marker => marker.remove());
      markersRef.current = [];
      map.remove();
      mapRef.current = null;
      setMapReady(false);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    getCurrentLocation().then(location => {
      if (cancelled || !isValidCoordinates(location)) return;
      setCurrentLocation(location);
      setLocationError('');
      mapRef.current?.flyTo({ center: [location.lon, location.lat], zoom: 14, essential: true });
    }).catch(() => {
      if (cancelled) return;
      setLocationError('Allow location access to plan a route from where you are.');
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const map = mapRef.current;
    const markers: MapLibreMarker[] = [];
    const addPin = (point: Coordinate, label: string, color: string, onClick?: () => void, small = false) => {
      const element = document.createElement('button');
      element.type = 'button';
      element.title = label;
      element.setAttribute('aria-label', label);
      element.style.width = small ? '18px' : '38px';
      element.style.height = small ? '18px' : '38px';
      element.style.borderRadius = '9999px';
      element.style.border = small ? '3px solid white' : '3px solid white';
      element.style.background = color;
      element.style.boxShadow = '0 2px 10px rgba(15, 42, 53, .28)';
      element.style.cursor = onClick ? 'pointer' : 'default';
      if (onClick) element.addEventListener('click', onClick);
      markers.push(new maplibregl.Marker({ element, anchor: 'center' }).setLngLat([point.lon, point.lat]).addTo(map));
    };
    if (currentLocation) addPin(currentLocation, 'Your current location', '#0874df', undefined, true);
    clients.forEach(client => addPin(client, client.name, '#178f68', () => {
      const place = placeFromClient(client);
      setSelectedPlace(place);
      setSavePromptPlace(null);
      setRouteError('');
      map.flyTo({ center: [client.lon, client.lat], zoom: 15, essential: true });
    }));
    if (selectedPlace) addPin(selectedPlace, selectedPlace.name, '#ed7954');
    markersRef.current.forEach(marker => marker.remove());
    markersRef.current = markers;
    return () => markers.forEach(marker => marker.remove());
  }, [mapReady, currentLocation, clients, selectedPlace]);

  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const source = mapRef.current.getSource('planned-route') as maplibregl.GeoJSONSource | undefined;
    source?.setData(plannedRoute?.geometry ? {
      type: 'Feature', properties: {}, geometry: plannedRoute.geometry
    } as GeoJSON.Feature<GeoJSON.LineString> : { type: 'FeatureCollection', features: [] });
    if (plannedRoute?.geometry?.coordinates?.length) {
      const bounds = new maplibregl.LngLatBounds();
      plannedRoute.geometry.coordinates.forEach((coordinate: number[]) => bounds.extend(coordinate as [number, number]));
      if (currentLocation) bounds.extend([currentLocation.lon, currentLocation.lat]);
      mapRef.current.fitBounds(bounds, { padding: { top: 90, right: 60, bottom: 245, left: 50 }, maxZoom: 15, duration: 700 });
    }
  }, [plannedRoute, currentLocation, mapReady]);

  const tripOptions = useMemo(() => [...trips].sort((a, b) => Number(b.id) - Number(a.id)), [trips]);
  const compareTrip = tripOptions.find(trip => String(trip.id) === compareTripId) || null;
  const distanceComparison = plannedRoute && compareTrip
    ? comparePlannedAndActualDistance(plannedRoute.distanceKm, compareTrip.totalKm)
    : null;

  const moveToCurrentLocation = async () => {
    setLocationError('');
    try {
      const location = await getCurrentLocation();
      if (!isValidCoordinates(location)) throw new Error('No location returned');
      setCurrentLocation(location);
      mapRef.current?.flyTo({ center: [location.lon, location.lat], zoom: 15, essential: true });
    } catch {
      setLocationError('Could not get your location. Check location permission and GPS, then try again.');
    }
  };

  const searchPlaces = async (event?: React.FormEvent) => {
    event?.preventDefault();
    const query = searchQuery.trim();
    if (!query) { setSearchError('Type a client, business, address, or place to search.'); return; }
    setIsSearching(true);
    setSearchError('');
    const localMatches = clients
      .filter(client => `${client.name} ${client.business} ${client.address}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()))
      .slice(0, 5)
      .map(placeFromClient);
    setSearchResults(localMatches);
    if (localMatches.length > 0) {
      setIsSearching(false);
      return;
    }
    try {
      const response = await fetchWithTimeout(
        buildPhotonSearchUrl(geocoderUrl, query),
        { headers: { Accept: 'application/json' } }, 12000
      );
      if (!response.ok) throw new Error(`Search service returned ${response.status}`);
      const data = await response.json();
      const remoteMatches = (Array.isArray(data?.features) ? data.features : [])
        .map(normalizePhotonFeature).filter(Boolean)
        .filter((place: MapPlace) => !findMatchingMapClient(clients, place)) as MapPlace[];
      setSearchResults([...localMatches, ...remoteMatches].slice(0, 8));
      if (localMatches.length + remoteMatches.length === 0) setSearchError('No matching places found. Try a nearby area or a shorter search.');
    } catch (error) {
      setSearchError(localMatches.length
        ? 'Showing saved matches. Online place search is unavailable right now.'
        : 'Place search is unavailable. Check your connection and try again.');
      console.warn('Place search failed', error);
    } finally { setIsSearching(false); }
  };

  const selectPlace = (place: MapPlace) => {
    setSelectedPlace(place);
    setSearchResults([]);
    setSearchQuery(place.name);
    setSearchError('');
    setRouteError('');
    setPlannedRoute(null);
    setExpandedDirections(false);
    setSavePromptPlace(null);
    if (!place.clientId) {
      const dismissed = readDismissedSuggestions();
      if (shouldSuggestMapClientSave(clients, dismissed, place)) setSavePromptPlace(place);
    }
    mapRef.current?.flyTo({ center: [place.lon, place.lat], zoom: 15, essential: true });
  };

  const planRoute = async () => {
    if (!selectedPlace) return;
    setRouteError('');
    setIsRouting(true);
    try {
      let origin = currentLocation;
      if (!origin) {
        origin = await getCurrentLocation();
        if (!isValidCoordinates(origin)) throw new Error('Location permission is required to plan a route.');
        setCurrentLocation(origin);
      }
      const response = await fetchWithTimeout(
        buildOsrmRouteUrl(routingUrl, origin, selectedPlace),
        { headers: { Accept: 'application/json' } }, 20000
      );
      if (!response.ok) throw new Error(`Route service returned ${response.status}`);
      const data = await response.json();
      const normalized = normalizeOsrmRoute(data?.routes?.[0]);
      if (data?.code !== 'Ok' || !normalized) throw new Error('No driving route was returned.');
      setPlannedRoute(normalized);
    } catch (error) {
      setRouteError(currentLocation
        ? 'Could not calculate a route. The community route service may be busy; try again later.'
        : 'Allow location access and check your internet, then try planning the route again.');
      console.warn('Could not calculate planned route', error);
    } finally { setIsRouting(false); }
  };

  const openClientForm = (place: MapPlace, client?: MapClient) => {
    setClientForm(client ? {
      id: client.id, name: client.name, business: client.business,
      address: client.address, lat: String(client.lat), lon: String(client.lon), notes: client.notes
    } : {
      name: place.business || place.name, business: place.business || '', address: place.address,
      lat: String(place.lat), lon: String(place.lon), notes: ''
    });
  };

  const saveClient = (event: React.FormEvent) => {
    event.preventDefault();
    if (!clientForm) return;
    const existing = clientForm.id ? clients.find(client => client.id === clientForm.id) : null;
    const candidate = normalizeMapClient({
      ...clientForm,
      id: clientForm.id || (globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
      lat: Number(clientForm.lat), lon: Number(clientForm.lon),
      createdAt: existing?.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString()
    });
    if (!candidate) { setNotice('Enter a client name and valid map coordinates.'); return; }
    const duplicate = clients.find(client => client.id !== candidate.id && findMatchingMapClient([client], candidate));
    if (duplicate && !window.confirm(`This location looks like “${duplicate.name}”. Save it as a separate client anyway?`)) return;
    setClients(previous => existing
      ? previous.map(client => client.id === candidate.id ? candidate : client)
      : [candidate, ...previous]);
    setSelectedPlace(placeFromClient(candidate));
    setClientForm(null);
    setSavePromptPlace(null);
    setNotice(existing ? 'Client details updated.' : 'Client location saved on this phone.');
  };

  const deleteClient = (client: MapClient) => {
    if (!window.confirm(`Delete saved location “${client.name}”?`)) return;
    setClients(previous => previous.filter(item => item.id !== client.id));
    if (selectedPlace?.clientId === client.id) {
      setSelectedPlace(null);
      setPlannedRoute(null);
    }
    setNotice('Saved client location deleted.');
  };

  const dismissSaveSuggestion = (doNotAskAgain: boolean) => {
    if (doNotAskAgain && savePromptPlace) {
      const dismissed = readDismissedSuggestions();
      dismissed.add(getLocationSuggestionId(savePromptPlace));
      try { localStorage.setItem(MAP_DISMISSED_SUGGESTIONS_STORAGE_KEY, JSON.stringify([...dismissed])); }
      catch (error) { console.warn('Could not save the dismissed client suggestion', error); }
    }
    setSavePromptPlace(null);
  };

  const openNavigation = async () => {
    if (!selectedPlace) return;
    const url = buildGoogleMapsDirectionsUrl(selectedPlace, currentLocation);
    if (!url) { setNotice('This place does not have valid map coordinates.'); return; }
    try {
      if (Capacitor.isNativePlatform()) {
        await AppLauncher.openUrl({ url });
        return;
      }
    } catch (error) { console.warn('Could not open the Maps app; using browser link', error); }
    const opened = window.open(url, '_blank', 'noopener,noreferrer');
    if (!opened) window.location.assign(url);
  };

  const clearSelection = () => {
    setSelectedPlace(null);
    setPlannedRoute(null);
    setRouteError('');
    setSearchQuery('');
    setSearchResults([]);
    setSavePromptPlace(null);
  };

  return (
    <section className="relative h-full min-h-0 overflow-hidden bg-slate-100" aria-label="Maps and clients">
      <div ref={mapContainerRef} className="absolute inset-0" style={{ position: 'absolute', inset: 0 }} aria-label="Interactive map" />
      {!mapReady && (
        <div className="absolute inset-0 z-[1] grid place-items-center bg-[#eaf4ef] text-sm font-semibold text-slate-600">
          <div className="flex flex-col items-center gap-3"><span className="h-9 w-9 animate-spin rounded-full border-4 border-teal-100 border-t-teal-700" />Loading map…</div>
        </div>
      )}

      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 p-3 pt-[max(12px,env(safe-area-inset-top))] sm:p-4">
        <div className="pointer-events-auto mx-auto max-w-xl">
          <form onSubmit={searchPlaces} className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl shadow-slate-900/10">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-800"><Search className="h-5 w-5" /></div>
            <input
              value={searchQuery}
              onChange={event => setSearchQuery(event.target.value)}
              placeholder="Search clients, places, or addresses"
              aria-label="Search clients, places, or addresses"
              className="min-w-0 flex-1 bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400"
            />
            {searchQuery && <button type="button" aria-label="Clear search" onClick={clearSelection} className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100"><X className="h-4 w-4" /></button>}
            <button type="submit" disabled={isSearching} className="flex h-10 shrink-0 items-center gap-1 rounded-xl brand-gradient-button px-3 text-sm font-bold text-white disabled:opacity-60">
              {isSearching ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" /> : 'Search'}
            </button>
          </form>
          {(searchResults.length > 0 || searchError) && (
            <div className="mt-2 max-h-64 overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-xl">
              {searchResults.map(place => (
                <button key={place.id} type="button" onClick={() => selectPlace(place)} className="flex min-h-14 w-full items-start gap-3 border-b border-slate-100 px-3 py-3 text-left last:border-0 hover:bg-teal-50">
                  <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${place.clientId ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-50 text-blue-700'}`}>
                    {place.clientId ? <UserRound className="h-4 w-4" /> : <MapPin className="h-4 w-4" />}
                  </span>
                  <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-slate-800">{place.name}</span><span className="mt-0.5 block truncate text-xs text-slate-500">{place.business ? `${place.business} · ` : ''}{place.address || 'Saved location'}</span></span>
                  {place.clientId && <span className="mt-1 text-[10px] font-bold uppercase tracking-wide text-emerald-700">Client</span>}
                </button>
              ))}
              {searchError && <p role="status" className="px-3 py-3 text-xs text-slate-500">{searchError}</p>}
            </div>
          )}
          {locationError && <p role="status" className="mt-2 rounded-xl bg-white/95 px-3 py-2 text-xs font-medium text-amber-800 shadow">{locationError}</p>}
        </div>
      </div>

      <button type="button" onClick={moveToCurrentLocation} aria-label="Go to my location" title="My location" className="absolute right-4 top-[max(158px,calc(env(safe-area-inset-top)+158px))] z-10 flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white text-teal-800 shadow-lg transition active:scale-95"><LocateFixed className="h-5 w-5" /></button>

      <div className="absolute bottom-4 left-3 right-3 z-10 mx-auto max-w-xl">
        {selectedPlace ? (
          <div className="max-h-[48vh] overflow-y-auto rounded-3xl border border-slate-200 bg-white p-4 shadow-2xl shadow-slate-900/20 sm:p-5">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-teal-50 text-teal-800"><MapPin className="h-5 w-5" /></div>
              <div className="min-w-0 flex-1"><h2 className="truncate text-base font-bold text-[#102a35]">{selectedPlace.name}</h2><p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{selectedPlace.address || 'Address not available'}</p></div>
              <button type="button" onClick={clearSelection} aria-label="Close selected place" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100"><X className="h-4 w-4" /></button>
            </div>
            {selectedPlace.business && <p className="ml-14 mt-1 flex items-center gap-1.5 text-xs font-medium text-slate-500"><Building2 className="h-3.5 w-3.5" />{selectedPlace.business}</p>}
            {savePromptPlace?.id === selectedPlace.id && (
              <div className="mt-3 rounded-2xl border border-teal-100 bg-teal-50 p-3">
                <p className="text-sm font-semibold text-teal-950">Would you like to save this location as a client?</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button type="button" onClick={() => openClientForm(selectedPlace)} className="min-h-9 rounded-xl brand-gradient-button px-3 text-xs font-bold text-white">Save Client</button>
                  <button type="button" onClick={() => dismissSaveSuggestion(false)} className="min-h-9 rounded-xl border border-teal-200 bg-white px-3 text-xs font-semibold text-teal-900">Not Now</button>
                  <button type="button" onClick={() => dismissSaveSuggestion(true)} className="min-h-9 rounded-xl px-2 text-xs font-semibold text-slate-500">Don’t Suggest Again for This Location</button>
                </div>
              </div>
            )}
            {routeError && <p role="status" className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900">{routeError}</p>}
            {plannedRoute ? (
              <div className="mt-3 rounded-2xl bg-slate-50 p-3">
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-xl bg-white px-3 py-2"><p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Planned distance</p><p className="mt-1 text-lg font-bold tabular-nums text-[#123d53]">{plannedRoute.distanceKm.toFixed(1)} <span className="text-xs">km</span></p></div>
                  <div className="rounded-xl bg-white px-3 py-2"><p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Estimated drive</p><p className="mt-1 flex items-center gap-1.5 text-base font-bold text-[#123d53]"><Clock3 className="h-4 w-4 text-teal-700" />{formatDuration(plannedRoute.durationMinutes)}</p></div>
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                  <button type="button" onClick={() => setExpandedDirections(open => !open)} aria-expanded={expandedDirections} className="inline-flex min-h-9 items-center gap-1.5 rounded-xl px-2 text-xs font-semibold text-teal-800 hover:bg-teal-50"><RouteIcon className="h-4 w-4" />{expandedDirections ? 'Hide directions' : `${plannedRoute.steps.length} route steps`}<ArrowDownUp className="h-3.5 w-3.5" /></button>
                  <button type="button" onClick={planRoute} disabled={isRouting} className="min-h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 disabled:opacity-50">Refresh route</button>
                </div>
                {expandedDirections && <ol className="mt-2 max-h-36 space-y-2 overflow-y-auto border-t border-slate-200 pt-2">{plannedRoute.steps.slice(0, 16).map((step, index) => <li key={`${index}-${step}`} className="flex gap-2 text-xs leading-4 text-slate-700"><span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-teal-100 text-[10px] font-bold text-teal-900">{index + 1}</span><span>{step}</span></li>)}</ol>}
                {trips.length > 0 && <div className="mt-3 border-t border-slate-200 pt-3">
                  <label htmlFor="map-actual-trip" className="block text-xs font-semibold text-slate-600">Compare with an actual recorded trip</label>
                  <select id="map-actual-trip" value={compareTripId} onChange={event => setCompareTripId(event.target.value)} className="mt-1.5 min-h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700">
                    <option value="">Choose a saved trip</option>
                    {tripOptions.map(trip => <option key={trip.id} value={String(trip.id)}>{trip.date || 'Trip'} · {trip.fromLoc || 'Start'} to {trip.toLoc || trip.visitor || 'Destination'} · {Number(trip.totalKm || 0).toFixed(1)} km</option>)}
                  </select>
                  {distanceComparison && <p className="mt-2 text-xs text-slate-600">Planned <b>{distanceComparison.plannedKm.toFixed(1)} km</b> · Actual <b>{distanceComparison.actualKm.toFixed(1)} km</b> · Difference <b>{distanceComparison.differenceKm > 0 ? '+' : ''}{distanceComparison.differenceKm.toFixed(1)} km</b></p>}
                  <p className="mt-1 text-[10px] leading-4 text-slate-400">This comparison is for reference and does not change trip history or expense calculations.</p>
                </div>}
              </div>
            ) : (
              <div className="mt-3 flex gap-2">
                <button type="button" onClick={planRoute} disabled={isRouting} className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl brand-gradient-button px-3 text-sm font-bold text-white disabled:opacity-60">
                  {isRouting ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" /> : <RouteIcon className="h-4 w-4" />}{isRouting ? 'Planning…' : 'Preview route'}
                </button>
                <button type="button" onClick={() => openClientForm(selectedPlace, clients.find(client => client.id === selectedPlace.clientId))} className="flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-teal-200 bg-teal-50 px-3 text-xs font-bold text-teal-900"><Save className="h-4 w-4" />{selectedPlace.clientId ? 'Edit client' : 'Save client'}</button>
              </div>
            )}
            {plannedRoute && <div className="mt-3 flex gap-2">
              <button type="button" onClick={openNavigation} className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl brand-gradient-button px-3 text-sm font-bold text-white"><Navigation className="h-4 w-4" />Navigate</button>
              {!selectedPlace.clientId && <button type="button" onClick={() => openClientForm(selectedPlace)} className="flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-teal-200 bg-teal-50 px-3 text-xs font-bold text-teal-900"><Save className="h-4 w-4" />Save client</button>}
            </div>}
          </div>
        ) : (
          <div className="rounded-3xl border border-slate-200 bg-white/95 p-3 shadow-xl shadow-slate-900/15 backdrop-blur-sm sm:p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0"><h2 className="text-sm font-bold text-[#102a35]">Explore your places</h2><p className="mt-0.5 text-xs text-slate-500">Search an address or open one of your saved client pins.</p></div>
              <button type="button" onClick={() => setIsClientListOpen(true)} className="flex min-h-10 shrink-0 items-center gap-1.5 rounded-xl bg-teal-50 px-3 text-xs font-bold text-teal-900"><UserRound className="h-4 w-4" />Clients <span className="rounded-full bg-white px-1.5 py-0.5 tabular-nums">{clients.length}</span></button>
            </div>
            {clients.length > 0 && <div className="mt-3 flex gap-2 overflow-x-auto pb-0.5">{clients.slice(0, 5).map(client => <button key={client.id} type="button" onClick={() => selectPlace(placeFromClient(client))} className="flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700"><MapPin className="h-3.5 w-3.5 text-emerald-700" />{client.name}</button>)}</div>}
            <p className="mt-2 text-[10px] leading-4 text-slate-400">Community map, search, and route services may be temporarily unavailable.</p>
          </div>
        )}
      </div>

      {notice && <div role="status" className="absolute left-1/2 top-24 z-30 flex max-w-[90%] -translate-x-1/2 items-center gap-2 rounded-xl bg-slate-900 px-3 py-2 text-xs font-medium text-white shadow-lg"><Check className="h-4 w-4 shrink-0 text-emerald-300" />{notice}<button type="button" onClick={() => setNotice('')} aria-label="Dismiss message" className="ml-1 text-white/70"><X className="h-4 w-4" /></button></div>}

      {isClientListOpen && <div className="absolute inset-0 z-40 flex items-end bg-slate-950/40" onClick={() => setIsClientListOpen(false)}>
        <section role="dialog" aria-modal="true" aria-labelledby="saved-clients-title" onClick={event => event.stopPropagation()} className="max-h-[82%] w-full overflow-y-auto rounded-t-3xl bg-white p-4 pb-[max(20px,env(safe-area-inset-bottom))] shadow-2xl">
          <div className="mx-auto max-w-xl">
            <div className="mb-4 flex items-center justify-between gap-3"><div><h2 id="saved-clients-title" className="text-lg font-bold text-[#102a35]">Saved clients</h2><p className="mt-1 text-xs text-slate-500">Locations are stored on this phone.</p></div><button type="button" onClick={() => setIsClientListOpen(false)} aria-label="Close saved clients" className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-600"><X className="h-5 w-5" /></button></div>
            {clients.length ? <ul className="divide-y divide-slate-100">{clients.map(client => <li key={client.id} className="flex items-center gap-2 py-3">
              <button type="button" onClick={() => { selectPlace(placeFromClient(client)); setIsClientListOpen(false); }} className="flex min-w-0 flex-1 items-center gap-3 text-left"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-800"><MapPin className="h-5 w-5" /></span><span className="min-w-0"><span className="block truncate text-sm font-semibold text-slate-800">{client.name}</span><span className="mt-0.5 block truncate text-xs text-slate-500">{client.business ? `${client.business} · ` : ''}{client.address || `${client.lat.toFixed(5)}, ${client.lon.toFixed(5)}`}</span></span></button>
              <button type="button" aria-label={`Edit ${client.name}`} onClick={() => openClientForm(placeFromClient(client), client)} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-teal-800 hover:bg-teal-50"><Edit3 className="h-4 w-4" /></button>
              <button type="button" aria-label={`Delete ${client.name}`} onClick={() => deleteClient(client)} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-rose-700 hover:bg-rose-50"><Trash2 className="h-4 w-4" /></button>
            </li>)}</ul> : <div className="rounded-2xl bg-slate-50 px-4 py-8 text-center"><MapPin className="mx-auto h-8 w-8 text-slate-300" /><p className="mt-3 text-sm font-semibold text-slate-700">No saved client locations yet</p><p className="mt-1 text-xs text-slate-500">Search a place, select it, then tap Save Client.</p></div>}
          </div>
        </section>
      </div>}

      {clientForm && <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-3">
        <section role="dialog" aria-modal="true" aria-labelledby="map-client-form-title" className="max-h-[92%] w-full max-w-md overflow-y-auto rounded-3xl bg-white p-5 shadow-2xl">
          <div className="mb-4 flex items-start justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[.16em] text-teal-700">Client location</p><h2 id="map-client-form-title" className="mt-1 text-xl font-bold text-[#102a35]">{clientForm.id ? 'Edit client' : 'Save as client'}</h2></div><button type="button" onClick={() => setClientForm(null)} aria-label="Close client form" className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-600"><X className="h-4 w-4" /></button></div>
          <form onSubmit={saveClient} className="space-y-3">
            <label className="block text-xs font-semibold text-slate-600">Client name *<input required value={clientForm.name} onChange={event => setClientForm({ ...clientForm, name: event.target.value })} className="mt-1.5 min-h-11 w-full rounded-xl border border-slate-200 px-3 text-sm text-slate-800 outline-none focus:border-teal-600 focus:ring-4 focus:ring-teal-600/10" /></label>
            <label className="block text-xs font-semibold text-slate-600">Business name<input value={clientForm.business} onChange={event => setClientForm({ ...clientForm, business: event.target.value })} className="mt-1.5 min-h-11 w-full rounded-xl border border-slate-200 px-3 text-sm text-slate-800 outline-none focus:border-teal-600 focus:ring-4 focus:ring-teal-600/10" /></label>
            <label className="block text-xs font-semibold text-slate-600">Address<textarea rows={2} value={clientForm.address} onChange={event => setClientForm({ ...clientForm, address: event.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-teal-600 focus:ring-4 focus:ring-teal-600/10" /></label>
            <div className="grid grid-cols-2 gap-3"><label className="block text-xs font-semibold text-slate-600">Latitude<input required inputMode="decimal" value={clientForm.lat} onChange={event => setClientForm({ ...clientForm, lat: event.target.value })} className="mt-1.5 min-h-11 w-full rounded-xl border border-slate-200 px-3 text-sm text-slate-800 outline-none focus:border-teal-600" /></label><label className="block text-xs font-semibold text-slate-600">Longitude<input required inputMode="decimal" value={clientForm.lon} onChange={event => setClientForm({ ...clientForm, lon: event.target.value })} className="mt-1.5 min-h-11 w-full rounded-xl border border-slate-200 px-3 text-sm text-slate-800 outline-none focus:border-teal-600" /></label></div>
            <label className="block text-xs font-semibold text-slate-600">Notes<textarea rows={2} value={clientForm.notes} onChange={event => setClientForm({ ...clientForm, notes: event.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-teal-600 focus:ring-4 focus:ring-teal-600/10" /></label>
            <div className="flex gap-2 pt-1"><button type="button" onClick={() => setClientForm(null)} className="min-h-11 flex-1 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700">Cancel</button><button type="submit" className="min-h-11 flex-1 rounded-xl brand-gradient-button px-3 text-sm font-bold text-white">{clientForm.id ? 'Save changes' : 'Save client'}</button></div>
          </form>
        </section>
      </div>}

      {!mapReady && <span className="sr-only">Map is loading</span>}
    </section>
  );
}

export default MapScreen;
