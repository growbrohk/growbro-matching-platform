import * as React from "react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { utcToDatetimeLocal, datetimeLocalToUTC } from "@/lib/utils/datetime";

interface DateTimeRow24Props {
  value: Date | null;
  onChange: (next: Date | null) => void;
  minuteStep?: number;
  disabled?: boolean;
  ariaLabel?: string;
  min?: Date;
  max?: Date;
  className?: string;
  id?: string;
}

export function DateTimeRow24({
  value,
  onChange,
  minuteStep = 5,
  disabled = false,
  ariaLabel,
  min,
  max,
  className,
  id,
}: DateTimeRow24Props) {
  // Convert UTC Date to local datetime string for display/editing
  const getLocalDateTimeString = (date: Date | null): string => {
    if (!date) return "";
    // Convert UTC to local datetime string format (YYYY-MM-DDTHH:mm)
    return utcToDatetimeLocal(date.toISOString());
  };

  const localDateTimeString = getLocalDateTimeString(value);
  const [datePart = "", timePart = ""] = localDateTimeString.split("T");

  // Get min/max as local datetime strings for input constraints
  const minDateStr = React.useMemo(() => {
    if (!min) return undefined;
    const localStr = getLocalDateTimeString(min);
    return localStr.split("T")[0];
  }, [min]);

  const maxDateStr = React.useMemo(() => {
    if (!max) return undefined;
    const localStr = getLocalDateTimeString(max);
    return localStr.split("T")[0];
  }, [max]);

  const minTimeStr = React.useMemo(() => {
    if (!min) return undefined;
    const localStr = getLocalDateTimeString(min);
    return localStr.split("T")[1]?.substring(0, 5); // HH:MM
  }, [min]);

  const maxTimeStr = React.useMemo(() => {
    if (!max) return undefined;
    const localStr = getLocalDateTimeString(max);
    return localStr.split("T")[1]?.substring(0, 5); // HH:MM
  }, [max]);

  // Clamp a date+time combination to min/max bounds
  const clampDateTime = React.useCallback(
    (dateStr: string, timeStr: string): Date | null => {
      const localDateTimeStr = `${dateStr}T${timeStr}`;
      const utcString = datetimeLocalToUTC(localDateTimeStr);
      if (!utcString) return null;

      let resultDate = new Date(utcString);

      // Clamp to min if provided
      if (min && resultDate < min) {
        resultDate = new Date(min);
      }

      // Clamp to max if provided
      if (max && resultDate > max) {
        resultDate = new Date(max);
      }

      return resultDate;
    },
    [min, max]
  );

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newDateStr = e.target.value;
    if (!newDateStr) {
      onChange(null);
      return;
    }

    // Keep existing time, or default to 00:00 if no time selected
    const currentTimeStr = timePart || "00:00";
    const clampedDate = clampDateTime(newDateStr, currentTimeStr);
    if (clampedDate) {
      onChange(clampedDate);
    }
  };

  const handleTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTimeStr = e.target.value;
    if (!newTimeStr) {
      // If time is cleared, keep date but set time to 00:00
      if (datePart) {
        const clampedDate = clampDateTime(datePart, "00:00");
        if (clampedDate) {
          onChange(clampedDate);
        }
      }
      return;
    }

    // Keep existing date, or use today if no date
    const currentDateStr = datePart || format(new Date(), "yyyy-MM-dd");
    const clampedDate = clampDateTime(currentDateStr, newTimeStr);
    if (clampedDate) {
      onChange(clampedDate);
    }
  };

  // Calculate time input constraints based on selected date
  const timeInputMin = React.useMemo(() => {
    if (!minTimeStr || !datePart || !minDateStr) return undefined;
    // Only restrict time if the selected date matches the min date
    if (datePart === minDateStr) return minTimeStr;
    return undefined;
  }, [datePart, minDateStr, minTimeStr]);

  const timeInputMax = React.useMemo(() => {
    if (!maxTimeStr || !datePart || !maxDateStr) return undefined;
    // Only restrict time if the selected date matches the max date
    if (datePart === maxDateStr) return maxTimeStr;
    return undefined;
  }, [datePart, maxDateStr, maxTimeStr]);

  return (
    <div className={cn("flex gap-3 w-full", className)} id={id}>
      {/* Date input */}
      <input
        type="date"
        value={datePart}
        onChange={handleDateChange}
        disabled={disabled}
        min={minDateStr}
        max={maxDateStr}
        aria-label={ariaLabel ? `${ariaLabel} date` : undefined}
        className={cn(
          "h-12 rounded-2xl border-2 px-4 text-base bg-[#FBF8F4] border-[rgba(14,122,58,0.14)]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          "disabled:cursor-not-allowed disabled:opacity-50",
          "flex-1",
          !value && "text-muted-foreground"
        )}
      />

      {/* Time input */}
      <input
        type="time"
        step={minuteStep * 60}
        value={timePart}
        onChange={handleTimeChange}
        disabled={disabled || !datePart}
        min={timeInputMin}
        max={timeInputMax}
        aria-label={ariaLabel ? `${ariaLabel} time` : undefined}
        className={cn(
          "h-12 rounded-2xl border-2 px-4 text-base bg-[#FBF8F4] border-[rgba(14,122,58,0.14)]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          "disabled:cursor-not-allowed disabled:opacity-50",
          "flex-1"
        )}
      />
    </div>
  );
}
