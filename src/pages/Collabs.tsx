import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useSearchParams, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Layout } from '@/components/Layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Checkbox } from '@/components/ui/checkbox';
import { CollabChip } from '@/components/CollabChip';
import { VenueOptionChip } from '@/components/VenueOptionChip';
import { 
  CollabRequest, 
  Profile, 
  CollabType, 
  CollabStatus, 
  COLLAB_TYPE_LABELS,
  VenueCollabOption,
  VenueOptionType,
} from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import {
  Plus,
  Loader2,
  ArrowRight,
  Check,
  X,
  Clock,
  Handshake,
  Calendar,
  MapPin,
  Package,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface CollabRequestWithProfiles extends CollabRequest {
  from_profile?: Profile;
  to_profile?: Profile;
}

const STATUS_COLORS: Record<CollabStatus, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  accepted: 'bg-green-100 text-green-800',
  declined: 'bg-red-100 text-red-800',
  closed: 'bg-gray-100 text-gray-800',
};

const COLLAB_TYPES: CollabType[] = ['consignment', 'event', 'collab_product', 'cup_sleeve_marketing'];

export default function Collabs() {
  const { profile } = useAuth();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const newRequestTo = searchParams.get('newRequest');

  const [incomingRequests, setIncomingRequests] = useState<CollabRequestWithProfiles[]>([]);
  const [sentRequests, setSentRequests] = useState<CollabRequestWithProfiles[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form state
  const [selectedProfileId, setSelectedProfileId] = useState(newRequestTo || '');
  const [selectedCollabType, setSelectedCollabType] = useState<CollabType>('consignment');
  const [message, setMessage] = useState('');
  const [proposedStartDate, setProposedStartDate] = useState('');
  const [proposedEndDate, setProposedEndDate] = useState('');
  const [locationNotes, setLocationNotes] = useState('');
  const [budgetNotes, setBudgetNotes] = useState('');
  const [availableProfiles, setAvailableProfiles] = useState<Profile[]>([]);
  
  // Venue options state
  const [venueOptions, setVenueOptions] = useState<VenueCollabOption[]>([]);
  const [selectedVenueOptionIds, setSelectedVenueOptionIds] = useState<string[]>([]);
  const [loadingVenueOptions, setLoadingVenueOptions] = useState(false);

  useEffect(() => {
    fetchRequests();
    fetchAvailableProfiles();
    if (newRequestTo) {
      setDialogOpen(true);
    }
  }, [profile, newRequestTo]);

  // Fetch venue options when selected profile changes
  useEffect(() => {
    if (selectedProfileId && profile?.role === 'brand') {
      fetchVenueOptions(selectedProfileId);
    } else {
      setVenueOptions([]);
      setSelectedVenueOptionIds([]);
    }
  }, [selectedProfileId, profile?.role]);

  const fetchRequests = async () => {
    if (!profile) return;

    setLoading(true);
    try {
      // Fetch incoming requests
      const { data: incoming, error: incomingError } = await supabase
        .from('collab_requests')
        .select('*')
        .eq('to_user_id', profile.id)
        .order('created_at', { ascending: false });

      if (incomingError) throw incomingError;

      // Fetch sent requests
      const { data: sent, error: sentError } = await supabase
        .from('collab_requests')
        .select('*')
        .eq('from_user_id', profile.id)
        .order('created_at', { ascending: false });

      if (sentError) throw sentError;

      // Fetch related profiles
      const allUserIds = [
        ...((incoming as CollabRequest[]) || []).map((r) => r.from_user_id),
        ...((sent as CollabRequest[]) || []).map((r) => r.to_user_id),
      ];

      const { data: profiles } = await supabase
        .from('profiles')
        .select('*')
        .in('id', allUserIds);

      const profileMap = new Map((profiles as Profile[])?.map((p) => [p.id, p]));

      setIncomingRequests(
        ((incoming as CollabRequest[]) || []).map((r) => ({
          ...r,
          from_profile: profileMap.get(r.from_user_id),
        }))
      );

      setSentRequests(
        ((sent as CollabRequest[]) || []).map((r) => ({
          ...r,
          to_profile: profileMap.get(r.to_user_id),
        }))
      );
    } catch (error) {
      console.error('Error fetching requests:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchAvailableProfiles = async () => {
    if (!profile) return;

    const { data } = await supabase
      .from('profiles')
      .select('*')
      .neq('id', profile.id)
      .limit(100);

    setAvailableProfiles((data as Profile[]) || []);
  };

  const fetchVenueOptions = async (venueId: string) => {
    setLoadingVenueOptions(true);
    try {
      // Check if the selected profile is a venue
      const selectedProfile = availableProfiles.find(p => p.id === venueId);
      if (selectedProfile?.role !== 'venue') {
        setVenueOptions([]);
        return;
      }

      const { data, error } = await supabase
        .from('venue_collab_options')
        .select('*')
        .eq('venue_user_id', venueId)
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setVenueOptions((data as VenueCollabOption[]) || []);
    } catch (error) {
      console.error('Error fetching venue options:', error);
    } finally {
      setLoadingVenueOptions(false);
    }
  };

  const handleCreateRequest = async () => {
    if (!profile || !selectedProfileId) {
      toast({
        title: 'Missing recipient',
        description: 'Please select who to send the request to',
        variant: 'destructive',
      });
      return;
    }

    setSaving(true);
    try {
      // Create the collab request
      const { data: requestData, error: requestError } = await supabase
        .from('collab_requests')
        .insert({
          from_user_id: profile.id,
          to_user_id: selectedProfileId,
          collab_type: selectedCollabType,
          message: message || null,
          proposed_start_date: proposedStartDate || null,
          proposed_end_date: proposedEndDate || null,
          location_notes: locationNotes || null,
          budget_notes: budgetNotes || null,
          status: 'pending',
        })
        .select()
        .single();

      if (requestError) throw requestError;

      // Insert selected venue options if any
      if (selectedVenueOptionIds.length > 0 && requestData) {
        const venueOptionsToInsert = selectedVenueOptionIds.map(optionId => ({
          collab_request_id: requestData.id,
          venue_collab_option_id: optionId,
        }));

        const { error: venueOptionsError } = await supabase
          .from('collab_request_venue_options')
          .insert(venueOptionsToInsert);

        if (venueOptionsError) throw venueOptionsError;
      }

      toast({ title: 'Collab request sent!' });
      setDialogOpen(false);
      resetForm();
      fetchRequests();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to send request',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateStatus = async (requestId: string, status: CollabStatus) => {
    try {
      const { error } = await supabase
        .from('collab_requests')
        .update({ status })
        .eq('id', requestId);

      if (error) throw error;
      toast({ title: `Request ${status}` });
      fetchRequests();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: 'Failed to update request',
        variant: 'destructive',
      });
    }
  };

  const resetForm = () => {
    setSelectedProfileId('');
    setSelectedCollabType('consignment');
    setMessage('');
    setProposedStartDate('');
    setProposedEndDate('');
    setLocationNotes('');
    setBudgetNotes('');
    setVenueOptions([]);
    setSelectedVenueOptionIds([]);
  };

  const toggleVenueOption = (optionId: string) => {
    setSelectedVenueOptionIds(prev => 
      prev.includes(optionId) 
        ? prev.filter(id => id !== optionId)
        : [...prev, optionId]
    );
  };

  const selectedProfile = availableProfiles.find(p => p.id === selectedProfileId);

  const RequestCard = ({ request, isIncoming }: { request: CollabRequestWithProfiles; isIncoming: boolean }) => {
    const otherProfile = isIncoming ? request.from_profile : request.to_profile;

    return (
      <Card className="card-hover">
        <CardContent className="pt-6">
          <div className="flex items-start gap-4">
            <Avatar className="h-12 w-12">
              <AvatarImage src={otherProfile?.avatar_url} />
              <AvatarFallback className="bg-primary/10 text-primary">
                {otherProfile?.display_name?.charAt(0)?.toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold">{otherProfile?.display_name}</h3>
                  <p className="text-sm text-muted-foreground">@{otherProfile?.handle}</p>
                </div>
                <span className={cn('px-2 py-1 rounded-full text-xs font-medium capitalize', STATUS_COLORS[request.status])}>
                  {request.status}
                </span>
              </div>
              <div className="mt-2">
                <CollabChip type={request.collab_type} size="sm" />
              </div>
              {request.message && (
                <p className="text-sm text-muted-foreground mt-3 line-clamp-2">
                  {request.message}
                </p>
              )}
              <div className="flex items-center gap-2 mt-4">
                <Link to={`/profiles/${otherProfile?.handle}`}>
                  <Button variant="outline" size="sm">View Profile</Button>
                </Link>
                {isIncoming && request.status === 'pending' && (
                  <>
                    <Button
                      variant="success"
                      size="sm"
                      onClick={() => handleUpdateStatus(request.id, 'accepted')}
                    >
                      <Check className="h-4 w-4 mr-1" />
                      Accept
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive"
                      onClick={() => handleUpdateStatus(request.id, 'declined')}
                    >
                      <X className="h-4 w-4 mr-1" />
                      Decline
                    </Button>
                  </>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <Layout>
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight" style={{ fontFamily: "'Inter Tight', sans-serif", color: '#0F1F17' }}>Collaborations</h1>
            <p className="mt-1" style={{ color: 'rgba(15,31,23,0.72)' }}>
              Manage your collab requests
            </p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={(open) => {
            setDialogOpen(open);
            if (!open) resetForm();
          }}>
            <DialogTrigger asChild>
              <Button style={{ backgroundColor: '#0E7A3A', color: 'white' }}>
                <Plus className="h-4 w-4 mr-2" />
                New Request
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Send Collab Request</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label>Send to *</Label>
                  <Select value={selectedProfileId} onValueChange={setSelectedProfileId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a profile" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableProfiles.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.display_name} (@{p.handle}) - {p.role}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Collab Type *</Label>
                  <Select value={selectedCollabType} onValueChange={(v) => setSelectedCollabType(v as CollabType)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {COLLAB_TYPES.map((type) => (
                        <SelectItem key={type} value={type}>
                          {COLLAB_TYPE_LABELS[type]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Venue Options Selection - Only shown when brand sends to venue */}
                {profile?.role === 'brand' && selectedProfile?.role === 'venue' && (
                  <div className="space-y-3">
                    <Label className="flex items-center gap-2">
                      <Calendar className="h-4 w-4" />
                      Select Venue Spaces/Slots (optional)
                    </Label>
                    {loadingVenueOptions ? (
                      <div className="flex justify-center py-4">
                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                      </div>
                    ) : venueOptions.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-2">
                        This venue hasn't added any collab options yet
                      </p>
                    ) : (
                      <div className="space-y-2 max-h-48 overflow-y-auto rounded-lg border p-3">
                        {venueOptions.map((option) => (
                          <label
                            key={option.id}
                            className={cn(
                              'flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all',
                              selectedVenueOptionIds.includes(option.id)
                                ? 'border-primary bg-primary/5'
                                : 'border-border hover:border-primary/50'
                            )}
                          >
                            <Checkbox
                              checked={selectedVenueOptionIds.includes(option.id)}
                              onCheckedChange={() => toggleVenueOption(option.id)}
                              className="mt-0.5"
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <VenueOptionChip type={option.type as VenueOptionType} size="sm" showIcon={false} />
                              </div>
                              <p className="font-medium text-sm">{option.name}</p>
                              {option.short_description && (
                                <p className="text-xs text-muted-foreground line-clamp-1">
                                  {option.short_description}
                                </p>
                              )}
                              {option.location_note && (
                                <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                                  <MapPin className="h-3 w-3" />
                                  {option.location_note}
                                </p>
                              )}
                            </div>
                          </label>
                        ))}
                      </div>
                    )}
                    {selectedVenueOptionIds.length > 0 && (
                      <p className="text-xs text-muted-foreground">
                        {selectedVenueOptionIds.length} option(s) selected
                      </p>
                    )}
                  </div>
                )}

                <div className="space-y-2">
                  <Label>Your Pitch</Label>
                  <Textarea
                    placeholder="Introduce yourself and explain why you'd be a great collab partner..."
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    rows={4}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Start Date</Label>
                    <Input
                      type="date"
                      value={proposedStartDate}
                      onChange={(e) => setProposedStartDate(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>End Date</Label>
                    <Input
                      type="date"
                      value={proposedEndDate}
                      onChange={(e) => setProposedEndDate(e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Location Notes</Label>
                  <Input
                    placeholder="e.g. Our flagship store in Central"
                    value={locationNotes}
                    onChange={(e) => setLocationNotes(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Budget Notes</Label>
                  <Input
                    placeholder="e.g. $500–1000 for marketing"
                    value={budgetNotes}
                    onChange={(e) => setBudgetNotes(e.target.value)}
                  />
                </div>

                <div className="flex gap-3 pt-4">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => {
                      setDialogOpen(false);
                      resetForm();
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="hero"
                    className="flex-1"
                    onClick={handleCreateRequest}
                    disabled={saving}
                  >
                    {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Send Request
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <Tabs defaultValue="incoming">
          <TabsList className="grid w-full grid-cols-2 mb-6">
            <TabsTrigger value="incoming" className="gap-2">
              Incoming
              {incomingRequests.filter((r) => r.status === 'pending').length > 0 && (
                <span className="h-5 w-5 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center">
                  {incomingRequests.filter((r) => r.status === 'pending').length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="sent">Sent</TabsTrigger>
          </TabsList>

          <TabsContent value="incoming">
            {loading ? (
              <div className="flex justify-center py-20">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : incomingRequests.length === 0 ? (
              <Card className="text-center py-16">
                <CardContent>
                  <Handshake className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                  <h2 className="text-xl font-semibold mb-2">No incoming requests</h2>
                  <p className="text-muted-foreground">
                    When someone sends you a collab request, it will appear here
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {incomingRequests.map((request) => (
                  <RequestCard key={request.id} request={request} isIncoming />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="sent">
            {loading ? (
              <div className="flex justify-center py-20">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : sentRequests.length === 0 ? (
              <Card className="text-center py-16">
                <CardContent>
                  <Clock className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                  <h2 className="text-xl font-semibold mb-2">No sent requests</h2>
                  <p className="text-muted-foreground mb-6">
                    Start reaching out to potential collaborators
                  </p>
                  <Button variant="hero" onClick={() => setDialogOpen(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Send Your First Request
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {sentRequests.map((request) => (
                  <RequestCard key={request.id} request={request} isIncoming={false} />
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
