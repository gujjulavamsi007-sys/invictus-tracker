import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildEditedTripList,
  buildMonthlyInsights,
  buildPdfTableDefinition,
  buildTripRecord,
  filterHistoryTrips,
  findDuplicateBackupTrips,
  parseTripDraft,
  persistTripDraft,
  readTripDraft,
  restoreBackupToStorage,
  TRIP_DRAFT_STORAGE_KEY,
  validateBackup
} from '../src/reportLogic.mjs';

const makeTrip = (overrides = {}) => ({
  id: 1,
  date: '10-09-2026',
  startTime: new Date(2026, 8, 10, 9).getTime(),
  endTime: new Date(2026, 8, 10, 10).getTime(),
  visitor: 'Client A',
  assignedBy: 'Manager A',
  recordedBy: 'Driver A',
  fromLoc: 'Office',
  toLoc: 'Client site',
  totalKm: 12,
  ratePerKm: 5,
  petrolCharges: 60,
  parkingFees: 20,
  totalAmount: 80,
  purpose: 'Meeting',
  ...overrides
});

const makeBackup = (trips = [makeTrip()]) => ({
  appId: 'petrol-expenses-tracker',
  formatVersion: 1,
  createdAt: '2026-10-10T10:00:00.000Z',
  data: {
    trips,
    officeLocation: { lat: 17.4, lon: 78.4 },
    savedDestinations: ['Office', 'Client site'],
    managers: ['Manager A'],
    savedVisitors: ['Client A'],
    petrolRate: 5
  }
});

test('saving a trip computes charges and records the configured driver', () => {
  const trip = buildTripRecord({
    startTime: new Date(2026, 8, 10, 9).getTime(),
    endTime: new Date(2026, 8, 10, 10).getTime(),
    actualKm: 12.5,
    parkingFees: 20,
    visitor: 'Client A',
    assignedBy: 'Manager A',
    recordedBy: '',
    fromLoc: 'Office',
    toLoc: 'Client site',
    purpose: 'Meeting'
  }, 'Driver A', 5, 42);

  assert.equal(trip.id, 42);
  assert.equal(trip.recordedBy, 'Driver A');
  assert.equal(trip.totalKm, 12.5);
  assert.equal(trip.petrolCharges, 62.5);
  assert.equal(trip.totalAmount, 82.5);
  assert.match(trip.date, /^\d{2}-\d{2}-2026$/);
});

test('editing keeps a trip’s saved rate and shifts its end time with the new date', () => {
  const original = makeTrip({ id: 7, ratePerKm: 4, petrolCharges: 48, totalAmount: 68 });
  const result = buildEditedTripList([original], 7, {
    date: '2026-09-12',
    visitor: '  Client B ',
    assignedBy: 'Manager B',
    fromLoc: 'Office',
    toLoc: 'New site',
    totalKm: '15',
    parkingFees: '10',
    purpose: 'Delivery'
  }, 9);

  assert.ok(result);
  assert.equal(result.updatedTrip.id, 7);
  assert.equal(result.updatedTrip.ratePerKm, 4);
  assert.equal(result.updatedTrip.petrolCharges, 60);
  assert.equal(result.updatedTrip.totalAmount, 70);
  assert.equal(result.updatedTrip.visitor, 'Client B');
  assert.equal(result.updatedTrip.endTime - result.updatedTrip.startTime, 60 * 60 * 1000);
  assert.equal(result.trips[0], result.updatedTrip);
  assert.equal(buildEditedTripList([original], 7, { date: '2026-02-30', totalKm: '5', parkingFees: '0' }, 5), null);
});

test('history filtering combines month, date, visitor, and search constraints', () => {
  const trips = [
    makeTrip({ id: 1, visitor: 'Client A', purpose: 'Meeting' }),
    makeTrip({ id: 2, date: '12-09-2026', startTime: new Date(2026, 8, 12, 9).getTime(), visitor: 'Client A', purpose: 'Delivery' }),
    makeTrip({ id: 3, date: '12-10-2026', startTime: new Date(2026, 9, 12, 9).getTime(), visitor: 'Client B', purpose: 'Meeting' })
  ];
  const result = filterHistoryTrips(trips, {
    selectedMonth: '2026-09',
    dateFrom: '2026-09-10',
    dateTo: '2026-09-12',
    filterVisitor: 'Client A',
    search: 'delivery'
  });

  assert.deepEqual(result.map(trip => trip.id), [2]);
});

test('monthly insights compare trip count, distance, fuel, and parking by month', () => {
  const insights = buildMonthlyInsights([
    makeTrip({ id: 1, totalKm: 12, petrolCharges: 60, parkingFees: 20, totalAmount: 80 }),
    makeTrip({ id: 2, date: '12-09-2026', startTime: new Date(2026, 8, 12).getTime(), totalKm: 8, petrolCharges: 40, parkingFees: 0, totalAmount: 40 }),
    makeTrip({ id: 3, date: '02-08-2026', startTime: new Date(2026, 7, 2).getTime(), totalKm: 5, petrolCharges: 25, parkingFees: 5, totalAmount: 30 })
  ]);

  assert.equal(insights.length, 2);
  assert.deepEqual(insights[0], {
    month: '2026-09', tripCount: 2, totalKm: 20,
    petrolAmount: 100, parkingAmount: 20, grandTotal: 120
  });
  assert.equal(insights[1].month, '2026-08');
});

test('backup validation summarizes settings and flags duplicate records without dropping them', () => {
  const duplicate = makeTrip({ id: 2 });
  const result = validateBackup(makeBackup([makeTrip(), duplicate]));

  assert.equal(result.ok, true);
  assert.equal(result.summary.tripCount, 2);
  assert.equal(result.summary.petrolRate, 5);
  assert.deepEqual(result.duplicateIndexes, [1]);
  assert.equal(result.data.trips.length, 2);
  assert.equal(validateBackup({ ...makeBackup(), data: { ...makeBackup().data, petrolRate: -1 } }).ok, false);
});

test('restoring a validated backup writes the expected local settings', () => {
  const values = new Map();
  const storage = {
    getItem: key => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key)
  };
  restoreBackupToStorage(storage, makeBackup().data);

  assert.equal(JSON.parse(storage.getItem('invictusTrips')).length, 1);
  assert.equal(storage.getItem('invictusRate'), '5');
  assert.deepEqual(JSON.parse(storage.getItem('invictusDests')), ['Office', 'Client site']);
});

test('a storage failure rolls back values written before backup restore failed', () => {
  const values = new Map([
    ['invictusTrips', '[{"id":99}]'],
    ['invictusOffice', 'null'],
    ['invictusDests', '["Old office"]'],
    ['invictusManagers', '["Old manager"]'],
    ['invictusVisitors', '["Old client"]'],
    ['invictusRate', '7']
  ]);
  let shouldFail = true;
  const storage = {
    getItem: key => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => {
      if (key === 'invictusManagers' && shouldFail) {
        shouldFail = false;
        throw new Error('storage full');
      }
      values.set(key, value);
    },
    removeItem: key => values.delete(key)
  };
  const before = new Map(values);

  assert.throws(() => restoreBackupToStorage(storage, makeBackup().data), /storage full/);
  assert.deepEqual(values, before);
});

test('unfinished trip drafts survive reload and are removed when a trip is discarded', () => {
  const values = new Map();
  const storage = {
    getItem: key => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key)
  };
  const trip = { ...makeTrip(), startCoords: { lat: 17.4, lon: 78.4 } };

  persistTripDraft(storage, 'tracking', trip);
  assert.deepEqual(readTripDraft(storage), { phase: 'tracking', trip: { ...trip, endCoords: null, actualKm: 0 } });
  persistTripDraft(storage, 'idle', trip);
  assert.equal(storage.getItem(TRIP_DRAFT_STORAGE_KEY), null);
  assert.equal(parseTripDraft('{bad json'), null);
});

test('PDF table export keeps a first-page header without repeating it on continuation pages', () => {
  const table = buildPdfTableDefinition(['No.', 'Date', 'Total'], [['1', '10-09-2026', '₹80']], ['TOTAL', '', '₹80']);

  assert.equal(table.headerRows, 0);
  assert.equal(table.body.length, 3);
  assert.deepEqual(table.body[1][0], { text: '1', alignment: 'center' });
  assert.deepEqual(table.body[1][1], { text: '10-09-2026', alignment: 'left' });
  assert.equal(table.body[2][2], '₹80');
});
