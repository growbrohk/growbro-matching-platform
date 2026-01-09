import { useState } from 'react';
import { format, parseISO, differenceInCalendarDays, startOfDay, endOfDay, isWithinInterval } from 'date-fns';
import { Calendar as CalendarIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { checkBlackoutOverlap } from '@/lib/api/poster-spaces';
import type { PosterSpace } from '@/lib/api/poster-spaces';
import type { DateRange } from 'react-day-picker';

interface PosterDatesPickerProps {
  space: PosterSpace;
  value: { startDate?: string; durationUnits: number };
  onChange: (next: { startDate?: string; durationUnits: number }) => void;
  error?: string;
}

export default function PosterDatesPicker({
  space,
  value,
  onChange,
  error,
}: PosterDatesPickerProps) {
  const [open, setOpen] = useState(false);
  const [calendarRange, setCalendarRange] = useState<DateRange | undefined>(
    value.startDate
      ? {
          from: parseISO(value.startDate),
          to: value.startDate
            ? (() => {
                const start = parseISO(value.startDate);
                const days = value.durationUnits;
                const end = new Date(start);
                end.setDate(end.getDate() + days - 1);
                return end;
              })()
            : undefined,
        }
      : undefined
  );

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Check if a date falls within any blackout range
  const isDateInBlackout = (date: Date): boolean => {
    if (!space.blackout_ranges || space.blackout_ranges.length === 0) {
      return false;
    }

    const dateStart = startOfDay(date);
    const dateEnd = endOfDay(date);

    return space.blackout_ranges.some((range) => {
      // Parse blackout dates as local dates to avoid timezone issues
      // parseISO can cause timezone issues, so we parse manually
      const [startYear, startMonth, startDay] = range.start.split('-').map(Number);
      const [endYear, endMonth, endDay] = range.end.split('-').map(Number);
      const rangeStart = startOfDay(new Date(startYear, startMonth - 1, startDay));
      const rangeEnd = endOfDay(new Date(endYear, endMonth - 1, endDay));
      
      // Check if the date falls within the blackout range (inclusive)
      return isWithinInterval(dateStart, { start: rangeStart, end: rangeEnd }) ||
             isWithinInterval(dateEnd, { start: rangeStart, end: rangeEnd });
    });
  };

  // Check if a date range overlaps with any blackout range
  const doesRangeOverlapBlackout = (from: Date, to: Date): boolean => {
    if (!space.blackout_ranges || space.blackout_ranges.length === 0) {
      return false;
    }

    const startDateStr = format(from, 'yyyy-MM-dd');
    const endDateStr = format(to, 'yyyy-MM-dd');
    return checkBlackoutOverlap(startDateStr, endDateStr, space.blackout_ranges);
  };

  const getDisplayText = () => {
    if (!value.startDate) {
      return 'Tap to select dates';
    }

    const start = parseISO(value.startDate);
    const end = new Date(start);
    end.setDate(end.getDate() + value.durationUnits - 1);

    if (value.durationUnits === 1) {
      return format(start, 'EEE, MMM d, yyyy');
    }
    return `${format(start, 'EEE, MMM d, yyyy')} | ${format(end, 'EEE, MMM d, yyyy')}`;
  };

  const handleClear = () => {
    setCalendarRange(undefined);
  };

  const handleSelect = () => {
    if (calendarRange?.from) {
      const from = calendarRange.from;
      const to = calendarRange.to || from;
      const days = differenceInCalendarDays(to, from) + 1;
      
      if (days >= 1) {
        // Check if the selected range overlaps with blackout periods
        if (doesRangeOverlapBlackout(from, to)) {
          toast.error('Selected dates include blackout period');
          return;
        }

        onChange({
          startDate: format(from, 'yyyy-MM-dd'),
          durationUnits: days,
        });
        setOpen(false);
      }
    }
  };

  // Handle calendar range selection with blackout validation
  const handleCalendarSelect = (range: DateRange | undefined) => {
    if (!range) {
      setCalendarRange(range);
      return;
    }

    // If both from and to are selected, validate the range
    if (range.from && range.to) {
      if (doesRangeOverlapBlackout(range.from, range.to)) {
        toast.error('Selected dates include blackout period');
        // Don't update the range if it overlaps
        return;
      }
    }

    setCalendarRange(range);
  };

  const isSelectDisabled = () => {
    return !calendarRange?.from;
  };

  const getUnitsLabel = () => {
    if (calendarRange?.from && calendarRange?.to) {
      const days = differenceInCalendarDays(calendarRange.to, calendarRange.from) + 1;
      return `Units: ${days}`;
    }
    return null;
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        className={cn(
          'w-full justify-start text-left font-normal',
          !value.startDate && 'text-muted-foreground',
          error && 'border-destructive'
        )}
        onClick={() => setOpen(true)}
      >
        <CalendarIcon className="mr-2 h-4 w-4" />
        {getDisplayText()}
      </Button>
      {error && (
        <p className="text-sm text-destructive mt-1">{error}</p>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-[520px] max-h-[calc(100vh-2rem)] overflow-y-auto overflow-x-hidden p-0">
          <DialogHeader className="px-6 pt-6">
            <DialogTitle>Select Dates</DialogTitle>
          </DialogHeader>

          <div className="px-6">
            <div className="mt-4">
              <div className="flex flex-col items-center space-y-4">
                <div className="w-fit mx-auto">
                  <Calendar
                    mode="range"
                    selected={calendarRange}
                    onSelect={handleCalendarSelect}
                    disabled={(date) => {
                      // Disable past dates and blackout dates
                      if (date < today) return true;
                      return isDateInBlackout(date);
                    }}
                    numberOfMonths={1}
                    className="mx-auto"
                  />
                </div>
                {getUnitsLabel() && (
                  <p className="text-sm text-muted-foreground text-center">{getUnitsLabel()}</p>
                )}
                {space.blackout_ranges && space.blackout_ranges.length > 0 && (
                  <p className="text-xs text-muted-foreground text-center mt-2">
                    Dates marked as unavailable are blackout periods
                  </p>
                )}
              </div>
            </div>
          </div>

          <DialogFooter className="px-6 pb-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={handleClear} className="w-full sm:w-auto">
              Clear
            </Button>
            <Button type="button" onClick={handleSelect} disabled={isSelectDisabled()} className="w-full sm:w-auto">
              Select
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

