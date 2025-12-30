import { useState, useEffect, FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, Plus, Trash2, Loader2, Eye } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { 
  createEvent, 
  updateEvent, 
  getEvent, 
  createTicketType, 
  updateTicketType, 
  deleteTicketType, 
  getTicketTypes,
  type CreateEventData,
  type CreateTicketTypeData 
} from '@/lib/api/events';
import type { Event, TicketType } from '@/lib/types';

interface TicketTypeForm {
  id?: string;
  name: string;
  price: string;
  quota: string;
  isNew?: boolean;
}

export default function EventForm() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { currentOrg, user } = useAuth();
  const { toast } = useToast();

  const isEditMode = !!id;
  const [loading, setLoading] = useState(isEditMode);
  const [saving, setSaving] = useState(false);

  // Event fields
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [startAt, setStartAt] = useState('');
  const [endAt, setEndAt] = useState('');
  const [status, setStatus] = useState<'draft' | 'published'>('draft');
  const [venueOrgId, setVenueOrgId] = useState<string>('');

  // Ticket types
  const [ticketTypes, setTicketTypes] = useState<TicketTypeForm[]>([]);
  const [existingTicketTypes, setExistingTicketTypes] = useState<TicketType[]>([]);

  // Progressive disclosure states
  const [showVenueSection, setShowVenueSection] = useState(false);
  const [showTicketTypesSection, setShowTicketTypesSection] = useState(false);
  const [showPublishingSection, setShowPublishingSection] = useState(false);

  // Preview dialog state
  const [showPreview, setShowPreview] = useState(false);

  // Load event data if editing
  useEffect(() => {
    if (!isEditMode || !id || !currentOrg) return;

    const loadEvent = async () => {
      setLoading(true);
      try {
        const event = await getEvent(id);
        if (!event) {
          toast({ 
            title: 'Error', 
            description: 'Event not found', 
            variant: 'destructive' 
          });
          navigate('/app/events');
          return;
        }

        // Check if user has access
        if (event.org_id !== currentOrg.id) {
          toast({ 
            title: 'Error', 
            description: 'You do not have access to this event', 
            variant: 'destructive' 
          });
          navigate('/app/events');
          return;
        }

        setTitle(event.title || '');
        setDescription(event.description || '');
        setStartAt(event.start_at ? new Date(event.start_at).toISOString().slice(0, 16) : '');
        setEndAt(event.end_at ? new Date(event.end_at).toISOString().slice(0, 16) : '');
        setStatus(event.status === 'published' ? 'published' : 'draft');
        setVenueOrgId(event.venue_org_id || '');

        // Load ticket types
        const types = await getTicketTypes(id);
        setExistingTicketTypes(types);
        setTicketTypes(types.map(t => ({
          id: t.id,
          name: t.name,
          price: t.price.toString(),
          quota: t.quota.toString(),
          isNew: false,
        })));

        // Show sections if they have data
        if (event.venue_org_id) setShowVenueSection(true);
        if (types.length > 0) setShowTicketTypesSection(true);
        setShowPublishingSection(true);
      } catch (error: any) {
        toast({ 
          title: 'Error', 
          description: error.message || 'Failed to load event', 
          variant: 'destructive' 
        });
      } finally {
        setLoading(false);
      }
    };

    loadEvent();
  }, [id, isEditMode, currentOrg, navigate, toast]);

  // Progressive disclosure: show ticket types section when basic info is filled
  useEffect(() => {
    if (title.trim() && startAt && endAt) {
      setShowTicketTypesSection(true);
    }
  }, [title, startAt, endAt]);

  // Progressive disclosure: show publishing section when ticket types are added
  useEffect(() => {
    if (ticketTypes.length > 0) {
      setShowPublishingSection(true);
    }
  }, [ticketTypes.length]);

  const addTicketType = () => {
    setTicketTypes([...ticketTypes, {
      name: '',
      price: '',
      quota: '',
      isNew: true,
    }]);
    setShowTicketTypesSection(true);
  };

  const removeTicketType = (index: number) => {
    const ticketType = ticketTypes[index];
    if (ticketType.id && !ticketType.isNew) {
      // Mark for deletion (we'll handle this on save)
      deleteTicketType(ticketType.id).catch(err => {
        console.error('Failed to delete ticket type:', err);
      });
    }
    setTicketTypes(ticketTypes.filter((_, i) => i !== index));
  };

  const updateTicketTypeForm = (index: number, field: keyof TicketTypeForm, value: string) => {
    setTicketTypes(ticketTypes.map((tt, i) => 
      i === index ? { ...tt, [field]: value } : tt
    ));
  };

  const canSubmit = () => {
    if (!currentOrg?.id) return false;
    if (!title.trim()) return false;
    if (!startAt || !endAt) return false;
    if (new Date(startAt) >= new Date(endAt)) return false;
    
    // Validate ticket types if any are added
    if (ticketTypes.length > 0) {
      return ticketTypes.every(tt => 
        tt.name.trim() && 
        tt.price && 
        parseFloat(tt.price) >= 0 && 
        tt.quota && 
        parseInt(tt.quota) > 0
      );
    }
    
    return true;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    
    if (!canSubmit() || !currentOrg) return;

    setSaving(true);
    try {
      // Prepare event data
      const eventData: CreateEventData = {
        org_id: currentOrg.id,
        title: title.trim(),
        description: description.trim() || undefined,
        start_at: new Date(startAt).toISOString(),
        end_at: new Date(endAt).toISOString(),
        venue_org_id: venueOrgId || null,
        status: status,
        metadata: {},
      };

      let eventId: string;

      if (isEditMode && id) {
        // Update existing event
        await updateEvent({ id, ...eventData });
        eventId = id;

        // Handle ticket types: delete removed ones, update existing, create new
        const currentIds = ticketTypes.filter(tt => tt.id).map(tt => tt.id!);
        const toDelete = existingTicketTypes.filter(tt => !currentIds.includes(tt.id));
        
        for (const tt of toDelete) {
          await deleteTicketType(tt.id);
        }

        // Update or create ticket types
        for (const tt of ticketTypes) {
          if (tt.id && !tt.isNew) {
            // Update existing
            await updateTicketType({
              id: tt.id,
              name: tt.name.trim(),
              price: parseFloat(tt.price),
              quota: parseInt(tt.quota),
            });
          } else {
            // Create new
            await createTicketType({
              event_id: eventId,
              name: tt.name.trim(),
              price: parseFloat(tt.price),
              quota: parseInt(tt.quota),
            });
          }
        }
      } else {
        // Create new event
        const newEvent = await createEvent(eventData);
        eventId = newEvent.id;

        // Create ticket types
        for (const tt of ticketTypes) {
          await createTicketType({
            event_id: eventId,
            name: tt.name.trim(),
            price: parseFloat(tt.price),
            quota: parseInt(tt.quota),
          });
        }
      }

      toast({ 
        title: 'Success', 
        description: isEditMode ? 'Event updated successfully' : 'Event created successfully' 
      });
      navigate('/app/events');
    } catch (error: any) {
      toast({ 
        title: 'Error', 
        description: error.message || 'Failed to save event', 
        variant: 'destructive' 
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: '#0E7A3A' }} />
      </div>
    );
  }

  const formatPreviewDate = (dateString: string) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const formatPreviewTime = (dateString: string) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  const isQuotaUnlimited = (quota: string) => {
    const num = parseInt(quota);
    return isNaN(num) || num >= 999999;
  };

  return (
    <div className="max-w-2xl mx-auto pb-12">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-start justify-between mb-4">
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => navigate('/app/events')}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Events
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShowPreview(true)}
            disabled={!title.trim() || !startAt || !endAt}
          >
            <Eye className="h-4 w-4 mr-2" />
            Preview
          </Button>
        </div>
        <h1 className="text-3xl font-bold" style={{ color: '#0F1F17' }}>
          {isEditMode ? 'Edit Event' : 'Create New Event'}
        </h1>
        <p className="mt-2 text-sm" style={{ color: 'rgba(15,31,23,0.72)' }}>
          Fill out the form below to {isEditMode ? 'update' : 'create'} your event
        </p>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-8">
        {/* Section 1: Basic Information */}
        <div className="space-y-6">
          <div>
            <h2 className="text-xl font-semibold mb-1" style={{ color: '#0F1F17' }}>
              What is the name of your event?
            </h2>
            <p className="text-sm mb-4" style={{ color: 'rgba(15,31,23,0.72)' }}>
              Give your event a clear, descriptive title
            </p>
            <Input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Summer Music Festival 2024"
              required
              className="w-full"
            />
          </div>

          <div>
            <h2 className="text-xl font-semibold mb-1" style={{ color: '#0F1F17' }}>
              Describe your event
            </h2>
            <p className="text-sm mb-4" style={{ color: 'rgba(15,31,23,0.72)' }}>
              Add details about what attendees can expect (optional)
            </p>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Tell people about your event..."
              rows={4}
              className="w-full rounded-2xl border-2 px-4 py-3"
              style={{
                borderColor: 'rgba(14,122,58,0.14)',
                backgroundColor: '#FBF8F4',
              }}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h2 className="text-xl font-semibold mb-1" style={{ color: '#0F1F17' }}>
                When does it start?
              </h2>
              <p className="text-sm mb-4" style={{ color: 'rgba(15,31,23,0.72)' }}>
                Select the start date and time
              </p>
              <Input
                type="datetime-local"
                value={startAt}
                onChange={(e) => setStartAt(e.target.value)}
                required
                className="w-full"
              />
            </div>

            <div>
              <h2 className="text-xl font-semibold mb-1" style={{ color: '#0F1F17' }}>
                When does it end?
              </h2>
              <p className="text-sm mb-4" style={{ color: 'rgba(15,31,23,0.72)' }}>
                Select the end date and time
              </p>
              <Input
                type="datetime-local"
                value={endAt}
                onChange={(e) => setEndAt(e.target.value)}
                required
                className="w-full"
                min={startAt || undefined}
              />
            </div>
          </div>
        </div>

        <Separator />

        {/* Section 2: Venue (Progressive Disclosure) */}
        {showVenueSection ? (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-semibold mb-1" style={{ color: '#0F1F17' }}>
                Where is this event taking place?
              </h2>
              <p className="text-sm mb-4" style={{ color: 'rgba(15,31,23,0.72)' }}>
                If this event is hosted at a venue, select the venue organization (optional)
              </p>
              <Input
                type="text"
                value={venueOrgId}
                onChange={(e) => setVenueOrgId(e.target.value)}
                placeholder="Venue organization ID (optional)"
                className="w-full"
              />
              <p className="text-xs mt-2" style={{ color: 'rgba(15,31,23,0.6)' }}>
                Leave blank if this event is not at a specific venue
              </p>
            </div>
          </div>
        ) : (
          <div>
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowVenueSection(true)}
              className="w-full"
            >
              + Add venue information (optional)
            </Button>
          </div>
        )}

        {showVenueSection && <Separator />}

        {/* Section 3: Ticket Types (Progressive Disclosure) */}
        {showTicketTypesSection ? (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-semibold mb-1" style={{ color: '#0F1F17' }}>
                What ticket types are available?
              </h2>
              <p className="text-sm mb-4" style={{ color: 'rgba(15,31,23,0.72)' }}>
                Add different ticket types with pricing and availability
              </p>
            </div>

            {ticketTypes.length === 0 ? (
              <div className="border-2 border-dashed rounded-lg p-8 text-center" style={{ borderColor: 'rgba(14,122,58,0.14)' }}>
                <p className="text-sm mb-4" style={{ color: 'rgba(15,31,23,0.72)' }}>
                  No ticket types added yet
                </p>
                <Button
                  type="button"
                  variant="outline"
                  onClick={addTicketType}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add First Ticket Type
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                {ticketTypes.map((tt, index) => (
                  <div 
                    key={index} 
                    className="border rounded-lg p-6 space-y-4" 
                    style={{ borderColor: 'rgba(14,122,58,0.14)', backgroundColor: 'rgba(251,248,244,0.5)' }}
                  >
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-medium" style={{ color: '#0F1F17' }}>
                        Ticket Type {index + 1}
                      </h3>
                      {ticketTypes.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeTicketType(index)}
                          className="text-red-600 hover:text-red-700"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>

                    <div>
                      <Label htmlFor={`ticket-name-${index}`} className="text-sm font-medium">
                        Ticket name
                      </Label>
                      <Input
                        id={`ticket-name-${index}`}
                        type="text"
                        value={tt.name}
                        onChange={(e) => updateTicketTypeForm(index, 'name', e.target.value)}
                        placeholder="e.g., General Admission, VIP, Early Bird"
                        required
                        className="mt-1"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor={`ticket-price-${index}`} className="text-sm font-medium">
                          Price ($)
                        </Label>
                        <Input
                          id={`ticket-price-${index}`}
                          type="number"
                          step="0.01"
                          min="0"
                          value={tt.price}
                          onChange={(e) => updateTicketTypeForm(index, 'price', e.target.value)}
                          placeholder="0.00"
                          required
                          className="mt-1"
                        />
                      </div>

                      <div>
                        <Label htmlFor={`ticket-quota-${index}`} className="text-sm font-medium">
                          Available tickets
                        </Label>
                        <Input
                          id={`ticket-quota-${index}`}
                          type="number"
                          min="1"
                          value={tt.quota}
                          onChange={(e) => updateTicketTypeForm(index, 'quota', e.target.value)}
                          placeholder="100"
                          required
                          className="mt-1"
                        />
                      </div>
                    </div>
                  </div>
                ))}

                <Button
                  type="button"
                  variant="outline"
                  onClick={addTicketType}
                  className="w-full"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Another Ticket Type
                </Button>
              </div>
            )}
          </div>
        ) : (
          <div>
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowTicketTypesSection(true)}
              className="w-full"
              disabled={!title.trim() || !startAt || !endAt}
            >
              + Add ticket types (optional)
            </Button>
            {(!title.trim() || !startAt || !endAt) && (
              <p className="text-xs mt-2 text-center" style={{ color: 'rgba(15,31,23,0.6)' }}>
                Complete basic information above first
              </p>
            )}
          </div>
        )}

        {showTicketTypesSection && <Separator />}

        {/* Section 4: Publishing (Progressive Disclosure) */}
        {showPublishingSection ? (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-semibold mb-1" style={{ color: '#0F1F17' }}>
                When should this event be published?
              </h2>
              <p className="text-sm mb-4" style={{ color: 'rgba(15,31,23,0.72)' }}>
                Choose whether to publish immediately or save as draft
              </p>
              <div className="space-y-3">
                <label className="flex items-center space-x-3 cursor-pointer">
                  <input
                    type="radio"
                    name="status"
                    value="draft"
                    checked={status === 'draft'}
                    onChange={(e) => setStatus(e.target.value as 'draft' | 'published')}
                    className="h-4 w-4"
                  />
                  <div>
                    <div className="font-medium" style={{ color: '#0F1F17' }}>
                      Save as draft
                    </div>
                    <div className="text-sm" style={{ color: 'rgba(15,31,23,0.72)' }}>
                      Keep this event private until you're ready to publish
                    </div>
                  </div>
                </label>
                <label className="flex items-center space-x-3 cursor-pointer">
                  <input
                    type="radio"
                    name="status"
                    value="published"
                    checked={status === 'published'}
                    onChange={(e) => setStatus(e.target.value as 'draft' | 'published')}
                    className="h-4 w-4"
                  />
                  <div>
                    <div className="font-medium" style={{ color: '#0F1F17' }}>
                      Publish now
                    </div>
                    <div className="text-sm" style={{ color: 'rgba(15,31,23,0.72)' }}>
                      Make this event visible to the public immediately
                    </div>
                  </div>
                </label>
              </div>
            </div>
          </div>
        ) : null}

        {/* Submit Button */}
        <div className="pt-6 border-t" style={{ borderColor: 'rgba(14,122,58,0.14)' }}>
          <div className="flex gap-4 justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate('/app/events')}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!canSubmit() || saving}
              style={{ backgroundColor: '#0E7A3A' }}
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {isEditMode ? 'Updating...' : 'Creating...'}
                </>
              ) : (
                isEditMode ? 'Update Event' : 'Create Event'
              )}
            </Button>
          </div>
        </div>
      </form>

      {/* Preview Dialog */}
      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-2xl">Event Preview</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-6 py-4">
            {/* Title */}
            <div>
              <h2 className="text-3xl font-bold mb-2" style={{ color: '#0F1F17' }}>
                {title.trim() || 'Event Title'}
              </h2>
            </div>

            {/* Date & Time */}
            {startAt && endAt && (
              <div className="space-y-1">
                <p className="text-sm font-medium" style={{ color: 'rgba(15,31,23,0.72)' }}>
                  Date & Time
                </p>
                <p className="text-lg" style={{ color: '#0F1F17' }}>
                  {formatPreviewDate(startAt)}
                </p>
                <p className="text-sm" style={{ color: 'rgba(15,31,23,0.72)' }}>
                  {formatPreviewTime(startAt)} - {formatPreviewTime(endAt)}
                </p>
              </div>
            )}

            {/* Venue */}
            {venueOrgId && (
              <div className="space-y-1">
                <p className="text-sm font-medium" style={{ color: 'rgba(15,31,23,0.72)' }}>
                  Venue
                </p>
                <p className="text-lg" style={{ color: '#0F1F17' }}>
                  {venueOrgId}
                </p>
              </div>
            )}

            {/* Description */}
            {description.trim() && (
              <div className="space-y-2">
                <p className="text-sm font-medium" style={{ color: 'rgba(15,31,23,0.72)' }}>
                  Description
                </p>
                <p className="text-base whitespace-pre-wrap" style={{ color: '#0F1F17' }}>
                  {description.trim()}
                </p>
              </div>
            )}

            {/* Ticket Types */}
            {ticketTypes.length > 0 && (
              <div className="space-y-4">
                <p className="text-sm font-medium" style={{ color: 'rgba(15,31,23,0.72)' }}>
                  Ticket Types
                </p>
                <div className="space-y-3">
                  {ticketTypes.map((tt, index) => (
                    <div
                      key={index}
                      className="border rounded-lg p-4"
                      style={{ borderColor: 'rgba(14,122,58,0.14)', backgroundColor: 'rgba(251,248,244,0.5)' }}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h3 className="font-semibold text-lg mb-1" style={{ color: '#0F1F17' }}>
                            {tt.name.trim() || `Ticket Type ${index + 1}`}
                          </h3>
                          <div className="flex items-center gap-4 mt-2">
                            <span className="text-base font-medium" style={{ color: '#0F1F17' }}>
                              ${parseFloat(tt.price) || 0}.00
                            </span>
                            <span className="text-sm" style={{ color: 'rgba(15,31,23,0.72)' }}>
                              {isQuotaUnlimited(tt.quota) ? 'Unlimited' : `${tt.quota || 0} available`}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* CTA Button */}
            <div className="pt-4 border-t" style={{ borderColor: 'rgba(14,122,58,0.14)' }}>
              <Button
                type="button"
                disabled
                className="w-full"
                style={{ backgroundColor: '#0E7A3A', opacity: 0.6 }}
              >
                Get Tickets
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
