import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Calendar, Clock, Loader2, Plus, Trash2, Edit } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface AvailabilityRule {
  id: string;
  resource_id: string;
  rule_type: 'weekly' | 'one_off';
  weekday: number | null;
  start_time_local: string;
  end_time_local: string;
  start_date: string | null;
  end_date: string | null;
  slot_duration_min: number;
  buffer_before_min: number;
  buffer_after_min: number;
  capacity_per_slot: number;
  active: boolean;
}

interface AvailabilityBuilderProps {
  resourceId: string;
}

const WEEKDAYS = [
  { value: 0, label: 'Sunday' },
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
];

export default function AvailabilityBuilder({ resourceId }: AvailabilityBuilderProps) {
  const [loading, setLoading] = useState(true);
  const [rules, setRules] = useState<AvailabilityRule[]>([]);
  const [showDialog, setShowDialog] = useState(false);
  const [editingRule, setEditingRule] = useState<AvailabilityRule | null>(null);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    rule_type: 'weekly' as 'weekly' | 'one_off',
    weekday: '1',
    start_time_local: '09:00',
    end_time_local: '17:00',
    start_date: '',
    end_date: '',
    slot_duration_min: '60',
    buffer_before_min: '0',
    buffer_after_min: '0',
    capacity_per_slot: '1',
  });

  useEffect(() => {
    fetchRules();
  }, [resourceId]);

  const fetchRules = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('booking_availability_rules')
        .select('*')
        .eq('resource_id', resourceId)
        .order('weekday', { ascending: true });

      if (error) throw error;
      setRules(data || []);
    } catch (error: any) {
      console.error('Error fetching rules:', error);
      toast.error('Failed to load availability rules');
    } finally {
      setLoading(false);
    }
  };

  const openDialog = (rule?: AvailabilityRule) => {
    if (rule) {
      setEditingRule(rule);
      setFormData({
        rule_type: rule.rule_type,
        weekday: rule.weekday?.toString() || '1',
        start_time_local: rule.start_time_local,
        end_time_local: rule.end_time_local,
        start_date: rule.start_date || '',
        end_date: rule.end_date || '',
        slot_duration_min: rule.slot_duration_min.toString(),
        buffer_before_min: rule.buffer_before_min.toString(),
        buffer_after_min: rule.buffer_after_min.toString(),
        capacity_per_slot: rule.capacity_per_slot.toString(),
      });
    } else {
      setEditingRule(null);
      setFormData({
        rule_type: 'weekly',
        weekday: '1',
        start_time_local: '09:00',
        end_time_local: '17:00',
        start_date: '',
        end_date: '',
        slot_duration_min: '60',
        buffer_before_min: '0',
        buffer_after_min: '0',
        capacity_per_slot: '1',
      });
    }
    setShowDialog(true);
  };

  const handleSave = async () => {
    try {
      setSaving(true);

      const ruleData = {
        resource_id: resourceId,
        rule_type: formData.rule_type,
        weekday: formData.rule_type === 'weekly' ? parseInt(formData.weekday) : null,
        start_time_local: formData.start_time_local,
        end_time_local: formData.end_time_local,
        start_date: formData.start_date || null,
        end_date: formData.end_date || null,
        slot_duration_min: parseInt(formData.slot_duration_min),
        buffer_before_min: parseInt(formData.buffer_before_min),
        buffer_after_min: parseInt(formData.buffer_after_min),
        capacity_per_slot: parseInt(formData.capacity_per_slot),
        active: true,
      };

      if (editingRule) {
        const { error } = await supabase
          .from('booking_availability_rules')
          .update(ruleData)
          .eq('id', editingRule.id);

        if (error) throw error;
        toast.success('Rule updated successfully');
      } else {
        const { error } = await supabase
          .from('booking_availability_rules')
          .insert(ruleData);

        if (error) throw error;
        toast.success('Rule added successfully');
      }

      setShowDialog(false);
      fetchRules();
    } catch (error: any) {
      console.error('Error saving rule:', error);
      toast.error(error.message || 'Failed to save rule');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (ruleId: string) => {
    if (!confirm('Are you sure you want to delete this availability rule?')) return;

    try {
      const { error } = await supabase
        .from('booking_availability_rules')
        .delete()
        .eq('id', ruleId);

      if (error) throw error;
      toast.success('Rule deleted successfully');
      fetchRules();
    } catch (error: any) {
      console.error('Error deleting rule:', error);
      toast.error('Failed to delete rule');
    }
  };

  const toggleActive = async (ruleId: string, currentActive: boolean) => {
    try {
      const { error } = await supabase
        .from('booking_availability_rules')
        .update({ active: !currentActive })
        .eq('id', ruleId);

      if (error) throw error;
      toast.success(currentActive ? 'Rule deactivated' : 'Rule activated');
      fetchRules();
    } catch (error: any) {
      console.error('Error toggling rule:', error);
      toast.error('Failed to update rule');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Availability Rules</CardTitle>
              <CardDescription>
                Define when this resource is available for booking
              </CardDescription>
            </div>
            <Button onClick={() => openDialog()}>
              <Plus className="h-4 w-4 mr-2" />
              Add Rule
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {rules.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No availability rules yet. Add rules to enable bookings.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {rules.map((rule) => (
                <div
                  key={rule.id}
                  className="flex items-center gap-3 p-4 border rounded-lg hover:bg-accent/50 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      {rule.rule_type === 'weekly' && rule.weekday !== null && (
                        <Badge variant="outline">
                          {WEEKDAYS.find((d) => d.value === rule.weekday)?.label}
                        </Badge>
                      )}
                      {rule.rule_type === 'one_off' && (
                        <Badge variant="outline">One-off</Badge>
                      )}
                      {!rule.active && (
                        <Badge variant="secondary" className="text-muted-foreground">
                          Inactive
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Clock className="h-4 w-4" />
                        <span>
                          {rule.start_time_local} - {rule.end_time_local}
                        </span>
                      </div>
                      <span>•</span>
                      <span>{rule.slot_duration_min}min slots</span>
                      <span>•</span>
                      <span>Capacity: {rule.capacity_per_slot}</span>
                      {(rule.buffer_before_min > 0 || rule.buffer_after_min > 0) && (
                        <>
                          <span>•</span>
                          <span>
                            Buffer: {rule.buffer_before_min}/{rule.buffer_after_min}min
                          </span>
                        </>
                      )}
                    </div>
                    {rule.start_date && rule.end_date && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {rule.start_date} to {rule.end_date}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={rule.active}
                      onCheckedChange={() => toggleActive(rule.id, rule.active)}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => openDialog(rule)}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(rule.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Rule Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingRule ? 'Edit Rule' : 'Add Availability Rule'}</DialogTitle>
            <DialogDescription>
              Configure when and how this resource can be booked
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="rule_type">Rule Type</Label>
              <Select
                value={formData.rule_type}
                onValueChange={(value: any) => setFormData({ ...formData, rule_type: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="weekly">Weekly Recurring</SelectItem>
                  <SelectItem value="one_off">One-off Date Range</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {formData.rule_type === 'weekly' && (
              <div className="space-y-2">
                <Label htmlFor="weekday">Day of Week</Label>
                <Select
                  value={formData.weekday}
                  onValueChange={(value) => setFormData({ ...formData, weekday: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {WEEKDAYS.map((day) => (
                      <SelectItem key={day.value} value={day.value.toString()}>
                        {day.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {formData.rule_type === 'one_off' && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="start_date">Start Date</Label>
                  <Input
                    id="start_date"
                    type="date"
                    value={formData.start_date}
                    onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="end_date">End Date</Label>
                  <Input
                    id="end_date"
                    type="date"
                    value={formData.end_date}
                    onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                  />
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="start_time">Start Time</Label>
                <Input
                  id="start_time"
                  type="time"
                  value={formData.start_time_local}
                  onChange={(e) => setFormData({ ...formData, start_time_local: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="end_time">End Time</Label>
                <Input
                  id="end_time"
                  type="time"
                  value={formData.end_time_local}
                  onChange={(e) => setFormData({ ...formData, end_time_local: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="slot_duration">Slot Duration (minutes)</Label>
              <Input
                id="slot_duration"
                type="number"
                value={formData.slot_duration_min}
                onChange={(e) => setFormData({ ...formData, slot_duration_min: e.target.value })}
                min="15"
                step="15"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="capacity">Capacity per Slot</Label>
              <Input
                id="capacity"
                type="number"
                value={formData.capacity_per_slot}
                onChange={(e) => setFormData({ ...formData, capacity_per_slot: e.target.value })}
                min="1"
              />
              <p className="text-sm text-muted-foreground">
                How many reservations can be made per slot
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="buffer_before">Buffer Before (minutes)</Label>
                <Input
                  id="buffer_before"
                  type="number"
                  value={formData.buffer_before_min}
                  onChange={(e) => setFormData({ ...formData, buffer_before_min: e.target.value })}
                  min="0"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="buffer_after">Buffer After (minutes)</Label>
                <Input
                  id="buffer_after"
                  type="number"
                  value={formData.buffer_after_min}
                  onChange={(e) => setFormData({ ...formData, buffer_after_min: e.target.value })}
                  min="0"
                />
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              Buffer time prevents back-to-back bookings
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save Rule'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

