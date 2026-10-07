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

  const buildCSV = () => {
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

    trips.forEach((t, i) => {
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

    const csvContent = buildCSV();
    const monthStr = trips[0]?.date
      ? trips[0].date.substring(3)
      : 'Report';
    const fileName = `Invictus_Tracker_${monthStr}.csv`;

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
    'w-full border border-slate-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-teal-500 focus:outline-none';

  return (
    <div className="h-screen w-full bg-slate-100 flex flex-col font-sans overflow-hidden">
      <header className="bg-gradient-to-r from-blue-700 via-teal-600 to-emerald-600 text-white p-4 shadow-md flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <Navigation className="w-6 h-6" />
          <h1 className="text-xl font-bold">Petrol Expenses Tracker</h1>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-4 pb-6">
        {activeTab === 'tracker' && (
          <div className="flex flex-col h-full max-w-md mx-auto pb-4">
            {tripState === 'idle' && (
              <div className="flex-1 flex flex-col items-center justify-center space-y-6 mt-10">
                <div className="w-48 h-48 rounded-full bg-gradient-to-br from-blue-50 via-teal-50 to-emerald-50 flex items-center justify-center border-4 border-teal-100 shadow-inner">
                  <Bike className="w-20 h-20 text-teal-600" />
                </div>

                <div className="text-center">
                  <h2 className="text-2xl font-bold text-slate-800">
                    Ready to go?
                  </h2>
                  <p className="text-slate-500 mt-2 text-sm px-4">
                    Press Start Trip to capture your current location and begin routing.
                  </p>
                </div>

                <button
                  onClick={handleStartTrip}
                  className="w-full py-4 bg-gradient-to-r from-blue-700 via-teal-600 to-emerald-600 hover:from-blue-800 hover:via-teal-700 hover:to-emerald-700 text-white rounded-xl font-bold text-lg shadow-lg shadow-teal-200 transition active:scale-95 flex items-center justify-center gap-2"
                >
                  <MapPin className="w-5 h-5" />
                  START TRIP
                </button>
              </div>
            )}

            {tripState === 'tracking' && (
              <div className="flex-1 flex flex-col items-center space-y-8 mt-10">
                <div className="w-full bg-white p-6 rounded-2xl shadow-sm border border-slate-200 text-center relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-600 via-teal-500 to-emerald-500 animate-pulse" />
                  <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-2">
                    Trip in Progress
                  </h3>

                  <div className="text-5xl font-mono text-teal-700 font-light mb-4 tracking-tighter">
                    {formatTime(timer)}
                  </div>

                  <div className="flex items-center justify-center gap-2 text-sm text-slate-500 bg-slate-50 py-2 rounded-lg">
                    <Navigation className="w-4 h-4 text-teal-600 animate-pulse" />
                    GPS Tracking Active
                  </div>
                </div>

                <button
                  onClick={handleEndTrip}
                  className="w-full py-4 bg-red-500 hover:bg-red-600 text-white rounded-xl font-bold text-lg shadow-lg shadow-red-200 transition active:scale-95 flex items-center justify-center gap-2"
                >
                  <AlertCircle className="w-5 h-5" />
                  END TRIP
                </button>
              </div>
            )}

            {tripState === 'saving' && (
              <div className="bg-white p-5 rounded-2xl shadow-md border border-slate-200 animate-fade-in">
                <h2 className="text-lg font-bold text-slate-800 mb-4 border-b pb-2">
                  Review & Save Trip
                </h2>

                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 mb-1">
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
                      <label className="block text-xs font-semibold text-slate-500 mb-1">
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

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-teal-700 mb-1">
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
                        className="w-full border-2 border-teal-200 bg-teal-50 rounded-lg p-2 text-sm font-bold text-teal-700 focus:outline-none"
                      />
                      <p className="text-[10px] text-slate-400 mt-1">
                        Calculated via OSRM
                      </p>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-500 mb-1">
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
                    <label className="block text-xs font-semibold text-slate-500 mb-1">
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

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 mb-1">
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
                      <label className="block text-xs font-semibold text-slate-500 mb-1">
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

                  <div className="pt-4 flex gap-3">
                    <button
                      onClick={() => setTripState('idle')}
                      className="flex-1 py-3 text-slate-600 bg-slate-100 rounded-lg font-semibold text-sm"
                    >
                      Cancel
                    </button>

                    <button
                      onClick={finalizeTrip}
                      className="flex-[2] py-3 text-white bg-gradient-to-r from-blue-700 via-teal-600 to-emerald-600 hover:from-blue-800 hover:via-teal-700 hover:to-emerald-700 rounded-lg font-bold text-sm shadow-md flex items-center justify-center gap-2"
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
          <div className="max-w-md mx-auto space-y-6 pb-4">
            <div className="flex justify-between items-center bg-white p-4 rounded-xl shadow-sm border border-slate-200">
              <h2 className="text-xl font-bold text-slate-800">
                Trip Reports
              </h2>

              <button
                onClick={exportCSV}
                className="bg-teal-100 text-teal-700 px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-teal-200 transition font-bold text-sm shadow-sm"
              >
                <Download className="w-4 h-4" />
                Export CSV
              </button>
            </div>

            <div className="bg-gradient-to-r from-blue-700 via-teal-600 to-emerald-600 rounded-xl p-5 text-white shadow-md">
              <h3 className="text-sm font-semibold text-teal-50 mb-3 uppercase tracking-wider">
                Overall Summary
              </h3>

              <div className="grid grid-cols-3 gap-4 text-center">
                <div className="bg-white/10 p-3 rounded-lg">
                  <div className="text-2xl font-bold">
                    {grandTotalTrips}
                  </div>
                  <div className="text-[10px] text-white/80 mt-1">
                    TOTAL TRIPS
                  </div>
                </div>

                <div className="bg-white/10 p-3 rounded-lg">
                  <div className="text-2xl font-bold">
                    {grandTotalKm.toFixed(1)}
                  </div>
                  <div className="text-[10px] text-white/80 mt-1">
                    TOTAL KM
                  </div>
                </div>

                <div className="bg-white/10 p-3 rounded-lg">
                  <div className="text-xl font-bold mt-1">
                    ₹{grandTotalAmount.toFixed(0)}
                  </div>
                  <div className="text-[10px] text-white/80 mt-1">
                    GRAND TOTAL
                  </div>
                </div>
              </div>
            </div>

            {trips.length === 0 ? (
              <div className="text-center py-10 text-slate-400">
                No trips recorded yet.
              </div>
            ) : (
              Object.entries(groupTripsByDate())
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
                      className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden"
                    >
                      <div className="bg-slate-50 px-4 py-3 border-b border-slate-100 flex justify-between items-center">
                        <h3 className="font-bold text-slate-700">
                          {date}
                        </h3>

                        <div className="text-right">
                          <span className="text-xs font-semibold text-teal-700 bg-teal-50 px-2 py-1 rounded mr-2">
                            {dayKm.toFixed(1)} KM
                          </span>
                          <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded">
                            ₹{dayAmount.toFixed(2)}
                          </span>
                        </div>
                      </div>

                      <div className="divide-y divide-slate-100">
                        {dayTrips.map(trip => (
                          <div
                            key={trip.id}
                            className="p-4 flex flex-col gap-2 relative group"
                          >
                            <button
                              onClick={() => deleteTrip(trip.id)}
                              className="absolute top-4 right-4 text-xs text-red-400 opacity-0 group-hover:opacity-100 transition"
                            >
                              Delete
                            </button>

                            <div className="flex justify-between items-start">
                              <span className="font-bold text-slate-800 text-sm">
                                {trip.visitor}
                                <span className="text-slate-400 font-normal ml-1">
                                  ({trip.assignedBy})
                                </span>
                              </span>

                              <span className="text-sm font-semibold text-teal-700">
                                {trip.totalKm} km
                              </span>
                            </div>

                            <div className="flex items-center text-xs text-slate-500 font-medium">
                              <span>{trip.fromLoc}</span>
                              <RefreshCw className="w-3 h-3 mx-2 text-slate-300 shrink-0" />
                              <span>{trip.toLoc}</span>
                            </div>

                            <div className="flex justify-between items-end mt-1">
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
          <div className="max-w-md mx-auto space-y-4 pb-4">
            <h2 className="text-xl font-bold text-slate-800 mb-6">
              Settings
            </h2>

            <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
              <h3 className="font-bold text-slate-700 mb-2 flex items-center gap-2">
                <MapPin className="w-4 h-4 text-teal-600" />
                Office Location Setting
              </h3>

              <p className="text-xs text-slate-500 mb-4">
                Set your current physical location as 'Office'. The app uses
                this to auto-fill your first trip of the day.
              </p>

              {officeLocation && (
                <div className="bg-emerald-50 text-emerald-700 p-3 rounded-lg text-xs font-mono mb-4 border border-emerald-100">
                  Saved: {officeLocation.lat.toFixed(5)},{' '}
                  {officeLocation.lon.toFixed(5)}
                </div>
              )}

              <button
                onClick={saveOfficeGPS}
                className="w-full py-3 bg-gradient-to-r from-blue-50 to-emerald-50 hover:from-blue-100 hover:to-emerald-100 text-teal-700 font-semibold rounded-lg text-sm border border-teal-200 transition"
              >
                Capture Current GPS as Office
              </button>
            </div>

            <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
              <h3 className="font-bold text-slate-700 mb-4 text-sm">
                App Info
              </h3>

              <ul className="text-xs text-slate-500 space-y-2">
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

      <nav className="bg-white border-t border-slate-200 flex justify-around p-3 z-50 shrink-0 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] w-full">
        <button
          onClick={() => setActiveTab('tracker')}
          className={`flex flex-col items-center gap-1 ${
            activeTab === 'tracker'
              ? 'text-teal-600'
              : 'text-slate-400'
          }`}
        >
          <Navigation className="w-6 h-6" />
          <span className="text-[10px] font-semibold">Track</span>
        </button>

        <button
          onClick={() => setActiveTab('reports')}
          className={`flex flex-col items-center gap-1 ${
            activeTab === 'reports'
              ? 'text-teal-600'
              : 'text-slate-400'
          }`}
        >
          <History className="w-6 h-6" />
          <span className="text-[10px] font-semibold">Reports</span>
        </button>

        <button
          onClick={() => setActiveTab('settings')}
          className={`flex flex-col items-center gap-1 ${
            activeTab === 'settings'
              ? 'text-teal-600'
              : 'text-slate-400'
          }`}
        >
          <Settings className="w-6 h-6" />
          <span className="text-[10px] font-semibold">Settings</span>
        </button>
      </nav>
    </div>
  );
}
