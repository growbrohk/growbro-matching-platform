import * as React from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

interface Time24PickerProps {
  value: string; // HH:mm format
  onChange: (next: string) => void;
  minuteStep?: 5 | 10 | 15;
  disabled?: boolean;
  className?: string;
  id?: string;
}

export function Time24Picker({
  value,
  onChange,
  minuteStep = 5,
  disabled = false,
  className,
  id,
}: Time24PickerProps) {
  const [hourStr = "00", minuteStr = "00"] = value ? value.split(":") : ["00", "00"];

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

  const handleHourChange = (newHour: string) => {
    onChange(`${newHour}:${minuteStr}`);
  };

  const handleMinuteChange = (newMinute: string) => {
    onChange(`${hourStr}:${newMinute}`);
  };

  return (
    <div className={cn("flex gap-2", className)} id={id}>
      <Select
        value={hourStr}
        onValueChange={handleHourChange}
        disabled={disabled}
      >
        <SelectTrigger className="w-[80px]">
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

      <Select
        value={minuteStr}
        onValueChange={handleMinuteChange}
        disabled={disabled}
      >
        <SelectTrigger className="w-[80px]">
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

