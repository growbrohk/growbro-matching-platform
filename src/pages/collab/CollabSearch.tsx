import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { 
  Search, 
  MapPin, 
  Calendar as CalendarIcon, 
  Map,
  ChevronDown,
  ArrowLeft
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Checkbox } from '@/components/ui/checkbox';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

type TabType = 'space' | 'brand';

const SPACE_TYPES = ['Consignment', 'Poster', 'Event Hosting'];
const BRAND_TYPES = ['Products', 'Events'];

interface DatePillProps {
  label: string;
  date?: Date;
  onSelect: (date: Date | undefined) => void;
  minDate?: Date;
}

function DatePill({ label, date, onSelect, minDate }: DatePillProps) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "w-full rounded-full h-11 justify-start text-left font-normal",
            !date && "text-muted-foreground",
            "bg-gray-50 hover:bg-gray-100 border-gray-200"
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {date ? format(date, 'MMM d, yyyy') : label}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={date}
          onSelect={(selectedDate) => {
            onSelect(selectedDate);
            setOpen(false);
          }}
          disabled={(date) => {
            const today = new Date(new Date().setHours(0, 0, 0, 0));
            if (minDate) {
              return date < minDate;
            }
            return date < today;
          }}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  );
}

interface MultiSelectProps {
  options: string[];
  selected: string[];
  placeholder: string;
  onSelectionChange: (selected: string[]) => void;
}

function MultiSelect({ options, selected, placeholder, onSelectionChange }: MultiSelectProps) {
  const [open, setOpen] = useState(false);

  const handleToggle = (option: string) => {
    if (selected.includes(option)) {
      onSelectionChange(selected.filter((s) => s !== option));
    } else {
      onSelectionChange([...selected, option]);
    }
  };

  const handleClear = () => {
    onSelectionChange([]);
  };

  const getDisplayText = () => {
    if (selected.length === 0) {
      return placeholder;
    }
    if (selected.length === 1) {
      return selected[0];
    }
    return `${selected.length} selected`;
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "w-full rounded-full h-11 justify-between text-left font-normal",
            selected.length === 0 && "text-muted-foreground",
            "bg-gray-50 hover:bg-gray-100 border-gray-200"
          )}
        >
          <span className="truncate">{getDisplayText()}</span>
          <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-2" align="start">
        <div className="space-y-1">
          {selected.length > 0 && (
            <div className="px-2 py-1.5 border-b border-gray-200 mb-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClear}
                className="h-8 text-xs text-muted-foreground hover:text-foreground"
              >
                Clear
              </Button>
            </div>
          )}
          {options.map((option) => (
            <div
              key={option}
              className="flex items-center space-x-2 px-2 py-2 rounded-md hover:bg-gray-100 cursor-pointer"
              onClick={() => handleToggle(option)}
            >
              <Checkbox
                checked={selected.includes(option)}
                onCheckedChange={() => handleToggle(option)}
              />
              <label className="text-sm font-normal cursor-pointer flex-1">
                {option}
              </label>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export default function CollabSearch() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabType>('space');
  const [location, setLocation] = useState('');
  const [startDate, setStartDate] = useState<Date | undefined>();
  const [endDate, setEndDate] = useState<Date | undefined>();
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);

  const handleTabChange = (tab: string) => {
    setActiveTab(tab as TabType);
    setSelectedTypes([]); // Reset selected types when switching tabs
  };

  const handleCurrentLocation = () => {
    setLocation('Current location');
  };

  const handleSearch = () => {
    const payload = {
      tab: activeTab,
      location,
      startDate: startDate ? format(startDate, 'yyyy-MM-dd') : undefined,
      endDate: endDate ? format(endDate, 'yyyy-MM-dd') : undefined,
      types: selectedTypes,
    };
    console.log('Search payload:', payload);
  };

  const spacePlaceholder = SPACE_TYPES.join(', ');
  const brandPlaceholder = BRAND_TYPES.join(', ');

  return (
    <div className="w-full min-h-screen flex flex-col items-center py-8" style={{ backgroundColor: 'rgba(255, 192, 203, 0.1)' }}>
      {/* Header */}
      <div className="w-full max-w-[520px] mb-6 px-4">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            className="h-10 w-10 rounded-full"
            onClick={() => navigate(-1)}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-2xl font-bold" style={{ fontFamily: "'Inter Tight', sans-serif", color: '#0F1F17' }}>
            All Collab
          </h1>
        </div>
      </div>

      {/* Main Content */}
      <div className="w-full max-w-[520px] px-4 pb-6">
        <Card className="rounded-3xl border shadow-lg p-6" style={{ backgroundColor: 'white', borderColor: 'rgba(14,122,58,0.14)' }}>
            <Tabs value={activeTab} onValueChange={handleTabChange}>
              <TabsList className="grid w-full grid-cols-2 mb-6 bg-gray-50 rounded-full p-1">
                <TabsTrigger 
                  value="space" 
                  className="rounded-full data-[state=active]:bg-white data-[state=active]:shadow-sm"
                >
                  Space
                </TabsTrigger>
                <TabsTrigger 
                  value="brand"
                  className="rounded-full data-[state=active]:bg-white data-[state=active]:shadow-sm"
                >
                  Brand
                </TabsTrigger>
              </TabsList>

              <TabsContent value="space" className="space-y-4 mt-0">
                {/* Location Search */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    type="text"
                    placeholder="Search location…"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    className="pl-10 pr-12 rounded-full h-11 bg-gray-50 border-gray-200"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-9 w-9 rounded-full"
                    onClick={handleCurrentLocation}
                  >
                    <MapPin className="h-4 w-4" />
                  </Button>
                </div>

                {/* Dates */}
                <div className="grid grid-cols-2 gap-3">
                  <DatePill
                    label="Start date"
                    date={startDate}
                    onSelect={(date) => {
                      setStartDate(date);
                      if (date && endDate && endDate < date) {
                        setEndDate(undefined);
                      }
                    }}
                  />
                  <DatePill
                    label="End date"
                    date={endDate}
                    onSelect={setEndDate}
                    minDate={startDate}
                  />
                </div>

                {/* Multi-select Types */}
                <MultiSelect
                  options={SPACE_TYPES}
                  selected={selectedTypes}
                  placeholder={spacePlaceholder}
                  onSelectionChange={setSelectedTypes}
                />
              </TabsContent>

              <TabsContent value="brand" className="space-y-4 mt-0">
                {/* Location Search */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    type="text"
                    placeholder="Search location…"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    className="pl-10 pr-12 rounded-full h-11 bg-gray-50 border-gray-200"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-9 w-9 rounded-full"
                    onClick={handleCurrentLocation}
                  >
                    <MapPin className="h-4 w-4" />
                  </Button>
                </div>

                {/* Dates */}
                <div className="grid grid-cols-2 gap-3">
                  <DatePill
                    label="Start date"
                    date={startDate}
                    onSelect={(date) => {
                      setStartDate(date);
                      if (date && endDate && endDate < date) {
                        setEndDate(undefined);
                      }
                    }}
                  />
                  <DatePill
                    label="End date"
                    date={endDate}
                    onSelect={setEndDate}
                    minDate={startDate}
                  />
                </div>

                {/* Multi-select Types */}
                <MultiSelect
                  options={BRAND_TYPES}
                  selected={selectedTypes}
                  placeholder={brandPlaceholder}
                  onSelectionChange={setSelectedTypes}
                />
              </TabsContent>
            </Tabs>

            {/* Bottom Action Row */}
            <div className="flex items-center gap-3 mt-6 pt-6 border-t" style={{ borderColor: 'rgba(14,122,58,0.12)' }}>
              <Button
                variant="outline"
                size="icon"
                className="h-11 w-11 rounded-full shrink-0"
                onClick={() => console.log('Map clicked')}
              >
                <Map className="h-5 w-5" />
              </Button>
              <Button
                onClick={handleSearch}
                className="flex-1 h-11 rounded-full font-semibold"
                style={{ backgroundColor: '#0E7A3A', color: 'white' }}
              >
                Search
              </Button>
            </div>
          </Card>
      </div>
    </div>
  );
}

