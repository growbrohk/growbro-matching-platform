import { useState, useRef } from 'react';
import { format, parseISO, differenceInCalendarDays, addMonths, startOfMonth } from 'date-fns';
import { Calendar as CalendarIcon, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import type { PosterSpace } from '@/lib/api/poster-spaces';
import type { DateRange } from 'react-day-picker';

interface PosterDatesPickerProps {
  space: PosterSpace;
  value: { startDate?: string; durationUnits: number };
  onChange: (next: { startDate?: string; durationUnits: number }) => void;
  error?: string;
}

type FlexibleDuration = '3 nights' | '1 week' | '1 month';

export default function PosterDatesPicker({
  space,
  value,
  onChange,
  error,
}: PosterDatesPickerProps) {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'calendar' | 'flexible'>('calendar');
  const monthRowRef = useRef<HTMLDivElement | null>(null);

  // Calendar tab state
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

  // Flexible tab state
  const [flexibleDuration, setFlexibleDuration] = useState<FlexibleDuration | null>(null);
  const [flexibleMonth, setFlexibleMonth] = useState<Date | null>(null);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Generate next 12 months for flexible tab
  const months = Array.from({ length: 12 }, (_, i) => {
    const month = addMonths(today, i);
    return startOfMonth(month);
  });

  const getDisplayText = () => {
    if (!value.startDate) {
      return 'Tap to select dates';
    }

    const start = parseISO(value.startDate);
    const end = new Date(start);
    end.setDate(end.getDate() + value.durationUnits - 1);

    if (flexibleDuration && flexibleMonth) {
      // Flexible mode display
      const monthStr = format(flexibleMonth, 'MMM yyyy');
      return `${monthStr} · ${flexibleDuration} (Flexible)`;
    }

    // Calendar mode display
    if (value.durationUnits === 1) {
      return format(start, 'EEE, MMM d, yyyy');
    }
    return `${format(start, 'EEE, MMM d, yyyy')} | ${format(end, 'EEE, MMM d, yyyy')}`;
  };

  const mapFlexibleToConcrete = (
    duration: FlexibleDuration,
    month: Date
  ): { startDate: string; durationUnits: number } => {
    const startDate = format(startOfMonth(month), 'yyyy-MM-dd');

    let durationUnits: number;
    switch (duration) {
      case '3 nights':
        durationUnits = 3;
        break;
      case '1 week':
        if (space.booking_unit === 'week') {
          durationUnits = 1;
        } else {
          durationUnits = 7;
        }
        break;
      case '1 month':
        if (space.booking_unit === 'month') {
          durationUnits = 1;
        } else {
          durationUnits = 30;
        }
        break;
    }

    return { startDate, durationUnits };
  };

  const handleClear = () => {
    setCalendarRange(undefined);
    setFlexibleDuration(null);
    setFlexibleMonth(null);
  };

  const handleSelect = () => {
    if (activeTab === 'calendar') {
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
    } else {
      // Flexible tab
      if (flexibleDuration && flexibleMonth) {
        const concrete = mapFlexibleToConcrete(flexibleDuration, flexibleMonth);
        onChange(concrete);
        setOpen(false);
      }
    }
  };

  const isSelectDisabled = () => {
    if (activeTab === 'calendar') {
      return !calendarRange?.from;
    } else {
      return !flexibleDuration || !flexibleMonth;
    }
  };

  const getUnitsLabel = () => {
    if (activeTab === 'calendar' && calendarRange?.from && calendarRange?.to) {
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
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'calendar' | 'flexible')}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="calendar">Calendar</TabsTrigger>
                <TabsTrigger value="flexible">Flexible</TabsTrigger>
              </TabsList>

              <TabsContent value="calendar" className="mt-4">
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
              </TabsContent>

              <TabsContent value="flexible" className="mt-4 overflow-x-hidden">
                <div className="space-y-4">
                  <div>
                    <p className="text-sm font-medium mb-2">Duration</p>
                    <div className="flex flex-wrap gap-2">
                      {(['3 nights', '1 week', '1 month'] as FlexibleDuration[]).map((duration) => (
                        <Button
                          key={duration}
                          type="button"
                          variant={flexibleDuration === duration ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => setFlexibleDuration(duration)}
                        >
                          {duration}
                        </Button>
                      ))}
                    </div>
                  </div>

                  <div className="relative">
                    <p className="text-sm font-medium mb-2">Month</p>
                    <div
                      ref={monthRowRef}
                      className="flex gap-2 overflow-x-auto whitespace-nowrap pb-2 -mx-1 px-1"
                    >
                      {months.map((month, idx) => (
                        <Button
                          key={idx}
                          type="button"
                          variant={
                            flexibleMonth &&
                            format(flexibleMonth, 'yyyy-MM') === format(month, 'yyyy-MM')
                              ? 'default'
                              : 'outline'
                          }
                          size="sm"
                          onClick={() => setFlexibleMonth(month)}
                          className="shrink-0 min-w-[110px]"
                        >
                          {format(month, 'MMM yyyy')}
                        </Button>
                      ))}
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-0 top-8 min-w-[40px]"
                      onClick={() => {
                        monthRowRef.current?.scrollBy({ left: 220, behavior: 'smooth' });
                      }}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </TabsContent>
            </Tabs>
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

