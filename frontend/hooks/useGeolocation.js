'use client';

import { useState, useEffect, useCallback } from 'react';
import { calculateHaversine } from '@/utils/geo';

export function useGeolocation(siteCoords, currentAction = 'check_in') {
  const [userCoords, setUserCoords] = useState({
    lat: null,
    lon: null,
    accuracy: null,
    gps_error: null,
  });
  const [status, setStatus] = useState('acquiring');
  const [distance, setDistance] = useState(null);
  const [warningMessage, setWarningMessage] = useState(null);

  const acquireLocation = useCallback(() => {
    if (typeof window === 'undefined' || !('geolocation' in navigator)) {
      setStatus('offline');
      setWarningMessage('Geolocation is not supported by your browser.');
      return;
    }

    setStatus('acquiring');

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;
        const accuracy = pos.coords.accuracy;
        const accMeters = Math.round(accuracy);

        setUserCoords({
          lat,
          lon,
          accuracy,
          gps_error: null,
        });

        let dist = null;
        if (siteCoords && siteCoords.lat != null && siteCoords.lon != null) {
          dist = calculateHaversine(lat, lon, siteCoords.lat, siteCoords.lon);
          setDistance(dist);
        }

        const accuracyThreshold = 100;
        if (accMeters > accuracyThreshold) {
          setStatus('poor_accuracy');
          setWarningMessage(
            `Low GPS Accuracy Warning (±${accMeters}m): Location accuracy is lower than normal (>100m). Your attendance will be flagged for review. For best accuracy, please move near a window, enable precise location, or use a mobile device.`
          );
        } else {
          setStatus('ready');
          if (siteCoords && siteCoords.enabled && dist !== null) {
            const radius = siteCoords.radius || 100;
            const actionText = currentAction.replace('_', ' ');
            if (dist - accMeters > radius) {
              setWarningMessage(
                `Location Warning: You appear to be ${dist}m from your registered office (${radius}m allowed, accuracy ±${accMeters}m). This ${actionText} will be flagged for administrative audit.`
              );
            } else if (dist > radius && dist - accMeters <= radius) {
              setWarningMessage(
                `Uncertain Geofence: You are ${dist}m from office, but your accuracy circle (±${accMeters}m) overlaps the allowed ${radius}m boundary. This event will be marked as uncertain for review.`
              );
            } else {
              setWarningMessage(null);
            }
          } else {
            setWarningMessage(null);
          }
        }
      },
      (err) => {
        let errType = 'error';
        let errMsg = 'GPS coordinates unavailable. Check-in outside geofence will be flagged for review.';

        if (err.code === 1 || err.code === err.PERMISSION_DENIED) {
          errType = 'permission_denied';
          errMsg = 'Location permission denied. Please allow location permissions in your browser or device settings to verify attendance.';
        } else if (err.code === 2 || err.code === err.POSITION_UNAVAILABLE) {
          errType = 'position_unavailable';
          errMsg = 'GPS position unavailable. Please ensure location services are enabled on your device.';
        } else if (err.code === 3 || err.code === err.TIMEOUT) {
          errType = 'timeout';
          errMsg = 'GPS location request timed out. Please check your network or satellite connection and refresh.';
        }

        setUserCoords({
          lat: null,
          lon: null,
          accuracy: null,
          gps_error: errType,
        });
        setStatus(errType);
        if (siteCoords && siteCoords.enabled) {
          setWarningMessage(errMsg);
        }
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }, [siteCoords, currentAction]);

  useEffect(() => {
    acquireLocation();
  }, [acquireLocation]);

  return {
    userCoords,
    status,
    distance,
    warningMessage,
    acquireLocation,
  };
}

export default useGeolocation;
