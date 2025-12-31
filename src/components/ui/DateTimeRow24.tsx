import * as React from "react";
import { format } from "date-fns";
import { Calendar } from "@/components/ui/calendar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { CalendarIcon } from "lucide-react";
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
  const [open, setOpen] = React.useState(false);

  // Convert UTC Date to local datetime string for display/editing
  const getLocalDateTimeString = (date: Date | null): string => {
    if (!date) return "";
    // Convert UTC to local datetime string format (YYYY-MM-DDTHH:mm)
    return utcToDatetimeLocal(date.toISOString());
  };

  const localDateTimeString = getLocalDateTimeString(value);
  const [datePart, timePart] = localDateTimeString.split("T");
  const [hourStr = "00", minuteStr = "00"] = timePart ? timePart.split(":") : ["00", "00"];

  // Generate minute options based on minuteStep
  const minuteOptions = React.useMemo(() => {
    const options: string[] = [];
    for (let i = 0; i < 60; i += minuteStep) {
      options.push(i.toString().padStart(2, "0"));
    }
    return options;
  }, [minuteStep]);

  // Generate hour options (00-23)
  const hourOptions = React.useMemo(() => {
    return Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, "0"));
  }, []);

  const handleDateSelect = (selectedDate: Date | undefined) => {
    if (!selectedDate) {
      onChange(null);
      return;
    }

    // Keep existing hour/minute, update date
    // Create local datetime string with selected date and current time
    const dateStr = format(selectedDate, "yyyy-MM-dd");
    const localDateTimeStr = `${dateStr}T${hourStr}:${minuteStr}`;
    
    // Convert local datetime string to UTC Date
    const utcString = datetimeLocalToUTC(localDateTimeStr);
    if (utcString) {
      onChange(new Date(utcString));
    }
  };

  const handleHourChange = (newHour: string) => {
    if (!value) {
      // If no date, use today
      const today = new Date();
      const dateStr = format(today, "yyyy-MM-dd");
      const localDateTimeStr = `${dateStr}T${newHour}:${minuteStr}`;
      const utcString = datetimeLocalToUTC(localDateTimeStr);
      if (utcString) {
        onChange(new Date(utcString));
      }
      return;
    }

    // Keep existing date, update hour
    // Get current local date string
    const currentLocalStr = getLocalDateTimeString(value);
    const [currentDatePart] = currentLocalStr.split("T");
    const localDateTimeStr = `${currentDatePart}T${newHour}:${minuteStr}`;
    const utcString = datetimeLocalToUTC(localDateTimeStr);
    if (utcString) {
      onChange(new Date(utcString));
    }
  };

  const handleMinuteChange = (newMinute: string) => {
    if (!value) {
      // If no date, use today
      const today = new Date();
      const dateStr = format(today, "yyyy-MM-dd");
      const localDateTimeStr = `${dateStr}T${hourStr}:${newMinute}`;
      const utcString = datetimeLocalToUTC(localDateTimeStr);
      if (utcString) {
        onChange(new Date(utcString));
      }
      return;
    }

    // Keep existing date/hour, update minute
    // Get current local date string
    const currentLocalStr = getLocalDateTimeString(value);
    const [currentDatePart] = currentLocalStr.split("T");
    const localDateTimeStr = `${currentDatePart}T${hourStr}:${newMinute}`;
    const utcString = datetimeLocalToUTC(localDateTimeStr);
    if (utcString) {
      onChange(new Date(utcString));
    }
  };

  // Get the date part for calendar (convert UTC to local Date for calendar display)
  // Calendar expects a Date object in local time
  const calendarDate = React.useMemo(() => {
    if (!value) return undefined;
    // Convert UTC to local datetime string, then parse as local Date
    const localStr = getLocalDateTimeString(value);
    const [datePart] = localStr.split("T");
    if (!datePart) return undefined;
    const [year, month, day] = datePart.split("-").map(Number);
    return new Date(year, month - 1, day);
  }, [value]);

  // Format display value (show in local time)
  const displayValue = React.useMemo(() => {
    if (!value) return "";
    const localStr = getLocalDateTimeString(value);
    const [datePart] = localStr.split("T");
    return datePart;
  }, [value]);

  return (
    <div className={cn("flex items-center gap-2", className)} id={id}>
      {/* Date picker */}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            disabled={disabled}
            className={cn(
              "w-[160px] justify-start text-left font-normal",
              !value && "text-muted-foreground"
            )}
            aria-label={ariaLabel}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {displayValue || "Select date"}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={calendarDate}
            onSelect={handleDateSelect}
            disabled={disabled}
            initialFocus
          />
        </PopoverContent>
      </Popover>

      {/* Hour dropdown */}
      <Select
        value={hourStr}
        onValueChange={handleHourChange}
        disabled={disabled || !value}
      >
        <SelectTrigger className="w-[72px]">
          <SelectValue placeholder="HH" />
        </SelectTrigger>
        <SelectContent>
          {hourOptions.map((hour) => (
            <SelectItem key={hour} value={hour}>
              {hour}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Separator */}
      <span className="text-muted-foreground">:</span>

      {/* Minute dropdown */}
      <Select
        value={minuteStr}
        onValueChange={handleMinuteChange}
        disabled={disabled || !value}
      >
        <SelectTrigger className="w-[72px]">
          <SelectValue placeholder="mm" />
        </SelectTrigger>
        <SelectContent>
          {minuteOptions.map((minute) => (
            <SelectItem key={minute} value={minute}>
              {minute}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
