import { useEffect, useRef, useState } from "react";

export function haversineMiles(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const earthMiles = 3958.8;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthMiles * c;
}

export type GeofenceState =
  | { status: "pending" }
  | { status: "denied" }
  | { status: "ok"; inside: boolean; distance_miles: number; accuracy_m: number; lat: number; lng: number };

export function useGeofence(target_lat: number, target_lng: number, radius_miles: number): GeofenceState {
  const [state, setState] = useState<GeofenceState>({ status: "pending" });
  const lastUpdateRef = useRef(0);

  useEffect(() => {
    if (!("geolocation" in navigator)) {
      setState({ status: "denied" });
      return;
    }
    setState({ status: "pending" });
    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const now = Date.now();
        if (now - lastUpdateRef.current < 5000) return;
        lastUpdateRef.current = now;
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        const distance = haversineMiles(lat, lng, target_lat, target_lng);
        setState({
          status: "ok",
          inside: distance <= radius_miles,
          distance_miles: distance,
          accuracy_m: position.coords.accuracy,
          lat,
          lng,
        });
      },
      () => setState({ status: "denied" }),
      { enableHighAccuracy: true, maximumAge: 3000, timeout: 15000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [radius_miles, target_lat, target_lng]);

  return state;
}
