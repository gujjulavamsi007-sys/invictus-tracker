import React, { useState, useEffect, useRef } from 'react';
import {
  MapPin,
  Clock,
  Navigation,
  History,
  Settings,
  Download,
  Bike,
  Plus,
  Save,
  AlertCircle,
  RefreshCw
} from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

export default function App() {
  const [activeTab, setActiveTab] = useState('tracker');
  const [tripState, setTripState] = useState('idle');
  const [timer, setTimer] = useState(0);
  const timerRef = useRef<any>(null);

  const [officeLocation, setOfficeLocation] = useState<any>(null);
  const [savedDestinations, setSavedDestinations] = useState<string[]>([]);
  const [trips, setTrips] = useState<any[]>([]);
  const [managers, setManagers] = useState<string[]>([]);
  const [selectedMonth, setSelectedMonth] = useState('');

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
    parkingFees: 0,
    purpose: ''
  });

  useEffect(() => {
    const savedTrips = JSON.parse(localStorage.getItem('invictusTrips') || '[]');
    const savedOffice = JSON.parse(localStorage.getItem('invictusOffice') || 'null');
    const savedDests = JSON.parse(
      localStorage.getItem('invictusDests') ||
      '["Office", "Paradise", "Begumpet", "Malkajgiri"]'
    );
    const savedManagers = JSON.parse(
      localStorage.getItem('invictusManagers') ||
      '["Ramu sir", "KV Mam", "Lakshmi Mam", "swetha mam"]'
    );

    setTrips(savedTrips);
    setOfficeLocation(savedOffice);
    setSavedDestinations(savedDests);
    setManagers(savedManagers);
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

      const defaultManager = managers.length > 0 ? managers[0] : '';

      setCurrentTrip(prev => ({
        ...prev,
        startCoords: coords,
        startTime: now.getTime(),
        fromLoc: autoFrom,
        assignedBy: defaultManager
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

  const saveManager = (managerName: string) => {
    if (managerName && !managers.includes(managerName)) {
      const updated = [...managers, managerName];
      setManagers(updated);
      localStorage.setItem('invictusManagers', JSON.stringify(updated));
    }
  };

  const finalizeTrip = () => {
    if (!currentTrip.toLoc || !currentTrip.visitor || !currentTrip.assignedBy) {
      alert('Please enter Destination, Visitor Name, and Assigned By');
      return;
    }

    saveDestination(currentTrip.toLoc);
    saveManager(currentTrip.assignedBy);

    const km = parseFloat(currentTrip.actualKm.toString()) || 0;
    const parking = parseFloat(currentTrip.parkingFees.toString()) || 0;

    const tripRecord = {
      id: Date.now(),
      date: new Date(currentTrip.startTime!).toLocaleDateString('en-GB').replace(/\//g, '-'),
      visitor: currentTrip.visitor,
      assignedBy: currentTrip.assignedBy,
      fromLoc: currentTrip.fromLoc,
      toLoc: currentTrip.toLoc,
      totalKm: km,
      ratePerKm: 5,
      petrolCharges: km * 5,
      parkingFees: parking,
      totalAmount: km * 5 + parking,
      purpose: currentTrip.purpose,
      startTime: currentTrip.startTime,
      endTime: currentTrip.endTime
    };

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
      parkingFees: 0,
      purpose: ''
    });

    setTripState('idle');
    setActiveTab('reports');
  };

  const deleteTrip = (id: number) => {
    if (window.confirm('Delete this trip?')) {
      const filtered = trips.filter(t => t.id !== id);
      setTrips(filtered);
      localStorage.setItem('invictusTrips', JSON.stringify(filtered));
    }
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

  const sumTripKm = (records: any[]) =>
    records.reduce((sum, trip) => sum + (Number(trip.totalKm) || 0), 0);

  const sumPetrolAmount = (records: any[]) =>
    records.reduce((sum, trip) => {
      const savedAmount = trip.petrolCharges ??
        (Number(trip.totalKm) || 0) * Number(trip.ratePerKm ?? 5);
      return sum + (Number(savedAmount) || 0);
    }, 0);

  const formatRupees = (amount: number) =>
    `₹${amount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

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

  const buildCSV = (reportTrips = getFilteredTrips()) => {
    const headers = [
      'Sn.',
      'DATE',
      'VISITOR PERSON',
      'ASSIGNED BY',
      'FROM',
      'TO',
      "TOTAL KM's",
      'RATE PER KM',
      'Petrol Charges',
      'PARKING FEES',
      'TOTAL AMOUNT',
      'PURPOSE & SIGS'
    ];

    let csvContent = headers.map(csvEscape).join(',') + '\n';
    let totalKm = 0;
    let totalAmount = 0;

    reportTrips.forEach((t, i) => {
      totalKm += Number(t.totalKm) || 0;
      totalAmount += Number(t.totalAmount) || 0;

      const row = [
        i + 1,
        t.date,
        t.visitor,
        t.assignedBy,
        t.fromLoc,
        t.toLoc,
        Number(t.totalKm || 0).toFixed(1),
        t.ratePerKm,
        Number(t.petrolCharges || 0).toFixed(2),
        Number(t.parkingFees || 0).toFixed(2),
        Number(t.totalAmount || 0).toFixed(2),
        t.purpose
      ];

      csvContent += row.map(csvEscape).join(',') + '\n';
    });

    csvContent += `,,,,,TOTALS,${totalKm.toFixed(1)},,,,${totalAmount.toFixed(2)},\n`;

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
    const fileName = selectedMonth
      ? `Petrol_Expenses_${selectedMonth}.csv`
      : 'Petrol_Expenses_All_Months.csv';

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

  const inputClass =
    'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-base text-slate-800 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-teal-600 focus:ring-4 focus:ring-teal-600/10';

  return (
    <div className="app-shell flex w-full flex-col overflow-hidden bg-[#f4f7f8] font-sans text-slate-900">
      <header className="app-header z-10 shrink-0 bg-[#102a35] text-white shadow-sm">
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
                  className="rounded-[24px] bg-[#102a35] p-4 text-white shadow-lg shadow-slate-900/10 sm:p-5"
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
                  </div>

                  <button
                    onClick={handleStartTrip}
                    className="flex min-h-14 w-full items-center justify-center gap-2.5 rounded-2xl bg-teal-700 px-5 py-4 text-base font-bold text-white shadow-lg shadow-teal-900/15 transition hover:bg-teal-800 focus:outline-none focus:ring-4 focus:ring-teal-700/20 active:scale-[0.99]"
                  >
                    <MapPin className="h-5 w-5" />
                    Start trip
                  </button>
                </div>
              </>
            )}

            {tripState === 'tracking' && (
              <div className="space-y-4">
                <div className="relative overflow-hidden rounded-[28px] bg-[#102a35] p-6 text-white shadow-lg shadow-slate-900/10 sm:p-7">
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
                        Assigned By
                      </label>
                      <input
                        type="text"
                        list="managersList"
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
                      <datalist id="managersList">
                        {managers.map(m => (
                          <option key={m} value={m} />
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
                      className="flex min-h-12 flex-[2] items-center justify-center gap-2 rounded-xl bg-teal-700 px-4 py-3 text-sm font-bold text-white shadow-md transition hover:bg-teal-800 focus:outline-none focus:ring-4 focus:ring-teal-700/20"
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
          <div className="mx-auto max-w-md space-y-4 pb-5">
            <div className="flex flex-col items-stretch justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center">
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-teal-700">
                  History & totals
                </p>
                <h2 className="text-xl font-bold tracking-tight text-[#102a35]">
                  Trip reports
                </h2>
              </div>

              <button
                onClick={exportCSV}
                className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-teal-800 focus:outline-none focus:ring-4 focus:ring-teal-700/20"
              >
                <Download className="h-4 w-4" />
                Export CSV
              </button>
            </div>

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
                Reports and CSV export use the selected month.
              </p>
            </div>

            <div className="rounded-2xl bg-[#102a35] p-5 text-white shadow-lg shadow-slate-900/10">
              <h3 className="mb-4 text-xs font-semibold uppercase tracking-[0.16em] text-teal-200">
                {selectedMonth ? getMonthLabel(selectedMonth) : 'Overall Summary'}
              </h3>

              <div className="grid grid-cols-3 gap-2 text-center sm:gap-3">
                <div className="rounded-xl bg-white/[0.08] px-2 py-3 ring-1 ring-white/10">
                  <div className="text-2xl font-bold tabular-nums">
                    {getFilteredTrips().length}
                  </div>
                  <div className="mt-1 text-[9px] font-semibold tracking-wide text-slate-300 sm:text-[10px]">
                    TOTAL TRIPS
                  </div>
                </div>

                <div className="rounded-xl bg-white/[0.08] px-2 py-3 ring-1 ring-white/10">
                  <div className="text-2xl font-bold tabular-nums">
                    {getFilteredTrips().reduce((sum, t) => sum + (Number(t.totalKm) || 0), 0).toFixed(1)}
                  </div>
                  <div className="mt-1 text-[9px] font-semibold tracking-wide text-slate-300 sm:text-[10px]">
                    TOTAL KM
                  </div>
                </div>

                <div className="rounded-xl bg-white/[0.08] px-2 py-3 ring-1 ring-white/10">
                  <div className="mt-0.5 text-xl font-bold tabular-nums">
                    ₹{getFilteredTrips().reduce((sum, t) => sum + (Number(t.totalAmount) || 0), 0).toFixed(0)}
                  </div>
                  <div className="mt-1 text-[9px] font-semibold tracking-wide text-slate-300 sm:text-[10px]">
                    GRAND TOTAL
                  </div>
                </div>
              </div>
            </div>

            {trips.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white/70 px-5 py-10 text-center text-sm text-slate-500">
                No trips recorded yet.
              </div>
            ) : (
              Object.entries(
                getFilteredTrips().reduce((acc, trip) => {
                  if (!acc[trip.date]) acc[trip.date] = [];
                  acc[trip.date].push(trip);
                  return acc;
                }, {} as Record<string, any[]>)
              )
                .reverse()
                .map(([date, dayTrips]) => {
                  const dayKm = dayTrips.reduce(
                    (sum, t) => sum + (Number(t.totalKm) || 0),
                    0
                  );
                  const dayAmount = dayTrips.reduce(
                    (sum, t) => sum + (Number(t.totalAmount) || 0),
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
                          <div
                            key={trip.id}
                            className="relative flex flex-col gap-2 p-4 group"
                          >
                            <button
                              onClick={() => deleteTrip(trip.id)}
                              className="absolute top-4 right-4 text-xs text-red-400 opacity-0 group-hover:opacity-100 transition"
                            >
                              Delete
                            </button>

                            <div className="flex justify-between items-start">
                              <span className="min-w-0 pr-14 text-sm font-bold text-slate-800">
                                {trip.visitor}
                                <span className="text-slate-400 font-normal ml-1">
                                  ({trip.assignedBy})
                                </span>
                              </span>

                              <span className="shrink-0 text-sm font-semibold text-teal-800">
                                {trip.totalKm} km
                              </span>
                            </div>

                            <div className="flex min-w-0 items-center text-xs font-medium text-slate-500">
                              <span>{trip.fromLoc}</span>
                              <RefreshCw className="w-3 h-3 mx-2 text-slate-300 shrink-0" />
                              <span>{trip.toLoc}</span>
                            </div>

                            <div className="mt-1 flex items-end justify-between gap-3">
                              <span className="text-xs text-slate-400 italic">
                                {trip.purpose || '-'}
                              </span>
                              <span className="text-xs font-bold text-slate-700">
                                ₹{Number(trip.totalAmount || 0).toFixed(2)}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })
            )}
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="mx-auto max-w-md space-y-4 pb-5">
            <div className="mb-5">
              <p className="mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-teal-700">
                Preferences
              </p>
              <h2 className="text-xl font-bold tracking-tight text-[#102a35]">
                Settings
              </h2>
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
              <h3 className="mb-4 text-sm font-bold text-[#102a35]">
                App Info
              </h3>

              <ul className="space-y-3 text-sm text-slate-500">
                <li>• App: Petrol Expenses Tracker</li>
                <li>• Routing Provider: OSRM Public API</li>
                <li>• Rate / KM: Fixed at ₹5.00</li>
                <li>• Data Storage: Local Device Storage</li>
                <li>• CSV Export: Android Filesystem + Share</li>
              </ul>
            </div>
          </div>
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


