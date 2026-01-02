import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { Calendar, Loader2, Plus, Search, MapPin, DollarSign } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

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

interface BookingResourcesListProps {
  typeFilter?: string;
  isEmbeddedInCatalog?: boolean;
}

export default function BookingResourcesList({ typeFilter: propTypeFilter, isEmbeddedInCatalog = false }: BookingResourcesListProps = {}) {
  const { currentOrg } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const urlTypeFilter = searchParams.get('type');
  const typeFilter = propTypeFilter || urlTypeFilter || 'event'; // Prop takes priority, then URL, then default
  
  const [loading, setLoading] = useState(true);
  const [resources, setResources] = useState<BookingResource[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newResource, setNewResource] = useState({
    name: '',
    type: typeFilter as 'space' | 'workshop' | 'event',
    description: '',
    location_text: '',
    base_price_amount: '',
  });

  useEffect(() => {
    if (currentOrg?.id) {
      fetchResources();
    }
  }, [currentOrg?.id]);

  // Update newResource type when typeFilter changes
  useEffect(() => {
    setNewResource((prev) => ({ ...prev, type: typeFilter as 'space' | 'workshop' | 'event' }));
  }, [typeFilter]);

  const fetchResources = async () => {
    if (!currentOrg?.id) return;

    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('booking_resources' as any)
        .select('*')
        .eq('org_id', currentOrg.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setResources(data as any || []);
    } catch (error: any) {
      console.error('Error fetching resources:', error);
      toast.error('Failed to load resources');
    } finally {
      setLoading(false);
    }
  };

  const generateSlug = (name: string) => {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
  };

  const handleCreate = async () => {
    if (!currentOrg?.id || !newResource.name) {
      toast.error('Please fill in all required fields');
      return;
    }

    try {
      setCreating(true);
      const slug = generateSlug(newResource.name);

      const { data, error } = await supabase
        .from('booking_resources' as any)
        .insert({
          org_id: currentOrg.id,
          name: newResource.name,
          slug,
          type: newResource.type,
          description: newResource.description || null,
          location_text: newResource.location_text || null,
          base_price_amount: newResource.base_price_amount
            ? parseInt(newResource.base_price_amount)
            : null,
          active: true,
        })
        .select()
        .single();

      if (error) throw error;

      toast.success('Resource created successfully');
      setShowNewDialog(false);
      setNewResource({
        name: '',
        type: 'space',
        description: '',
        location_text: '',
        base_price_amount: '',
      });
      fetchResources();
      
      // Navigate to the detail page with type parameter
      if (data) {
        navigate(`/app/booking/resources/${(data as any).id}?type=${typeFilter}`);
      }
    } catch (error: any) {
      console.error('Error creating resource:', error);
      toast.error(error.message || 'Failed to create resource');
    } finally {
      setCreating(false);
    }
  };

  const filteredResources = resources.filter((resource) => {
    const matchesSearch =
      resource.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      resource.description?.toLowerCase().includes(searchQuery.toLowerCase());
    
    // Filter by type: 'event' filter includes both 'event' and 'workshop'
    const matchesType =
      typeFilter === 'event'
        ? resource.type === 'event' || resource.type === 'workshop'
        : resource.type === typeFilter;
    
    return matchesSearch && matchesType;
  });

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'space':
        return 'bg-blue-100 text-blue-700';
      case 'workshop':
        return 'bg-purple-100 text-purple-700';
      case 'event':
        return 'bg-orange-100 text-orange-700';
      default:
        return 'bg-gray-100 text-gray-700';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: '#0E7A3A' }} />
      </div>
    );
  }

  return (
    <div className={`w-full min-w-0 ${isEmbeddedInCatalog ? 'px-4 py-6' : 'max-w-7xl mx-auto px-4 sm:px-6 lg:px-8'} space-y-4 md:space-y-6`}>
      {/* Header - Only show when NOT embedded in Catalog */}
      {!isEmbeddedInCatalog && (
        <div className="flex flex-wrap items-center justify-between gap-2 sm:gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="text-xl sm:text-2xl md:text-3xl font-extrabold tracking-tight truncate" style={{ fontFamily: "'Inter Tight', sans-serif", color: '#0F1F17' }}>
              {typeFilter === 'space' ? 'Spaces' : 'Events & Workshops'}
            </h1>
            <p className="mt-1 text-sm" style={{ color: 'rgba(15,31,23,0.72)' }}>
              {typeFilter === 'space'
                ? 'Manage your bookable spaces'
                : 'Manage your events, workshops, and classes'}
            </p>
          </div>
          <Button
            onClick={() => setShowNewDialog(true)}
            style={{ backgroundColor: '#0E7A3A', color: 'white' }}
            size="icon"
            className="h-8 w-8 sm:h-9 sm:w-auto sm:px-3 shrink-0"
            title={typeFilter === 'space' ? 'Create new space' : 'Create new event'}
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline sm:ml-2">{typeFilter === 'space' ? 'New Space' : 'New Event'}</span>
          </Button>
        </div>
      )}

      {/* Embedded header - Show when embedded in Catalog */}
      {isEmbeddedInCatalog && (
        <div className="flex flex-wrap items-center justify-between gap-2 sm:gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-lg sm:text-xl font-semibold truncate" style={{ color: '#0F1F17' }}>
              {typeFilter === 'space' ? 'Spaces' : 'Events & Workshops'}
            </h2>
          </div>
          <Button
            onClick={() => setShowNewDialog(true)}
            style={{ backgroundColor: '#0E7A3A', color: 'white' }}
            size="icon"
            className="h-8 w-8 sm:h-9 sm:w-auto sm:px-3 shrink-0"
            title={typeFilter === 'space' ? 'Create new space' : 'Create new event'}
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline sm:ml-2">{typeFilter === 'space' ? 'New Space' : 'New Event'}</span>
          </Button>
        </div>
      )}

      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search resources..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {filteredResources.length === 0 ? (
        <Card className="rounded-3xl border" style={{ borderColor: 'rgba(14,122,58,0.14)', backgroundColor: 'rgba(251,248,244,0.9)' }}>
          <CardContent className="flex flex-col items-center justify-center py-16 p-4 md:p-6">
            <Calendar className="h-16 w-16 mb-4" style={{ color: '#0E7A3A', opacity: 0.3 }} />
            <h3 className="text-xl font-semibold mb-2" style={{ color: '#0F1F17' }}>
              {typeFilter === 'space' ? 'No spaces yet' : 'No events yet'}
            </h3>
            <p className="text-center text-muted-foreground mb-6 max-w-md">
              {typeFilter === 'space'
                ? 'Get started by creating your first bookable space'
                : 'Get started by creating your first event or workshop'}
            </p>
            <Button
              onClick={() => setShowNewDialog(true)}
              style={{ backgroundColor: '#0E7A3A', color: 'white' }}
            >
              <Plus className="h-4 w-4 mr-2" />
              {typeFilter === 'space' ? 'Create Your First Space' : 'Create Your First Event'}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 w-full min-w-0">
          {filteredResources.map((resource) => (
            <Card
              key={resource.id}
              className="cursor-pointer hover:shadow-md transition-shadow w-full min-w-0"
              onClick={() => navigate(`/app/booking/resources/${resource.id}?type=${typeFilter}`)}
            >
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <CardTitle className="truncate text-base sm:text-lg">{resource.name}</CardTitle>
                    <CardDescription className="line-clamp-2 mt-1">
                      {resource.description || 'No description'}
                    </CardDescription>
                  </div>
                  <div className="flex flex-col gap-2">
                    <Badge className={getTypeColor(resource.type)} variant="secondary">
                      {resource.type}
                    </Badge>
                    {!resource.active && (
                      <Badge variant="outline" className="text-muted-foreground">
                        Inactive
                      </Badge>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {resource.location_text && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <MapPin className="h-4 w-4" />
                    <span className="truncate">{resource.location_text}</span>
                  </div>
                )}
                {resource.base_price_amount && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <DollarSign className="h-4 w-4" />
                    <span>
                      {resource.currency} {resource.base_price_amount}
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={showNewDialog} onOpenChange={setShowNewDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Create Booking Resource</DialogTitle>
            <DialogDescription>
              Add a new space, workshop, or event that can be booked
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">
                Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="name"
                value={newResource.name}
                onChange={(e) => setNewResource({ ...newResource, name: e.target.value })}
                placeholder="e.g., Co-working Space, Pottery Workshop"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="type">
                Type <span className="text-destructive">*</span>
              </Label>
              <Select
                value={newResource.type}
                onValueChange={(value: any) => setNewResource({ ...newResource, type: value })}
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

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={newResource.description}
                onChange={(e) => setNewResource({ ...newResource, description: e.target.value })}
                placeholder="Describe your resource..."
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="location">Location</Label>
              <Input
                id="location"
                value={newResource.location_text}
                onChange={(e) => setNewResource({ ...newResource, location_text: e.target.value })}
                placeholder="e.g., 123 Main St, Hong Kong"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="price">Base Price (HKD)</Label>
              <Input
                id="price"
                type="number"
                value={newResource.base_price_amount}
                onChange={(e) =>
                  setNewResource({ ...newResource, base_price_amount: e.target.value })
                }
                placeholder="0"
              />
              <p className="text-sm text-muted-foreground">Leave empty for free resources</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewDialog(false)} disabled={creating}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={creating || !newResource.name}>
              {creating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                'Create Resource'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

