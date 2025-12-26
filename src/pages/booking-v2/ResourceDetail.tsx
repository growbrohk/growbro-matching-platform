import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { ArrowLeft, Loader2, Save, ExternalLink } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import FormBuilder from './components/FormBuilder';
import AvailabilityBuilder from './components/AvailabilityBuilder';

interface BookingResource {
  id: string;
  org_id: string;
  type: 'space' | 'workshop' | 'event';
  name: string;
  slug: string;
  description: string | null;
  location_text: string | null;
  timezone: string;
  active: boolean;
  cover_image_url: string | null;
  base_price_amount: number | null;
  currency: string;
  created_at: string;
}

export default function ResourceDetail() {
  const { id } = useParams<{ id: string }>();
  const { currentOrg } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [resource, setResource] = useState<BookingResource | null>(null);
  const [activeTab, setActiveTab] = useState('overview');

  useEffect(() => {
    if (currentOrg?.id && id) {
      fetchResource();
    }
  }, [currentOrg?.id, id]);

  const fetchResource = async () => {
    if (!currentOrg?.id || !id) return;

    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('booking_resources')
        .select('*')
        .eq('id', id)
        .eq('org_id', currentOrg.id)
        .single();

      if (error) throw error;
      setResource(data);
    } catch (error: any) {
      console.error('Error fetching resource:', error);
      toast.error('Failed to load resource');
      navigate('/app/booking-v2/resources');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!currentOrg?.id || !resource) return;

    try {
      setSaving(true);
      const { error } = await supabase
        .from('booking_resources')
        .update({
          name: resource.name,
          type: resource.type,
          description: resource.description,
          location_text: resource.location_text,
          timezone: resource.timezone,
          active: resource.active,
          cover_image_url: resource.cover_image_url,
          base_price_amount: resource.base_price_amount,
          currency: resource.currency,
        })
        .eq('id', resource.id);

      if (error) throw error;

      toast.success('Resource updated successfully');
      fetchResource();
    } catch (error: any) {
      console.error('Error saving resource:', error);
      toast.error('Failed to save resource');
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

  if (!resource) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <p className="text-muted-foreground">Resource not found</p>
      </div>
    );
  }

  const publicUrl = `${window.location.origin}/book/${currentOrg?.slug}/${resource.slug}`;

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate('/app/booking-v2/resources')}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold tracking-tight">{resource.name}</h1>
              <Badge variant={resource.active ? 'default' : 'secondary'}>
                {resource.active ? 'Active' : 'Inactive'}
              </Badge>
            </div>
            <p className="text-muted-foreground mt-1">/{resource.slug}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.open(publicUrl, '_blank')}
          >
            <ExternalLink className="h-4 w-4 mr-2" />
            Preview
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                Save
              </>
            )}
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="availability">Availability</TabsTrigger>
          <TabsTrigger value="form">Booking Form</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Basic Information</CardTitle>
              <CardDescription>Edit resource details and settings</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Resource Name</Label>
                  <Input
                    id="name"
                    value={resource.name}
                    onChange={(e) => setResource({ ...resource, name: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="type">Type</Label>
                  <Select
                    value={resource.type}
                    onValueChange={(value: any) => setResource({ ...resource, type: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="space">Space</SelectItem>
                      <SelectItem value="workshop">Workshop</SelectItem>
                      <SelectItem value="event">Event</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={resource.description || ''}
                  onChange={(e) => setResource({ ...resource, description: e.target.value })}
                  rows={4}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="location">Location</Label>
                <Input
                  id="location"
                  value={resource.location_text || ''}
                  onChange={(e) => setResource({ ...resource, location_text: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="cover-image">Cover Image URL</Label>
                <Input
                  id="cover-image"
                  value={resource.cover_image_url || ''}
                  onChange={(e) => setResource({ ...resource, cover_image_url: e.target.value })}
                  placeholder="https://example.com/image.jpg"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="price">Base Price</Label>
                  <Input
                    id="price"
                    type="number"
                    value={resource.base_price_amount || ''}
                    onChange={(e) =>
                      setResource({
                        ...resource,
                        base_price_amount: e.target.value ? parseInt(e.target.value) : null,
                      })
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="currency">Currency</Label>
                  <Select
                    value={resource.currency}
                    onValueChange={(value) => setResource({ ...resource, currency: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="HKD">HKD</SelectItem>
                      <SelectItem value="USD">USD</SelectItem>
                      <SelectItem value="CNY">CNY</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="timezone">Timezone</Label>
                <Input
                  id="timezone"
                  value={resource.timezone}
                  onChange={(e) => setResource({ ...resource, timezone: e.target.value })}
                />
              </div>

              <div className="flex items-center justify-between pt-4 border-t">
                <div className="space-y-0.5">
                  <Label htmlFor="active">Active Status</Label>
                  <p className="text-sm text-muted-foreground">
                    Inactive resources won't be visible to the public
                  </p>
                </div>
                <Switch
                  id="active"
                  checked={resource.active}
                  onCheckedChange={(checked) => setResource({ ...resource, active: checked })}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Public Booking URL</CardTitle>
              <CardDescription>Share this link with your customers</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <Input value={publicUrl} readOnly className="font-mono text-sm" />
                <Button
                  variant="outline"
                  onClick={() => {
                    navigator.clipboard.writeText(publicUrl);
                    toast.success('URL copied to clipboard');
                  }}
                >
                  Copy
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="availability">
          <AvailabilityBuilder resourceId={resource.id} />
        </TabsContent>

        <TabsContent value="form">
          <FormBuilder resourceId={resource.id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

