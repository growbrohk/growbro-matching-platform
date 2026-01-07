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
  getPublicPosterSpace,
  createBookingRequest,
  computeEndDate,
  checkBlackoutOverlap,
  type PosterSpace,
} from '@/lib/api/poster-spaces';

export default function PublicPosterSpaceRequest() {
  const { orgSlug, spaceId } = useParams<{ orgSlug: string; spaceId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [space, setSpace] = useState<PosterSpace | null>(null);
  const [org, setOrg] = useState<any>(null);

  const [formData, setFormData] = useState({
    requested_start_date: '',
    duration_units: 1,
    message: '',
    requester_name: '',
    requester_email: '',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (orgSlug && spaceId) {
      fetchSpace();
    }
  }, [orgSlug, spaceId]);

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

  const fetchSpace = async () => {
    if (!orgSlug || !spaceId) return;

    try {
      setLoading(true);
      const result = await getPublicPosterSpace(orgSlug, spaceId);
      if (!result) {
        toast.error('Space not found');
        navigate(`/o/${orgSlug}/spaces/${spaceId}`);
        return;
      }
      setSpace(result.space);
      setOrg(result.org);
    } catch (error: any) {
      console.error('Error fetching poster space:', error);
      toast.error('Failed to load space');
    } finally {
      setLoading(false);
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
      if (checkBlackoutOverlap(formData.requested_start_date, endDate, space.blackout_ranges)) {
        newErrors.requested_start_date = 'Selected dates overlap with a blackout period';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validate() || !space || !orgSlug || !spaceId) return;

    try {
      setSubmitting(true);
      const endDate = computeEndDate(
        formData.requested_start_date,
        space.booking_unit,
        formData.duration_units
      );

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
      navigate(`/o/${orgSlug}/spaces/${spaceId}/request/${request.id}/success`);
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
            onClick={() => navigate(`/o/${orgSlug}/spaces/${spaceId}`)}
            className="mb-4"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to space
          </Button>
          <h1 className="text-3xl font-bold mb-2">Request to Book</h1>
          <p className="text-muted-foreground">{space.title}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Start Date */}
          <Card>
            <CardHeader>
              <CardTitle>Start Date</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="start_date">
                  Start date <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="start_date"
                  type="date"
                  value={formData.requested_start_date}
                  onChange={(e) => {
                    setFormData({ ...formData, requested_start_date: e.target.value });
                    setErrors({ ...errors, requested_start_date: '' });
                  }}
                  min={new Date().toISOString().split('T')[0]}
                  required
                />
                {errors.requested_start_date && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{errors.requested_start_date}</AlertDescription>
                  </Alert>
                )}
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
              </div>
            </CardContent>
          </Card>

          {/* Duration */}
          <Card>
            <CardHeader>
              <CardTitle>Duration</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="duration">
                  Duration <span className="text-destructive">*</span>
                </Label>
                <Select
                  value={formData.duration_units.toString()}
                  onValueChange={(value) => {
                    setFormData({ ...formData, duration_units: parseInt(value) });
                    setErrors({ ...errors, duration_units: '' });
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {space.allowed_durations.map((duration) => (
                      <SelectItem key={duration} value={duration.toString()}>
                        {duration} {space.booking_unit}
                        {duration > 1 ? 's' : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.duration_units && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{errors.duration_units}</AlertDescription>
                  </Alert>
                )}
              </div>
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
              <Button type="submit" size="lg" className="w-full" disabled={submitting}>
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
            </CardContent>
          </Card>
        </form>
      </div>
    </div>
  );
}

