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

/**
 * Format multi-day event display
 * 1-day: "Fri 6 Dec, 18:00–22:00"
 * 2-day: "Fri 6 Dec 18:00–22:00, Sat 7 Dec 14:00–20:00"
 */
export function formatEventDateTimeMultiDay(
  startAt: string,
  endAt: string,
  day2StartAt?: string | null,
  day2EndAt?: string | null
): string {
  const day1 = `${formatEventDate(startAt)} ${formatEventTime(startAt, endAt)}`;
  if (!day2StartAt || !day2EndAt) {
    return day1;
  }
  const day2 = `${formatEventDate(day2StartAt)} ${formatEventTime(day2StartAt, day2EndAt)}`;
  return `${day1}, ${day2}`;
}

/**
 * Format date/time for a ticket type based on valid_for_days
 * - day_1: Day 1 range (e.g., "Fri 6 Dec 18:00–22:00")
 * - day_2: Day 2 range (e.g., "Sat 7 Dec 14:00–20:00")
 * - both: Both ranges
 * - Default/1-day event: Day 1 range
 */
export function formatTicketTypeDateTime(
  event: { start_at: string; end_at: string; day_2_start_at?: string | null; day_2_end_at?: string | null },
  ticketType: { valid_for_days?: 'day_1' | 'day_2' | 'both' }
): string {
  const validFor = ticketType.valid_for_days || 'day_1';
  const hasDay2 = !!(event.day_2_start_at && event.day_2_end_at);

  if (!hasDay2 || validFor === 'day_1') {
    return `${formatEventDate(event.start_at)} ${formatEventTime(event.start_at, event.end_at)}`;
  }
  if (validFor === 'day_2') {
    return `${formatEventDate(event.day_2_start_at!)} ${formatEventTime(event.day_2_start_at!, event.day_2_end_at!)}`;
  }
  // both
  const day1 = `${formatEventDate(event.start_at)} ${formatEventTime(event.start_at, event.end_at)}`;
  const day2 = `${formatEventDate(event.day_2_start_at!)} ${formatEventTime(event.day_2_start_at!, event.day_2_end_at!)}`;
  return `${day1}, ${day2}`;
}

/**
 * Format message time for WhatsApp-style display
 * - If today: "11:27 PM" (12-hour format)
 * - Else: "Jan 10" (short date format)
 */
export function formatMessageTime(dateString: string): string {
  if (!dateString) return '';
  
  const date = new Date(dateString);
  const now = new Date();
  
  // Convert both to Hong Kong timezone for comparison
  const dateHK = new Date(date.toLocaleString('en-US', { timeZone: TIMEZONE }));
  const nowHK = new Date(now.toLocaleString('en-US', { timeZone: TIMEZONE }));
  
  // Check if same day
  const isToday = 
    dateHK.getDate() === nowHK.getDate() &&
    dateHK.getMonth() === nowHK.getMonth() &&
    dateHK.getFullYear() === nowHK.getFullYear();
  
  if (isToday) {
    // Format as 12-hour time: "11:27 PM"
    return dateHK.toLocaleTimeString('en-US', {
      timeZone: TIMEZONE,
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  } else {
    // Format as short date: "Jan 10"
    return dateHK.toLocaleDateString('en-US', {
      timeZone: TIMEZONE,
      month: 'short',
      day: 'numeric',
    });
  }
}

/**
 * Format ticket date/time in the format: "FRIDAY 23RD SEPTEMBER 19:30"
 * Example output: "FRIDAY 23RD SEPTEMBER 19:30"
 */
export function formatTicketDateTime(dateString: string): string {
  if (!dateString) return '';
  
  const date = new Date(dateString);
  
  // Convert to Hong Kong timezone for all date parts
  const hkDateStr = date.toLocaleString('en-US', { timeZone: TIMEZONE });
  const hkDate = new Date(hkDateStr);
  
  // Get weekday (uppercase)
  const weekday = hkDate.toLocaleDateString('en-US', {
    weekday: 'long',
  }).toUpperCase();
  
  // Get day with ordinal suffix
  const day = hkDate.getDate();
  const getOrdinalSuffix = (n: number): string => {
    const j = n % 10;
    const k = n % 100;
    if (j === 1 && k !== 11) return 'ST';
    if (j === 2 && k !== 12) return 'ND';
    if (j === 3 && k !== 13) return 'RD';
    return 'TH';
  };
  const dayWithOrdinal = `${day}${getOrdinalSuffix(day)}`;
  
  // Get month (uppercase)
  const month = hkDate.toLocaleDateString('en-US', {
    month: 'long',
  }).toUpperCase();
  
  // Get time (HH:mm format)
  const hours = hkDate.getHours().toString().padStart(2, '0');
  const minutes = hkDate.getMinutes().toString().padStart(2, '0');
  const time = `${hours}:${minutes}`;
  
  return `${weekday} ${dayWithOrdinal} ${month} ${time}`;
}

