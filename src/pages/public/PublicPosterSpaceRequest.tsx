import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { toast } from 'sonner';
import { Calendar, Loader2, AlertCircle, ArrowLeft } from 'lucide-react';
import {
  getPublicPosterSpaceByShortCode,
  createBookingRequest,
  computeEndDate,
  checkBlackoutOverlap,
  type PosterSpace,
} from '@/lib/api/poster-spaces';
import PosterDatesPicker from '@/components/poster/PosterDatesPicker';
import { supabase } from '@/integrations/supabase/client';

export default function PublicPosterSpaceRequest() {
  const { spaceParam } = useParams<{ spaceParam: string }>();
  const navigate = useNavigate();
  const { user, currentOrg } = useAuth();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [space, setSpace] = useState<PosterSpace | null>(null);
  const [org, setOrg] = useState<any>(null);
  const [events, setEvents] = useState<{ id: string; title: string }[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);

  const [formData, setFormData] = useState({
    requested_start_date: '',
    duration_units: 1,
    event_id: '',
    message: '',
    requester_name: '',
    requester_email: '',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (spaceParam) {
      fetchSpace();
    }
  }, [spaceParam]);

  useEffect(() => {
    // Pre-fill user info if logged in
    if (user && user.email) {
      setFormData((prev) => ({
        ...prev,
        requester_email: user.email || '',
        requester_name: user.user_metadata?.full_name || '',
      }));
    }
  }, [user]);

  useEffect(() => {
    if (user && currentOrg?.id) {
      fetchEvents();
    }
  }, [user, currentOrg?.id]);

  const fetchSpace = async () => {
    if (!spaceParam) return;

    // Parse shortCode from spaceParam
    const shortCode = spaceParam.split('-')[0];

    try {
      setLoading(true);
      const result = await getPublicPosterSpaceByShortCode(shortCode);
      if (!result) {
        toast.error('Space not found');
        navigate(`/space/${spaceParam}`);
        return;
      }
      setSpace(result.space);
      setOrg(result.org);

      // Optional redirect to canonical URL if slug exists and URL slug mismatches
      if (result.org.slug) {
        const expectedUrl = `/space/${shortCode}-${result.org.slug}/request`;
        const currentUrl = `/space/${spaceParam}/request`;
        if (currentUrl !== expectedUrl) {
          navigate(expectedUrl, { replace: true });
          return;
        }
      }
    } catch (error: any) {
      console.error('Error fetching poster space:', error);
      toast.error('Failed to load space');
    } finally {
      setLoading(false);
    }
  };

  const fetchEvents = async () => {
    if (!user || !currentOrg?.id) return;

    try {
      setEventsLoading(true);
      const { data, error } = await supabase
        .from('events')
        .select('id, title')
        .eq('org_id', currentOrg.id)
        .order('start_at', { ascending: false });

      if (error) throw error;
      setEvents((data || []) as { id: string; title: string }[]);
    } catch (error: any) {
      console.error('Error fetching events:', error);
      // Don't show toast error for events - it's not critical for the form
    } finally {
      setEventsLoading(false);
    }
  };

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.requested_start_date) {
      newErrors.requested_start_date = 'Start date is required';
    } else {
      const startDate = new Date(formData.requested_start_date);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (startDate < today) {
        newErrors.requested_start_date = 'Start date cannot be in the past';
      }
    }

    if (!formData.duration_units || formData.duration_units < 1) {
      newErrors.duration_units = 'Duration is required';
    } else if (
      space &&
      space.allowed_durations &&
      !space.allowed_durations.includes(formData.duration_units)
    ) {
      newErrors.duration_units = `Duration must be one of: ${space.allowed_durations.join(', ')} ${space.booking_unit}s`;
    }

    // Only require event_id if there are events available
    if (events.length > 0 && !formData.event_id?.trim()) {
      newErrors.event_id = 'Event is required';
    }

    if (!user) {
      if (!formData.requester_name?.trim()) {
        newErrors.requester_name = 'Name is required';
      }
      if (!formData.requester_email?.trim()) {
        newErrors.requester_email = 'Email is required';
      } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.requester_email)) {
        newErrors.requester_email = 'Invalid email address';
      }
    }

    // Check blackout overlap
    if (space && formData.requested_start_date && formData.duration_units) {
      const endDate = computeEndDate(
        formData.requested_start_date,
        space.booking_unit,
        formData.duration_units
      );
      
      // Debug logs - parse dates as local to show actual values being compared
      const parseLocalDateForLog = (dateStr: string) => {
        const [year, month, day] = dateStr.split('-').map(Number);
        return new Date(year, month - 1, day);
      };
      
      console.debug('[Blackout Validation]', {
        requested_start_date: {
          raw: formData.requested_start_date,
          parsed_local: parseLocalDateForLog(formData.requested_start_date).toISOString(),
        },
        computed_end_date: {
          raw: endDate,
          parsed_local: parseLocalDateForLog(endDate).toISOString(),
        },
        duration_units: formData.duration_units,
        booking_unit: space.booking_unit,
        blackout_ranges: space.blackout_ranges?.map((r) => ({
          start: { raw: r.start, parsed_local: parseLocalDateForLog(r.start).toISOString() },
          end: { raw: r.end, parsed_local: parseLocalDateForLog(r.end).toISOString() },
        })),
      });
      
      const hasOverlap = checkBlackoutOverlap(formData.requested_start_date, endDate, space.blackout_ranges);
      
      if (hasOverlap) {
        // Find which blackout range overlaps
        const overlappingRange = space.blackout_ranges?.find((range) => {
          const start = parseLocalDateForLog(formData.requested_start_date);
          const end = parseLocalDateForLog(endDate);
          const rangeStart = parseLocalDateForLog(range.start);
          const rangeEnd = parseLocalDateForLog(range.end);
          
          const startOfDay = new Date(start.getFullYear(), start.getMonth(), start.getDate(), 0, 0, 0, 0);
          const endOfDay = new Date(end.getFullYear(), end.getMonth(), end.getDate(), 23, 59, 59, 999);
          const rangeStartOfDay = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), rangeStart.getDate(), 0, 0, 0, 0);
          const rangeEndOfDay = new Date(rangeEnd.getFullYear(), rangeEnd.getMonth(), rangeEnd.getDate(), 23, 59, 59, 999);
          
          return startOfDay <= rangeEndOfDay && endOfDay >= rangeStartOfDay;
        });
        
        console.debug('[Blackout Validation] Overlap detected', {
          overlapping_range: overlappingRange,
        });
        newErrors.requested_start_date = 'Selected dates overlap with a blackout period';
      } else {
        console.debug('[Blackout Validation] No overlap');
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validate() || !space || !spaceParam) return;

    try {
      setSubmitting(true);
      const endDate = computeEndDate(
        formData.requested_start_date,
        space.booking_unit,
        formData.duration_units
      );

      // TODO: Include event_id in createBookingRequest payload once backend supports it
      // Currently event_id is stored in formData and validated, but not sent to backend
      const request = await createBookingRequest({
        poster_space_id: space.id,
        requester_user_id: user?.id || null,
        requester_name: formData.requester_name || undefined,
        requester_email: formData.requester_email || undefined,
        message: formData.message || null,
        requested_start_date: formData.requested_start_date,
        duration_units: formData.duration_units,
        computed_end_date: endDate,
      });

      toast.success('Booking request submitted successfully');
      const shortCode = spaceParam.split('-')[0];
      const url = org?.slug
        ? `/space/${shortCode}-${org.slug}/request/${request.id}/success`
        : `/space/${shortCode}/request/${request.id}/success`;
      navigate(url);
    } catch (error: any) {
      console.error('Error creating booking request:', error);
      toast.error(error.message || 'Failed to submit booking request');
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

  if (!space || !org) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#FBF8F4' }}>
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>Not Found</CardTitle>
            <CardDescription>This poster space could not be found</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#FBF8F4' }}>
      <div className="max-w-2xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-6">
          <Button
            variant="ghost"
            onClick={() => {
              const shortCode = spaceParam?.split('-')[0] || space.short_code;
              const url = org?.slug
                ? `/space/${shortCode}-${org.slug}`
                : `/space/${shortCode}`;
              navigate(url);
            }}
            className="mb-4"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to space
          </Button>
          <h1 className="text-3xl font-bold mb-2">Request to Book</h1>
          <p className="text-muted-foreground">{space.title}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Dates */}
          <Card>
            <CardHeader>
              <CardTitle>Dates</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <PosterDatesPicker
                space={space}
                value={{
                  startDate: formData.requested_start_date,
                  durationUnits: formData.duration_units,
                }}
                onChange={(next) => {
                  setFormData((prev) => ({
                    ...prev,
                    requested_start_date: next.startDate || '',
                    duration_units: next.durationUnits,
                  }));
                  setErrors((prev) => ({
                    ...prev,
                    requested_start_date: '',
                    duration_units: '',
                  }));
                }}
                error={errors.requested_start_date || errors.duration_units}
              />
              {formData.requested_start_date && formData.duration_units && (
                <p className="text-sm text-muted-foreground">
                  End date:{' '}
                  {computeEndDate(
                    formData.requested_start_date,
                    space.booking_unit,
                    formData.duration_units
                  )}
                </p>
              )}
            </CardContent>
          </Card>

          {/* Event */}
          <Card>
            <CardHeader>
              <CardTitle>Event</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {eventsLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading events...
                </div>
              ) : events.length === 0 ? (
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    You don't have any events yet. Create your first event to start a poster collab.
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      navigate('/app/events/new');
                    }}
                  >
                    Create event
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  <Label htmlFor="event_id">
                    Event <span className="text-destructive">*</span>
                  </Label>
                  <Select
                    value={formData.event_id}
                    onValueChange={(value) => {
                      setFormData({ ...formData, event_id: value });
                      setErrors({ ...errors, event_id: '' });
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select an event" />
                    </SelectTrigger>
                    <SelectContent>
                      {events.map((event) => (
                        <SelectItem key={event.id} value={event.id}>
                          {event.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.event_id && (
                    <Alert variant="destructive">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>{errors.event_id}</AlertDescription>
                    </Alert>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Contact Info (if not logged in) */}
          {!user && (
            <Card>
              <CardHeader>
                <CardTitle>Your Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="requester_name">
                    Name <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="requester_name"
                    value={formData.requester_name}
                    onChange={(e) => {
                      setFormData({ ...formData, requester_name: e.target.value });
                      setErrors({ ...errors, requester_name: '' });
                    }}
                    required
                  />
                  {errors.requester_name && (
                    <Alert variant="destructive">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>{errors.requester_name}</AlertDescription>
                    </Alert>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="requester_email">
                    Email <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="requester_email"
                    type="email"
                    value={formData.requester_email}
                    onChange={(e) => {
                      setFormData({ ...formData, requester_email: e.target.value });
                      setErrors({ ...errors, requester_email: '' });
                    }}
                    required
                  />
                  {errors.requester_email && (
                    <Alert variant="destructive">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>{errors.requester_email}</AlertDescription>
                    </Alert>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Message */}
          <Card>
            <CardHeader>
              <CardTitle>Message (Optional)</CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                value={formData.message}
                onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                placeholder="Add any additional information..."
                rows={4}
              />
            </CardContent>
          </Card>

          {/* Submit */}
          <Card>
            <CardContent className="pt-6">
              <Button
                type="submit"
                size="lg"
                className="w-full"
                disabled={submitting || (!eventsLoading && events.length === 0)}
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  <>
                    <Calendar className="h-4 w-4 mr-2" />
                    Submit Request
                  </>
                )}
              </Button>
              {!eventsLoading && events.length === 0 && (
                <p className="text-sm text-muted-foreground mt-2 text-center">
                  Create an event before submitting a poster request.
                </p>
              )}
            </CardContent>
          </Card>
        </form>
      </div>
    </div>
  );
}

