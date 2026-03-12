import * as React from "react";
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
  // Convert UTC Date to local datetime string for display/editing (YYYY-MM-DDTHH:mm)
  const getLocalDateTimeString = (date: Date | null): string => {
    if (!date) return "";
    return utcToDatetimeLocal(date.toISOString());
  };

  const localDateTimeString = getLocalDateTimeString(value);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    if (!newValue) {
      onChange(null);
      return;
    }

    const utcString = datetimeLocalToUTC(newValue);
    if (!utcString) return;

    let resultDate = new Date(utcString);

    if (min && resultDate < min) {
      resultDate = new Date(min);
    }
    if (max && resultDate > max) {
      resultDate = new Date(max);
    }

    onChange(resultDate);
  };

  return (
    <div className={cn("w-full min-w-0", className)} id={id}>
      <input
        type="datetime-local"
        value={localDateTimeString}
        onChange={handleChange}
        disabled={disabled}
        step={minuteStep * 60}
        min={min ? getLocalDateTimeString(min) : undefined}
        max={max ? getLocalDateTimeString(max) : undefined}
        aria-label={ariaLabel}
        className={cn(
          "h-10 w-full min-w-0 rounded-2xl border-2 px-3 text-sm bg-[#FBF8F4] border-[rgba(14,122,58,0.14)]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          "disabled:cursor-not-allowed disabled:opacity-50",
          !value && "text-muted-foreground"
        )}
      />
    </div>
  );
}
