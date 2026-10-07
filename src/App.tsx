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
