-- Migration 009: Add checkin_checkout_distance_meters to attendance_events and attendance tables
ALTER TABLE attendance_events ADD COLUMN checkin_checkout_distance_meters REAL DEFAULT NULL;
ALTER TABLE attendance ADD COLUMN checkin_checkout_distance_meters REAL DEFAULT NULL;

