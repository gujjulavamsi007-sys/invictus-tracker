export const TRIP_DRAFT_STORAGE_KEY = 'invictusTripDraft';
export const PDF_TABLE_HEADER_ROWS = 0;

export const createEmptyTrip = () => ({
  startCoords: null,
  endCoords: null,
  startTime: null,
  endTime: null,
  actualKm: 0,
  fromLoc: '',
  toLoc: '',
  visitor: '',
  assignedBy: '',
  recordedBy: '',
  parkingFees: 0,
  purpose: ''
});

export function getTripDate(trip) {
  if (trip?.startTime) {
    const tripDate = new Date(trip.startTime);
    return Number.isNaN(tripDate.getTime()) ? null : tripDate;
  }

  const parts = String(trip?.date || '').split('-').map(Number);
  if (parts.length !== 3 || parts.some(part => !Number.isFinite(part))) return null;

  const [day, month, year] = parts;
  const tripDate = new Date(year, month - 1, day);
  if (
    tripDate.getFullYear() !== year ||
    tripDate.getMonth() !== month - 1 ||
    tripDate.getDate() !== day
  ) return null;

  return tripDate;
}

export const getTripDateKey = date =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export function getTripMonthKey(trip) {
  if (trip?.startTime) {
    const date = new Date(trip.startTime);
    if (!Number.isNaN(date.getTime())) {
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    }
  }
  const parts = String(trip?.date || '').split('-');
  return parts.length === 3 ? `${parts[2]}-${parts[1]}` : '';
}

export function compareTripsByReportOrder(a, b) {
  const aDate = getTripDate(a);
  const bDate = getTripDate(b);
  const aDay = aDate ? getTripDateKey(aDate) : '';
  const bDay = bDate ? getTripDateKey(bDate) : '';
  if (aDay !== bDay) return aDay.localeCompare(bDay);
  const aStart = Number(a.startTime || a.id || 0) || 0;
  const bStart = Number(b.startTime || b.id || 0) || 0;
  return aStart - bStart || Number(a.id || 0) - Number(b.id || 0);
}

export const getTripPetrolAmount = trip =>
  Number(trip?.petrolCharges ?? (Number(trip?.totalKm) || 0) * Number(trip?.ratePerKm ?? 5)) || 0;

export const getTripTotalAmount = trip =>
  Number(trip?.totalAmount ?? (getTripPetrolAmount(trip) + (Number(trip?.parkingFees) || 0))) || 0;

export function buildTripRecord(currentTrip, recordedByName, petrolRate, id = Date.now()) {
  const km = parseFloat(String(currentTrip.actualKm)) || 0;
  const parking = parseFloat(String(currentTrip.parkingFees)) || 0;
  return {
    id,
    date: new Date(currentTrip.startTime).toLocaleDateString('en-GB').replace(/\//g, '-'),
    visitor: currentTrip.visitor,
    assignedBy: currentTrip.assignedBy,
    recordedBy: currentTrip.recordedBy || recordedByName,
    fromLoc: currentTrip.fromLoc,
    toLoc: currentTrip.toLoc,
    totalKm: km,
    ratePerKm: petrolRate,
    petrolCharges: km * petrolRate,
    parkingFees: parking,
    totalAmount: km * petrolRate + parking,
    purpose: currentTrip.purpose,
    startTime: currentTrip.startTime,
    endTime: currentTrip.endTime
  };
}

export function buildEditedTripList(trips, tripId, form, petrolRate) {
  const [year, month, day] = String(form?.date || '').split('-').map(Number);
  const selectedDay = new Date(year, month - 1, day);
  if (
    !Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day) ||
    selectedDay.getFullYear() !== year || selectedDay.getMonth() !== month - 1 ||
    selectedDay.getDate() !== day
  ) return null;

  const originalTrip = trips.find(trip => Number(trip.id) === Number(tripId));
  if (!originalTrip) return null;
  const totalKm = Number(form.totalKm);
  const parkingFees = Number(form.parkingFees);
  if (!Number.isFinite(totalKm) || totalKm < 0 || !Number.isFinite(parkingFees) || parkingFees < 0) return null;

  const originalTripDate = getTripDate(originalTrip);
  const originalStartTime = Number(originalTrip.startTime) || originalTripDate?.getTime() || selectedDay.getTime();
  const originalStart = new Date(originalStartTime);
  selectedDay.setHours(
    originalStart.getHours(),
    originalStart.getMinutes(),
    originalStart.getSeconds(),
    originalStart.getMilliseconds()
  );
  const ratePerKm = Number(originalTrip.ratePerKm ?? petrolRate);
  const petrolCharges = totalKm * ratePerKm;
  const dateShift = selectedDay.getTime() - originalStartTime;
  const updatedTrip = {
    ...originalTrip,
    date: selectedDay.toLocaleDateString('en-GB').replace(/\//g, '-'),
    startTime: selectedDay.getTime(),
    endTime: originalTrip.endTime ? Number(originalTrip.endTime) + dateShift : originalTrip.endTime,
    visitor: String(form.visitor || '').trim(),
    assignedBy: String(form.assignedBy || '').trim(),
    fromLoc: String(form.fromLoc || '').trim(),
    toLoc: String(form.toLoc || '').trim(),
    totalKm,
    ratePerKm,
    petrolCharges,
    parkingFees,
    totalAmount: petrolCharges + parkingFees,
    purpose: String(form.purpose || '').trim()
  };

  return {
    trips: trips.map(trip => Number(trip.id) === Number(tripId) ? updatedTrip : trip),
    updatedTrip
  };
}

export function filterHistoryTrips(trips, filters, fallbackRecordedBy = '') {
  const search = String(filters.search || '').trim().toLocaleLowerCase();
  return trips
    .filter(trip => !filters.selectedMonth || getTripMonthKey(trip) === filters.selectedMonth)
    .filter(trip => {
      const tripDate = getTripDate(trip);
      const tripDateKey = tripDate ? getTripDateKey(tripDate) : '';
      if (filters.dateFrom && (!tripDateKey || tripDateKey < filters.dateFrom)) return false;
      if (filters.dateTo && (!tripDateKey || tripDateKey > filters.dateTo)) return false;
      if (filters.filterVisitor && trip.visitor !== filters.filterVisitor) return false;
      if (!search) return true;
      const searchFields = [
        trip.visitor,
        trip.assignedBy,
        trip.recordedBy || fallbackRecordedBy,
        trip.fromLoc,
        trip.toLoc,
        trip.purpose
      ].join(' ').toLocaleLowerCase();
      return searchFields.includes(search);
    })
    .sort(compareTripsByReportOrder);
}

export function buildMonthlyInsights(trips, limit = 6) {
  const months = new Map();
  for (const trip of trips) {
    const month = getTripMonthKey(trip);
    if (!month) continue;
    if (!months.has(month)) months.set(month, []);
    months.get(month).push(trip);
  }
  return [...months.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .slice(0, limit)
    .map(([month, monthTrips]) => ({
      month,
      tripCount: monthTrips.length,
      totalKm: monthTrips.reduce((sum, trip) => sum + (Number(trip.totalKm) || 0), 0),
      petrolAmount: monthTrips.reduce((sum, trip) => sum + getTripPetrolAmount(trip), 0),
      parkingAmount: monthTrips.reduce((sum, trip) => sum + (Number(trip.parkingFees) || 0), 0),
      grandTotal: monthTrips.reduce((sum, trip) => sum + getTripTotalAmount(trip), 0)
    }));
}

export function findDuplicateBackupTrips(trips) {
  const seenIds = new Set();
  const seenRecords = new Set();
  const duplicateIndexes = [];
  trips.forEach((trip, index) => {
    const id = String(trip.id);
    const recordKey = JSON.stringify(Object.keys(trip).filter(key => key !== 'id').sort().map(key => [key, trip[key]]));
    if (seenIds.has(id) || seenRecords.has(recordKey)) duplicateIndexes.push(index);
    seenIds.add(id);
    seenRecords.add(recordKey);
  });
  return duplicateIndexes;
}

export function validateBackup(backup) {
  const data = backup?.data;
  if (
    (backup?.appId !== 'invictus-tracker' && backup?.appId !== 'petrol-expenses-tracker') ||
    backup?.formatVersion !== 1 || !data || !Array.isArray(data.trips) ||
    !Array.isArray(data.savedDestinations) || !Array.isArray(data.managers) ||
    !Array.isArray(data.savedVisitors) ||
    !data.savedDestinations.every(item => typeof item === 'string') ||
    !data.managers.every(item => typeof item === 'string') ||
    !data.savedVisitors.every(item => typeof item === 'string')
  ) return { ok: false, error: 'This backup file is not for this app.' };

  const validRate = Number(data.petrolRate);
  const validOffice = data.officeLocation === null || (
    typeof data.officeLocation?.lat === 'number' && Number.isFinite(data.officeLocation.lat) &&
    typeof data.officeLocation?.lon === 'number' && Number.isFinite(data.officeLocation.lon)
  );
  const validTrips = data.trips.every(trip =>
    trip && typeof trip === 'object' &&
    (typeof trip.id === 'number' || typeof trip.id === 'string') &&
    typeof trip.date === 'string' &&
    ['visitor', 'assignedBy', 'recordedBy', 'fromLoc', 'toLoc', 'purpose'].every(field =>
      trip[field] === undefined || trip[field] === null || typeof trip[field] === 'string'
    ) &&
    ['totalKm', 'ratePerKm', 'petrolCharges', 'parkingFees', 'totalAmount', 'startTime', 'endTime'].every(field =>
      trip[field] === undefined || trip[field] === null ||
      (typeof trip[field] === 'number' && Number.isFinite(trip[field]))
    )
  );
  if (!Number.isFinite(validRate) || validRate < 0 || !validOffice || !validTrips) {
    return { ok: false, error: 'The backup contains invalid trip or setting data.' };
  }

  return {
    ok: true,
    data,
    duplicateIndexes: findDuplicateBackupTrips(data.trips),
    summary: {
      tripCount: data.trips.length,
      createdAt: typeof backup.createdAt === 'string' ? backup.createdAt : '',
      petrolRate: validRate,
      officeLocationSaved: Boolean(data.officeLocation),
      destinationCount: data.savedDestinations.length,
      managerCount: data.managers.length,
      visitorCount: data.savedVisitors.length
    }
  };
}

export function restoreBackupToStorage(storage, data) {
  const restoredValues = {
    invictusTrips: JSON.stringify(data.trips),
    invictusOffice: JSON.stringify(data.officeLocation),
    invictusDests: JSON.stringify(data.savedDestinations),
    invictusManagers: JSON.stringify(data.managers),
    invictusVisitors: JSON.stringify(data.savedVisitors),
    invictusRate: String(Number(data.petrolRate))
  };
  const previousValues = new Map(Object.keys(restoredValues).map(key => [key, storage.getItem(key)]));
  try {
    for (const [key, value] of Object.entries(restoredValues)) storage.setItem(key, value);
  } catch (error) {
    for (const [key, previous] of previousValues) {
      try {
        if (previous === null) storage.removeItem(key);
        else storage.setItem(key, previous);
      } catch {
        // Continue restoring the remaining original values.
      }
    }
    throw error;
  }
}

export function parseTripDraft(raw) {
  if (!raw) return null;
  try {
    const draft = JSON.parse(raw);
    const trip = draft?.trip;
    if (
      draft?.version !== 1 || !['tracking', 'saving'].includes(draft?.phase) ||
      !trip || typeof trip !== 'object' || trip.startTime === null || trip.startTime === undefined ||
      !Number.isFinite(Number(trip.startTime)) ||
      !['fromLoc', 'toLoc', 'visitor', 'assignedBy', 'recordedBy', 'purpose'].every(field =>
        trip[field] === undefined || trip[field] === null || typeof trip[field] === 'string'
      )
    ) return null;
    return { phase: draft.phase, trip: { ...createEmptyTrip(), ...trip } };
  } catch {
    return null;
  }
}

export function readTripDraft(storage) {
  try {
    return parseTripDraft(storage.getItem(TRIP_DRAFT_STORAGE_KEY));
  } catch {
    return null;
  }
}

export function persistTripDraft(storage, phase, trip) {
  if (!['tracking', 'saving'].includes(phase)) {
    storage.removeItem(TRIP_DRAFT_STORAGE_KEY);
    return;
  }
  storage.setItem(TRIP_DRAFT_STORAGE_KEY, JSON.stringify({ version: 1, phase, trip, savedAt: Date.now() }));
}

export function buildPdfTableDefinition(headerCells, rows, totalRow) {
  return {
    headerRows: PDF_TABLE_HEADER_ROWS,
    body: [
      headerCells,
      ...rows.map(row => row.map((text, columnIndex) => ({
        text,
        alignment: columnIndex === 0 || columnIndex >= 6 ? 'center' : 'left'
      }))),
      totalRow
    ]
  };
}
