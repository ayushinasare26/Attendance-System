-- migrations/006_add_gps_accuracy_and_geocode_cache.sql
-- Add accuracy_meters column to attendance_events and attendance tables
-- Create geocode_cache table for serverless-resilient reverse geocode caching

ALTER TABLE attendance_events ADD COLUMN accuracy_meters REAL;
ALTER TABLE attendance ADD COLUMN accuracy_meters REAL;

CREATE TABLE IF NOT EXISTS geocode_cache (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cache_key TEXT UNIQUE NOT NULL,
    address TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_geocode_cache_key ON geocode_cache(cache_key);
