import React, { useState, useEffect, useRef } from 'react';
import {
  MapPin,
  Clock,
  Navigation,
  Menu,
  X,
  History,
  Settings,
  Download,
  Bike,
  Plus,
  Save,
  AlertCircle,
  RefreshCw,
  FileText,
  Trash2,
  Upload,
  Database,
  UserRound
} from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

export default function App() {
  const [activeTab, setActiveTab] = useState('tracker');
  const [showReportsMenu, setShowReportsMenu] = useState(false);
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);
  const [tripState, setTripState] = useState('idle');
  const [timer, setTimer] = useState(0);
  const timerRef = useRef<any>(null);

  const [officeLocation, setOfficeLocation] = useState<any>(null);
  const [savedDestinations, setSavedDestinations] = useState<string[]>([]);
  const [trips, setTrips] = useState<any[]>([]);
  const [recordedByName, setRecordedByName] = useState('');
  const [recordedByInput, setRecordedByInput] = useState('');
  const [assignedPeople, setAssignedPeople] = useState<string[]>([]);
  const [savedVisitors, setSavedVisitors] = useState<string[]>([]);
  const [visitorInput, setVisitorInput] = useState('');
  const [petrolRate, setPetrolRate] = useState(5);
  const [rateInput, setRateInput] = useState('5');
  const [selectedMonth, setSelectedMonth] = useState('');
  const [reportSearch, setReportSearch] = useState('');
  const [filterVisitor, setFilterVisitor] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [editingTripId, setEditingTripId] = useState<number | null>(null);
  const [editingTripForm, setEditingTripForm] = useState<any>(null);
  const [showPastTripForm, setShowPastTripForm] = useState(false);
  const [pastTripForm, setPastTripForm] = useState<any>(null);
  const backupInputRef = useRef<HTMLInputElement | null>(null);

  const [currentTrip, setCurrentTrip] = useState({
    startCoords: null as any,
    endCoords: null as any,
    startTime: null as number | null,
    endTime: null as number | null,
    actualKm: 0,
    fromLoc: '',
    toLoc: '',
    visitor: '',
    assignedBy: '',
    recordedBy: '',
    parkingFees: 0,
    purpose: ''
  });

  useEffect(() => {
    const savedTrips = JSON.parse(localStorage.getItem('invictusTrips') || '[]');
    const savedRecordedByName = localStorage.getItem('invictusRecordedBy') || '';
    const savedOffice = JSON.parse(localStorage.getItem('invictusOffice') || 'null');
    const savedDests = JSON.parse(
      localStorage.getItem('invictusDests') ||
      '["Office", "Paradise", "Begumpet", "Malkajgiri"]'
    );
    const savedAssignedPeople = JSON.parse(
      localStorage.getItem('invictusManagers') ||
      '["Ramu sir", "KV Mam", "Lakshmi Mam", "swetha mam"]'
    );
    const savedVisitors = JSON.parse(localStorage.getItem('invictusVisitors') || '[]');
    const savedRate = Number(localStorage.getItem('invictusRate') ?? 5);

    setTrips(savedTrips);
    setRecordedByName(savedRecordedByName);
    setRecordedByInput(savedRecordedByName);
    setOfficeLocation(savedOffice);
    setSavedDestinations(savedDests);
    setAssignedPeople(savedAssignedPeople);
    setSavedVisitors(savedVisitors);
    setPetrolRate(Number.isFinite(savedRate) && savedRate >= 0 ? savedRate : 5);
    setRateInput(String(Number.isFinite(savedRate) && savedRate >= 0 ? savedRate : 5));
  }, []);

  useEffect(() => {
    if (tripState === 'tracking') {
      timerRef.current = setInterval(() => setTimer(t => t + 1), 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      if (tripState === 'idle') setTimer(0);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [tripState]);

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h > 0 ? h + 'h ' : ''}${m}m ${s}s`;
  };

  const getGPSLocation = (): Promise<{ lat: number; lon: number }> => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Geolocation is not supported by this device'));
        return;
      }

      navigator.geolocation.getCurrentPosition(
        position =>
          resolve({
            lat: position.coords.latitude,
            lon: position.coords.longitude
          }),
        error => reject(error),
        {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 0
        }
      );
    });
  };

  const getRoadDistanceOSRM = async (start: any, end: any) => {
    try {
      const baseUrl = atob(
        'aHR0cHM6Ly9yb3V0ZXIucHJvamVjdC1vc3JtLm9yZw=='
      );
      const path = '/route/v1/driving/';
      const response = await fetch(
        `${baseUrl}${path}${start.lon},${start.lat};${end.lon},${end.lat}?overview=false`
      );
      const data = await response.json();

      if (data.routes && data.routes.length > 0) {
        return parseFloat((data.routes[0].distance / 1000).toFixed(1));
      }

      return 0;
    } catch (e) {
      console.error('OSRM Route Failed', e);
      return 0;
    }
  };

  const handleStartTrip = async () => {
    if (!recordedByName.trim()) {
      alert('Please set the name for this phone in Settings before starting a trip.');
      setActiveTab('settings');
      return;
    }

    try {
      const coords = await getGPSLocation();
      const now = new Date();

      const todayString = now.toLocaleDateString('en-GB');
      const todaysTrips = trips.filter(
        t => new Date(t.startTime).toLocaleDateString('en-GB') === todayString
      );

      const autoFrom =
        todaysTrips.length > 0
          ? todaysTrips[todaysTrips.length - 1].toLoc
          : 'Office';

      const defaultAssignedPerson = assignedPeople.length > 0 ? assignedPeople[0] : '';

      setCurrentTrip(prev => ({
        ...prev,
        startCoords: coords,
        startTime: now.getTime(),
        fromLoc: autoFrom,
        assignedBy: defaultAssignedPerson,
        recordedBy: recordedByName
      }));

      setTripState('tracking');
    } catch (err) {
      alert('GPS Error: Please ensure Location permissions are granted.');
    }
  };

  const handleEndTrip = async () => {
    try {
      const coords = await getGPSLocation();
      const now = new Date();

      let distanceKm = 0;

      if (currentTrip.startCoords) {
        distanceKm = await getRoadDistanceOSRM(
          currentTrip.startCoords,
          coords
        );
      }

      if (distanceKm === 0) {
        alert(
          'Road routing failed or distance too short. You can enter the KM manually on the next screen.'
        );
      }

      setCurrentTrip(prev => ({
        ...prev,
        endCoords: coords,
        endTime: now.getTime(),
        actualKm: distanceKm
      }));

      setTripState('saving');
    } catch (err) {
      alert('GPS Error while ending trip. Cannot capture end coordinates.');
    }
  };

  const saveOfficeGPS = async () => {
    try {
      const coords = await getGPSLocation();
      setOfficeLocation(coords);
      localStorage.setItem('invictusOffice', JSON.stringify(coords));
      alert('Office GPS location saved successfully!');
    } catch (err) {
      alert('Failed to get location for Office.');
    }
  };

  const saveDestination = (dest: string) => {
    if (dest && !savedDestinations.includes(dest)) {
      const updated = [...savedDestinations, dest];
      setSavedDestinations(updated);
      localStorage.setItem('invictusDests', JSON.stringify(updated));
    }
  };

  const saveAssignedPerson = (personName: string) => {
    const normalizedName = personName.trim();
    if (normalizedName && !assignedPeople.some(name => name.toLowerCase() === normalizedName.toLowerCase())) {
      const updated = [...assignedPeople, normalizedName];
      setAssignedPeople(updated);
      localStorage.setItem('invictusManagers', JSON.stringify(updated));
    }
  };

  const saveVisitor = (visitorName: string) => {
    const normalizedName = visitorName.trim();
    if (normalizedName && !savedVisitors.some(name => name.toLowerCase() === normalizedName.toLowerCase())) {
      const updated = [...savedVisitors, normalizedName];
      setSavedVisitors(updated);
      localStorage.setItem('invictusVisitors', JSON.stringify(updated));
    }
  };

  const removeSavedVisitor = (name: string) => {
    const updated = savedVisitors.filter(item => item !== name);
    setSavedVisitors(updated);
    localStorage.setItem('invictusVisitors', JSON.stringify(updated));
  };

  const savePetrolRate = () => {
    if (!rateInput.trim()) {
      alert('Enter the petrol reimbursement rate per kilometre.');
      return;
    }
    const nextRate = Number(rateInput);
    if (!Number.isFinite(nextRate) || nextRate < 0) {
      alert('Enter a valid petrol rate of ₹0 or more per kilometre.');
      return;
    }

    setPetrolRate(nextRate);
    localStorage.setItem('invictusRate', String(nextRate));
    alert('Petrol rate saved. Existing trips keep their saved rate.');
  };

  const saveRecordedByName = () => {
    const normalizedName = recordedByInput.trim();
    if (!normalizedName) {
      alert('Enter the name of the person using this phone.');
      return;
    }

    setRecordedByName(normalizedName);
    setRecordedByInput(normalizedName);
    localStorage.setItem('invictusRecordedBy', normalizedName);
    alert('Name saved on this phone. New trips will include it.');
  };

  const finalizeTrip = () => {
    if (!currentTrip.toLoc || !currentTrip.visitor || !currentTrip.assignedBy) {
      alert('Please enter Destination, Visitor Name, and Assigned Person');
      return;
    }

    saveDestination(currentTrip.toLoc);
    saveAssignedPerson(currentTrip.assignedBy);

    const km = parseFloat(currentTrip.actualKm.toString()) || 0;
    const parking = parseFloat(currentTrip.parkingFees.toString()) || 0;

    const tripRecord = {
      id: Date.now(),
      date: new Date(currentTrip.startTime!).toLocaleDateString('en-GB').replace(/\//g, '-'),
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

    saveVisitor(currentTrip.visitor);
    const newTrips = [...trips, tripRecord];
    setTrips(newTrips);
    localStorage.setItem('invictusTrips', JSON.stringify(newTrips));

    setCurrentTrip({
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

    setTripState('idle');
    setActiveTab('reports');
  };

  const deleteTrip = (id: number) => {
    if (window.confirm('Delete this trip? This cannot be undone.')) {
      const filtered = trips.filter(t => t.id !== id);
      setTrips(filtered);
      localStorage.setItem('invictusTrips', JSON.stringify(filtered));
      if (editingTripId === id) {
        setEditingTripId(null);
        setEditingTripForm(null);
      }
    }
  };

  const beginEditTrip = (trip: any) => {
    const tripDate = getTripDate(trip);
    setEditingTripId(Number(trip.id));
    setEditingTripForm({
      date: tripDate ? getTripDateKey(tripDate) : '',
      visitor: trip.visitor || '',
      assignedBy: trip.assignedBy || '',
      fromLoc: trip.fromLoc || '',
      toLoc: trip.toLoc || '',
      totalKm: String(Number(trip.totalKm) || 0),
      parkingFees: String(Number(trip.parkingFees) || 0),
      purpose: trip.purpose || ''
    });
  };

  const cancelEditTrip = () => {
    setEditingTripId(null);
    setEditingTripForm(null);
  };

  const saveEditedTrip = (tripId: number) => {
    if (!editingTripForm?.date || !editingTripForm.visitor.trim() ||
        !editingTripForm.assignedBy.trim() || !editingTripForm.toLoc.trim()) {
      alert('Enter the date, destination, visitor, and assigned person.');
      return;
    }

    const [year, month, day] = editingTripForm.date.split('-').map(Number);
    const selectedDay = new Date(year, month - 1, day);
    if (
      !Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day) ||
      selectedDay.getFullYear() !== year || selectedDay.getMonth() !== month - 1 ||
      selectedDay.getDate() !== day
    ) {
      alert('Choose a valid trip date.');
      return;
    }

    const originalTrip = trips.find(trip => Number(trip.id) === tripId);
    if (!originalTrip) return;

    const originalTripDate = getTripDate(originalTrip);
    const originalStartTime = Number(originalTrip.startTime) || originalTripDate?.getTime() || selectedDay.getTime();
    const originalStart = new Date(originalStartTime);
    selectedDay.setHours(
      originalStart.getHours(),
      originalStart.getMinutes(),
      originalStart.getSeconds(),
      originalStart.getMilliseconds()
    );

    const totalKm = Number(editingTripForm.totalKm);
    const parkingFees = Number(editingTripForm.parkingFees);
    if (!Number.isFinite(totalKm) || totalKm < 0 || !Number.isFinite(parkingFees) || parkingFees < 0) {
      alert('Enter valid non-negative values for distance and parking.');
      return;
    }

    const ratePerKm = Number(originalTrip.ratePerKm ?? petrolRate);
    const petrolCharges = totalKm * ratePerKm;
    const dateShift = selectedDay.getTime() - originalStartTime;
    const updatedTrips = trips.map(trip => {
      if (Number(trip.id) !== tripId) return trip;
      return {
        ...trip,
        date: selectedDay.toLocaleDateString('en-GB').replace(/\//g, '-'),
        startTime: selectedDay.getTime(),
        endTime: trip.endTime ? Number(trip.endTime) + dateShift : trip.endTime,
        visitor: editingTripForm.visitor.trim(),
        assignedBy: editingTripForm.assignedBy.trim(),
        fromLoc: editingTripForm.fromLoc.trim(),
        toLoc: editingTripForm.toLoc.trim(),
        totalKm,
        ratePerKm,
        petrolCharges,
        parkingFees,
        totalAmount: petrolCharges + parkingFees,
        purpose: editingTripForm.purpose.trim()
      };
    });

    saveVisitor(editingTripForm.visitor);
    saveAssignedPerson(editingTripForm.assignedBy);
    saveDestination(editingTripForm.toLoc);
    setTrips(updatedTrips);
    localStorage.setItem('invictusTrips', JSON.stringify(updatedTrips));
    cancelEditTrip();
  };

  const openPastTripForm = () => {
    if (!recordedByName.trim()) {
      alert('Please set the name for this phone in Settings before adding a past trip.');
      setActiveTab('settings');
      setShowReportsMenu(false);
      setShowSettingsMenu(true);
      return;
    }

    const now = new Date();
    setPastTripForm({
      date: getTripDateKey(now),
      time: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
      fromLoc: 'Office',
      toLoc: '',
      visitor: '',
      assignedBy: assignedPeople[0] || '',
      totalKm: '',
      parkingFees: '0',
      purpose: ''
    });
    setShowPastTripForm(true);
  };

  const cancelPastTrip = () => {
    setShowPastTripForm(false);
    setPastTripForm(null);
  };

  const savePastTrip = () => {
    if (!pastTripForm) return;
    if (!recordedByName.trim()) {
      alert('Please set the name for this phone in Settings before adding a past trip.');
      setActiveTab('settings');
      setShowReportsMenu(false);
      setShowSettingsMenu(true);
      return;
    }

    const [year, month, day] = String(pastTripForm.date || '').split('-').map(Number);
    const [hours, minutes] = String(pastTripForm.time || '').split(':').map(Number);
    const tripStart = new Date(year, month - 1, day, hours, minutes);
    if (
      !Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day) ||
      !Number.isFinite(hours) || !Number.isFinite(minutes) ||
      tripStart.getFullYear() !== year || tripStart.getMonth() !== month - 1 ||
      tripStart.getDate() !== day || hours < 0 || hours > 23 ||
      minutes < 0 || minutes > 59
    ) {
      alert('Choose a valid trip date and start time.');
      return;
    }
    if (tripStart.getTime() > Date.now()) {
      alert('Choose a trip date and time that has already happened.');
      return;
    }

    const visitor = String(pastTripForm.visitor || '').trim();
    const assignedBy = String(pastTripForm.assignedBy || '').trim();
    const fromLoc = String(pastTripForm.fromLoc || '').trim();
    const toLoc = String(pastTripForm.toLoc || '').trim();
    const totalKm = Number(pastTripForm.totalKm);
    const parkingFees = Number(pastTripForm.parkingFees);
    if (!visitor || !assignedBy || !fromLoc || !toLoc) {
      alert('Enter the starting point, destination, visitor, and assigned person.');
      return;
    }
    if (!Number.isFinite(totalKm) || totalKm <= 0 ||
        !Number.isFinite(parkingFees) || parkingFees < 0) {
      alert('Enter a distance greater than 0 and a valid parking fee.');
      return;
    }

    const ratePerKm = petrolRate;
    const petrolCharges = totalKm * ratePerKm;
    const latestId = trips.reduce((max, trip) => Math.max(max, Number(trip.id) || 0), 0);
    const tripRecord = {
      id: Math.max(Date.now(), latestId + 1),
      date: tripStart.toLocaleDateString('en-GB').split('/').join('-'),
      visitor,
      assignedBy,
      recordedBy: recordedByName.trim(),
      fromLoc,
      toLoc,
      actualKm: totalKm,
      totalKm,
      ratePerKm,
      petrolCharges,
      parkingFees,
      totalAmount: petrolCharges + parkingFees,
      purpose: String(pastTripForm.purpose || '').trim(),
      startTime: tripStart.getTime(),
      endTime: tripStart.getTime(),
      startCoords: null,
      endCoords: null,
      manualEntry: true
    };
    const updatedTrips = [...trips, tripRecord];

    saveDestination(fromLoc);
    saveDestination(toLoc);
    saveVisitor(visitor);
    saveAssignedPerson(assignedBy);
    setTrips(updatedTrips);
    localStorage.setItem('invictusTrips', JSON.stringify(updatedTrips));
    setSelectedMonth(currentMonth => {
      const tripMonth = getTripMonthKey(tripRecord);
      return currentMonth && currentMonth !== tripMonth ? tripMonth : currentMonth;
    });
    setReportSearch('');
    setFilterVisitor('');
    setDateFrom('');
    setDateTo('');
    cancelPastTrip();
  };

  const csvEscape = (value: any) => {
    const text = String(value ?? '');
    return `"${text.replace(/"/g, '""')}"`;
  };


  const getTripMonthKey = (trip: any) => {
    if (trip.startTime) {
      const d = new Date(trip.startTime);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    }
    const parts = String(trip.date || '').split('-');
    return parts.length === 3 ? `${parts[2]}-${parts[1]}` : '';
  };

  const getTripDate = (trip: any) => {
    if (trip.startTime) {
      const tripDate = new Date(trip.startTime);
      return Number.isNaN(tripDate.getTime()) ? null : tripDate;
    }

    const parts = String(trip.date || '').split('-').map(Number);
    if (parts.length !== 3 || parts.some(part => !Number.isFinite(part))) {
      return null;
    }

    const [day, month, year] = parts;
    const tripDate = new Date(year, month - 1, day);
    if (
      tripDate.getFullYear() !== year ||
      tripDate.getMonth() !== month - 1 ||
      tripDate.getDate() !== day
    ) {
      return null;
    }

    return tripDate;
  };

  const getTripDateKey = (date: Date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

  const compareTripsByReportOrder = (a: any, b: any) => {
    const aDate = getTripDate(a);
    const bDate = getTripDate(b);
    const aDay = aDate ? getTripDateKey(aDate) : '';
    const bDay = bDate ? getTripDateKey(bDate) : '';

    if (aDay !== bDay) return aDay.localeCompare(bDay);

    const aStart = Number(a.startTime || a.id || 0) || 0;
    const bStart = Number(b.startTime || b.id || 0) || 0;
    return aStart - bStart || Number(a.id || 0) - Number(b.id || 0);
  };

  const sumTripKm = (records: any[]) =>
    records.reduce((sum, trip) => sum + (Number(trip.totalKm) || 0), 0);

  const getTripPetrolAmount = (trip: any) =>
    Number(trip.petrolCharges ??
      (Number(trip.totalKm) || 0) * Number(trip.ratePerKm ?? 5)) || 0;

  const sumPetrolAmount = (records: any[]) =>
    records.reduce((sum, trip) => sum + getTripPetrolAmount(trip), 0);

  const sumParkingAmount = (records: any[]) =>
    records.reduce((sum, trip) => sum + (Number(trip.parkingFees) || 0), 0);

  const getTripTotalAmount = (trip: any) =>
    Number(trip.totalAmount ?? (getTripPetrolAmount(trip) + (Number(trip.parkingFees) || 0))) || 0;

  const sumTotalAmount = (records: any[]) =>
    records.reduce((sum, trip) => sum + getTripTotalAmount(trip), 0);

  const formatRupees = (amount: number) =>
    `₹${amount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

  const getTripRecordedBy = (trip: any) => trip.recordedBy || recordedByName;

  const now = new Date();
  const todayKey = getTripDateKey(now);
  const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const todayTrips = trips.filter(trip => {
    const tripDate = getTripDate(trip);
    return tripDate ? getTripDateKey(tripDate) === todayKey : false;
  });
  const monthTrips = trips.filter(trip => getTripMonthKey(trip) === currentMonthKey);
  const todayKm = sumTripKm(todayTrips);
  const todayPetrol = sumPetrolAmount(todayTrips);
  const monthKm = sumTripKm(monthTrips);
  const monthPetrol = sumPetrolAmount(monthTrips);

  const getAvailableMonths = () =>
    Array.from(new Set(trips.map(getTripMonthKey).filter(Boolean))).sort().reverse();

  const getMonthLabel = (monthKey: string) => {
    if (!monthKey) return 'All Months';
    const [year, month] = monthKey.split('-').map(Number);
    return new Date(year, month - 1, 1).toLocaleDateString('en-IN', {
      month: 'long',
      year: 'numeric'
    });
  };

  const getFilteredTrips = () =>
    selectedMonth ? trips.filter(t => getTripMonthKey(t) === selectedMonth) : trips;

  const reportTrips = getFilteredTrips();
  const reportKm = sumTripKm(reportTrips);
  const reportPetrol = sumPetrolAmount(reportTrips);
  const reportParking = sumParkingAmount(reportTrips);
  const reportGrandTotal = sumTotalAmount(reportTrips);

  const getAvailableVisitors = () =>
    Array.from(new Set([
      ...savedVisitors,
      ...trips.map(trip => String(trip.visitor || '').trim()).filter(Boolean)
    ])).sort((a, b) => a.localeCompare(b));

  const getHistoryTrips = () => {
    const search = reportSearch.trim().toLocaleLowerCase();

    return getFilteredTrips()
      .filter(trip => {
        const tripDate = getTripDate(trip);
        const tripDateKey = tripDate ? getTripDateKey(tripDate) : '';
        if (dateFrom && (!tripDateKey || tripDateKey < dateFrom)) return false;
        if (dateTo && (!tripDateKey || tripDateKey > dateTo)) return false;
        if (filterVisitor && trip.visitor !== filterVisitor) return false;
        if (!search) return true;

        const searchFields = [
          trip.visitor,
          trip.assignedBy,
          getTripRecordedBy(trip),
          trip.fromLoc,
          trip.toLoc,
          trip.purpose
        ].join(' ').toLocaleLowerCase();
        return searchFields.includes(search);
      })
      .sort(compareTripsByReportOrder);
  };

  const clearHistoryFilters = () => {
    setReportSearch('');
    setFilterVisitor('');
    setDateFrom('');
    setDateTo('');
  };

  const buildCSV = (reportTrips = getFilteredTrips()) => {
    const headers = [
      'No.',
      'Date',
      'Visitor / Client',
      'Assigned Person',
      'Recorded By',
      'From',
      'To',
      'Distance (km)',
      'Rate (₹ / km)',
      'Petrol Reimbursement (₹)',
      'Parking (₹)',
      'Grand Total (₹)',
      'Purpose / Remarks'
    ];

    let csvContent = headers.map(csvEscape).join(',') + '\n';
    let totalKm = 0;
    let totalPetrol = 0;
    let totalParking = 0;
    let grandTotal = 0;

    reportTrips.forEach((t, i) => {
      totalKm += Number(t.totalKm) || 0;
      totalPetrol += getTripPetrolAmount(t);
      totalParking += Number(t.parkingFees) || 0;
      grandTotal += getTripTotalAmount(t);

      const row = [
        i + 1,
        t.date,
        t.visitor,
        t.assignedBy,
        getTripRecordedBy(t),
        t.fromLoc,
        t.toLoc,
        Number(t.totalKm || 0).toFixed(1),
        Number(t.ratePerKm ?? petrolRate).toFixed(2),
        getTripPetrolAmount(t).toFixed(2),
        Number(t.parkingFees || 0).toFixed(2),
        getTripTotalAmount(t).toFixed(2),
        t.purpose
      ];

      csvContent += row.map(csvEscape).join(',') + '\n';
    });

    csvContent += `,,,,,,TOTALS,${totalKm.toFixed(1)},,${totalPetrol.toFixed(2)},${totalParking.toFixed(2)},${grandTotal.toFixed(2)},\n`;

    return csvContent;
  };

  const exportCSV = async () => {
    if (trips.length === 0) {
      alert('No trips to export');
      return;
    }

    const reportTrips = getFilteredTrips();

    if (reportTrips.length === 0) {
      alert('No trips found for the selected month');
      return;
    }

    const csvContent = buildCSV(reportTrips);
    const exportDate = getTripDateKey(new Date());
    const fileName = selectedMonth
      ? `Invictus_Trip_Report_${selectedMonth}_Exported_${exportDate}.csv`
      : `Invictus_Trip_Report_All_Months_${exportDate}.csv`;

    try {
      if (Capacitor.isNativePlatform()) {
        await Filesystem.writeFile({
          path: fileName,
          data: csvContent,
          directory: Directory.Documents,
          encoding: Encoding.UTF8
        });

        const fileUri = await Filesystem.getUri({
          path: fileName,
          directory: Directory.Documents
        });

        await Share.share({
          title: 'Petrol Expenses Tracker Report',
          text: 'Monthly travel and petrol expense report',
          url: fileUri.uri,
          dialogTitle: 'Share / Save CSV Report'
        });

        return;
      }

      const blob = new Blob([csvContent], {
        type: 'text/csv;charset=utf-8;'
      });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);

      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      alert('Export successful! CSV downloaded.');
    } catch (err: any) {
      alert(
        'Export failed: ' +
          (err?.message || JSON.stringify(err))
      );
    }
  };

  const exportPDF = async () => {
    if (trips.length === 0) {
      alert('No trips to export');
      return;
    }

    const selectedTrips = getFilteredTrips();
    if (selectedTrips.length === 0) {
      alert('No trips found for the selected month');
      return;
    }

    const totalKm = sumTripKm(selectedTrips);
    const totalPetrol = sumPetrolAmount(selectedTrips);
    const totalParking = sumParkingAmount(selectedTrips);
    const grandTotal = sumTotalAmount(selectedTrips);
    const generatedOn = new Date().toLocaleDateString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric'
    });
    const exportDate = getTripDateKey(new Date());
    const fileName = selectedMonth
      ? `Invictus_Trip_Report_${selectedMonth}_Exported_${exportDate}.pdf`
      : `Invictus_Trip_Report_All_Months_${exportDate}.pdf`;
    const rows = selectedTrips
      .slice()
      .sort(compareTripsByReportOrder)
      .map((trip, index) => [
        String(index + 1),
        trip.date || '-',
        trip.visitor || '-',
        trip.assignedBy || '-',
        `${trip.fromLoc || '-'} TO ${trip.toLoc || '-'}`,
        trip.purpose || '-',
        (Number(trip.totalKm) || 0).toFixed(1),
        formatRupees(getTripPetrolAmount(trip)),
        formatRupees(Number(trip.parkingFees) || 0),
        formatRupees(getTripTotalAmount(trip))
      ]);

    const documentDefinition: any = {
      pageSize: 'A4',
      pageOrientation: 'landscape',
      pageMargins: [28, 38, 28, 38],
      footer: {
        text: `Generated ${generatedOn}`,
        alignment: 'left',
        margin: [28, 0, 0, 16],
        style: 'footer'
      },
      content: [
        { text: 'Petrol Expense Report', style: 'title' },
        ...(recordedByName ? [{ text: `Name: ${recordedByName}`, style: 'reporter' }] : []),
        { text: `${selectedMonth ? getMonthLabel(selectedMonth) : 'All months'}`, style: 'subtitle' },
        {
          margin: [0, 14, 0, 14],
          table: {
            widths: ['*', '*', '*', '*', '*'],
            body: [[
              { text: `TRIPS\n${selectedTrips.length}`, style: 'summary' },
              { text: `TOTAL KM\n${totalKm.toFixed(1)}`, style: 'summary' },
              { text: `PETROL AMOUNT\n${formatRupees(totalPetrol)}`, style: 'summary' },
              { text: `PARKING FEE\n${formatRupees(totalParking)}`, style: 'summary' },
              { text: `GRAND TOTAL\n${formatRupees(grandTotal)}`, style: 'summaryHighlight' }
            ]]
          },
          layout: {
            hLineWidth: () => 0,
            vLineWidth: () => 5,
            vLineColor: () => '#ffffff',
            paddingLeft: () => 8,
            paddingRight: () => 8,
            paddingTop: () => 9,
            paddingBottom: () => 9
          }
        },
        {
          table: {
            headerRows: 1,
            widths: [22, 50, 74, 64, '*', '*', 36, 56, 52, 58],
            body: [[
              'No.', 'Date', 'Visitor / Client', 'Assigned Person', 'Route', 'Purpose',
              'KM', 'Petrol Amount', 'Parking Fee', 'Total'
            ], ...rows, [
              { text: 'TOTAL', colSpan: 6, alignment: 'right', bold: true },
              {}, {}, {}, {}, {},
              { text: totalKm.toFixed(1), bold: true },
              { text: formatRupees(totalPetrol), bold: true },
              { text: formatRupees(totalParking), bold: true },
              { text: formatRupees(grandTotal), bold: true }
            ]]
          },
          layout: {
            hLineColor: () => '#dbe4e8',
            vLineWidth: () => 0,
            paddingLeft: () => 4,
            paddingRight: () => 4,
            paddingTop: () => 5,
            paddingBottom: () => 5
          }
        }
      ],
      styles: {
        title: { fontSize: 20, bold: true, color: '#102a35', margin: [0, 4, 0, 0] },
        subtitle: { fontSize: 9, color: '#64748b', margin: [0, 5, 0, 0] },
        footer: { fontSize: 8, color: '#64748b' },
        reporter: { fontSize: 12, bold: true, color: '#087f9b', margin: [0, 6, 0, 0] },
        summary: { fontSize: 9, bold: true, color: '#102a35', fillColor: '#eef9fb', alignment: 'center', lineHeight: 1.4 },
        summaryHighlight: { fontSize: 9, bold: true, color: '#ffffff', fillColor: '#087f9b', alignment: 'center', lineHeight: 1.4 }
      },
      defaultStyle: { font: 'Roboto', fontSize: 7, color: '#334155' }
    };

    try {
      const [pdfMakeModule, pdfFontsModule] = await Promise.all([
        import('pdfmake/build/pdfmake'),
        import('pdfmake/build/vfs_fonts')
      ]);
      const pdfMake = pdfMakeModule.default;
      (pdfMake as any).addVirtualFileSystem((pdfFontsModule as any).default);
      const pdf = pdfMake.createPdf(documentDefinition);
      if (Capacitor.isNativePlatform()) {
        const base64 = await pdf.getBase64();
        await Filesystem.writeFile({
          path: fileName,
          data: base64,
          directory: Directory.Documents
        });
        const fileUri = await Filesystem.getUri({
          path: fileName,
          directory: Directory.Documents
        });
        await Share.share({
          title: 'Invictus Trip Report',
          text: 'Trip and petrol expense report',
          url: fileUri.uri,
          dialogTitle: 'Share / Save PDF Report'
        });
        return;
      }

      await pdf.download(fileName);
    } catch (error: any) {
      alert('PDF export failed: ' + (error?.message || 'Please try again.'));
    }
  };

  const createBackup = async () => {
    const backup = {
      appId: 'invictus-tracker',
      formatVersion: 1,
      createdAt: new Date().toISOString(),
      data: {
        trips,
        officeLocation,
        savedDestinations,
        managers: assignedPeople,
        savedVisitors,
        petrolRate
      }
    };
    const backupText = JSON.stringify(backup, null, 2);
    const fileName = `Invictus_Tracker_Backup_${new Date().toISOString().slice(0, 10)}.json`;

    try {
      if (Capacitor.isNativePlatform()) {
        await Filesystem.writeFile({
          path: fileName,
          data: backupText,
          directory: Directory.Documents,
          encoding: Encoding.UTF8
        });
        const fileUri = await Filesystem.getUri({
          path: fileName,
          directory: Directory.Documents
        });
        await Share.share({
          title: 'Invictus Tracker Backup',
          text: 'Backup of trips and app settings',
          url: fileUri.uri,
          dialogTitle: 'Save or share backup'
        });
        return;
      }

      const blob = new Blob([backupText], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error: any) {
      alert('Backup failed: ' + (error?.message || 'Please try again.'));
    }
  };

  const restoreBackup = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;

    try {
      if (file.size > 25 * 1024 * 1024) {
        alert('This backup file is too large to restore.');
        return;
      }

      const backup = JSON.parse(await file.text());
      const data = backup?.data;
      if (
        backup?.appId !== 'invictus-tracker' ||
        backup?.formatVersion !== 1 ||
        !data ||
        !Array.isArray(data.trips) ||
        !Array.isArray(data.savedDestinations) ||
        !Array.isArray(data.managers) ||
        !Array.isArray(data.savedVisitors) ||
        !data.savedDestinations.every((item: unknown) => typeof item === 'string') ||
        !data.managers.every((item: unknown) => typeof item === 'string') ||
        !data.savedVisitors.every((item: unknown) => typeof item === 'string')
      ) {
        alert('This is not a valid Invictus Tracker backup file.');
        return;
      }

      const validRate = Number(data.petrolRate);
      const validOffice = data.officeLocation === null ||
        (typeof data.officeLocation?.lat === 'number' && Number.isFinite(data.officeLocation.lat) &&
          typeof data.officeLocation?.lon === 'number' && Number.isFinite(data.officeLocation.lon));
      const validTrips = data.trips.every((trip: any) =>
        trip && typeof trip === 'object' &&
        (typeof trip.id === 'number' || typeof trip.id === 'string') &&
        typeof trip.date === 'string' &&
        ['visitor', 'assignedBy', 'recordedBy', 'fromLoc', 'toLoc', 'purpose'].every((field: string) =>
          trip[field] === undefined || trip[field] === null || typeof trip[field] === 'string'
        ) &&
        ['totalKm', 'ratePerKm', 'petrolCharges', 'parkingFees', 'totalAmount', 'startTime', 'endTime'].every((field: string) =>
          trip[field] === undefined || trip[field] === null ||
          (typeof trip[field] === 'number' && Number.isFinite(trip[field]))
        )
      );
      if (!Number.isFinite(validRate) || validRate < 0 || !validOffice || !validTrips) {
        alert('The backup contains invalid trip or setting data.');
        return;
      }

      if (!window.confirm('Restore this backup? It will replace the trips and settings currently on this phone.')) {
        return;
      }

      const restoredValues: Record<string, string> = {
        invictusTrips: JSON.stringify(data.trips),
        invictusOffice: JSON.stringify(data.officeLocation),
        invictusDests: JSON.stringify(data.savedDestinations),
        invictusManagers: JSON.stringify(data.managers),
        invictusVisitors: JSON.stringify(data.savedVisitors),
        invictusRate: String(validRate)
      };
      const keys = Object.keys(restoredValues);
      const previousValues = new Map(keys.map(key => [key, localStorage.getItem(key)]));

      try {
        keys.forEach(key => localStorage.setItem(key, restoredValues[key]));
      } catch (storageError) {
        keys.forEach(key => {
          const previous = previousValues.get(key);
          try {
            if (previous === null || previous === undefined) localStorage.removeItem(key);
            else localStorage.setItem(key, previous);
          } catch {
            // Keep trying to restore the remaining saved values.
          }
        });
        throw storageError;
      }

      setTrips(data.trips);
      setOfficeLocation(data.officeLocation);
      setSavedDestinations(data.savedDestinations);
      setAssignedPeople(data.managers);
      setSavedVisitors(data.savedVisitors);
      setPetrolRate(validRate);
      setRateInput(String(validRate));
      setSelectedMonth('');
      clearHistoryFilters();
      cancelEditTrip();
      alert('Backup restored successfully.');
    } catch (error: any) {
      alert('Restore failed: ' + (error?.message || 'Choose a valid backup file.'));
    } finally {
      input.value = '';
    }
  };

  const groupTripsByDate = () => {
    return trips.reduce((acc, trip) => {
      if (!acc[trip.date]) acc[trip.date] = [];
      acc[trip.date].push(trip);
      return acc;
    }, {} as Record<string, any[]>);
  };

  const grandTotalTrips = trips.length;
  const grandTotalKm = trips.reduce(
    (sum, t) => sum + (Number(t.totalKm) || 0),
    0
  );
  const grandTotalAmount = trips.reduce(
    (sum, t) => sum + (Number(t.totalAmount) || 0),
    0
  );
  const historyTrips = getHistoryTrips();

  const inputClass =
    'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-base text-slate-800 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-teal-600 focus:ring-4 focus:ring-teal-600/10';

  return (
    <div className="app-shell flex w-full flex-col overflow-hidden bg-[#f4f7f8] font-sans text-slate-900">
      <header className="app-header z-10 shrink-0 brand-gradient-bg text-white shadow-sm">
        <div className="mx-auto flex w-full max-w-xl items-center gap-3 px-5 py-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/10">
            <Navigation className="h-5 w-5 text-teal-300" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-teal-300">
              INVICTUS · FIELD TRACKER
            </p>
            <h1 className="truncate text-base font-semibold tracking-tight sm:text-lg">
              Petrol Expenses
            </h1>
          </div>
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto px-4 pb-5 pt-5 sm:px-5">
        {activeTab === 'tracker' && (
          <div className="mx-auto flex min-h-full w-full max-w-md flex-col justify-center gap-4 pb-5">
            {tripState === 'idle' && (
              <>
                <section
                  aria-labelledby="dashboard-title"
                  className="rounded-[24px] brand-gradient-bg p-4 text-white shadow-lg shadow-slate-900/10 sm:p-5"
                >
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.17em] text-teal-200">
                        At a glance
                      </p>
                      <h2 id="dashboard-title" className="mt-0.5 text-lg font-bold tracking-tight">
                        Dashboard
                      </h2>
                    </div>
                    <span className="rounded-full bg-white/[0.08] px-3 py-1.5 text-xs font-semibold text-slate-200 ring-1 ring-white/10">
                      {trips.length} {trips.length === 1 ? 'trip' : 'trips'} total
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5">
                    <div className="rounded-2xl bg-white/[0.08] px-3 py-3 ring-1 ring-white/10">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-300">
                        Today · KM
                      </p>
                      <p className="mt-1 text-xl font-bold tabular-nums">
                        {todayKm.toFixed(1)} <span className="text-xs font-medium text-slate-300">km</span>
                      </p>
                    </div>
                    <div className="rounded-2xl bg-white/[0.08] px-3 py-3 ring-1 ring-white/10">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-300">
                        Today · Petrol
                      </p>
                      <p className="mt-1 text-xl font-bold tabular-nums">{formatRupees(todayPetrol)}</p>
                    </div>
                    <div className="rounded-2xl bg-white/[0.08] px-3 py-3 ring-1 ring-white/10">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-300">
                        This month · KM
                      </p>
                      <p className="mt-1 text-xl font-bold tabular-nums">
                        {monthKm.toFixed(1)} <span className="text-xs font-medium text-slate-300">km</span>
                      </p>
                    </div>
                    <div className="rounded-2xl bg-white/[0.08] px-3 py-3 ring-1 ring-white/10">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-300">
                        This month · Petrol
                      </p>
                      <p className="mt-1 text-xl font-bold tabular-nums">{formatRupees(monthPetrol)}</p>
                    </div>
                  </div>
                </section>

                <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm sm:p-7">
                  <div className="mb-7 flex items-center justify-between gap-3">
                    <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                      Trip tracking
                    </span>
                    <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700">
                      <span className="h-2 w-2 rounded-full bg-emerald-500" />
                      Ready
                    </span>
                  </div>

                  <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-teal-50 text-teal-700 ring-1 ring-teal-100">
                    <Bike className="h-8 w-8" />
                  </div>

                  <div className="mb-7">
                    <h2 className="text-2xl font-bold tracking-tight text-[#102a35] sm:text-[28px]">
                      Ready for your next trip?
                    </h2>
                    <p className="mt-2 max-w-sm text-sm leading-6 text-slate-500">
                      Start when you set off. Your trip time and route will be captured automatically.
                    </p>
                    <p className="mt-2 text-xs font-medium text-slate-500">
                      {recordedByName
                        ? `New trips will be recorded as ${recordedByName}.`
                        : 'Set this phone’s name in Settings before starting a trip.'}
                    </p>
                  </div>

                  <button
                    onClick={handleStartTrip}
                    className="brand-gradient-button flex min-h-14 w-full items-center justify-center gap-2.5 rounded-2xl px-5 py-4 text-base font-bold text-white shadow-lg shadow-teal-900/15 transition focus:outline-none focus:ring-4 focus:ring-teal-700/20 active:scale-[0.99]"
                  >
                    <MapPin className="h-5 w-5" />
                    Start trip
                  </button>
                </div>
              </>
            )}

            {tripState === 'tracking' && (
              <div className="space-y-4">
                <div className="relative overflow-hidden rounded-[28px] brand-gradient-bg p-6 text-white shadow-lg shadow-slate-900/10 sm:p-7">
                  <div className="absolute right-0 top-0 h-40 w-40 translate-x-12 -translate-y-16 rounded-full bg-teal-400/10 blur-2xl" />
                  <div className="relative flex items-center justify-between gap-3">
                    <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-300">
                      Trip in progress
                    </span>
                    <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold text-teal-200 ring-1 ring-white/10">
                      <span className="h-2 w-2 animate-pulse rounded-full bg-teal-300" />
                      Live
                    </span>
                  </div>

                  <div className="relative py-9 text-center">
                    <p className="mb-2 text-xs font-medium uppercase tracking-[0.18em] text-slate-400">
                      Elapsed time
                    </p>
                    <div className="whitespace-nowrap text-5xl font-medium tabular-nums tracking-tight text-white sm:text-6xl">
                      {formatTime(timer)}
                    </div>
                  </div>

                  <div className="relative flex items-center justify-center gap-2 rounded-xl bg-white/[0.08] px-4 py-3 text-sm font-medium text-slate-200 ring-1 ring-white/10">
                    <Navigation className="h-4 w-4 text-teal-300" />
                    GPS tracking active
                  </div>
                </div>

                <button
                  onClick={handleEndTrip}
                  className="flex min-h-14 w-full items-center justify-center gap-2.5 rounded-2xl bg-rose-600 px-5 py-4 text-base font-bold text-white shadow-lg shadow-rose-900/15 transition hover:bg-rose-700 focus:outline-none focus:ring-4 focus:ring-rose-600/20 active:scale-[0.99]"
                >
                  <AlertCircle className="h-5 w-5" />
                  End trip
                </button>
              </div>
            )}

            {tripState === 'saving' && (
              <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                <div className="mb-6 border-b border-slate-100 pb-4">
                  <p className="mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-teal-700">
                    Trip details
                  </p>
                  <h2 className="text-xl font-bold tracking-tight text-[#102a35]">
                    Review & save trip
                  </h2>
                </div>

                <div className="space-y-5">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label className="mb-1.5 block text-xs font-semibold text-slate-600">
                        From Location
                      </label>
                      <input
                        type="text"
                        value={currentTrip.fromLoc}
                        onChange={e =>
                          setCurrentTrip({
                            ...currentTrip,
                            fromLoc: e.target.value
                          })
                        }
                        className={inputClass}
                      />
                    </div>

                    <div>
                      <label className="mb-1.5 block text-xs font-semibold text-slate-600">
                        To (Destination)
                      </label>
                      <input
                        type="text"
                        list="destinations"
                        placeholder="Search or type..."
                        value={currentTrip.toLoc}
                        onChange={e =>
                          setCurrentTrip({
                            ...currentTrip,
                            toLoc: e.target.value
                          })
                        }
                        className={inputClass}
                      />
                      <datalist id="destinations">
                        {savedDestinations.map(d => (
                          <option key={d} value={d} />
                        ))}
                      </datalist>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label className="mb-1.5 block text-xs font-semibold text-teal-800">
                        Road Distance (KM)
                      </label>
                      <input
                        type="number"
                        step="0.1"
                        value={currentTrip.actualKm}
                        onChange={e =>
                          setCurrentTrip({
                            ...currentTrip,
                            actualKm: parseFloat(e.target.value) || 0
                          })
                        }
                        className="w-full rounded-xl border border-teal-200 bg-teal-50 px-3.5 py-3 text-base font-bold text-teal-800 shadow-sm outline-none transition focus:border-teal-600 focus:ring-4 focus:ring-teal-600/10"
                      />
                      <p className="text-[10px] text-slate-400 mt-1">
                        Calculated via OSRM
                      </p>
                    </div>

                    <div>
                      <label className="mb-1.5 block text-xs font-semibold text-slate-600">
                        Assigned Person
                      </label>
                      <input
                        type="text"
                        list="assignedPeopleList"
                        placeholder="Select or type..."
                        value={currentTrip.assignedBy}
                        onChange={e =>
                          setCurrentTrip({
                            ...currentTrip,
                            assignedBy: e.target.value
                          })
                        }
                        className={inputClass}
                      />
                      <datalist id="assignedPeopleList">
                        {assignedPeople.map(person => (
                          <option key={person} value={person} />
                        ))}
                      </datalist>
                    </div>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-slate-600">
                      Visitor / Client Name
                    </label>
                    <input
                      type="text"
                      list="visitorsList"
                      placeholder="e.g. Printer Shop, HDFC Bank"
                      value={currentTrip.visitor}
                      onChange={e =>
                        setCurrentTrip({
                          ...currentTrip,
                          visitor: e.target.value
                        })
                      }
                      className={inputClass}
                    />
                    <datalist id="visitorsList">
                      {getAvailableVisitors().map(visitor => (
                        <option key={visitor} value={visitor} />
                      ))}
                    </datalist>
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label className="mb-1.5 block text-xs font-semibold text-slate-600">
                        Purpose / Remarks
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Chq Submitted"
                        value={currentTrip.purpose}
                        onChange={e =>
                          setCurrentTrip({
                            ...currentTrip,
                            purpose: e.target.value
                          })
                        }
                        className={inputClass}
                      />
                    </div>

                    <div>
                      <label className="mb-1.5 block text-xs font-semibold text-slate-600">
                        Parking Fees (₹)
                      </label>
                      <input
                        type="number"
                        placeholder="0"
                        value={currentTrip.parkingFees}
                        onChange={e =>
                          setCurrentTrip({
                            ...currentTrip,
                            parkingFees: parseFloat(e.target.value) || 0
                          })
                        }
                        className={inputClass}
                      />
                    </div>
                  </div>

                  <div className="flex gap-3 border-t border-slate-100 pt-5">
                    <button
                      onClick={() => setTripState('idle')}
                      className="min-h-12 flex-1 rounded-xl bg-slate-100 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-200"
                    >
                      Cancel
                    </button>

                    <button
                      onClick={finalizeTrip}
                      className="brand-gradient-button flex min-h-12 flex-[2] items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold text-white shadow-md transition focus:outline-none focus:ring-4 focus:ring-teal-700/20"
                    >
                      <Save className="w-4 h-4" />
                      Save Record
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'reports' && (
          <>
          <div className="mx-auto max-w-md space-y-4 pb-5">
            <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="min-w-0">
                <h2 className="text-xl font-bold tracking-tight text-[#102a35]">Trip reports</h2>
                <p className="mt-1 truncate text-xs font-medium text-slate-500">
                  {selectedMonth ? `Showing ${getMonthLabel(selectedMonth)}` : 'All trip dates'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowReportsMenu(true)}
                aria-label="Open reports menu"
                aria-expanded={showReportsMenu}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-800 transition hover:bg-teal-100 focus:outline-none focus:ring-4 focus:ring-teal-700/20"
              >
                <Menu className="h-5 w-5" />
              </button>
            </div>

            <div className="rounded-2xl brand-gradient-bg p-5 text-white shadow-lg shadow-slate-900/10">
              <h3 className="mb-4 text-xs font-semibold uppercase tracking-[0.16em] text-teal-200">
                {selectedMonth ? getMonthLabel(selectedMonth) : 'Overall Summary'}
              </h3>

              <div className="grid grid-cols-2 gap-2 text-center sm:gap-3">
                <div className="rounded-xl bg-white/[0.08] px-2 py-3 ring-1 ring-white/10">
                  <div className="text-2xl font-bold tabular-nums">
                    {reportTrips.length}
                  </div>
                  <div className="mt-1 text-[9px] font-semibold tracking-wide text-slate-300 sm:text-[10px]">
                    TOTAL TRIPS
                  </div>
                </div>

                <div className="rounded-xl bg-white/[0.08] px-2 py-3 ring-1 ring-white/10">
                  <div className="text-2xl font-bold tabular-nums">
                    {reportKm.toFixed(1)}
                  </div>
                  <div className="mt-1 text-[9px] font-semibold tracking-wide text-slate-300 sm:text-[10px]">
                    TOTAL KM
                  </div>
                </div>

                <div className="rounded-xl bg-white/[0.08] px-2 py-3 ring-1 ring-white/10">
                  <div className="mt-0.5 text-xl font-bold tabular-nums">
                    {formatRupees(reportPetrol)}
                  </div>
                  <div className="mt-1 text-[9px] font-semibold tracking-wide text-slate-300 sm:text-[10px]">
                    PETROL TOTAL
                  </div>
                </div>

                <div className="rounded-xl bg-white/[0.08] px-2 py-3 ring-1 ring-white/10">
                  <div className="mt-0.5 text-xl font-bold tabular-nums">
                    {formatRupees(reportParking)}
                  </div>
                  <div className="mt-1 text-[9px] font-semibold tracking-wide text-slate-300 sm:text-[10px]">
                    PARKING TOTAL
                  </div>
                </div>

                <div className="col-span-2 rounded-xl bg-teal-400/15 px-2 py-3 ring-1 ring-teal-200/20">
                  <div className="mt-0.5 text-xl font-bold tabular-nums">
                    {formatRupees(reportGrandTotal)}
                  </div>
                  <div className="mt-1 text-[9px] font-semibold tracking-wide text-teal-100 sm:text-[10px]">
                    GRAND TOTAL
                  </div>
                </div>
              </div>
            </div>

            {trips.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white/70 px-5 py-10 text-center text-sm text-slate-500">
                No trips recorded yet.
              </div>
            ) : historyTrips.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white/70 px-5 py-10 text-center text-sm text-slate-500">
                No trips match these filters.
              </div>
            ) : (
              (
                Object.entries(
                  historyTrips.reduce((acc, trip) => {
                    if (!acc[trip.date]) acc[trip.date] = [];
                    acc[trip.date].push(trip);
                    return acc;
                  }, {} as Record<string, any[]>)
                ) as [string, any[]][]
              ).map(([date, dayTrips]) => {
                  const dayKm = dayTrips.reduce(
                    (sum, t) => sum + (Number(t.totalKm) || 0),
                    0
                  );
                  const dayAmount = dayTrips.reduce(
                    (sum, t) => sum + getTripTotalAmount(t),
                    0
                  );

                  return (
                    <div
                      key={date}
                      className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
                    >
                      <div className="flex items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/80 px-4 py-3">
                        <h3 className="text-sm font-bold text-slate-700">
                          {date}
                        </h3>

                        <div className="flex items-center gap-1.5 text-right">
                          <span className="rounded-lg bg-teal-50 px-2 py-1 text-[10px] font-semibold text-teal-800 sm:text-xs">
                            {dayKm.toFixed(1)} KM
                          </span>
                          <span className="rounded-lg bg-emerald-50 px-2 py-1 text-[10px] font-bold text-emerald-700 sm:text-xs">
                            ₹{dayAmount.toFixed(2)}
                          </span>
                        </div>
                      </div>

                      <div className="divide-y divide-slate-100">
                        {dayTrips.map(trip => (
                          <div key={trip.id} className="flex flex-col gap-3 p-4">
                            {editingTripId === Number(trip.id) && editingTripForm ? (
                              <div className="space-y-3">
                                <h4 className="text-sm font-bold text-[#102a35]">Edit trip</h4>
                                <div className="grid grid-cols-2 gap-3">
                                  <label className="text-xs font-semibold text-slate-500">
                                    Date
                                    <input
                                      type="date"
                                      value={editingTripForm.date}
                                      onChange={event => setEditingTripForm({ ...editingTripForm, date: event.target.value })}
                                      className="mt-1.5 w-full rounded-xl border border-slate-200 px-2.5 py-2.5 text-sm text-slate-700"
                                    />
                                  </label>
                                  <label className="text-xs font-semibold text-slate-500">
                                    Distance (km)
                                    <input
                                      type="number"
                                      min="0"
                                      step="0.1"
                                      value={editingTripForm.totalKm}
                                      onChange={event => setEditingTripForm({ ...editingTripForm, totalKm: event.target.value })}
                                      className="mt-1.5 w-full rounded-xl border border-slate-200 px-2.5 py-2.5 text-sm text-slate-700"
                                    />
                                  </label>
                                  <label className="text-xs font-semibold text-slate-500">
                                    Visitor / client
                                    <input
                                      value={editingTripForm.visitor}
                                      onChange={event => setEditingTripForm({ ...editingTripForm, visitor: event.target.value })}
                                      className="mt-1.5 w-full rounded-xl border border-slate-200 px-2.5 py-2.5 text-sm text-slate-700"
                                    />
                                  </label>
                                  <label className="text-xs font-semibold text-slate-500">
                                    Assigned Person
                                    <input
                                      value={editingTripForm.assignedBy}
                                      onChange={event => setEditingTripForm({ ...editingTripForm, assignedBy: event.target.value })}
                                      className="mt-1.5 w-full rounded-xl border border-slate-200 px-2.5 py-2.5 text-sm text-slate-700"
                                    />
                                  </label>
                                  <label className="text-xs font-semibold text-slate-500">
                                    From
                                    <input
                                      value={editingTripForm.fromLoc}
                                      onChange={event => setEditingTripForm({ ...editingTripForm, fromLoc: event.target.value })}
                                      className="mt-1.5 w-full rounded-xl border border-slate-200 px-2.5 py-2.5 text-sm text-slate-700"
                                    />
                                  </label>
                                  <label className="text-xs font-semibold text-slate-500">
                                    To
                                    <input
                                      value={editingTripForm.toLoc}
                                      onChange={event => setEditingTripForm({ ...editingTripForm, toLoc: event.target.value })}
                                      className="mt-1.5 w-full rounded-xl border border-slate-200 px-2.5 py-2.5 text-sm text-slate-700"
                                    />
                                  </label>
                                  <label className="text-xs font-semibold text-slate-500">
                                    Parking (₹)
                                    <input
                                      type="number"
                                      min="0"
                                      step="0.01"
                                      value={editingTripForm.parkingFees}
                                      onChange={event => setEditingTripForm({ ...editingTripForm, parkingFees: event.target.value })}
                                      className="mt-1.5 w-full rounded-xl border border-slate-200 px-2.5 py-2.5 text-sm text-slate-700"
                                    />
                                  </label>
                                  <label className="col-span-2 text-xs font-semibold text-slate-500">
                                    Purpose / remarks
                                    <input
                                      value={editingTripForm.purpose}
                                      onChange={event => setEditingTripForm({ ...editingTripForm, purpose: event.target.value })}
                                      className="mt-1.5 w-full rounded-xl border border-slate-200 px-2.5 py-2.5 text-sm text-slate-700"
                                    />
                                  </label>
                                </div>
                                <p className="text-xs text-slate-400">
                                  Petrol uses this trip’s saved rate of {formatRupees(Number(trip.ratePerKm ?? 5))} per km.
                                </p>
                                <div className="flex gap-2">
                                  <button
                                    type="button"
                                    onClick={cancelEditTrip}
                                    className="min-h-11 flex-1 rounded-xl bg-slate-100 px-3 py-2.5 text-sm font-semibold text-slate-700"
                                  >
                                    Cancel
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => saveEditedTrip(Number(trip.id))}
                                    className="brand-gradient-button min-h-11 flex-1 rounded-xl px-3 py-2.5 text-sm font-bold text-white"
                                  >
                                    Save changes
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <>
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <p className="truncate text-sm font-bold text-slate-800">
                                      {trip.visitor}
                                      <span className="ml-1 font-normal text-slate-400">({trip.assignedBy})</span>
                                    </p>
                                  </div>
                                  <span className="shrink-0 text-sm font-semibold text-teal-800">
                                    {Number(trip.totalKm || 0).toFixed(1)} km
                                  </span>
                                </div>

                                <div className="flex min-w-0 items-center text-xs font-medium text-slate-500">
                                  <span className="truncate">{trip.fromLoc}</span>
                                  <RefreshCw className="mx-2 h-3 w-3 shrink-0 text-slate-300" />
                                  <span className="truncate">{trip.toLoc}</span>
                                </div>

                                {getTripRecordedBy(trip) && (
                                  <p className="text-xs font-medium text-slate-500">
                                    Recorded by <span className="font-semibold text-teal-800">{getTripRecordedBy(trip)}</span>
                                  </p>
                                )}

                                <div className="flex items-end justify-between gap-3">
                                  <span className="text-xs italic text-slate-400">{trip.purpose || '-'}</span>
                                  <span className="shrink-0 text-xs font-bold text-slate-700">
                                    {formatRupees(getTripTotalAmount(trip))}
                                  </span>
                                </div>

                                <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
                                  <button
                                    type="button"
                                    onClick={() => beginEditTrip(trip)}
                                    className="min-h-10 rounded-lg bg-teal-50 px-3 py-2 text-xs font-semibold text-teal-800 hover:bg-teal-100"
                                  >
                                    Edit
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => deleteTrip(Number(trip.id))}
                                    className="min-h-10 rounded-lg bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-100"
                                  >
                                    Delete
                                  </button>
                                </div>
                              </>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })
            )}
          </div>
          {showReportsMenu && (
            <div className="fixed inset-0 z-40 flex justify-end bg-slate-950/40" role="presentation">
              <button
                type="button"
                className="absolute inset-0 cursor-default"
                onClick={() => setShowReportsMenu(false)}
                aria-label="Close reports menu"
              />
              <aside
                role="dialog"
                aria-modal="true"
                aria-labelledby="reports-menu-title"
                className="relative z-10 flex h-full w-[min(92vw,430px)] flex-col bg-[#f4f7f8] shadow-2xl"
              >
                <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-white px-5 py-4">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-teal-700">More options</p>
                    <h2 id="reports-menu-title" className="text-lg font-bold text-[#102a35]">Reports menu</h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowReportsMenu(false)}
                    aria-label="Close reports menu"
                    className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-600 transition hover:bg-slate-200 focus:outline-none focus:ring-4 focus:ring-teal-700/20"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
                <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
            <div className="flex flex-col items-stretch justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center">
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-teal-700">
                  History & totals
                </p>
                <h2 className="text-xl font-bold tracking-tight text-[#102a35]">
                  Trip reports
                </h2>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={exportCSV}
                  className="brand-gradient-button flex min-h-11 items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-bold text-white shadow-sm transition focus:outline-none focus:ring-4 focus:ring-teal-700/20"
                >
                  <Download className="h-4 w-4" />
                  CSV
                </button>
                <button
                  onClick={exportPDF}
                  className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-teal-200 bg-teal-50 px-3 py-2.5 text-sm font-bold text-teal-800 transition hover:bg-teal-100 focus:outline-none focus:ring-4 focus:ring-teal-700/20"
                >
                  <FileText className="h-4 w-4" />
                  PDF
                </button>
              </div>
            </div>
            {!showPastTripForm ? (
              <button
                type="button"
                onClick={openPastTripForm}
                className="brand-gradient-button flex min-h-12 w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold text-white shadow-sm transition focus:outline-none focus:ring-4 focus:ring-teal-700/20"
              >
                <Plus className="h-4 w-4" />
                Add a past trip
              </button>
            ) : pastTripForm ? (
              <form
                onSubmit={event => {
                  event.preventDefault();
                  savePastTrip();
                }}
                className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
              >
                <div>
                  <h3 className="text-base font-bold text-[#102a35]">Add a past trip</h3>
                  <p className="mt-1 text-xs leading-5 text-slate-500">
                    Enter the route and distance manually. Petrol uses your saved rate of {formatRupees(petrolRate)} per km.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <label className="text-xs font-semibold text-slate-500">
                    Trip date
                    <input
                      type="date"
                      required
                      max={getTripDateKey(new Date())}
                      value={pastTripForm.date}
                      onChange={event => setPastTripForm({ ...pastTripForm, date: event.target.value })}
                      className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-2.5 py-3 text-sm text-slate-700"
                    />
                  </label>
                  <label className="text-xs font-semibold text-slate-500">
                    Start time
                    <input
                      type="time"
                      required
                      value={pastTripForm.time}
                      onChange={event => setPastTripForm({ ...pastTripForm, time: event.target.value })}
                      className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-2.5 py-3 text-sm text-slate-700"
                    />
                  </label>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <label className="text-xs font-semibold text-slate-500">
                    From
                    <input
                      required
                      list="past-trip-locations"
                      value={pastTripForm.fromLoc}
                      onChange={event => setPastTripForm({ ...pastTripForm, fromLoc: event.target.value })}
                      className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-2.5 py-3 text-sm text-slate-700"
                    />
                  </label>
                  <label className="text-xs font-semibold text-slate-500">
                    To
                    <input
                      required
                      list="past-trip-locations"
                      value={pastTripForm.toLoc}
                      onChange={event => setPastTripForm({ ...pastTripForm, toLoc: event.target.value })}
                      className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-2.5 py-3 text-sm text-slate-700"
                    />
                  </label>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <label className="text-xs font-semibold text-slate-500">
                    Visitor / client
                    <input
                      required
                      list="past-trip-visitors"
                      value={pastTripForm.visitor}
                      onChange={event => setPastTripForm({ ...pastTripForm, visitor: event.target.value })}
                      className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-2.5 py-3 text-sm text-slate-700"
                    />
                  </label>
                  <label className="text-xs font-semibold text-slate-500">
                    Assigned person
                    <input
                      required
                      list="past-trip-assigned-people"
                      value={pastTripForm.assignedBy}
                      onChange={event => setPastTripForm({ ...pastTripForm, assignedBy: event.target.value })}
                      className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-2.5 py-3 text-sm text-slate-700"
                    />
                  </label>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <label className="text-xs font-semibold text-slate-500">
                    Distance (km)
                    <input
                      type="number"
                      required
                      min="0.1"
                      step="0.1"
                      value={pastTripForm.totalKm}
                      onChange={event => setPastTripForm({ ...pastTripForm, totalKm: event.target.value })}
                      className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-2.5 py-3 text-sm text-slate-700"
                    />
                  </label>
                  <label className="text-xs font-semibold text-slate-500">
                    Parking fee
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={pastTripForm.parkingFees}
                      onChange={event => setPastTripForm({ ...pastTripForm, parkingFees: event.target.value })}
                      className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-2.5 py-3 text-sm text-slate-700"
                    />
                  </label>
                </div>

                <label className="block text-xs font-semibold text-slate-500">
                  Purpose
                  <input
                    value={pastTripForm.purpose}
                    onChange={event => setPastTripForm({ ...pastTripForm, purpose: event.target.value })}
                    className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-2.5 py-3 text-sm text-slate-700"
                  />
                </label>

                <datalist id="past-trip-locations">
                  {savedDestinations.map(destination => <option key={destination} value={destination} />)}
                </datalist>
                <datalist id="past-trip-visitors">
                  {getAvailableVisitors().map(visitor => <option key={visitor} value={visitor} />)}
                </datalist>
                <datalist id="past-trip-assigned-people">
                  {assignedPeople.map(person => <option key={person} value={person} />)}
                </datalist>

                <div className="flex gap-3 border-t border-slate-100 pt-4">
                  <button
                    type="button"
                    onClick={cancelPastTrip}
                    className="min-h-11 flex-1 rounded-xl bg-slate-100 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-200"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="brand-gradient-button flex-[2] rounded-xl px-4 py-3 text-sm font-bold text-white shadow-sm focus:outline-none focus:ring-4 focus:ring-teal-700/20"
                  >
                    Save past trip
                  </button>
                </div>
              </form>
            ) : null}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <label className="mb-2 block text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
                Select Month
              </label>
              <select
                value={selectedMonth}
                onChange={e => setSelectedMonth(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-base font-semibold text-slate-700 shadow-sm outline-none focus:border-teal-600 focus:ring-4 focus:ring-teal-600/10"
              >
                <option value="">All Months</option>
                {getAvailableMonths().map(month => (
                  <option key={month} value={month}>{getMonthLabel(month)}</option>
                ))}
              </select>
              <p className="mt-2 text-xs leading-5 text-slate-400">
                Reports and CSV / PDF exports use the selected month.
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold text-[#102a35]">Find trips</h3>
                  <p className="mt-0.5 text-xs text-slate-400">Oldest first</p>
                </div>
                <button
                  type="button"
                  onClick={clearHistoryFilters}
                  className="rounded-lg px-2 py-1 text-xs font-semibold text-teal-800 hover:bg-teal-50"
                >
                  Clear filters
                </button>
              </div>

              <input
                type="search"
                value={reportSearch}
                onChange={event => setReportSearch(event.target.value)}
                placeholder="Search visitor, assigned person, place, purpose"
                aria-label="Search trips"
                className="mb-3 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-base text-slate-700 shadow-sm outline-none placeholder:text-slate-400 focus:border-teal-600 focus:ring-4 focus:ring-teal-600/10"
              />

              <div className="grid grid-cols-2 gap-3">
                <label className="text-xs font-semibold text-slate-500">
                  From date
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={event => setDateFrom(event.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-2.5 py-2.5 text-sm text-slate-700"
                  />
                </label>
                <label className="text-xs font-semibold text-slate-500">
                  To date
                  <input
                    type="date"
                    value={dateTo}
                    onChange={event => setDateTo(event.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-2.5 py-2.5 text-sm text-slate-700"
                  />
                </label>
              </div>

              <label className="mt-3 block text-xs font-semibold text-slate-500">
                Visitor / client
                <select
                  value={filterVisitor}
                  onChange={event => setFilterVisitor(event.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-medium text-slate-700"
                >
                  <option value="">All visitors / clients</option>
                  {getAvailableVisitors().map(visitor => (
                    <option key={visitor} value={visitor}>{visitor}</option>
                  ))}
                </select>
              </label>
            </div>
                </div>
              </aside>
            </div>
          )}
          </>
        )}

        {activeTab === 'settings' && (
          <>
            <div className="mx-auto max-w-md space-y-4 pb-5">
              <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-teal-700">Preferences</p>
                  <h2 className="text-xl font-bold tracking-tight text-[#102a35]">Settings</h2>
                </div>
                <button
                  type="button"
                  onClick={() => setShowSettingsMenu(true)}
                  aria-label="Open settings menu"
                  aria-expanded={showSettingsMenu}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-800 transition hover:bg-teal-100 focus:outline-none focus:ring-4 focus:ring-teal-700/20"
                >
                  <Menu className="h-5 w-5" />
                </button>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-teal-50 text-teal-800">
                  <Settings className="h-7 w-7" />
                </div>
                <h3 className="text-base font-bold text-[#102a35]">Your settings are in one place</h3>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  Manage this phone’s name, office location, petrol rate, clients, backups, and app details from the menu.
                </p>
                <button
                  type="button"
                  onClick={() => setShowSettingsMenu(true)}
                  className="brand-gradient-button mt-5 min-h-11 w-full rounded-xl px-4 py-3 text-sm font-bold text-white shadow-sm focus:outline-none focus:ring-4 focus:ring-teal-700/20"
                >
                  Open settings menu
                </button>
              </div>
            </div>

            {showSettingsMenu && (
              <div className="fixed inset-0 z-40 flex justify-end bg-slate-950/40" role="presentation">
                <button
                  type="button"
                  className="absolute inset-0 cursor-default"
                  onClick={() => setShowSettingsMenu(false)}
                  aria-label="Close settings menu"
                />
                <aside
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="settings-menu-title"
                  className="relative z-10 flex h-full w-[min(92vw,430px)] flex-col bg-[#f4f7f8] shadow-2xl"
                >
                  <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-white px-5 py-4">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-teal-700">Preferences</p>
                      <h2 id="settings-menu-title" className="text-lg font-bold text-[#102a35]">Settings menu</h2>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowSettingsMenu(false)}
                      aria-label="Close settings menu"
                      className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-600 transition hover:bg-slate-200 focus:outline-none focus:ring-4 focus:ring-teal-700/20"
                    >
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                  <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="mb-2 flex items-center gap-2 font-bold text-[#102a35]">
                <UserRound className="h-4 w-4 text-teal-700" />
                Name on this phone
              </h3>
              <p className="mb-4 text-sm leading-6 text-slate-500">
                New trips saved on this phone will show who recorded them. This name is stored only on this phone.
              </p>
              <label className="mb-3 block text-xs font-semibold text-slate-600">
                Recorded by
                <input
                  type="text"
                  value={recordedByInput}
                  onChange={event => setRecordedByInput(event.target.value)}
                  placeholder="Enter the phone user's name"
                  className={inputClass + ' mt-1.5'}
                  maxLength={80}
                />
              </label>
              <button
                type="button"
                onClick={saveRecordedByName}
                className="brand-gradient-button flex min-h-11 w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold text-white transition focus:outline-none focus:ring-4 focus:ring-teal-700/20"
              >
                <Save className="h-4 w-4" />
                {recordedByName ? 'Update phone name' : 'Save phone name'}
              </button>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="mb-2 flex items-center gap-2 font-bold text-[#102a35]">
                <MapPin className="h-4 w-4 text-teal-700" />
                Office Location Setting
              </h3>

              <p className="mb-4 text-sm leading-6 text-slate-500">
                Set your current physical location as 'Office'. The app uses
                this to auto-fill your first trip of the day.
              </p>

              {officeLocation && (
                <div className="mb-4 rounded-xl border border-emerald-100 bg-emerald-50 p-3 text-xs font-mono text-emerald-800">
                  Saved: {officeLocation.lat.toFixed(5)},{' '}
                  {officeLocation.lon.toFixed(5)}
                </div>
              )}

              <button
                onClick={saveOfficeGPS}
                className="flex min-h-12 w-full items-center justify-center rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm font-semibold text-teal-800 transition hover:bg-teal-100 focus:outline-none focus:ring-4 focus:ring-teal-700/10"
              >
                Capture Current GPS as Office
              </button>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="mb-2 font-bold text-[#102a35]">Petrol rate</h3>
              <p className="mb-4 text-sm leading-6 text-slate-500">
                New trips use this reimbursement rate. Saved trips keep their original rate.
              </p>
              <label className="mb-3 block text-xs font-semibold text-slate-600">
                Rate per kilometre (₹)
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  value={rateInput}
                  onChange={event => setRateInput(event.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-base text-slate-800 shadow-sm outline-none focus:border-teal-600 focus:ring-4 focus:ring-teal-600/10"
                />
              </label>
              <button
                type="button"
                onClick={savePetrolRate}
                className="brand-gradient-button flex min-h-11 w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold text-white transition focus:outline-none focus:ring-4 focus:ring-teal-700/20"
              >
                <Save className="h-4 w-4" />
                Save petrol rate
              </button>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="mb-1 flex items-center gap-2 font-bold text-[#102a35]">
                <UserRound className="h-4 w-4 text-teal-700" />
                Visitors / clients
              </h3>
              <p className="mb-4 text-sm text-slate-500">Saved names appear as suggestions when entering a trip.</p>
              <div className="mb-4 flex gap-2">
                <input
                  type="text"
                  value={visitorInput}
                  onChange={event => setVisitorInput(event.target.value)}
                  onKeyDown={event => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      saveVisitor(visitorInput);
                      setVisitorInput('');
                    }
                  }}
                  placeholder="Add a visitor or client"
                  className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-3 text-sm text-slate-800 outline-none focus:border-teal-600 focus:ring-4 focus:ring-teal-600/10"
                />
                <button
                  type="button"
                  onClick={() => { saveVisitor(visitorInput); setVisitorInput(''); }}
                  aria-label="Add visitor or client"
                  className="brand-gradient-button flex min-h-11 min-w-11 items-center justify-center rounded-xl text-white"
                >
                  <Plus className="h-5 w-5" />
                </button>
              </div>
              {savedVisitors.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {savedVisitors.map(visitor => (
                    <span key={visitor} className="inline-flex max-w-full items-center gap-1 rounded-full bg-teal-50 py-1 pl-3 pr-1 text-xs font-medium text-teal-900">
                      <span className="max-w-[210px] truncate">{visitor}</span>
                      <button
                        type="button"
                        onClick={() => removeSavedVisitor(visitor)}
                        aria-label={`Remove ${visitor}`}
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-teal-700 hover:bg-teal-100"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-400">No saved clients yet. Names are also remembered when trips are saved.</p>
              )}
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="mb-2 flex items-center gap-2 font-bold text-[#102a35]">
                <Database className="h-4 w-4 text-teal-700" />
                Backup & restore
              </h3>
              <p className="mb-4 text-sm leading-6 text-slate-500">
                Save your trips and settings to a backup file. Restore it after reinstalling or on another phone.
              </p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={createBackup}
                  className="brand-gradient-button flex min-h-11 items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-bold text-white"
                >
                  <Database className="h-4 w-4" />
                  Backup data
                </button>
                <button
                  type="button"
                  onClick={() => backupInputRef.current?.click()}
                  className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-teal-200 bg-teal-50 px-3 py-2.5 text-sm font-bold text-teal-800 hover:bg-teal-100"
                >
                  <Upload className="h-4 w-4" />
                  Restore data
                </button>
              </div>
              <input
                ref={backupInputRef}
                type="file"
                accept=".json,application/json"
                onChange={restoreBackup}
                className="hidden"
              />
              <p className="mt-3 text-xs leading-5 text-slate-400">Restoring replaces the trips and settings currently saved on this phone.</p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="mb-4 text-sm font-bold text-[#102a35]">
                App Info
              </h3>

              <ul className="space-y-3 text-sm text-slate-500">
                <li>• App: Invictus Tracker · v1.0.0</li>
                <li>• Routing Provider: OSRM Public API</li>
                <li>• Rate / KM: {formatRupees(petrolRate)} (editable)</li>
                <li>• Data Storage: Local Device Storage</li>
                <li>• Exports: CSV and PDF · Android Share</li>
                <li>• Backup: JSON file</li>
              </ul>
            </div>
                  </div>
                </aside>
              </div>
            )}
          </>
        )}
      </main>

      <nav className="pb-safe z-20 shrink-0 border-t border-slate-200 bg-white/95 px-4 pt-2 shadow-[0_-8px_24px_rgba(15,23,42,0.06)]">
        <div className="mx-auto grid w-full max-w-md grid-cols-3 gap-2">
        <button
          onClick={() => setActiveTab('tracker')}
          className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-2xl px-3 transition ${
            activeTab === 'tracker'
              ? 'bg-teal-50 text-teal-800'
              : 'text-slate-400 hover:bg-slate-50 hover:text-slate-600'
          }`}
        >
          <Navigation className="h-5 w-5" />
          <span className="text-[11px] font-semibold">Track</span>
        </button>

        <button
          onClick={() => setActiveTab('reports')}
          className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-2xl px-3 transition ${
            activeTab === 'reports'
              ? 'bg-teal-50 text-teal-800'
              : 'text-slate-400 hover:bg-slate-50 hover:text-slate-600'
          }`}
        >
          <History className="h-5 w-5" />
          <span className="text-[11px] font-semibold">Reports</span>
        </button>

        <button
          onClick={() => setActiveTab('settings')}
          className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-2xl px-3 transition ${
            activeTab === 'settings'
              ? 'bg-teal-50 text-teal-800'
              : 'text-slate-400 hover:bg-slate-50 hover:text-slate-600'
          }`}
        >
          <Settings className="h-5 w-5" />
          <span className="text-[11px] font-semibold">Settings</span>
        </button>
        </div>
      </nav>
    </div>
  );
}



