import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { EventFormData, EVENT_VISIBILITY_OPTIONS, EventVisibility } from '@/lib/types/ticketing';

interface PublishingSectionProps {
  data: EventFormData;
  onChange: (data: Partial<EventFormData>) => void;
}

export function PublishingSection({ data, onChange }: PublishingSectionProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Publishing & Visibility</CardTitle>
        <CardDescription>Control how this event is displayed and accessed</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="is-purchasable">Purchasable</Label>
              <p className="text-sm text-muted-foreground">
                Allow customers to purchase tickets for this event
              </p>
            </div>
            <Switch
              id="is-purchasable"
              checked={data.is_purchasable}
              onCheckedChange={(checked) => onChange({ is_purchasable: checked })}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="is-public">Public</Label>
              <p className="text-sm text-muted-foreground">
                Show this event in public listings
              </p>
            </div>
            <Switch
              id="is-public"
              checked={data.is_public}
              onCheckedChange={(checked) => onChange({ is_public: checked })}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="is-active">Active</Label>
              <p className="text-sm text-muted-foreground">
                Event is active and visible
              </p>
            </div>
            <Switch
              id="is-active"
              checked={data.is_active}
              onCheckedChange={(checked) => onChange({ is_active: checked })}
            />
          </div>
        </div>

        <div className="space-y-2 pt-4 border-t">
          <Label htmlFor="visibility">Visibility</Label>
          <Select
            value={data.visibility}
            onValueChange={(value) => onChange({ visibility: value as EventVisibility })}
          >
            <SelectTrigger id="visibility">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {EVENT_VISIBILITY_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {data.visibility === 'password_protected' && (
          <div className="space-y-2">
            <Label htmlFor="event-password">
              Event Password <span className="text-destructive">*</span>
            </Label>
            <Input
              id="event-password"
              type="password"
              value={data.event_password || ''}
              onChange={(e) => onChange({ event_password: e.target.value })}
              placeholder="Enter password"
              required={data.visibility === 'password_protected'}
            />
            <p className="text-xs text-muted-foreground">
              Users will need this password to view the event
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

