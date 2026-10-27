/**
 * frontend/utils/formatLocalTimestamp.js
 *
 * Exact JavaScript port of Python `config.py:format_local_timestamp`.
 * Converts any stored UTC ISO string or timestamp into the actual real
 * local date and time in the configured application timezone (defaults to Asia/Kolkata).
 *
 * Example: '2026-09-30T05:46:00Z' -> 'Sep 30, 2026 - 11:16 AM'
 */

const APP_TIMEZONE = process.env.NEXT_PUBLIC_APP_TIMEZONE || 'Asia/Kolkata';

export function formatLocalTimestamp(isoVal, includeYear = true, timeZone = APP_TIMEZONE) {
  if (!isoVal) {
    return '—';
  }

  try {
    let cleanStr = String(isoVal).trim();
    if (!cleanStr) return '—';

    // If naive ISO string without timezone offset or Z, assume UTC
    if (!cleanStr.endsWith('Z') && !/[+-]\d{2}:\d{2}$/.test(cleanStr) && !cleanStr.includes('+')) {
      cleanStr += 'Z';
    }

    const d = new Date(cleanStr);
    if (isNaN(d.getTime())) {
      return String(isoVal);
    }

    // Format using Intl.DateTimeFormat in target timezone
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timeZone,
      month: 'short',
      day: '2-digit',
      year: includeYear ? 'numeric' : undefined,
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });

    const parts = formatter.formatToParts(d);
    const getPart = (type) => parts.find((p) => p.type === type)?.value || '';

    const month = getPart('month');
    const day = getPart('day');
    const year = getPart('year');
    const hour = getPart('hour');
    const minute = getPart('minute');
    const dayPeriod = getPart('dayPeriod').toUpperCase();

    if (includeYear) {
      return `${month} ${day}, ${year} - ${hour}:${minute} ${dayPeriod}`;
    }
    return `${month} ${day} - ${hour}:${minute} ${dayPeriod}`;
  } catch (err) {
    return String(isoVal);
  }
}

export default formatLocalTimestamp;
