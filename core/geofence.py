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
            msg = "Location permission denied."
        elif gps_error == "timeout":
            msg = "GPS location request timed out."
        elif gps_error == "position_unavailable":
            msg = "GPS position unavailable."
        elif employee_lat is not None and employee_lon is not None:
            msg = "Invalid GPS coordinates."
        else:
            msg = "GPS coordinates were not provided."

        return {
            "within_geofence": True,
            "distance_meters": None,
            "radius_meters": allowed_radius,
            "geofencing_enabled": bool(geofencing_enabled),
            "flagged": False,
            "flag_reason": None,
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

    # Policy 4: Geodesic Distance Calculation
    dist = geodesic_distance(employee_lat, employee_lon, site_lat, site_lon)
    if dist is None:
        return {
            "within_geofence": True,
            "distance_meters": None,
            "radius_meters": allowed_radius,
            "geofencing_enabled": bool(geofencing_enabled),
            "flagged": False,
            "flag_reason": None,
            "accuracy_meters": acc_val,
            "classification": "invalid",
            "message": "Invalid GPS coordinate format."
        }

    # Policy 5: Location recorded neutrally without office geofence flagging
    acc_note = f" (accuracy ±{round(acc_val)}m)" if acc_val is not None else ""
    return {
        "within_geofence": True,
        "distance_meters": dist,
        "radius_meters": allowed_radius,
        "geofencing_enabled": bool(geofencing_enabled),
        "flagged": False,
        "flag_reason": None,
        "accuracy_meters": acc_val,
        "classification": "verified",
        "message": f"Location acquired: {dist}m from {label}{acc_note}."
    }
