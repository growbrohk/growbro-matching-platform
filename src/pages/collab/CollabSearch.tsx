import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { 
  Search, 
  MapPin, 
  Calendar as CalendarIcon, 
  Map,
  ChevronDown,
  ArrowLeft,
  Loader2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Checkbox } from '@/components/ui/checkbox';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { useTypeDefinitions } from '@/hooks/use-type-definitions';
import type { TypeDefinition } from '@/lib/api/type-definitions';

type TabType = 'space' | 'brand';

// Fallback values for backward compatibility
const FALLBACK_SPACE_TYPES: TypeDefinition[] = [
  { id: '1', domain: 'space_type', value: 'consignment', label: 'Consignment', parent_domain: null, parent_value: null, db_table: 'poster_spaces', db_column: 'category', db_values: ['consignment_shelf', 'shelf', 'booth', 'counter'], sort_order: 1, active: true, created_at: '', updated_at: '' },
  { id: '2', domain: 'space_type', value: 'promotion', label: 'Promotion', parent_domain: null, parent_value: null, db_table: 'poster_spaces', db_column: 'category', db_values: ['poster_space', 'cup_sleeve_promotion'], sort_order: 2, active: true, created_at: '', updated_at: '' },
  { id: '3', domain: 'space_type', value: 'event', label: 'Event Hosting', parent_domain: null, parent_value: null, db_table: 'poster_spaces', db_column: 'category', db_values: ['event_hosting'], sort_order: 3, active: true, created_at: '', updated_at: '' },
];

const FALLBACK_BRAND_TYPES: TypeDefinition[] = [
  { id: '4', domain: 'brand_type', value: 'product', label: 'Product', parent_domain: null, parent_value: null, db_table: 'products', db_column: 'type', db_values: ['physical'], sort_order: 1, active: true, created_at: '', updated_at: '' },
  { id: '5', domain: 'brand_type', value: 'event', label: 'Event', parent_domain: null, parent_value: null, db_table: 'events', db_column: null, db_values: [], sort_order: 2, active: true, created_at: '', updated_at: '' },
];

const FALLBACK_PROMOTION_TYPES: TypeDefinition[] = [
  { id: '6', domain: 'promotion_type', value: 'poster', label: 'Poster', parent_domain: 'space_type', parent_value: 'promotion', db_table: 'poster_spaces', db_column: 'category', db_values: ['poster_space'], sort_order: 1, active: true, created_at: '', updated_at: '' },
  { id: '7', domain: 'promotion_type', value: 'cupsleeve', label: 'Cupsleeve', parent_domain: 'space_type', parent_value: 'promotion', db_table: 'poster_spaces', db_column: 'category', db_values: ['cup_sleeve_promotion'], sort_order: 2, active: true, created_at: '', updated_at: '' },
];

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
            "w-full rounded-full h-12 sm:h-14 justify-start text-left font-normal min-w-0",
            !date && "text-muted-foreground",
            "bg-gray-50 hover:bg-gray-100 border-gray-200"
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
          <span className="truncate">{date ? format(date, 'MMM d, yyyy') : label}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0 max-w-[calc(100vw-2rem)]" align="start">
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
  options: TypeDefinition[];
  selected: string[]; // Selected values (not labels)
  placeholder: string;
  onSelectionChange: (selected: string[]) => void;
  loading?: boolean;
}

function MultiSelect({ options, selected, placeholder, onSelectionChange, loading }: MultiSelectProps) {
  const [open, setOpen] = useState(false);

  const handleToggle = (value: string) => {
    if (selected.includes(value)) {
      onSelectionChange(selected.filter((s) => s !== value));
    } else {
      onSelectionChange([...selected, value]);
    }
  };

  const handleClear = () => {
    onSelectionChange([]);
  };

  const getDisplayText = () => {
    if (loading) {
      return 'Loading types...';
    }
    if (selected.length === 0) {
      return placeholder;
    }
    if (selected.length === 1) {
      const option = options.find((opt) => opt.value === selected[0]);
      return option?.label || selected[0];
    }
    return `${selected.length} selected`;
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          disabled={loading}
          className={cn(
            "w-full rounded-full h-12 sm:h-14 justify-between text-left font-normal min-w-0",
            selected.length === 0 && "text-muted-foreground",
            "bg-gray-50 hover:bg-gray-100 border-gray-200"
          )}
        >
          <span className="truncate min-w-0">{getDisplayText()}</span>
          {loading ? (
            <Loader2 className="ml-2 h-4 w-4 shrink-0 animate-spin opacity-50" />
          ) : (
            <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] max-w-[calc(100vw-2rem)] p-2" align="start">
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
          {loading ? (
            <div className="px-2 py-4 text-center text-sm text-muted-foreground">
              Loading...
            </div>
          ) : options.length === 0 ? (
            <div className="px-2 py-4 text-center text-sm text-muted-foreground">
              No options available
            </div>
          ) : (
            options.map((option) => (
              <div
                key={option.value}
                className="flex items-center space-x-2 px-2 py-2 rounded-md hover:bg-gray-100 cursor-pointer"
                onClick={() => handleToggle(option.value)}
              >
                <Checkbox
                  checked={selected.includes(option.value)}
                  onCheckedChange={() => handleToggle(option.value)}
                />
                <label className="text-sm font-normal cursor-pointer flex-1">
                  {option.label}
                </label>
              </div>
            ))
          )}
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
  const [selectedSpaceTypes, setSelectedSpaceTypes] = useState<string[]>([]);
  const [selectedPromoTypes, setSelectedPromoTypes] = useState<string[]>([]);
  const [selectedBrandTypes, setSelectedBrandTypes] = useState<string[]>([]);

  // Fetch type definitions
  const { typeDefinitions: spaceTypes, loading: loadingSpaceTypes } = useTypeDefinitions({
    domain: 'space_type',
    fallback: FALLBACK_SPACE_TYPES,
  });

  const { typeDefinitions: promoTypes, loading: loadingPromoTypes } = useTypeDefinitions({
    domain: 'promotion_type',
    parent_domain: 'space_type',
    parent_value: 'promotion',
    fallback: FALLBACK_PROMOTION_TYPES,
  });

  const { typeDefinitions: brandTypes, loading: loadingBrandTypes } = useTypeDefinitions({
    domain: 'brand_type',
    fallback: FALLBACK_BRAND_TYPES,
  });

  // Show promotion dropdown only if promotion is selected
  const showPromotionDropdown = selectedSpaceTypes.includes('promotion');

  const handleTabChange = (tab: string) => {
    setActiveTab(tab as TabType);
    setSelectedSpaceTypes([]);
    setSelectedPromoTypes([]);
    setSelectedBrandTypes([]);
  };

  const handleCurrentLocation = () => {
    setLocation('Current location');
  };

  const handleSearch = () => {
    // Build query params
    const params = new URLSearchParams();
    params.set('tab', activeTab);
    if (location) params.set('location', location);
    if (startDate) params.set('start', format(startDate, 'yyyy-MM-dd'));
    if (endDate) params.set('end', format(endDate, 'yyyy-MM-dd'));
    if (selectedSpaceTypes.length > 0) params.set('types', selectedSpaceTypes.join(','));
    if (selectedPromoTypes.length > 0) params.set('promoTypes', selectedPromoTypes.join(','));
    if (selectedBrandTypes.length > 0) params.set('brandTypes', selectedBrandTypes.join(','));

    // Navigate to results page
    navigate(`/collab/results?${params.toString()}`);
  };

  const spacePlaceholder = spaceTypes.length > 0 
    ? spaceTypes.map((t) => t.label).join(', ')
    : 'Select space types...';
  const brandPlaceholder = brandTypes.length > 0
    ? brandTypes.map((t) => t.label).join(', ')
    : 'Select brand types...';

  return (
    <div className="w-full min-h-screen flex flex-col items-center py-8 px-4 sm:px-6 overflow-x-hidden" style={{ backgroundColor: 'rgba(255, 192, 203, 0.1)' }}>
      {/* Header */}
      <div className="w-full max-w-[min(640px,calc(100vw-2rem))] sm:max-w-[min(720px,calc(100vw-3rem))] mb-6 mx-auto">
        <div className="flex items-center gap-4 min-w-0">
          <Button
            variant="ghost"
            size="icon"
            className="h-10 w-10 rounded-full shrink-0"
            onClick={() => navigate(-1)}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-2xl font-bold truncate" style={{ fontFamily: "'Inter Tight', sans-serif", color: '#0F1F17' }}>
            All Collab
          </h1>
        </div>
      </div>

      {/* Main Content */}
      <div className="w-full max-w-[min(640px,calc(100vw-2rem))] sm:max-w-[min(720px,calc(100vw-3rem))] pb-6 mx-auto">
        <Card className="rounded-3xl border shadow-lg px-5 py-6 sm:px-7 sm:py-7" style={{ backgroundColor: 'white', borderColor: 'rgba(14,122,58,0.14)' }}>
            <Tabs value={activeTab} onValueChange={handleTabChange}>
              <TabsList className="grid w-full grid-cols-2 mb-6 bg-slate-100/70 rounded-full p-1">
                <TabsTrigger 
                  value="space" 
                  className="flex-1 rounded-full data-[state=active]:bg-white data-[state=active]:shadow-sm min-w-0"
                >
                  <span className="truncate">Space</span>
                </TabsTrigger>
                <TabsTrigger 
                  value="brand"
                  className="flex-1 rounded-full data-[state=active]:bg-white data-[state=active]:shadow-sm min-w-0"
                >
                  <span className="truncate">Brand</span>
                </TabsTrigger>
              </TabsList>

              <TabsContent value="space" className="space-y-5 mt-0">
                {/* Location Search */}
                <div className="relative min-w-0">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground shrink-0" />
                  <Input
                    type="text"
                    placeholder="Search location…"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    className="pl-10 pr-12 rounded-full h-12 sm:h-14 bg-gray-50 border-gray-200 min-w-0"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-10 w-10 sm:h-12 sm:w-12 rounded-full shrink-0"
                    onClick={handleCurrentLocation}
                  >
                    <MapPin className="h-4 w-4 sm:h-5 sm:w-5" />
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

                {/* Multi-select Space Types */}
                <MultiSelect
                  options={spaceTypes}
                  selected={selectedSpaceTypes}
                  placeholder={spacePlaceholder}
                  onSelectionChange={setSelectedSpaceTypes}
                  loading={loadingSpaceTypes}
                />

                {/* Conditional Promotion Type Dropdown */}
                {showPromotionDropdown && (
                  <MultiSelect
                    options={promoTypes}
                    selected={selectedPromoTypes}
                    placeholder={promoTypes.length > 0 ? promoTypes.map((t) => t.label).join(', ') : 'Select promotion types...'}
                    onSelectionChange={setSelectedPromoTypes}
                    loading={loadingPromoTypes}
                  />
                )}
              </TabsContent>

              <TabsContent value="brand" className="space-y-5 mt-0">
                {/* Location Search */}
                <div className="relative min-w-0">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground shrink-0" />
                  <Input
                    type="text"
                    placeholder="Search location…"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    className="pl-10 pr-12 rounded-full h-12 sm:h-14 bg-gray-50 border-gray-200 min-w-0"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-10 w-10 sm:h-12 sm:w-12 rounded-full shrink-0"
                    onClick={handleCurrentLocation}
                  >
                    <MapPin className="h-4 w-4 sm:h-5 sm:w-5" />
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

                {/* Multi-select Brand Types */}
                <MultiSelect
                  options={brandTypes}
                  selected={selectedBrandTypes}
                  placeholder={brandPlaceholder}
                  onSelectionChange={setSelectedBrandTypes}
                  loading={loadingBrandTypes}
                />
              </TabsContent>
            </Tabs>

            {/* Bottom Action Row */}
            <div className="flex items-center gap-3 mt-6 pt-6 border-t min-w-0" style={{ borderColor: 'rgba(14,122,58,0.12)' }}>
              <Button
                variant="outline"
                size="icon"
                className="h-12 w-12 sm:h-14 sm:w-14 rounded-full shrink-0"
                onClick={() => console.log('Map clicked')}
              >
                <Map className="h-5 w-5 sm:h-6 sm:w-6" />
              </Button>
              <Button
                onClick={handleSearch}
                className="flex-1 h-12 sm:h-14 rounded-full font-semibold min-w-0"
                style={{ backgroundColor: '#0E7A3A', color: 'white' }}
              >
                <span className="truncate">Search</span>
              </Button>
            </div>
          </Card>
      </div>
    </div>
  );
}

