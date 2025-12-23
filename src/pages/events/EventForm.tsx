import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, Loader2, Save } from 'lucide-react';
import {
  EventFormData,
  TicketProductFormData,
  EventWithTicketProducts,
} from '@/lib/types/ticketing';
import {
  createOrUpdateEvent,
  getEventWithTickets,
} from '@/lib/api/ticketing';
import { EventInfoFormSection } from './components/EventInfoFormSection';
import { TicketTypesFormSection } from './components/TicketTypesFormSection';
import { AdmissionSettingsSection } from './components/AdmissionSettingsSection';
import { PublishingSection } from './components/PublishingSection';

export default function EventForm() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(!!id);
  const [saving, setSaving] = useState(false);

  const [eventData, setEventData] = useState<EventFormData>({
    name: '',
    description: '',
    category: undefined,
    cover_image_url: '',
    date_start: '',
    date_end: '',
    location_name: '',
    location_address: '',
    location_map_url: '',
    organizer_name: profile?.display_name || '',
    admission_settings: {
      check_in_method: 'qr_scan_only',
      redemption_notes: '',
    },
    event_password: '',
    is_purchasable: true,
    is_public: true,
    is_active: true,
    visibility: 'public',
  });

  const [ticketProducts, setTicketProducts] = useState<TicketProductFormData[]>([]);

  const isEditMode = !!id;

  useEffect(() => {
    if (id && profile) {
      loadEvent();
    } else if (profile) {
      // Set default organizer name
      setEventData((prev) => ({
        ...prev,
        organizer_name: profile.display_name || '',
      }));
    }
  }, [id, profile]);

  const loadEvent = async () => {
    if (!id || !profile) return;

    setLoading(true);
    try {
      const { data, error } = await getEventWithTickets(id, profile);
      if (error) throw error;
      if (!data) {
        toast({
          title: 'Error',
          description: 'Event not found',
          variant: 'destructive',
        });
        navigate('/app/events');
        return;
      }

      // Populate event data
      setEventData({
        name: data.name,
        description: data.description || '',
        category: data.category,
        cover_image_url: data.cover_image_url || '',
        date_start: data.date_start,
        date_end: data.date_end,
        location_name: data.location_name || '',
        location_address: data.location_address || '',
        location_map_url: data.location_map_url || '',
        organizer_name: data.organizer_name || profile.display_name || '',
        admission_settings: data.admission_settings || {
          check_in_method: 'qr_scan_only',
          redemption_notes: '',
        },
        event_password: data.event_password || '',
        is_purchasable: true, // Will be loaded from products table
        is_public: true, // Will be loaded from products table
        is_active: true, // Will be loaded from products table
        visibility: data.event_password ? 'password_protected' : 'public',
      });

      // Populate ticket products (convert price from numeric to dollars)
      setTicketProducts(
        data.ticket_products.map((tp) => ({
          name: tp.name,
          description: tp.description || '',
          price: typeof tp.price === 'number' ? tp.price / 100 : parseFloat(tp.price.toString()) / 100, // Convert to dollars
          currency: tp.currency,
          capacity_total: tp.capacity_total,
          sales_start: tp.sales_start || '',
          sales_end: tp.sales_end || '',
          max_per_customer: tp.max_per_customer,
          wave_label: tp.wave_label || '',
          valid_from: tp.valid_from || '',
          valid_until: tp.valid_until || '',
          require_holder_name: tp.require_holder_name,
          require_holder_email: tp.require_holder_email,
          allow_transfer: tp.allow_transfer,
          allow_reentry: tp.allow_reentry,
        }))
      );
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to load event',
        variant: 'destructive',
      });
      navigate('/app/events');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!profile) {
      toast({
        title: 'Error',
        description: 'You must be logged in',
        variant: 'destructive',
      });
      return;
    }

    // Validation
    if (!eventData.name.trim()) {
      toast({
        title: 'Validation Error',
        description: 'Event name is required',
        variant: 'destructive',
      });
      return;
    }

    if (!eventData.date_start || !eventData.date_end) {
      toast({
        title: 'Validation Error',
        description: 'Event start and end dates are required',
        variant: 'destructive',
      });
      return;
    }

    if (ticketProducts.length === 0) {
      toast({
        title: 'Validation Error',
        description: 'At least one ticket type is required',
        variant: 'destructive',
      });
      return;
    }

    // Validate ticket products
    for (const ticketProduct of ticketProducts) {
      if (!ticketProduct.name.trim()) {
        toast({
          title: 'Validation Error',
          description: 'All ticket types must have a name',
          variant: 'destructive',
        });
        return;
      }
      if (ticketProduct.price <= 0) {
        toast({
          title: 'Validation Error',
          description: 'All ticket types must have a price greater than 0',
          variant: 'destructive',
        });
        return;
      }
      if (ticketProduct.capacity_total <= 0) {
        toast({
          title: 'Validation Error',
          description: 'All ticket types must have a capacity greater than 0',
          variant: 'destructive',
        });
        return;
      }
    }

    if (eventData.visibility === 'password_protected' && !eventData.event_password?.trim()) {
      toast({
        title: 'Validation Error',
        description: 'Event password is required when visibility is password protected',
        variant: 'destructive',
      });
      return;
    }

    setSaving(true);
    try {
      const { data, error } = await createOrUpdateEvent(
        eventData,
        ticketProducts,
        profile,
        id
      );

      if (error) throw error;

      toast({
        title: 'Success',
        description: isEditMode ? 'Event updated successfully' : 'Event created successfully',
      });
      navigate('/app/events');
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to save event',
        variant: 'destructive',
      });
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
    <div>
      <div className="container mx-auto py-8 px-4 max-w-5xl">
        <div className="mb-6">
          <Button variant="ghost" onClick={() => navigate('/app/events')} className="mb-4">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Events
          </Button>
          <h1 className="text-3xl font-bold">
            {isEditMode ? 'Edit Event Ticket' : 'Create New Event Ticket'}
          </h1>
          <p className="text-muted-foreground mt-1">
            {isEditMode
              ? 'Update your event ticket product'
              : 'Create a new event ticket product'}
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="space-y-6">
            <EventInfoFormSection
              data={eventData}
              onChange={(updates) => setEventData({ ...eventData, ...updates })}
              brandName={profile?.display_name}
            />

            <TicketTypesFormSection
              ticketProducts={ticketProducts}
              onChange={setTicketProducts}
            />

            <AdmissionSettingsSection
              data={eventData}
              onChange={(updates) => setEventData({ ...eventData, ...updates })}
            />

            <PublishingSection
              data={eventData}
              onChange={(updates) => setEventData({ ...eventData, ...updates })}
            />

            {/* Actions */}
            <div className="flex items-center justify-end gap-4 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate('/app/events')}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {!saving && <Save className="mr-2 h-4 w-4" />}
                {isEditMode ? 'Update Event Ticket' : 'Save Event Ticket'}
              </Button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

