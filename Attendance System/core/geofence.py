"""
core/geofence.py - Enterprise Geofencing & Geodesic Distance Engine
Calculates precise geographic distance between submitted check-in coordinates
and registered office/site coordinates using geopy, enforcing work-site
geofencing policies with GPS accuracy awareness.
"""

import math
from geopy.distance import geodesic
from config import Config

def is_valid_coordinate(lat, lon):
    """
    Validates latitude and longitude values:
    - Latitude in [-90.0, 90.0]
    - Longitude in [-180.0, 180.0]
    - Rejects None, strings that cannot be parsed, NaN, and Inf
    - Rejects (0, 0) as invalid (null island / uninitialized location)
    """
    if lat is None or lon is None:
        return False
    try:
        f_lat = float(lat)
        f_lon = float(lon)
    except (ValueError, TypeError):
        return False
    if math.isnan(f_lat) or math.isinf(f_lat) or math.isnan(f_lon) or math.isinf(f_lon):
        return False
    if not (-90.0 <= f_lat <= 90.0 and -180.0 <= f_lon <= 180.0):
        return False
    if abs(f_lat) < 1e-7 and abs(f_lon) < 1e-7:
        return False
    return True

def geodesic_distance(lat1, lon1, lat2, lon2):
    """
    Calculates the geodesic distance between two points on the WGS-84 ellipsoid
    using geopy.distance.geodesic.
    
    Parameters:
        lat1, lon1: Coordinates of point 1 in decimal degrees.
        lat2, lon2: Coordinates of point 2 in decimal degrees.
        
    Returns:
        float or None: Distance between points in meters rounded to 2 decimal places,
                       or None if any input coordinate is invalid.
    """
    if not (is_valid_coordinate(lat1, lon1) and is_valid_coordinate(lat2, lon2)):
        return None
        
    try:
        p1 = (float(lat1), float(lon1))
        p2 = (float(lat2), float(lon2))
        if p1 == p2:
            return 0.0
        return round(float(geodesic(p1, p2).meters), 2)
    except Exception:
        return None

def haversine_distance(lat1, lon1, lat2, lon2):
    """
    Backward-compatible wrapper for distance calculation using geodesic distance.
    """
    return geodesic_distance(lat1, lon1, lat2, lon2)

def validate_geofence(
    employee_lat,
    employee_lon,
    site_lat,
    site_lon,
    radius_meters=200.0,
    geofencing_enabled=True,
    site_name=None,
    accuracy_meters=None,
    gps_error=None
):
    """
    Validates whether an employee's submitted coordinates satisfy a site's geofencing policy,
    taking into account browser GPS accuracy.
    
    Parameters:
        employee_lat, employee_lon: Submitted coordinates from browser GPS.
        site_lat, site_lon: Registered site/office coordinates.
        radius_meters: Permitted circular boundary in meters (default: 200m).
        geofencing_enabled: If False, geofencing is bypassed (e.g. for remote/field staff).
        site_name: Optional human-readable site name for logging and warning messages.
        accuracy_meters: Browser GPS accuracy in meters (position.coords.accuracy).
        gps_error: Optional string code ('permission_denied', 'timeout', 'position_unavailable').
        
    Returns:
        dict: {
            "within_geofence": bool,
            "distance_meters": float or None,
            "radius_meters": float,
            "geofencing_enabled": bool,
            "flagged": bool,
            "flag_reason": str or None,
            "accuracy_meters": float or None,
            "classification": str,
            "message": str
        }
    """
    label = site_name or "assigned work site"
    allowed_radius = float(radius_meters)
    
    # Parse & validate accuracy_meters
    acc_val = None
    if accuracy_meters is not None:
        try:
            val = float(accuracy_meters)
            if not (math.isnan(val) or math.isinf(val)) and val >= 0:
                acc_val = round(val, 1)
        except (ValueError, TypeError):
            acc_val = None

    accuracy_threshold = getattr(Config, "GPS_ACCURACY_THRESHOLD_METERS", 100.0)
    is_low_accuracy = (acc_val is not None and acc_val > accuracy_threshold)

    # Policy 1: Remote / Field Staff with geofencing disabled
    if not geofencing_enabled:
        dist = None
        if is_valid_coordinate(employee_lat, employee_lon) and is_valid_coordinate(site_lat, site_lon):
            dist = geodesic_distance(employee_lat, employee_lon, site_lat, site_lon)
            
        return {
            "within_geofence": True,
            "distance_meters": dist,
            "radius_meters": allowed_radius,
            "geofencing_enabled": False,
            "flagged": False,
            "flag_reason": None,
            "accuracy_meters": acc_val,
            "classification": "remote",
            "message": f"Geofence disabled for {label} (Field/Remote Policy: Coordinates logged without radius restriction)."
        }

    # Policy 2: Explicit GPS Error or Missing/Invalid coordinates
    if gps_error or not is_valid_coordinate(employee_lat, employee_lon):
        if gps_error == "permission_denied":
            reason = f"GPS permission denied by user/browser for {label}"
            msg = "Location permission denied. Please allow location access in your browser settings to verify attendance."
        elif gps_error == "timeout":
            reason = f"GPS request timed out for {label}"
            msg = "GPS location request timed out. Please check your network or satellite connection."
        elif gps_error == "position_unavailable":
            reason = f"GPS position unavailable for {label}"
            msg = "GPS position unavailable. Please ensure location services are enabled on your device."
        elif employee_lat is not None and employee_lon is not None:
            try:
                f_lat, f_lon = float(employee_lat), float(employee_lon)
                if abs(f_lat) < 1e-7 and abs(f_lon) < 1e-7:
                    reason = f"Invalid (0, 0) coordinates rejected for {label}"
                    msg = "Invalid GPS coordinates detected (0,0). Please enable real GPS."
                else:
                    reason = f"Invalid coordinate values ({employee_lat}, {employee_lon}) for {label}"
                    msg = "Invalid GPS coordinate format."
            except (ValueError, TypeError):
                reason = "Invalid coordinate formatting encountered during geofence calculation"
                msg = "Invalid GPS coordinate format."
        else:
            reason = f"Missing GPS coordinates for geofenced site ({label})"
            msg = "GPS coordinates were not provided or location access was denied."

        return {
            "within_geofence": False,
            "distance_meters": None,
            "radius_meters": allowed_radius,
            "geofencing_enabled": True,
            "flagged": True,
            "flag_reason": reason,
            "accuracy_meters": acc_val,
            "classification": "no_gps",
            "message": msg
        }

    # Policy 3: Site itself has undefined coordinates
    if not is_valid_coordinate(site_lat, site_lon):
        return {
            "within_geofence": True,
            "distance_meters": None,
            "radius_meters": allowed_radius,
            "geofencing_enabled": False,
            "flagged": False,
            "flag_reason": None,
            "accuracy_meters": acc_val,
            "classification": "site_unconfigured",
            "message": f"Site {label} has no configured geographic coordinates."
        }

    # Policy 4: Accurate Geodesic Distance Calculation
    dist = geodesic_distance(employee_lat, employee_lon, site_lat, site_lon)
    if dist is None:
        return {
            "within_geofence": False,
            "distance_meters": None,
            "radius_meters": allowed_radius,
            "geofencing_enabled": True,
            "flagged": True,
            "flag_reason": "Invalid coordinate formatting encountered during geofence calculation",
            "accuracy_meters": acc_val,
            "classification": "invalid",
            "message": "Invalid GPS coordinate format."
        }

    # Policy 5: Accuracy-Aware Geofence Decision Logic
    # Case A: Inside or exactly on the geofence radius boundary
    if dist <= allowed_radius:
        if is_low_accuracy:
            # Inside radius, but GPS accuracy is worse than threshold (e.g. ±120m > 100m)
            # Do not silently accept or reject: Flag for review with clear reason and guidance
            reason = f"Low GPS accuracy: ±{round(acc_val)}m exceeds {int(accuracy_threshold)}m threshold ({int(dist)}m from {label})"
            msg = (
                f"Low GPS accuracy (±{round(acc_val)}m). Event flagged for administrative review. "
                "For improved accuracy, please move near a window, enable precise location, or use a mobile device."
            )
            return {
                "within_geofence": True,
                "distance_meters": dist,
                "radius_meters": allowed_radius,
                "geofencing_enabled": True,
                "flagged": True,
                "flag_reason": reason,
                "accuracy_meters": acc_val,
                "classification": "low_accuracy",
                "message": msg
            }
        else:
            # Confidently inside geofence
            acc_note = f" (accuracy ±{round(acc_val)}m)" if acc_val is not None else ""
            return {
                "within_geofence": True,
                "distance_meters": dist,
                "radius_meters": allowed_radius,
                "geofencing_enabled": True,
                "flagged": False,
                "flag_reason": None,
                "accuracy_meters": acc_val,
                "classification": "verified",
                "message": f"Verified within geofence: {dist}m from {label}{acc_note} (Limit: {allowed_radius}m)."
            }

    # Case B: Reported center point is outside the geofence radius (dist > allowed_radius)
    # Check if accuracy circle overlaps the geofence boundary: (dist - accuracy) <= allowed_radius
    if acc_val is not None and (dist - acc_val) <= allowed_radius:
        # Accuracy circle overlaps the boundary -> Uncertain classification rather than hard violation
        reason = (
            f"Uncertain geofence: Accuracy circle (±{round(acc_val)}m) overlaps {label} geofence "
            f"({int(dist)}m from site, limit {int(allowed_radius)}m)"
        )
        if is_low_accuracy:
            reason += f" [Low GPS accuracy: ±{round(acc_val)}m]"
            
        msg = (
            f"Uncertain location: You are {int(dist)}m from {label} with accuracy ±{round(acc_val)}m "
            f"(overlaps {int(allowed_radius)}m limit). Event flagged for administrative review. "
            "Please move near a window, enable precise location, or use a mobile device."
        )
        return {
            "within_geofence": False,
            "distance_meters": dist,
            "radius_meters": allowed_radius,
            "geofencing_enabled": True,
            "flagged": True,
            "flag_reason": reason,
            "accuracy_meters": acc_val,
            "classification": "uncertain",
            "message": msg
        }
    else:
        # Confidently outside geofence (dist - accuracy > allowed_radius, or no accuracy provided)
        excess = round(dist - allowed_radius, 1)
        reason = f"Geofence violation: {int(dist)}m from {label} (exceeds {allowed_radius}m limit by {int(excess)}m)"
        if is_low_accuracy:
            reason += f" [Low GPS accuracy: ±{round(acc_val)}m]"
            
        msg = f"Location warning: You are {int(dist)}m from {label} (allowed radius: {int(allowed_radius)}m). This event is flagged for administrative review."
        return {
            "within_geofence": False,
            "distance_meters": dist,
            "radius_meters": allowed_radius,
            "geofencing_enabled": True,
            "flagged": True,
            "flag_reason": reason,
            "accuracy_meters": acc_val,
            "classification": "violation",
            "message": msg
        }
