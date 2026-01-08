import { useState } from 'react';
import { format, parseISO, differenceInCalendarDays } from 'date-fns';
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
        onChange({
          startDate: format(from, 'yyyy-MM-dd'),
          durationUnits: days,
        });
        setOpen(false);
      }
    }
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
                    onSelect={setCalendarRange}
                    disabled={(date) => date < today}
                    numberOfMonths={1}
                    className="mx-auto"
                  />
                </div>
                {getUnitsLabel() && (
                  <p className="text-sm text-muted-foreground text-center">{getUnitsLabel()}</p>
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

