import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildGoogleMapsDirectionsUrl,
  buildOsrmRouteUrl,
  buildPhotonSearchUrl,
  comparePlannedAndActualDistance,
  findMatchingMapClient,
  normalizeMapClient,
  normalizeOsrmRoute,
  normalizePhotonFeature,
  shouldSuggestMapClientSave
} from '../src/maps/mapLogic.mjs';

const savedClient = {
  id: 'client-1', name: 'Main Office', business: 'Invictus', address: 'Hyderabad',
  lat: 17.385, lon: 78.4867, notes: '', createdAt: '2026-10-01', updatedAt: '2026-10-01'
};

test('map client normalization rejects invalid coordinates and trims fields', () => {
  assert.equal(normalizeMapClient({ name: 'Nowhere', lat: 91, lon: 10 }), null);
  const client = normalizeMapClient({ name: '  Client A  ', business: ' Firm ', lat: '17.4', lon: '78.5' });
  assert.equal(client.name, 'Client A');
  assert.equal(client.business, 'Firm');
  assert.equal(client.lat, 17.4);
});

test('nearby and same-name saved locations are detected as possible duplicates', () => {
  assert.equal(findMatchingMapClient([savedClient], { name: 'Another label', lat: 17.3852, lon: 78.4868 }), savedClient);
  assert.equal(findMatchingMapClient([savedClient], { name: 'Main Office', lat: 18, lon: 79 }), savedClient);
  assert.equal(findMatchingMapClient([savedClient], { name: 'Client B', lat: 18, lon: 79 }), null);
});

test('new places prompt once unless already saved or dismissed', () => {
  const place = { name: 'New Client', lat: 17.4, lon: 78.5 };
  assert.equal(shouldSuggestMapClientSave([], [], place), true);
  assert.equal(shouldSuggestMapClientSave([savedClient], [], { ...savedClient, name: 'Main Office' }), false);
  assert.equal(shouldSuggestMapClientSave([], ['17.400,78.500'], place), false);
});

test('Photon locations use OSM coordinates and a readable address', () => {
  const place = normalizePhotonFeature({
    geometry: { coordinates: [78.4867, 17.385] },
    properties: { name: 'Paradise', street: 'Sardar Patel Road', city: 'Secunderabad', state: 'Telangana', country: 'India' }
  });
  assert.equal(place.name, 'Paradise');
  assert.match(place.address, /Sardar Patel Road/);
  assert.match(place.address, /Secunderabad/);
  assert.equal(normalizePhotonFeature({ geometry: { coordinates: [200, 100] }, properties: {} }), null);
});

test('provider request URLs are valid and include current-location bias or route steps', () => {
  const search = new URL(buildPhotonSearchUrl('https://photon.example/api/', 'client office', savedClient));
  assert.equal(search.searchParams.get('q'), 'client office');
  assert.equal(search.searchParams.get('lat'), '17.385');
  const route = new URL(buildOsrmRouteUrl('https://router.example/', savedClient, { lat: 17.4, lon: 78.5 }));
  assert.match(route.pathname, /78\.4867,17\.385;78\.5,17\.4/);
  assert.equal(route.searchParams.get('steps'), 'true');
});

test('Google Maps directions URL carries coordinates without needing a key', () => {
  const url = new URL(buildGoogleMapsDirectionsUrl({ lat: 17.4, lon: 78.5 }, savedClient));
  assert.equal(url.hostname, 'www.google.com');
  assert.equal(url.searchParams.get('api'), '1');
  assert.equal(url.searchParams.get('destination'), '17.4,78.5');
  assert.equal(url.searchParams.get('origin'), '17.385,78.4867');
  assert.equal(url.searchParams.get('key'), null);
});

test('OSRM route results are normalized for display and comparison', () => {
  const route = normalizeOsrmRoute({
    distance: 12800,
    duration: 1800,
    geometry: { type: 'LineString', coordinates: [[78.48, 17.38], [78.5, 17.4]] },
    legs: [{ steps: [
      { name: 'Main Road', maneuver: { type: 'depart' } },
      { name: 'Tank Bund Road', maneuver: { type: 'turn', modifier: 'left' } },
      { maneuver: { type: 'arrive' } }
    ] }]
  });
  assert.equal(route.distanceKm, 12.8);
  assert.equal(route.durationMinutes, 30);
  assert.deepEqual(route.steps, ['Start on Main Road', 'Turn Left onto Tank Bund Road', 'Arrive at your destination']);
  assert.deepEqual(comparePlannedAndActualDistance(12.8, 15), { plannedKm: 12.8, actualKm: 15, differenceKm: 2.2 });
  assert.equal(normalizeOsrmRoute({ distance: NaN }), null);
});
