import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, Loader2, Plus, Save, Trash2 } from 'lucide-react';

type EventStatus = 'draft' | 'published' | 'cancelled' | 'completed';

type EventRow = {
  id: string;
  org_id: string;
  venue_org_id: string | null;
  title: string;
  description: string | null;
  start_at: string;
  end_at: string;
  status: EventStatus;
};

type TicketType = {
  id?: string;
  name: string;
  price: string; // decimal input
  quota: string; // int input
};

function toIsoFromDatetimeLocal(value: string): string {
  // value: "YYYY-MM-DDTHH:mm"
  const d = new Date(value);
  return d.toISOString();
}

function toDatetimeLocal(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const mi = pad(d.getMinutes());
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
}

export default function EventForm() {
  const { id } = useParams<{ id: string }>();
  const isEditMode = !!id;
  const navigate = useNavigate();
  const { currentOrg } = useAuth();
  const { toast } = useToast();

  const [loading, setLoading] = useState(isEditMode);
  const [saving, setSaving] = useState(false);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [startAt, setStartAt] = useState('');
  const [endAt, setEndAt] = useState('');
  const [status, setStatus] = useState<EventStatus>('draft');
  const [venueOrgId, setVenueOrgId] = useState<string>('');

  const [ticketTypes, setTicketTypes] = useState<TicketType[]>([{ name: 'General Admission', price: '0', quota: '100' }]);

  const canSubmit = useMemo(() => {
    if (!currentOrg?.id) return false;
    if (!title.trim()) return false;
    if (!startAt || !endAt) return false;
    if (new Date(toIsoFromDatetimeLocal(endAt)) <= new Date(toIsoFromDatetimeLocal(startAt))) return false;
    if (ticketTypes.filter((t) => t.name.trim()).length === 0) return false;
    return true;
  }, [currentOrg?.id, endAt, startAt, ticketTypes, title]);

  useEffect(() => {
    if (!isEditMode) return;
    if (!id) return;
    if (!currentOrg) return;

    const load = async () => {
      setLoading(true);
      try {
        const { data: event, error: eventErr } = await supabase
          .from('events')
          .select('id, org_id, venue_org_id, title, description, start_at, end_at, status')
          .eq('id', id)
          .eq('org_id', currentOrg.id)
          .single();
        if (eventErr) throw eventErr;
        const e = event as any as EventRow;

        setTitle(e.title);
        setDescription(e.description || '');
        setStartAt(toDatetimeLocal(e.start_at));
        setEndAt(toDatetimeLocal(e.end_at));
        setStatus(e.status);
        setVenueOrgId(e.venue_org_id || '');

        const { data: ttData, error: ttErr } = await supabase
          .from('ticket_types')
          .select('id, name, price, quota')
          .eq('event_id', e.id)
          .order('created_at', { ascending: true });
        if (ttErr) throw ttErr;

        const rows = (ttData as any[] | null) || [];
        setTicketTypes(
          rows.length > 0
            ? rows.map((row) => ({
                id: row.id,
                name: row.name || '',
                price: row.price === null || row.price === undefined ? '0' : String(row.price),
                quota: row.quota === null || row.quota === undefined ? '0' : String(row.quota),
              }))
            : [{ name: 'General Admission', price: '0', quota: '100' }]
        );
      } catch (e: any) {
        toast({ title: 'Error', description: e?.message || 'Failed to load event', variant: 'destructive' });
        navigate('/app/events');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [currentOrg, id, isEditMode, navigate, toast]);

  const addTicketType = () => setTicketTypes((prev) => [...prev, { name: '', price: '0', quota: '0' }]);
  const removeTicketType = (idx: number) => setTicketTypes((prev) => prev.filter((_, i) => i !== idx));

  const onSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentOrg) return;
    if (!title.trim()) {
      toast({ title: 'Validation', description: 'Title is required', variant: 'destructive' });
      return;
    }
    if (!startAt || !endAt) {
      toast({ title: 'Validation', description: 'Start and end time are required', variant: 'destructive' });
      return;
    }
    if (new Date(toIsoFromDatetimeLocal(endAt)) <= new Date(toIsoFromDatetimeLocal(startAt))) {
      toast({ title: 'Validation', description: 'End must be after start', variant: 'destructive' });
      return;
    }

    const cleanedTypes = ticketTypes
      .map((t) => ({
        id: t.id,
        name: t.name.trim(),
        price: Number(t.price),
        quota: Number(t.quota),
      }))
      .filter((t) => t.name.length > 0);

    if (cleanedTypes.length === 0) {
      toast({ title: 'Validation', description: 'Add at least one ticket type', variant: 'destructive' });
      return;
    }

    for (const t of cleanedTypes) {
      if (!Number.isFinite(t.price) || t.price < 0) {
        toast({ title: 'Validation', description: 'Ticket price must be >= 0', variant: 'destructive' });
        return;
      }
      if (!Number.isFinite(t.quota) || t.quota <= 0) {
        toast({ title: 'Validation', description: 'Ticket quota must be > 0', variant: 'destructive' });
        return;
      }
    }

    setSaving(true);
    try {
      const payload = {
        org_id: currentOrg.id,
        venue_org_id: venueOrgId.trim() || null,
        title: title.trim(),
        description: description.trim() || null,
        start_at: toIsoFromDatetimeLocal(startAt),
        end_at: toIsoFromDatetimeLocal(endAt),
        status,
      };

      let eventId = id;
      if (!isEditMode) {
        const { data: created, error: createErr } = await supabase.from('events').insert(payload).select('id').single();
        if (createErr) throw createErr;
        eventId = (created as any).id as string;
      } else {
        const { error: updateErr } = await supabase.from('events').update(payload).eq('id', id!).eq('org_id', currentOrg.id);
        if (updateErr) throw updateErr;
      }

      // Ticket types: update existing IDs, insert new ones. Avoid deleting existing IDs (may be referenced by orders).
      const existing = cleanedTypes.filter((t) => !!t.id);
      const fresh = cleanedTypes.filter((t) => !t.id);

      for (const t of existing) {
        const { error: ttUpdateErr } = await supabase
          .from('ticket_types')
          .update({ name: t.name, price: t.price, quota: t.quota })
          .eq('id', t.id);
        if (ttUpdateErr) throw ttUpdateErr;
      }

      if (fresh.length > 0) {
        const { error: ttInsertErr } = await supabase.from('ticket_types').insert(
          fresh.map((t) => ({
            event_id: eventId,
            name: t.name,
            price: t.price,
            quota: t.quota,
          }))
        );
        if (ttInsertErr) throw ttInsertErr;
      }

      toast({ title: 'Success', description: isEditMode ? 'Event updated' : 'Event created' });
      navigate('/app/events');
    } catch (e: any) {
      toast({ title: 'Error', description: e?.message || 'Failed to save event', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 px-4 max-w-3xl">
      <Button variant="ghost" onClick={() => navigate('/app/events')} className="mb-4">
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back to Events
      </Button>

      <Card>
        <CardHeader>
          <CardTitle>{isEditMode ? 'Edit Event' : 'Create Event'}</CardTitle>
          <CardDescription>Create ticket types under this event.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSave} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="title">Title</Label>
              <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Event title" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional description" />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Start</Label>
                <Input type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>End</Label>
                <Input type="datetime-local" value={endAt} onChange={(e) => setEndAt(e.target.value)} />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={status} onValueChange={(v) => setStatus(v as EventStatus)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">draft</SelectItem>
                    <SelectItem value="published">published</SelectItem>
                    <SelectItem value="cancelled">cancelled</SelectItem>
                    <SelectItem value="completed">completed</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Venue Org ID (optional)</Label>
                <Input value={venueOrgId} onChange={(e) => setVenueOrgId(e.target.value)} placeholder="UUID" />
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Ticket Types</Label>
                  <p className="text-sm text-muted-foreground">At least one ticket type is required.</p>
                </div>
                <Button type="button" variant="outline" onClick={addTicketType}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add
                </Button>
              </div>

              <div className="space-y-3">
                {ticketTypes.map((t, idx) => (
                  <div key={t.id ?? idx} className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end border rounded-lg p-3">
                    <div className="md:col-span-6 space-y-1">
                      <Label>Name</Label>
                      <Input value={t.name} onChange={(e) => setTicketTypes((prev) => prev.map((x, i) => (i === idx ? { ...x, name: e.target.value } : x)))} />
                    </div>
                    <div className="md:col-span-3 space-y-1">
                      <Label>Price</Label>
                      <Input value={t.price} onChange={(e) => setTicketTypes((prev) => prev.map((x, i) => (i === idx ? { ...x, price: e.target.value } : x)))} />
                    </div>
                    <div className="md:col-span-2 space-y-1">
                      <Label>Quota</Label>
                      <Input value={t.quota} onChange={(e) => setTicketTypes((prev) => prev.map((x, i) => (i === idx ? { ...x, quota: e.target.value } : x)))} />
                    </div>
                    <div className="md:col-span-1 flex justify-end">
                      <Button type="button" variant="ghost" onClick={() => removeTicketType(idx)} disabled={!!t.id && ticketTypes.length === 1}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-3">
              <Button type="button" variant="outline" onClick={() => navigate('/app/events')} disabled={saving}>
                Cancel
              </Button>
              <Button type="submit" disabled={!canSubmit || saving}>
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                {isEditMode ? 'Save Changes' : 'Create Event'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}


