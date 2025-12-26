import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Calendar, Loader2, MapPin, Clock, DollarSign, Users, AlertCircle } from 'lucide-react';
import { format, addDays, startOfDay } from 'date-fns';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface BookingContext {
  resource: any;
  settings: any;
  form_fields: any[];
  slots: any[];
}

export default function PublicBook() {
  const { orgSlug, resourceSlug } = useParams<{ orgSlug: string; resourceSlug: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [context, setContext] = useState<BookingContext | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date>(startOfDay(new Date()));
  const [selectedSlot, setSelectedSlot] = useState<any>(null);
  const [formData, setFormData] = useState({
    customer_name: '',
    customer_phone: '',
    customer_email: '',
    party_size: '1',
    answers: {} as any,
  });

  useEffect(() => {
    if (orgSlug && resourceSlug) {
      fetchContext();
    }
  }, [orgSlug, resourceSlug, selectedDate]);

  const fetchContext = async () => {
    if (!orgSlug || !resourceSlug) return;

    try {
      setLoading(true);
      const { data, error } = await supabase.rpc('public_booking_get_context' as any, {
        p_org_slug: orgSlug,
        p_resource_slug: resourceSlug,
        p_start_date: format(selectedDate, 'yyyy-MM-dd'),
        p_days: 14,
      });

      if (error) throw error;
      setContext(data as any);
    } catch (error: any) {
      console.error('Error fetching booking context:', error);
      toast.error('Failed to load booking page');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedSlot) {
      toast.error('Please select a time slot');
      return;
    }

    if (!formData.customer_name) {
      toast.error('Please enter your name');
      return;
    }

    try {
      setSubmitting(true);
      const { data, error } = await supabase.rpc('public_booking_create_reservation' as any, {
        p_org_slug: orgSlug,
        p_resource_slug: resourceSlug,
        p_slot_id: selectedSlot.id,
        p_party_size: parseInt(formData.party_size),
        p_answers: formData.answers,
        p_customer_name: formData.customer_name,
        p_customer_phone: formData.customer_phone || null,
        p_customer_email: formData.customer_email || null,
      });

      if (error) throw error;

      toast.success('Booking created! Redirecting...');
      navigate(`/r/${data.qr_token}`);
    } catch (error: any) {
      console.error('Error creating reservation:', error);
      toast.error(error.message || 'Failed to create booking');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#FBF8F4' }}>
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!context) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#FBF8F4' }}>
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>Not Found</CardTitle>
            <CardDescription>This booking page could not be found</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const resource = context.resource;
  const availableSlots = context.slots.filter((slot: any) => slot.available > 0);
  
  // Group slots by date
  const slotsByDate = availableSlots.reduce((acc: any, slot: any) => {
    const date = format(new Date(slot.start_at), 'yyyy-MM-dd');
    if (!acc[date]) acc[date] = [];
    acc[date].push(slot);
    return acc;
  }, {});

  const dates = Object.keys(slotsByDate).slice(0, 7); // Show next 7 days with availability

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#FBF8F4' }}>
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          {resource.cover_image_url && (
            <img
              src={resource.cover_image_url}
              alt={resource.name}
              className="w-full h-64 object-cover rounded-lg mb-6"
            />
          )}
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <h1 className="text-4xl font-bold tracking-tight mb-2">{resource.name}</h1>
              {resource.description && (
                <p className="text-muted-foreground text-lg">{resource.description}</p>
              )}
            </div>
            <Badge variant="secondary" className="capitalize">
              {resource.type}
            </Badge>
          </div>

          <div className="flex flex-wrap gap-4 mt-4 text-muted-foreground">
            {resource.location_text && (
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                <span>{resource.location_text}</span>
              </div>
            )}
            {resource.base_price_amount !== null && (
              <div className="flex items-center gap-2">
                <DollarSign className="h-4 w-4" />
                <span>
                  {resource.currency} {resource.base_price_amount}
                  {resource.base_price_amount === 0 && ' (Free)'}
                </span>
              </div>
            )}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Date Selection */}
          <Card>
            <CardHeader>
              <CardTitle>Select Date</CardTitle>
            </CardHeader>
            <CardContent>
              {dates.length === 0 ? (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    No available time slots in the next 14 days. Please check back later.
                  </AlertDescription>
                </Alert>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {dates.map((date) => {
                    const dateObj = new Date(date);
                    const isSelected = format(selectedDate, 'yyyy-MM-dd') === date;
                    return (
                      <Button
                        key={date}
                        type="button"
                        variant={isSelected ? 'default' : 'outline'}
                        className="h-auto flex-col py-3"
                        onClick={() => {
                          setSelectedDate(dateObj);
                          setSelectedSlot(null);
                        }}
                      >
                        <div className="text-xs opacity-75">
                          {format(dateObj, 'EEE')}
                        </div>
                        <div className="text-lg font-bold">
                          {format(dateObj, 'MMM d')}
                        </div>
                        <div className="text-xs opacity-75">
                          {slotsByDate[date].length} slots
                        </div>
                      </Button>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Time Slot Selection */}
          {dates.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Select Time</CardTitle>
                <CardDescription>
                  {format(selectedDate, 'EEEE, MMMM d, yyyy')}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {slotsByDate[format(selectedDate, 'yyyy-MM-dd')]?.length > 0 ? (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {slotsByDate[format(selectedDate, 'yyyy-MM-dd')].map((slot: any) => {
                      const isSelected = selectedSlot?.id === slot.id;
                      return (
                        <Button
                          key={slot.id}
                          type="button"
                          variant={isSelected ? 'default' : 'outline'}
                          className="h-auto flex-col py-3"
                          onClick={() => setSelectedSlot(slot)}
                          disabled={slot.available === 0}
                        >
                          <Clock className="h-4 w-4 mb-1" />
                          <div className="font-semibold">
                            {format(new Date(slot.start_at), 'h:mm a')}
                          </div>
                          <div className="text-xs opacity-75">
                            {slot.available} available
                          </div>
                        </Button>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-center text-muted-foreground py-4">
                    No available slots for this date
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {/* Contact Information */}
          {selectedSlot && (
            <>
              <Card>
                <CardHeader>
                  <CardTitle>Your Information</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="customer_name">
                      Name <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="customer_name"
                      value={formData.customer_name}
                      onChange={(e) => setFormData({ ...formData, customer_name: e.target.value })}
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="customer_phone">Phone</Label>
                    <Input
                      id="customer_phone"
                      type="tel"
                      value={formData.customer_phone}
                      onChange={(e) => setFormData({ ...formData, customer_phone: e.target.value })}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="customer_email">Email</Label>
                    <Input
                      id="customer_email"
                      type="email"
                      value={formData.customer_email}
                      onChange={(e) => setFormData({ ...formData, customer_email: e.target.value })}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="party_size">Party Size</Label>
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-muted-foreground" />
                      <Input
                        id="party_size"
                        type="number"
                        min="1"
                        max={selectedSlot?.capacity || 10}
                        value={formData.party_size}
                        onChange={(e) => setFormData({ ...formData, party_size: e.target.value })}
                        className="w-24"
                      />
                      <span className="text-sm text-muted-foreground">
                        people
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Custom Form Fields */}
              {context.form_fields && context.form_fields.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>Additional Information</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {context.form_fields.map((field: any) => (
                      <div key={field.id} className="space-y-2">
                        <Label htmlFor={field.key}>
                          {field.label}
                          {field.required && <span className="text-destructive">*</span>}
                        </Label>
                        {field.help_text && (
                          <p className="text-sm text-muted-foreground">{field.help_text}</p>
                        )}
                        {field.field_type === 'long_text' ? (
                          <Textarea
                            id={field.key}
                            placeholder={field.placeholder}
                            required={field.required}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                answers: { ...formData.answers, [field.key]: e.target.value },
                              })
                            }
                          />
                        ) : (
                          <Input
                            id={field.key}
                            type={
                              field.field_type === 'email'
                                ? 'email'
                                : field.field_type === 'number'
                                ? 'number'
                                : field.field_type === 'date'
                                ? 'date'
                                : field.field_type === 'time'
                                ? 'time'
                                : 'text'
                            }
                            placeholder={field.placeholder}
                            required={field.required}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                answers: { ...formData.answers, [field.key]: e.target.value },
                              })
                            }
                          />
                        )}
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              {/* Submit */}
              <Card>
                <CardContent className="pt-6">
                  <Button type="submit" size="lg" className="w-full" disabled={submitting}>
                    {submitting ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Creating Booking...
                      </>
                    ) : (
                      <>
                        <Calendar className="h-4 w-4 mr-2" />
                        Confirm Booking
                      </>
                    )}
                  </Button>
                </CardContent>
              </Card>
            </>
          )}
        </form>
      </div>
    </div>
  );
}

