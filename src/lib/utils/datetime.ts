/**
 * Centralized datetime utilities for event handling
 * 
 * Rules:
 * - DB stores timestamptz (UTC)
 * - UI displays Asia/Hong_Kong timezone
 * - HTML datetime-local input parses → UTC via helpers
 */

const TIMEZONE = 'Asia/Hong_Kong';

/**
 * Convert a UTC timestamp string to Asia/Hong_Kong timezone for display
 */
export function formatDateForDisplay(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    timeZone: TIMEZONE,
    month: 'short',
    day: 'numeric',
    weekday: 'short',
  });
}

/**
 * Format time range for display (24-hour format with en dash)
 * Example: "16:00–18:30"
 */
export function formatTimeRangeForDisplay(startString: string, endString: string): string {
  const formatTime = (date: Date) => {
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  };
  
  const start = new Date(startString);
  const end = new Date(endString);
  
  // Convert to Hong Kong timezone for display
  const startHK = new Date(start.toLocaleString('en-US', { timeZone: TIMEZONE }));
  const endHK = new Date(end.toLocaleString('en-US', { timeZone: TIMEZONE }));
  
  return `${formatTime(startHK)}–${formatTime(endHK)}`;
}

/**
 * Convert a datetime-local input value (local time) to UTC ISO string
 * This handles the conversion from HTML datetime-local input (which is in local timezone)
 * to UTC for storage in the database
 */
export function datetimeLocalToUTC(localDateTimeString: string): string {
  if (!localDateTimeString) return '';
  
  // datetime-local input gives us a string like "2024-01-15T14:30"
  // This is interpreted as local time, so we need to convert to UTC
  const localDate = new Date(localDateTimeString);
  
  // Return ISO string (UTC)
  return localDate.toISOString();
}

/**
 * Convert a UTC ISO string to datetime-local input format (local time)
 * This handles the conversion from database (UTC) to HTML datetime-local input format
 */
export function utcToDatetimeLocal(utcIsoString: string): string {
  if (!utcIsoString) return '';
  
  const date = new Date(utcIsoString);
  
  // Format as YYYY-MM-DDTHH:mm for datetime-local input
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

/**
 * Format event date as "Jan 4 (Sun)" for display
 */
export function formatEventDate(dateString: string): string {
  const date = new Date(dateString);
  const month = date.toLocaleDateString('en-US', { 
    timeZone: TIMEZONE,
    month: 'short' 
  });
  const day = date.getDate();
  const weekday = date.toLocaleDateString('en-US', { 
    timeZone: TIMEZONE,
    weekday: 'short' 
  });
  return `${month} ${day} (${weekday})`;
}

/**
 * Format event time as "16:00–18:30" (24-hour format with en dash)
 */
export function formatEventTime(startString: string, endString: string): string {
  return formatTimeRangeForDisplay(startString, endString);
}

