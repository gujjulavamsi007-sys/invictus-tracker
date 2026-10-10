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
  Plus,
  Save,
  AlertCircle,
  RefreshCw,
  FileText,
  ChevronRight,
  Fuel,
  Trash2,
  Upload,
  Database,
  UserRound,
  UsersRound,
  Heart
} from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import {
  buildEditedTripList,
  buildMonthlyInsights,
  buildPdfTableDefinition,
  buildTripRecord,
  compareTripsByReportOrder,
  createEmptyTrip,
  filterHistoryTrips,
  getTripDate,
  getTripDateKey,
  getTripMonthKey,
  persistTripDraft,
  readTripDraft,
  restoreBackupToStorage,
  validateBackup
} from './reportLogic.mjs';

export default function App() {
  const [activeTab, setActiveTab] = useState('tracker');
  const [showReportsMenu, setShowReportsMenu] = useState(false);
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);
  const [recoveredTripDraft] = useState(() => readTripDraft(localStorage));
  const [showWelcomeSetup, setShowWelcomeSetup] = useState(() => {
    try {
      if (localStorage.getItem('tripExpenseOnboardingComplete') === 'true') return false;
      const savedTrips = JSON.parse(localStorage.getItem('invictusTrips') || '[]');
      const hasExistingSetup = Boolean(
        localStorage.getItem('invictusRecordedBy') ||
        localStorage.getItem('invictusOffice') ||
        localStorage.getItem('invictusRate') ||
        (Array.isArray(savedTrips) && savedTrips.length > 0)
      );
      return !hasExistingSetup && !recoveredTripDraft;
    } catch {
      return false;
    }
  });
  const [showRecoveredTripNotice, setShowRecoveredTripNotice] = useState(Boolean(recoveredTripDraft));
  const [tripState, setTripState] = useState(recoveredTripDraft?.phase || 'idle');
  const [timer, setTimer] = useState(0);
  const timerRef = useRef<any>(null);

  const [officeLocation, setOfficeLocation] = useState<any>(null);
  const [officeSetupMessage, setOfficeSetupMessage] = useState('');
  const [isSavingOfficeLocation, setIsSavingOfficeLocation] = useState(false);
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

  const [currentTrip, setCurrentTrip] = useState(recoveredTripDraft?.trip || createEmptyTrip());
  const [pendingBackupRestore, setPendingBackupRestore] = useState<any>(null);

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
      const updateElapsed = () => {
        const startedAt = Number(currentTrip.startTime) || Date.now();
        setTimer(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
      };
      updateElapsed();
      timerRef.current = setInterval(updateElapsed, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      if (tripState === 'idle') setTimer(0);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [tripState, currentTrip.startTime]);

  useEffect(() => {
    try {
      persistTripDraft(localStorage, tripState, currentTrip);
    } catch (error) {
      console.error('Could not save the in-progress trip draft', error);
    }
  }, [tripState, currentTrip]);

  const clearTripDraft = () => {
    try {
      persistTripDraft(localStorage, 'idle', createEmptyTrip());
    } catch (error) {
      console.error('Could not clear the in-progress trip draft', error);
    }
  };

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

  const saveOfficeGPS = async (showAlert = true) => {
    setIsSavingOfficeLocation(true);
    try {
      const coords = await getGPSLocation();
      setOfficeLocation(coords);
      localStorage.setItem('invictusOffice', JSON.stringify(coords));
      setOfficeSetupMessage('Office location saved. You can change it later in Settings.');
      if (showAlert) alert('Office GPS location saved successfully!');
      return true;
    } catch (err) {
      setOfficeSetupMessage('Could not get your location. Check location permission, or set this later in Settings.');
      if (showAlert) alert('Failed to get location for Office.');
      return false;
    } finally {
      setIsSavingOfficeLocation(false);
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

  const completeWelcomeSetup = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedName = recordedByInput.trim();
    const nextRate = Number(rateInput);
    if (!normalizedName) {
      alert('Enter the name of the person using this phone.');
      return;
    }
    if (!rateInput.trim() || !Number.isFinite(nextRate) || nextRate < 0) {
      alert('Enter a valid petrol rate of ₹0 or more per kilometre.');
      return;
    }

    setRecordedByName(normalizedName);
    setRecordedByInput(normalizedName);
    setPetrolRate(nextRate);
    setRateInput(String(nextRate));
    localStorage.setItem('invictusRecordedBy', normalizedName);
    localStorage.setItem('invictusRate', String(nextRate));
    localStorage.setItem('tripExpenseOnboardingComplete', 'true');
    setShowWelcomeSetup(false);
  };

  const skipWelcomeSetup = () => {
    localStorage.setItem('tripExpenseOnboardingComplete', 'true');
    setShowWelcomeSetup(false);
  };

  const finalizeTrip = () => {
    if (!currentTrip.toLoc || !currentTrip.visitor || !currentTrip.assignedBy) {
      alert('Please enter Destination, Visitor Name, and Assigned Person');
      return;
    }

    saveDestination(currentTrip.toLoc);
    saveAssignedPerson(currentTrip.assignedBy);

    const tripRecord = buildTripRecord(currentTrip, recordedByName, petrolRate);

    saveVisitor(currentTrip.visitor);
    const newTrips = [...trips, tripRecord];
    setTrips(newTrips);
    localStorage.setItem('invictusTrips', JSON.stringify(newTrips));
    clearTripDraft();

    setCurrentTrip(createEmptyTrip());

    setTripState('idle');
    setShowRecoveredTripNotice(false);
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

    const totalKm = Number(editingTripForm.totalKm);
    const parkingFees = Number(editingTripForm.parkingFees);
    if (!Number.isFinite(totalKm) || totalKm < 0 || !Number.isFinite(parkingFees) || parkingFees < 0) {
      alert('Enter valid non-negative values for distance and parking.');
      return;
    }

    const edited = buildEditedTripList(trips, tripId, editingTripForm, petrolRate);
    if (!edited) return;

    saveVisitor(edited.updatedTrip.visitor);
    saveAssignedPerson(edited.updatedTrip.assignedBy);
    saveDestination(edited.updatedTrip.toLoc);
    setTrips(edited.trips);
    localStorage.setItem('invictusTrips', JSON.stringify(edited.trips));
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
  const todayTrips = trips.filter(trip => {
    const tripDate = getTripDate(trip);
    return tripDate ? getTripDateKey(tripDate) === todayKey : false;
  });
  const todayKm = sumTripKm(todayTrips);
  const todayTotal = sumTotalAmount(todayTrips);
  const recentTrips = [...trips].sort(compareTripsByReportOrder).reverse().slice(0, 2);
  const todayLabel = now.toLocaleDateString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long'
  });
  const greetingName = recordedByName.trim().split(/\s+/)[0] || 'there';

  const getAvailableMonths = (): string[] =>
    Array.from(new Set(trips.map((trip: any) => String(getTripMonthKey(trip))).filter(Boolean) as string[])).sort().reverse();

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
  const monthlyInsights: any[] = buildMonthlyInsights(trips);

  const getAvailableVisitors = () =>
    Array.from(new Set([
      ...savedVisitors,
      ...trips.map(trip => String(trip.visitor || '').trim()).filter(Boolean)
    ])).sort((a, b) => a.localeCompare(b));

  const getHistoryTrips = () => filterHistoryTrips(trips, {
    selectedMonth,
    dateFrom,
    dateTo,
    filterVisitor,
    search: reportSearch
  }, recordedByName);

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
      ? `Petrol_Expense_Report_${selectedMonth}_Exported_${exportDate}.csv`
      : `Petrol_Expense_Report_All_Months_${exportDate}.csv`;

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
      ? `Petrol_Expense_Report_${selectedMonth}_Exported_${exportDate}.pdf`
      : `Petrol_Expense_Report_All_Months_${exportDate}.pdf`;
    const formatReportDate = (date: string) => {
      const isoDate = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      return isoDate ? `${isoDate[3]}-${isoDate[2]}-${isoDate[1]}` : date;
    };
    const rows = selectedTrips
      .slice()
      .sort(compareTripsByReportOrder)
      .map((trip, index) => [
        String(index + 1),
        formatReportDate(trip.date || '-'),
        trip.visitor || '-',
        trip.assignedBy || '-',
        `${trip.fromLoc || '-'} TO ${trip.toLoc || '-'}`,
        trip.purpose || '-',
        (Number(trip.totalKm) || 0).toFixed(1),
        formatRupees(getTripPetrolAmount(trip)),
        formatRupees(Number(trip.parkingFees) || 0),
        formatRupees(getTripTotalAmount(trip))
      ]);

    const reportIconPaths: Record<string, string> = {
      road: '<path d="M9 3 6 21M15 3l3 18M12 4v2m0 4v2m0 4v2m0 4v1"/>',
      pin: '<path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>',
      fuel: '<path d="M5 21V4a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v17M5 8h10M8 5h4M5 21h12"/><path d="m15 8 3 2v7a2 2 0 0 0 4 0V9l-2-2"/>',
      parking: '<path d="M7 21V3h6a6 6 0 0 1 0 12H7"/>',
      coins: '<ellipse cx="9" cy="6" rx="6" ry="3"/><path d="M3 6v4c0 1.7 2.7 3 6 3h1M3 10v4c0 1.7 2.7 3 6 3"/><ellipse cx="16" cy="14" rx="5" ry="2.5"/><path d="M11 14v4c0 1.4 2.2 2.5 5 2.5s5-1.1 5-2.5v-4"/>',
      calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/>',
      person: '<circle cx="12" cy="8" r="3.5"/><path d="M5 21v-2a7 7 0 0 1 14 0v2"/>',
      users: '<path d="M16 21v-2a5 5 0 0 0-10 0v2M11 4.2a3.5 3.5 0 1 0 0 7"/><path d="M17 11a3.5 3.5 0 1 0-1-6.8M19 14a5 5 0 0 1 3 4.6V21"/>',
      route: '<circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="6" r="2.5"/><path d="M8.5 18h3a3 3 0 0 0 3-3V9a3 3 0 0 1 3-3"/>',
      document: '<path d="M6 2h8l5 5v15H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Z"/><path d="M14 2v6h6M8 13h8M8 17h8"/>',
      total: '<ellipse cx="9" cy="6" rx="6" ry="3"/><path d="M3 6v4c0 1.7 2.7 3 6 3s6-1.3 6-3V6M3 10v4c0 1.7 2.7 3 6 3h2"/><ellipse cx="17" cy="15" rx="4" ry="2"/><path d="M13 15v4c0 1.1 1.8 2 4 2s4-.9 4-2v-4"/>'
    };
    const makeReportIcon = (name: string, stroke: string, background?: string) =>
      `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">${background ? `<circle cx="12" cy="12" r="11.5" fill="${background}"/>` : ''}<g fill="none" stroke="${stroke}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${reportIconPaths[name]}</g></svg>`;
    const makeSummaryBadge = (name: string, background: string, stroke: string) =>
      `<svg xmlns="http://www.w3.org/2000/svg" width="52" height="52" viewBox="0 0 56 56"><circle cx="28" cy="28" r="26" fill="${background}"/><g transform="translate(16 16)" fill="none" stroke="${stroke}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${reportIconPaths[name]}</g></svg>`;
    const summaryBadgeColors: Record<string, string> = {
      road: '#B9DFFC', pin: '#AFE4D7', fuel: '#FFD19A', parking: '#D0C1FF', coins: '#06798C'
    };
    const summaryCard = (label: string, value: string, icon: string, fillColor: string, accent: string, highlight = false) => ({
      columns: [
        { svg: makeSummaryBadge(icon, summaryBadgeColors[icon], highlight ? '#FFFFFF' : accent), width: 48, height: 48 },
        {
          stack: [
            { text: label, style: highlight ? 'summaryTotalLabel' : 'summaryLabel' },
            { text: value, style: highlight ? 'summaryTotalValue' : 'summaryValue' },
            { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 15, y2: 0, lineWidth: 1.8, lineColor: highlight ? '#52D2D4' : accent }], margin: [0, 2, 0, 0] }
          ],
          width: '*'
        }
      ],
      columnGap: 6,
      fillColor,
      margin: [7, 7, 7, 7]
    });
    const tableHeaderCell = (label: string, icon: string, fillColor = '#0C3558') => ({
      columns: [
        { svg: makeReportIcon(icon, '#FFFFFF'), width: 12, height: 12 },
        { text: label, style: 'tableHeader' }
      ],
      columnGap: 4,
      fillColor
    });

    const documentDefinition: any = {
      pageSize: 'A4',
      pageOrientation: 'landscape',
      pageMargins: [22, 20, 22, 62],
      footer: (currentPage: number, pageCount: number) => ({
        stack: [
          {
            canvas: [{ type: 'line', x1: 0, y1: 0, x2: 797, y2: 0, lineWidth: 1.1, lineColor: '#0D8798' }],
            margin: [0, 0, 0, 5]
          },
          {
            columns: [
              {
                columns: [
                  { svg: makeReportIcon('calendar', '#0D6C9E'), width: 13, height: 13 },
                  { text: `Generated ${generatedOn}`, style: 'footer' }
                ],
                columnGap: 5
              },
              { text: `Page ${currentPage} of ${pageCount}`, alignment: 'right', style: 'footerPage' }
            ]
          }
        ],
        margin: [22, 0, 22, 12]
      }),
      content: [
        {
          text: [
            { text: 'Petrol Expense ', color: '#0C3558' },
            { text: 'Report', color: '#078B96' }
          ],
          style: 'title'
        },
        { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 74, y2: 0, lineWidth: 1.4, lineColor: '#08A4B0' }], margin: [0, 2, 0, 4] },
        ...(recordedByName ? [{ text: [{ text: 'Name: ' }, { text: recordedByName, bold: true }], style: 'reporter' }] : []),
        { text: `${selectedMonth ? getMonthLabel(selectedMonth) : 'All months'}`, style: 'subtitle' },
        {
          margin: [0, 9, 0, 9],
          table: {
            widths: ['*', '*', '*', '*', '*'],
            body: [[
              summaryCard('TRIPS', String(selectedTrips.length), 'road', '#EAF5FB', '#1177C5'),
              summaryCard('TOTAL KM', totalKm.toFixed(1), 'pin', '#E8F7F4', '#008D79'),
              summaryCard('PETROL AMOUNT', formatRupees(totalPetrol), 'fuel', '#FFF2E5', '#E97D0A'),
              summaryCard('PARKING FEE', formatRupees(totalParking), 'parking', '#F2EEFF', '#7040D5'),
              summaryCard('GRAND TOTAL', formatRupees(grandTotal), 'coins', '#087F94', '#FFFFFF', true)
            ]]
          },
          layout: {
            hLineWidth: () => 0,
            vLineWidth: () => 6,
            vLineColor: () => '#FFFFFF',
            paddingLeft: () => 0,
            paddingRight: () => 0,
            paddingTop: () => 0,
            paddingBottom: () => 0
          }
        },
        {
          margin: [0, 0, 0, 0],
          table: {
            widths: [17, 50, 88, 78, 132, 116, 31, 72, 67, 64],
            ...buildPdfTableDefinition([
              { text: 'No.', style: 'tableHeader' },
              tableHeaderCell('Date', 'calendar'),
              tableHeaderCell('Visitor / Client', 'person'),
              tableHeaderCell('Assigned Person', 'users'),
              tableHeaderCell('Route', 'route'),
              tableHeaderCell('Purpose', 'document'),
              tableHeaderCell('KM', 'road'),
              tableHeaderCell('Petrol Amount', 'fuel'),
              tableHeaderCell('Parking Fee', 'parking'),
              tableHeaderCell('Total', 'total', '#087F86')
            ], rows, [
              { text: 'TOTAL', colSpan: 6, alignment: 'right', bold: true, color: '#0C3558' },
              {}, {}, {}, {}, {},
              { text: totalKm.toFixed(1), bold: true, color: '#0C3558', alignment: 'center' },
              { text: formatRupees(totalPetrol), bold: true, color: '#0C3558', alignment: 'center' },
              { text: formatRupees(totalParking), bold: true, color: '#0C3558', alignment: 'center' },
              { text: formatRupees(grandTotal), bold: true, color: '#087F86', alignment: 'center' }
            ])
          },
          layout: {
            fillColor: (rowIndex: number) => {
              if (rowIndex === 0) return '#0C3558';
              if (rowIndex === rows.length + 1) return '#E8F3F6';
              return rowIndex % 2 === 0 ? '#EFF5F9' : '#FFFFFF';
            },
            hLineColor: (lineIndex: number) => lineIndex === 1 ? '#0D8798' : '#D4E1EA',
            hLineWidth: (lineIndex: number) => lineIndex === 1 ? 1.1 : 0.55,
            vLineColor: () => '#D4E1EA',
            vLineWidth: () => 0.55,
            paddingLeft: () => 4,
            paddingRight: () => 4,
            paddingTop: () => 3.5,
            paddingBottom: () => 3.5
          }
        }
      ],
      styles: {
        title: { fontSize: 24, bold: true, margin: [0, 0, 0, 0] },
        subtitle: { fontSize: 9, color: '#0C3558', margin: [0, 2, 0, 0] },
        reporter: { fontSize: 10, color: '#0C3558', margin: [0, 1, 0, 0] },
        footer: { fontSize: 8, color: '#0C3558' },
        footerPage: { fontSize: 8, bold: true, color: '#0C3558' },
        summaryLabel: { fontSize: 7.4, bold: true, color: '#173C5A', margin: [0, 1, 0, 2] },
        summaryValue: { fontSize: 13, bold: true, color: '#0C3558' },
        summaryTotalLabel: { fontSize: 7.4, bold: true, color: '#FFFFFF', margin: [0, 1, 0, 2] },
        summaryTotalValue: { fontSize: 13, bold: true, color: '#FFFFFF' },
        tableHeader: { fontSize: 7.4, bold: true, color: '#FFFFFF' }
      },
      defaultStyle: { font: 'Roboto', fontSize: 8.2, color: '#123553' }
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
          title: 'Petrol Expense Report',
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
      appId: 'petrol-expenses-tracker',
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
    const fileName = `Petrol_Tracker_Backup_${new Date().toISOString().slice(0, 10)}.json`;

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
          title: 'Petrol Tracker Backup',
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

      const validation = validateBackup(JSON.parse(await file.text()));
      if (!validation.ok) {
        alert(validation.error);
        return;
      }
      setPendingBackupRestore(validation);
    } catch (error: any) {
      alert('Restore failed: ' + (error?.message || 'Choose a valid backup file.'));
    } finally {
      input.value = '';
    }
  };

  const applyPendingBackupRestore = () => {
    if (!pendingBackupRestore?.data) return;
    const data = pendingBackupRestore.data;
    const validRate = Number(data.petrolRate);
    try {
      restoreBackupToStorage(localStorage, data);
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
      setPendingBackupRestore(null);
      alert('Backup restored successfully.');
    } catch (error: any) {
      alert('Restore failed: ' + (error?.message || 'Choose a valid backup file.'));
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
      {showWelcomeSetup && (
        <section className="fixed inset-0 z-[100] overflow-y-auto bg-[#f4f7f8] px-4 pb-8 pt-[max(24px,env(safe-area-inset-top))]" aria-labelledby="welcome-setup-title">
          <div className="mx-auto flex min-h-[calc(100dvh-32px)] w-full max-w-md flex-col">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl brand-gradient-bg text-white shadow-md shadow-teal-900/15">
                <Navigation className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-teal-700">Welcome</p>
                <p className="text-sm font-bold leading-5 text-[#102a35]">Trip &amp; Petrol Expense Tracker</p>
              </div>
            </div>

            <div className="mt-9">
              <p className="text-[10px] font-bold uppercase tracking-[0.17em] text-teal-700">Quick setup · 1 of 1</p>
              <h1 id="welcome-setup-title" className="mt-2 text-[28px] font-extrabold leading-[1.12] tracking-tight text-[#102a35]">
                Let’s get you set up.
              </h1>
              <p className="mt-2 max-w-sm text-sm leading-6 text-slate-500">
                Add a couple of details so your trips and expense reports are ready to go.
              </p>
            </div>

            <form id="welcome-setup-form" onSubmit={completeWelcomeSetup} className="mt-6 space-y-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <label className="block text-xs font-semibold text-slate-600">
                Name for this phone
                <input
                  type="text"
                  required
                  maxLength={80}
                  autoComplete="name"
                  value={recordedByInput}
                  onChange={event => setRecordedByInput(event.target.value)}
                  placeholder="Enter your name"
                  className={inputClass + ' mt-1.5'}
                />
              </label>
              <label className="block text-xs font-semibold text-slate-600">
                Petrol reimbursement rate
                <span className="relative mt-1.5 block">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    required
                    value={rateInput}
                    onChange={event => setRateInput(event.target.value)}
                    className={inputClass + ' pr-20'}
                    aria-label="Petrol reimbursement rate per kilometre in rupees"
                  />
                  <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs font-medium text-slate-400">per km</span>
                </span>
              </label>
            </form>

            <div className="mt-4 rounded-2xl border border-teal-100 bg-teal-50/70 p-4">
              <div className="flex items-center gap-2 text-sm font-bold text-[#102a35]">
                <MapPin className="h-4 w-4 text-teal-700" />
                Office location <span className="text-xs font-medium text-slate-400">Optional</span>
              </div>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                Save your office location to prefill the start point for your first trip of the day.
              </p>
              {officeLocation && (
                <p className="mt-2 text-xs font-semibold text-emerald-800">Office location saved on this phone.</p>
              )}
              {officeSetupMessage && (
                <p role="status" className="mt-2 text-xs leading-5 text-slate-600">{officeSetupMessage}</p>
              )}
              <button
                type="button"
                disabled={isSavingOfficeLocation}
                onClick={() => { void saveOfficeGPS(false); }}
                className="mt-3 inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-teal-200 bg-white px-3 py-2 text-xs font-bold text-teal-800 transition hover:bg-teal-100 disabled:cursor-wait disabled:opacity-60"
              >
                <MapPin className="h-4 w-4" />
                {isSavingOfficeLocation ? 'Finding location…' : officeLocation ? 'Update with GPS' : 'Use current location'}
              </button>
            </div>

            <div className="mt-auto pt-6">
              <button
                type="submit"
                form="welcome-setup-form"
                className="brand-gradient-button flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl px-5 py-3 text-sm font-bold text-white shadow-lg shadow-teal-900/15 focus:outline-none focus:ring-4 focus:ring-teal-700/20"
              >
                Save and continue <ChevronRight className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={skipWelcomeSetup}
                className="mt-2 min-h-10 w-full rounded-xl px-4 py-2 text-xs font-semibold text-slate-500 hover:bg-white"
              >
                Set this up later
              </button>
              <p className="mt-1 text-center text-[10px] leading-4 text-slate-400">
                Your name and rate are saved on this phone. Change them anytime in Settings.
              </p>
            </div>
          </div>
        </section>
      )}
      {activeTab === 'settings' && (
        <header className="app-header z-10 shrink-0 brand-gradient-bg text-white shadow-sm">
          <div className="mx-auto flex w-full max-w-xl items-center gap-3 px-5 py-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/10">
              <Navigation className="h-5 w-5 text-teal-300" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-teal-300">
                {recordedByName || 'PERSONAL TRIP TRACKER'}
              </p>
              <h1 className="truncate text-base font-semibold tracking-tight sm:text-lg">
                Trip & Petrol Expense Tracker
              </h1>
            </div>
          </div>
        </header>
      )}

      <main className="min-h-0 flex-1 overflow-y-auto px-4 pb-5 pt-5 sm:px-5">
        {activeTab === 'tracker' && (
          <div className="mx-auto flex min-h-full w-full max-w-md flex-col justify-start gap-4 pb-5">
            {showRecoveredTripNotice && (
              <div role="status" className="flex items-start justify-between gap-3 rounded-2xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-950">
                <p>Your unfinished trip was recovered on this device. You can continue tracking or finish entering its details.</p>
                <button
                  type="button"
                  onClick={() => setShowRecoveredTripNotice(false)}
                  className="shrink-0 text-xs font-semibold text-teal-800 underline underline-offset-2"
                >
                  Dismiss
                </button>
              </div>
            )}
            {tripState === 'idle' && (
              <>
                <header className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] brand-gradient-bg text-white shadow-sm">
                      <Navigation className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <h1 className="max-w-[245px] text-[13px] font-extrabold leading-4 tracking-tight text-[#102a35]">
                        Trip &amp; Petrol Expense Tracker
                      </h1>
                      <p className="mt-0.5 text-[10px] text-slate-500">Trips, made simple</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab('settings')}
                    aria-label="Open settings"
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:bg-slate-50 focus:outline-none focus:ring-4 focus:ring-teal-700/15"
                  >
                    <Settings className="h-4 w-4" />
                  </button>
                </header>

                <section aria-labelledby="dashboard-title" className="pt-1">
                  <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-teal-700">{todayLabel}</p>
                  <h2 id="dashboard-title" className="mt-1 text-[21px] font-extrabold tracking-tight text-[#102a35]">
                    Ready for your next trip?
                  </h2>
                  <p className="mt-1 text-xs text-slate-500">Hello, {greetingName}. Start tracking when you set off.</p>
                </section>

                <section className="rounded-[22px] brand-gradient-bg p-4 text-white shadow-lg shadow-slate-900/10">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/10">
                      <MapPin className="h-5 w-5 text-white" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold">Trip tracking is ready</p>
                      <p className="mt-0.5 text-[10px] leading-4 text-white/75">GPS will capture your route while you travel.</p>
                    </div>
                  </div>
                  <button
                    onClick={handleStartTrip}
                    className="mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-extrabold text-teal-800 shadow-sm transition hover:bg-teal-50 focus:outline-none focus:ring-4 focus:ring-white/30 active:scale-[0.99]"
                  >
                    <MapPin className="h-4 w-4" />
                    Start trip
                  </button>
                  <p className="mt-2 text-center text-[10px] text-white/75">
                    {recordedByName ? `Recorded on this phone as ${recordedByName}.` : 'Add the phone name in Settings before tracking.'}
                  </p>
                </section>

                <section aria-labelledby="today-summary-title">
                  <div className="mb-2 flex items-center justify-between px-1">
                    <h3 id="today-summary-title" className="text-sm font-bold text-[#102a35]">Today at a glance</h3>
                    <button type="button" onClick={() => setActiveTab('reports')} className="text-[10px] font-bold text-teal-800">View reports</button>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="rounded-2xl border border-slate-200 bg-white px-3 py-3 shadow-sm">
                      <p className="text-[9px] font-bold uppercase tracking-wide text-slate-500">Trips</p>
                      <p className="mt-1 text-lg font-extrabold tabular-nums text-[#123d53]">{todayTrips.length}</p>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-white px-3 py-3 shadow-sm">
                      <p className="text-[9px] font-bold uppercase tracking-wide text-slate-500">Distance</p>
                      <p className="mt-1 whitespace-nowrap text-lg font-extrabold tabular-nums text-[#123d53]">{todayKm.toFixed(1)} <span className="text-[10px] font-semibold">km</span></p>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-white px-3 py-3 shadow-sm">
                      <p className="text-[9px] font-bold uppercase tracking-wide text-slate-500">Expenses</p>
                      <p className="mt-1 whitespace-nowrap text-lg font-extrabold tabular-nums text-[#123d53]">{formatRupees(todayTotal)}</p>
                    </div>
                  </div>
                </section>

                <section aria-labelledby="recent-trips-title" className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                    <h3 id="recent-trips-title" className="text-sm font-bold text-[#102a35]">Recent trips</h3>
                    <button type="button" onClick={() => setActiveTab('reports')} className="inline-flex items-center gap-0.5 text-[10px] font-bold text-teal-800">
                      See all <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  {recentTrips.length > 0 ? (
                    <div className="divide-y divide-slate-100">
                      {recentTrips.map(trip => {
                        const tripDate = getTripDate(trip);
                        const startTime = Number(trip.startTime);
                        const tripTime = Number.isFinite(startTime) && startTime > 0
                          ? new Date(startTime).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })
                          : '';
                        const tripDateLabel = tripDate
                          ? tripDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
                          : String(trip.date || 'Date unavailable');
                        return (
                          <div key={trip.id} className="flex items-center gap-3 px-4 py-3">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-800">
                              <History className="h-4 w-4" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-xs font-bold text-[#102a35]">{trip.fromLoc || 'Start'} <span className="text-slate-400">→</span> {trip.toLoc || 'Destination'}</p>
                              <p className="mt-1 text-[10px] text-slate-500">{tripDateLabel}{tripTime ? ` · ${tripTime}` : ''} · {Number(trip.totalKm || 0).toFixed(1)} km</p>
                            </div>
                            <p className="shrink-0 text-xs font-extrabold tabular-nums text-[#123d53]">{formatRupees(getTripTotalAmount(trip))}</p>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="px-4 py-5 text-xs leading-5 text-slate-500">No trips recorded yet. Your recent trips will appear here.</p>
                  )}
                </section>
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
                      onClick={() => {
                        clearTripDraft();
                        setCurrentTrip(createEmptyTrip());
                        setTripState('idle');
                        setShowRecoveredTripNotice(false);
                      }}
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

        {(activeTab === 'reports' || activeTab === 'trips') && (
          <>
          <div className="mx-auto max-w-md space-y-4 pb-5">
            {activeTab === 'reports' && (
              <>
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

            <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm" aria-labelledby="monthly-insights-title">
              <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
                <div>
                  <h3 id="monthly-insights-title" className="text-sm font-bold text-[#102a35]">Monthly comparison</h3>
                  <p className="mt-0.5 text-[11px] text-slate-500">Latest {monthlyInsights.length} months · all trips</p>
                </div>
                <History className="h-4 w-4 shrink-0 text-teal-700" />
              </div>
              {monthlyInsights.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="min-w-[540px] w-full text-left text-[11px]">
                    <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-3 py-2 font-semibold">Month</th>
                        <th className="px-3 py-2 text-right font-semibold">Trips</th>
                        <th className="px-3 py-2 text-right font-semibold">KM</th>
                        <th className="px-3 py-2 text-right font-semibold">Petrol</th>
                        <th className="px-3 py-2 text-right font-semibold">Parking</th>
                        <th className="px-3 py-2 text-right font-semibold">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {monthlyInsights.map(month => (
                        <tr key={month.month} className="border-t border-slate-100">
                          <th scope="row" className="whitespace-nowrap px-3 py-2 font-semibold text-slate-700">{getMonthLabel(month.month)}</th>
                          <td className="px-3 py-2 text-right tabular-nums text-slate-600">{month.tripCount}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-slate-600">{month.totalKm.toFixed(1)}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-slate-600">{formatRupees(month.petrolAmount)}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-slate-600">{formatRupees(month.parkingAmount)}</td>
                          <td className="px-3 py-2 text-right font-semibold tabular-nums text-teal-800">{formatRupees(month.grandTotal)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="px-4 py-5 text-sm text-slate-500">Monthly comparisons appear after trips are recorded.</p>
              )}
            </section>

            <button
              type="button"
              onClick={() => setActiveTab('trips')}
              className="flex min-h-12 w-full items-center justify-between rounded-2xl border border-teal-100 bg-white px-4 py-3 text-left text-sm font-bold text-teal-800 shadow-sm transition hover:bg-teal-50"
            >
              <span>View recorded trips</span>
              <ChevronRight className="h-4 w-4" />
            </button>
              </>
            )}

            {activeTab === 'trips' && (
              <>
                <section className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-teal-700">Trip history</p>
                    <h2 className="mt-0.5 text-lg font-bold tracking-tight text-[#102a35]">Your trips</h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowReportsMenu(true)}
                    aria-label="Open trip filters and export options"
                    className="flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl bg-teal-50 px-3 text-xs font-bold text-teal-800 transition hover:bg-teal-100"
                  >
                    <Menu className="h-4 w-4" />
                    Filters &amp; more
                  </button>
                </section>

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
              </>
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
                    <h2 id="reports-menu-title" className="text-lg font-bold text-[#102a35]">Trips &amp; Reports</h2>
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
                <div className="mx-auto mb-4 flex h-[72px] w-[72px] items-center justify-center rounded-[22px] brand-gradient-bg shadow-[0_8px_24px_rgba(0,128,160,0.22)] ring-4 ring-teal-50">
                  <Heart className="h-9 w-9 fill-white text-white drop-shadow-sm" />
                </div>
                <h3 className="text-base font-bold text-[#102a35]">Everything you need, in one place</h3>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  Manage this phone’s name, office location, Trips &amp; Reports, petrol rate, clients, backups, and app details from the menu.
                </p>
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

            <button
              type="button"
              onClick={() => {
                setShowSettingsMenu(false);
                setActiveTab('reports');
                setShowReportsMenu(true);
              }}
              aria-label="Open Trips and Reports"
              className="w-full rounded-2xl border border-teal-200 bg-teal-50/70 p-4 text-left shadow-sm transition hover:bg-teal-50 focus:outline-none focus:ring-4 focus:ring-teal-700/20"
            >
              <span className="flex items-center justify-between gap-3">
                <span className="flex min-w-0 items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-teal-800">
                    <FileText className="h-5 w-5" />
                  </span>
                  <span className="min-w-0">
                    <span className="block font-bold text-[#102a35]">Trips &amp; Reports</span>
                    <span className="mt-1 block text-xs leading-5 text-slate-500">
                      Month filters, past trips, CSV and PDF
                    </span>
                  </span>
                </span>
                <ChevronRight className="h-5 w-5 shrink-0 text-teal-800" />
              </span>
            </button>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="mb-2 flex items-center gap-2 font-bold text-[#102a35]">
                <Fuel className="h-4 w-4 text-teal-700" />
                Petrol rate
              </h3>
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
                <UsersRound className="h-4 w-4 text-teal-700" />
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
                <li>• App: Trip & Petrol Expense Tracker · v1.0.0</li>
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

      {!showWelcomeSetup && (
      <nav className="pb-safe z-20 shrink-0 border-t border-slate-200 bg-white/95 px-3 pt-2 shadow-[0_-8px_24px_rgba(15,23,42,0.06)]">
        <div className="mx-auto grid w-full max-w-md grid-cols-4 gap-1">
        <button
          onClick={() => setActiveTab('tracker')}
          className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-2xl px-3 transition ${
            activeTab === 'tracker'
              ? 'bg-teal-50 text-teal-800'
              : 'text-slate-400 hover:bg-slate-50 hover:text-slate-600'
          }`}
        >
          <Navigation className="h-5 w-5" />
          <span className="text-[11px] font-semibold">Home</span>
        </button>

        <button
          onClick={() => setActiveTab('trips')}
          className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-2xl px-2 transition ${
            activeTab === 'trips'
              ? 'bg-teal-50 text-teal-800'
              : 'text-slate-400 hover:bg-slate-50 hover:text-slate-600'
          }`}
        >
          <History className="h-5 w-5" />
          <span className="text-[10px] font-semibold">Trips</span>
        </button>

        <button
          onClick={() => setActiveTab('reports')}
          className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-2xl px-3 transition ${
            activeTab === 'reports'
              ? 'bg-teal-50 text-teal-800'
              : 'text-slate-400 hover:bg-slate-50 hover:text-slate-600'
          }`}
        >
          <FileText className="h-5 w-5" />
          <span className="text-[10px] font-semibold">Reports</span>
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
      )}

      {pendingBackupRestore && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="backup-restore-title"
            className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl"
          >
            <div className="mb-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-teal-700">Backup preview</p>
              <h2 id="backup-restore-title" className="mt-1 text-xl font-bold text-[#102a35]">Review before restoring</h2>
              <p className="mt-1 text-sm text-slate-500">
                Created {pendingBackupRestore.summary.createdAt
                  ? new Date(pendingBackupRestore.summary.createdAt).toLocaleString()
                  : 'date not recorded'}
              </p>
            </div>

            <dl className="grid grid-cols-2 gap-2 text-sm">
              <div className="rounded-xl bg-slate-50 p-3">
                <dt className="text-xs text-slate-500">Trips</dt>
                <dd className="mt-1 font-bold text-slate-800">{pendingBackupRestore.summary.tripCount}</dd>
              </div>
              <div className="rounded-xl bg-slate-50 p-3">
                <dt className="text-xs text-slate-500">Petrol rate</dt>
                <dd className="mt-1 font-bold text-slate-800">{formatRupees(pendingBackupRestore.summary.petrolRate)} / km</dd>
              </div>
              <div className="rounded-xl bg-slate-50 p-3">
                <dt className="text-xs text-slate-500">Office location</dt>
                <dd className="mt-1 font-bold text-slate-800">{pendingBackupRestore.summary.officeLocationSaved ? 'Saved' : 'Not set'}</dd>
              </div>
              <div className="rounded-xl bg-slate-50 p-3">
                <dt className="text-xs text-slate-500">Saved lists</dt>
                <dd className="mt-1 font-bold text-slate-800">
                  {pendingBackupRestore.summary.destinationCount} destinations · {pendingBackupRestore.summary.managerCount} people · {pendingBackupRestore.summary.visitorCount} clients
                </dd>
              </div>
            </dl>

            {pendingBackupRestore.duplicateIndexes.length > 0 && (
              <p role="alert" className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
                {pendingBackupRestore.duplicateIndexes.length} possible duplicate trip {pendingBackupRestore.duplicateIndexes.length === 1 ? 'record was' : 'records were'} found in this backup. They will be restored as listed.
              </p>
            )}

            <p className="mt-4 text-xs leading-5 text-slate-500">
              Restoring replaces the trips and settings currently on this phone. Make a backup first if you need to keep the current data.
            </p>

            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={() => setPendingBackupRestore(null)}
                className="min-h-11 flex-1 rounded-xl bg-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-200"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={applyPendingBackupRestore}
                className="min-h-11 flex-1 rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-teal-800 focus:outline-none focus:ring-4 focus:ring-teal-700/20"
              >
                Replace data
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}




