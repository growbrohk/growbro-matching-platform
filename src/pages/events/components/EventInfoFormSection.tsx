import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { EventFormData, EVENT_CATEGORIES } from '@/lib/types/ticketing';

interface EventInfoFormSectionProps {
  data: EventFormData;
  onChange: (data: Partial<EventFormData>) => void;
  brandName?: string;
}

export function EventInfoFormSection({ data, onChange, brandName }: EventInfoFormSectionProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Event Information / 活動資訊</CardTitle>
        <CardDescription>Basic event details</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="event-name">
            Event Name / 活動名稱 <span className="text-destructive">*</span>
          </Label>
          <Input
            id="event-name"
            value={data.name}
            onChange={(e) => onChange({ name: e.target.value })}
            placeholder="e.g. Summer Run 2024"
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="event-short-description">Short Description</Label>
          <Input
            id="event-short-description"
            value={data.description || ''}
            onChange={(e) => onChange({ description: e.target.value })}
            placeholder="Brief event description"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="event-full-description">Full Description</Label>
          <Textarea
            id="event-full-description"
            value={data.description || ''}
            onChange={(e) => onChange({ description: e.target.value })}
            placeholder="Detailed event description..."
            rows={4}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="event-category">Event Category</Label>
            <Select
              value={data.category || ''}
              onValueChange={(value) => onChange({ category: value as any })}
            >
              <SelectTrigger id="event-category">
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                {EVENT_CATEGORIES.map((cat) => (
                  <SelectItem key={cat} value={cat}>
                    {cat}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="event-cover-image">Cover Image URL / 封面圖</Label>
            <Input
              id="event-cover-image"
              value={data.cover_image_url || ''}
              onChange={(e) => onChange({ cover_image_url: e.target.value })}
              placeholder="https://example.com/image.jpg"
              type="url"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="event-date-start">
              Start Date & Time <span className="text-destructive">*</span>
            </Label>
            <Input
              id="event-date-start"
              type="datetime-local"
              value={data.date_start ? new Date(data.date_start).toISOString().slice(0, 16) : ''}
              onChange={(e) => {
                const date = e.target.value ? new Date(e.target.value).toISOString() : '';
                onChange({ date_start: date });
              }}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="event-date-end">
              End Date & Time <span className="text-destructive">*</span>
            </Label>
            <Input
              id="event-date-end"
              type="datetime-local"
              value={data.date_end ? new Date(data.date_end).toISOString().slice(0, 16) : ''}
              onChange={(e) => {
                const date = e.target.value ? new Date(e.target.value).toISOString() : '';
                onChange({ date_end: date });
              }}
              required
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="event-location-name">Venue Name / 活動地點</Label>
          <Input
            id="event-location-name"
            value={data.location_name || ''}
            onChange={(e) => onChange({ location_name: e.target.value })}
            placeholder="e.g. Central Park"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="event-location-address">Address</Label>
          <Input
            id="event-location-address"
            value={data.location_address || ''}
            onChange={(e) => onChange({ location_address: e.target.value })}
            placeholder="Full address"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="event-location-map">Map URL</Label>
          <Input
            id="event-location-map"
            value={data.location_map_url || ''}
            onChange={(e) => onChange({ location_map_url: e.target.value })}
            placeholder="https://maps.google.com/..."
            type="url"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="event-organizer">Organizer Name / 主辦單位</Label>
          <Input
            id="event-organizer"
            value={data.organizer_name || brandName || ''}
            onChange={(e) => onChange({ organizer_name: e.target.value })}
            placeholder={brandName || 'Organizer name'}
          />
        </div>
      </CardContent>
    </Card>
  );
}

