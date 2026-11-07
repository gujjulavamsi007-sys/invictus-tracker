export const MAP_CLIENTS_STORAGE_KEY = 'invictusMapClients';
export const MAP_DISMISSED_SUGGESTIONS_STORAGE_KEY = 'invictusMapClientSuggestionsDismissed';

export const DEFAULT_MAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';
export const DEFAULT_GEOCODER_URL = 'https://photon.komoot.io/api/';
export const DEFAULT_ROUTING_URL = 'https://router.project-osrm.org';

export function isValidCoordinates(point) {
  return Boolean(
    point && Number.isFinite(Number(point.lat)) && Number(point.lat) >= -90 && Number(point.lat) <= 90 &&
    Number.isFinite(Number(point.lon)) && Number(point.lon) >= -180 && Number(point.lon) <= 180
  );
}

export function normalizeMapClient(client) {
  if (!client || typeof client !== 'object' || !isValidCoordinates(client)) return null;
  const name = String(client.name || '').trim();
  if (!name) return null;
  return {
    id: String(client.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
    name,
    business: String(client.business || '').trim(),
    address: String(client.address || '').trim(),
    lat: Number(client.lat),
    lon: Number(client.lon),
    notes: String(client.notes || '').trim(),
    createdAt: String(client.createdAt || new Date().toISOString()),
    updatedAt: String(client.updatedAt || new Date().toISOString())
  };
}

export function normalizeSavedMapClients(clients) {
  if (!Array.isArray(clients)) return [];
  return clients.map(normalizeMapClient).filter(Boolean);
}

export function getDistanceBetweenPointsKm(a, b) {
  if (!isValidCoordinates(a) || !isValidCoordinates(b)) return Infinity;
  const radians = value => value * Math.PI / 180;
  const lat1 = radians(Number(a.lat));
  const lat2 = radians(Number(b.lat));
  const latDelta = lat2 - lat1;
  const lonDelta = radians(Number(b.lon) - Number(a.lon));
  const haversine = Math.sin(latDelta / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(lonDelta / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

export function findMatchingMapClient(clients, location, radiusKm = 0.075) {
  const normalizedName = String(location?.name || '').trim().toLocaleLowerCase();
  return (Array.isArray(clients) ? clients : []).find(client => {
    if (getDistanceBetweenPointsKm(client, location) <= radiusKm) return true;
    return normalizedName && String(client.name || '').trim().toLocaleLowerCase() === normalizedName;
  }) || null;
}

export function getLocationSuggestionId(location) {
  const lat = Number(location?.lat);
  const lon = Number(location?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return '';
  return `${lat.toFixed(3)},${lon.toFixed(3)}`;
}

export function shouldSuggestMapClientSave(clients, dismissedIds, location) {
  if (!isValidCoordinates(location) || findMatchingMapClient(clients, location)) return false;
  return !(dismissedIds instanceof Set ? dismissedIds : new Set(dismissedIds || []))
    .has(getLocationSuggestionId(location));
}

export function getAddressFromPhotonProperties(properties = {}) {
  const name = String(properties.name || properties.street || properties.locality || 'Selected location').trim();
  const detail = [
    properties.housenumber && properties.street && `${properties.housenumber} ${properties.street}`,
    !properties.housenumber && properties.street,
    properties.locality,
    properties.district,
    properties.city,
    properties.state,
    properties.postcode,
    properties.country
  ].filter(Boolean).map(String);
  return { name, address: [...new Set(detail)].join(', ') };
}

export function normalizePhotonFeature(feature) {
  const coordinates = feature?.geometry?.coordinates;
  const properties = feature?.properties || {};
  if (!Array.isArray(coordinates) || coordinates.length < 2) return null;
  const point = { lon: Number(coordinates[0]), lat: Number(coordinates[1]) };
  if (!isValidCoordinates(point)) return null;
  const { name, address } = getAddressFromPhotonProperties(properties);
  const business = String(properties.name || '').trim() !== name ? String(properties.name || '').trim() : '';
  return { id: `place-${point.lat.toFixed(6)}-${point.lon.toFixed(6)}`, name, business, address, ...point };
}

export function buildPhotonSearchUrl(baseUrl, query, bias) {
  const url = new URL(baseUrl);
  url.searchParams.set('q', String(query || '').trim());
  url.searchParams.set('limit', '8');
  if (isValidCoordinates(bias)) {
    url.searchParams.set('lat', String(Number(bias.lat)));
    url.searchParams.set('lon', String(Number(bias.lon)));
  }
  return url.toString();
}

export function buildOsrmRouteUrl(baseUrl, start, end) {
  if (!isValidCoordinates(start) || !isValidCoordinates(end)) throw new Error('Choose a valid start and destination.');
  const root = String(baseUrl || '').replace(/\/+$/, '');
  return `${root}/route/v1/driving/${Number(start.lon)},${Number(start.lat)};${Number(end.lon)},${Number(end.lat)}?overview=full&geometries=geojson&steps=true`;
}

export function formatRouteStep(step) {
  const maneuver = step?.maneuver || {};
  const modifier = String(maneuver.modifier || '').replace(/\b\w/g, letter => letter.toUpperCase());
  const road = String(step?.name || '').trim();
  const type = String(maneuver.type || '').replace(/\b\w/g, letter => letter.toUpperCase());
  if (maneuver.type === 'depart') return road ? `Start on ${road}` : 'Start your journey';
  if (maneuver.type === 'arrive') return 'Arrive at your destination';
  if (maneuver.type === 'roundabout' || maneuver.type === 'rotary') {
    return `${type}${modifier ? ` ${modifier}` : ''}${road ? ` onto ${road}` : ''}`;
  }
  const action = maneuver.type === 'turn' || maneuver.type === 'merge' || maneuver.type === 'fork' || maneuver.type === 'on ramp'
    ? `${type}${modifier ? ` ${modifier}` : ''}`
    : `${type}${modifier ? ` ${modifier}` : ''}`;
  return `${action}${road ? ` onto ${road}` : ''}`.trim();
}

export function normalizeOsrmRoute(route) {
  const distanceKm = Number(route?.distance) / 1000;
  const durationMinutes = Number(route?.duration) / 60;
  const coordinates = route?.geometry?.coordinates;
  if (!Number.isFinite(distanceKm) || !Number.isFinite(durationMinutes) || !Array.isArray(coordinates)) return null;
  return {
    distanceKm: Number(distanceKm.toFixed(1)),
    durationMinutes: Math.max(1, Math.round(durationMinutes)),
    geometry: route.geometry,
    steps: (route.legs || []).flatMap(leg => leg.steps || []).map(formatRouteStep).filter(Boolean)
  };
}

export function buildGoogleMapsDirectionsUrl(destination, origin) {
  if (!isValidCoordinates(destination)) return '';
  const url = new URL('https://www.google.com/maps/dir/');
  url.searchParams.set('api', '1');
  url.searchParams.set('destination', `${Number(destination.lat)},${Number(destination.lon)}`);
  url.searchParams.set('travelmode', 'driving');
  if (isValidCoordinates(origin)) url.searchParams.set('origin', `${Number(origin.lat)},${Number(origin.lon)}`);
  return url.toString();
}

export function comparePlannedAndActualDistance(plannedKm, actualKm) {
  const planned = Number(plannedKm);
  const actual = Number(actualKm);
  if (!Number.isFinite(planned) || !Number.isFinite(actual)) return null;
  return {
    plannedKm: Number(planned.toFixed(1)),
    actualKm: Number(actual.toFixed(1)),
    differenceKm: Number((actual - planned).toFixed(1))
  };
}
