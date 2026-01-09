# Why "Selected dates overlap with a blackout period" Error Appears

## Error Location

The error message **"Selected dates overlap with a blackout period"** is set in:
- **File**: `src/pages/public/PublicPosterSpaceRequest.tsx`
- **Line**: 221

## Code Flow

### 1. User Submits Form
When the user clicks "Submit Request", the `handleSubmit` function is called:

```typescript:231:234:src/pages/public/PublicPosterSpaceRequest.tsx
const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();

  if (!validate() || !space || !spaceParam) return;
```

### 2. Validation Function Runs
The `validate()` function checks all form fields, including blackout overlap:

```typescript:169:225:src/pages/public/PublicPosterSpaceRequest.tsx
// Check blackout overlap
if (space && formData.requested_start_date && formData.duration_units) {
  const endDate = computeEndDate(
    formData.requested_start_date,
    space.booking_unit,
    formData.duration_units
  );
  
  // ... debug logs ...
  
  const hasOverlap = checkBlackoutOverlap(formData.requested_start_date, endDate, space.blackout_ranges);
  
  if (hasOverlap) {
    // ... find overlapping range ...
    newErrors.requested_start_date = 'Selected dates overlap with a blackout period';
  }
}
```

### 3. End Date Computation
The `computeEndDate` function calculates the end date based on:
- `requested_start_date`: The start date selected by the user
- `booking_unit`: 'day', 'week', or 'month'
- `duration_units`: Number of units

```typescript:477:505:src/lib/api/poster-spaces.ts
export function computeEndDate(
  startDate: string,
  bookingUnit: 'week' | 'day' | 'month',
  durationUnits: number
): string {
  const start = parseLocalDate(startDate);
  let end: Date;

  switch (bookingUnit) {
    case 'day':
      end = new Date(start);
      end.setDate(end.getDate() + durationUnits - 1);
      break;
    case 'week':
      end = new Date(start);
      end.setDate(end.getDate() + durationUnits * 7 - 1);
      break;
    case 'month':
      end = new Date(start);
      end.setMonth(end.getMonth() + durationUnits);
      end.setDate(end.getDate() - 1);
      break;
  }

  return formatLocalDate(end);
}
```

**Important**: Note that for all booking units, the end date is calculated as `start + duration - 1`. This means:
- If booking_unit is 'day' and duration_units is 1, end date = start date
- If booking_unit is 'day' and duration_units is 3, end date = start date + 2 days

### 4. Blackout Overlap Check
The `checkBlackoutOverlap` function checks if the requested date range overlaps with any blackout ranges:

```typescript:511:538:src/lib/api/poster-spaces.ts
export function checkBlackoutOverlap(
  startDate: string,
  endDate: string,
  blackoutRanges: Array<{ start: string; end: string }>
): boolean {
  if (!blackoutRanges || blackoutRanges.length === 0) {
    return false;
  }

  // Parse as local dates to avoid timezone issues
  const start = parseLocalDate(startDate);
  const end = parseLocalDate(endDate);

  // Set to start/end of day for inclusive comparison
  const startOfDay = new Date(start.getFullYear(), start.getMonth(), start.getDate(), 0, 0, 0, 0);
  const endOfDay = new Date(end.getFullYear(), end.getMonth(), end.getDate(), 23, 59, 59, 999);

  return blackoutRanges.some((range) => {
    const rangeStart = parseLocalDate(range.start);
    const rangeEnd = parseLocalDate(range.end);
    
    const rangeStartOfDay = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), rangeStart.getDate(), 0, 0, 0, 0);
    const rangeEndOfDay = new Date(rangeEnd.getFullYear(), rangeEnd.getMonth(), rangeEnd.getDate(), 23, 59, 59, 999);
    
    // Check for overlap: ranges overlap if start <= rangeEnd && end >= rangeStart (inclusive)
    return startOfDay <= rangeEndOfDay && endOfDay >= rangeStartOfDay;
  });
}
```

## Overlap Detection Logic

The overlap check uses this formula:
```
startOfDay <= rangeEndOfDay && endOfDay >= rangeStartOfDay
```

This means an overlap is detected if:
- The requested start date is **before or equal to** the blackout end date, **AND**
- The requested end date is **after or equal to** the blackout start date

### Example Scenarios

**Scenario 1: Direct Overlap**
- Requested: Jan 10 - Jan 15
- Blackout: Jan 12 - Jan 14
- Result: ✅ Overlap detected (Jan 12-14 is within Jan 10-15)

**Scenario 2: Requested Range Starts Before Blackout**
- Requested: Jan 10 - Jan 15
- Blackout: Jan 12 - Jan 20
- Result: ✅ Overlap detected (Jan 12-15 overlaps)

**Scenario 3: Requested Range Ends After Blackout**
- Requested: Jan 10 - Jan 15
- Blackout: Jan 5 - Jan 12
- Result: ✅ Overlap detected (Jan 10-12 overlaps)

**Scenario 4: Requested Range Completely Within Blackout**
- Requested: Jan 12 - Jan 14
- Blackout: Jan 10 - Jan 20
- Result: ✅ Overlap detected (entire range is within blackout)

**Scenario 5: No Overlap**
- Requested: Jan 10 - Jan 15
- Blackout: Jan 20 - Jan 25
- Result: ❌ No overlap

**Scenario 6: Boundary Case - Adjacent Dates**
- Requested: Jan 10 - Jan 15
- Blackout: Jan 16 - Jan 20
- Result: ❌ No overlap (dates are adjacent, not overlapping)

**Scenario 7: Boundary Case - Same End Date**
- Requested: Jan 10 - Jan 15
- Blackout: Jan 15 - Jan 20
- Result: ✅ Overlap detected (Jan 15 is included in both ranges)

## How to Debug

The code includes debug logging that will help you understand what's happening. When you submit the form, check the browser console for:

1. **`[Blackout Validation]`** - Shows:
   - Raw requested start date
   - Computed end date
   - Duration units and booking unit
   - All blackout ranges with parsed dates

2. **`[Blackout Validation] Overlap detected`** - Shows:
   - Which specific blackout range is causing the overlap

### Steps to Debug:

1. Open browser DevTools (F12 or Cmd+Option+I)
2. Go to the Console tab
3. Submit the booking request form
4. Look for `[Blackout Validation]` logs
5. Compare the requested date range with the blackout ranges

### Example Console Output:

```javascript
[Blackout Validation] {
  requested_start_date: {
    raw: "2025-02-10",
    parsed_local: "2025-02-10T00:00:00.000Z"
  },
  computed_end_date: {
    raw: "2025-02-12",
    parsed_local: "2025-02-12T00:00:00.000Z"
  },
  duration_units: 3,
  booking_unit: "day",
  blackout_ranges: [
    {
      start: { raw: "2025-02-11", parsed_local: "2025-02-11T00:00:00.000Z" },
      end: { raw: "2025-02-13", parsed_local: "2025-02-13T00:00:00.000Z" }
    }
  ]
}

[Blackout Validation] Overlap detected {
  overlapping_range: {
    start: "2025-02-11",
    end: "2025-02-13"
  }
}
```

## Common Issues

### Issue 1: End Date Calculation
The end date is calculated as `start + duration - 1`. If you expect the end date to be `start + duration`, this could cause confusion.

**Example:**
- Start: 2025-02-10
- Duration: 3 days
- Computed End: 2025-02-12 (not 2025-02-13)
- This covers: Feb 10, 11, 12 (3 days total)

### Issue 2: Inclusive Boundary Dates
The overlap check is **inclusive** on both ends. If a blackout period ends on the same day the request starts, it's considered an overlap.

**Example:**
- Requested: Jan 15 - Jan 20
- Blackout: Jan 10 - Jan 15
- Result: ✅ Overlap (Jan 15 is in both ranges)

### Issue 3: Date Format Issues
All dates should be in `YYYY-MM-DD` format. If dates are stored or parsed incorrectly, this could cause false positives.

### Issue 4: Timezone Issues
The code uses `parseLocalDate` to avoid timezone issues, but if dates are being converted to UTC or other timezones elsewhere, this could cause problems.

## How to Fix

If the error is appearing incorrectly:

1. **Check the console logs** to see what dates are being compared
2. **Verify blackout ranges** in the database/space configuration
3. **Check if dates are being modified** between selection and validation
4. **Verify the booking_unit and duration_units** are correct

If you need to adjust the overlap logic, modify the `checkBlackoutOverlap` function in `src/lib/api/poster-spaces.ts`.

