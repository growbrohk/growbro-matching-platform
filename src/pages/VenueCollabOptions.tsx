import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Layout } from '@/components/Layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { CollabChip } from '@/components/CollabChip';
import { VenueOptionChip } from '@/components/VenueOptionChip';
import { VenueCollabOption, VenueOptionType, CollabType, VENUE_OPTION_TYPE_LABELS } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import {
  Plus,
  Edit,
  Trash2,
  Loader2,
  MapPin,
  Calendar,
  DollarSign,
  Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const VENUE_OPTION_TYPES: VenueOptionType[] = ['event_slot', 'shelf_space', 'exhibition_period', 'wall_space', 'other'];
const COLLAB_TYPES: CollabType[] = ['consignment', 'event', 'collab_product', 'cup_sleeve_marketing'];

export default function VenueCollabOptions() {
  const { profile } = useAuth();
  const { toast } = useToast();
  const [options, setOptions] = useState<VenueCollabOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingOption, setEditingOption] = useState<VenueCollabOption | null>(null);

  // Form state
  const [name, setName] = useState('');
  const [type, setType] = useState<VenueOptionType>('event_slot');
  const [shortDescription, setShortDescription] = useState('');
  const [fullDescription, setFullDescription] = useState('');
  const [collabTypes, setCollabTypes] = useState<CollabType[]>([]);
  const [availableFrom, setAvailableFrom] = useState('');
  const [availableTo, setAvailableTo] = useState('');
  const [recurringPattern, setRecurringPattern] = useState('');
  const [capacityNote, setCapacityNote] = useState('');
  const [locationNote, setLocationNote] = useState('');
  const [pricingNote, setPricingNote] = useState('');
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    fetchOptions();
  }, [profile]);

  const fetchOptions = async () => {
    if (!profile) return;

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('venue_collab_options')
        .select('*')
        .eq('venue_user_id', profile.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setOptions((data as VenueCollabOption[]) || []);
    } catch (error) {
      console.error('Error fetching venue options:', error);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setName('');
    setType('event_slot');
    setShortDescription('');
    setFullDescription('');
    setCollabTypes([]);
    setAvailableFrom('');
    setAvailableTo('');
    setRecurringPattern('');
    setCapacityNote('');
    setLocationNote('');
    setPricingNote('');
    setIsActive(true);
    setEditingOption(null);
  };

  const openEditDialog = (option: VenueCollabOption) => {
    setEditingOption(option);
    setName(option.name);
    setType(option.type);
    setShortDescription(option.short_description || '');
    setFullDescription(option.full_description || '');
    setCollabTypes((option.collab_types as CollabType[]) || []);
    setAvailableFrom(option.available_from ? option.available_from.slice(0, 16) : '');
    setAvailableTo(option.available_to ? option.available_to.slice(0, 16) : '');
    setRecurringPattern(option.recurring_pattern || '');
    setCapacityNote(option.capacity_note || '');
    setLocationNote(option.location_note || '');
    setPricingNote(option.pricing_note || '');
    setIsActive(option.is_active);
    setDialogOpen(true);
  };

  const toggleCollabType = (collabType: CollabType) => {
    setCollabTypes((prev) =>
      prev.includes(collabType) ? prev.filter((t) => t !== collabType) : [...prev, collabType]
    );
  };

  const handleSave = async () => {
    if (!profile || !name.trim()) {
      toast({
        title: 'Missing name',
        description: 'Option name is required',
        variant: 'destructive',
      });
      return;
    }

    setSaving(true);
    try {
      const optionData = {
        venue_user_id: profile.id,
        name: name.trim(),
        type,
        short_description: shortDescription || null,
        full_description: fullDescription || null,
        collab_types: collabTypes,
        available_from: availableFrom || null,
        available_to: availableTo || null,
        recurring_pattern: recurringPattern || null,
        capacity_note: capacityNote || null,
        location_note: locationNote || null,
        pricing_note: pricingNote || null,
        is_active: isActive,
      };

      if (editingOption) {
        const { error } = await supabase
          .from('venue_collab_options')
          .update(optionData)
          .eq('id', editingOption.id);

        if (error) throw error;
        toast({ title: 'Collab option updated' });
      } else {
        const { error } = await supabase.from('venue_collab_options').insert(optionData);
        if (error) throw error;
        toast({ title: 'Collab option created' });
      }

      setDialogOpen(false);
      resetForm();
      fetchOptions();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to save collab option',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (optionId: string) => {
    if (!confirm('Are you sure you want to delete this collab option?')) return;

    try {
      const { error } = await supabase.from('venue_collab_options').delete().eq('id', optionId);
      if (error) throw error;
      toast({ title: 'Collab option deleted' });
      fetchOptions();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: 'Failed to delete collab option',
        variant: 'destructive',
      });
    }
  };

  const formatAvailability = (option: VenueCollabOption) => {
    if (option.recurring_pattern) return option.recurring_pattern;
    if (option.available_from || option.available_to) {
      const from = option.available_from ? new Date(option.available_from).toLocaleDateString() : '';
      const to = option.available_to ? new Date(option.available_to).toLocaleDateString() : '';
      if (from && to) return `${from} – ${to}`;
      if (from) return `From ${from}`;
      if (to) return `Until ${to}`;
    }
    return null;
  };

  if (profile?.role !== 'venue') {
    return (
      <Layout>
        <div className="text-center py-20">
          <h1 className="text-2xl font-bold mb-2">Collab Options are for venues only</h1>
          <p className="text-muted-foreground">This feature is available for venue accounts.</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold">Collab Menu</h1>
            <p className="text-muted-foreground mt-1">
              Manage your available slots, spaces, and collaboration options
            </p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={(open) => {
            setDialogOpen(open);
            if (!open) resetForm();
          }}>
            <DialogTrigger asChild>
              <Button variant="hero">
                <Plus className="h-4 w-4 mr-2" />
                Add Option
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>
                  {editingOption ? 'Edit Collab Option' : 'Add Collab Option'}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label>Name *</Label>
                  <Input
                    placeholder="e.g. Bar Shelf – Front Counter"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Type *</Label>
                  <Select value={type} onValueChange={(v) => setType(v as VenueOptionType)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {VENUE_OPTION_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>
                          {VENUE_OPTION_TYPE_LABELS[t]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Short Description</Label>
                  <Input
                    placeholder="Brief summary"
                    value={shortDescription}
                    onChange={(e) => setShortDescription(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Full Description</Label>
                  <Textarea
                    placeholder="Detailed description..."
                    value={fullDescription}
                    onChange={(e) => setFullDescription(e.target.value)}
                    rows={3}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Suitable for collab types</Label>
                  <div className="flex flex-wrap gap-2">
                    {COLLAB_TYPES.map((ct) => (
                      <button
                        key={ct}
                        type="button"
                        onClick={() => toggleCollabType(ct)}
                        className={cn(
                          'px-3 py-1.5 rounded-full border text-sm transition-all',
                          collabTypes.includes(ct)
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-border hover:border-primary/50'
                        )}
                      >
                        {ct.replace('_', ' ')}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Available From</Label>
                    <Input
                      type="datetime-local"
                      value={availableFrom}
                      onChange={(e) => setAvailableFrom(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Available To</Label>
                    <Input
                      type="datetime-local"
                      value={availableTo}
                      onChange={(e) => setAvailableTo(e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Recurring Pattern</Label>
                  <Input
                    placeholder="e.g. Every Saturday 4–7pm"
                    value={recurringPattern}
                    onChange={(e) => setRecurringPattern(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Location Note</Label>
                  <Input
                    placeholder="e.g. Next to cashier, Back room wall"
                    value={locationNote}
                    onChange={(e) => setLocationNote(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Capacity Note</Label>
                  <Input
                    placeholder="e.g. Max 1 brand, Up to 3 products"
                    value={capacityNote}
                    onChange={(e) => setCapacityNote(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Pricing Note</Label>
                  <Input
                    placeholder="e.g. Revenue share 70/30, Flat $500/week"
                    value={pricingNote}
                    onChange={(e) => setPricingNote(e.target.value)}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <Label>Active</Label>
                  <Switch checked={isActive} onCheckedChange={setIsActive} />
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
                    onClick={handleSave}
                    disabled={saving}
                  >
                    {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    {editingOption ? 'Save Changes' : 'Add Option'}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : options.length === 0 ? (
          <Card className="text-center py-16">
            <CardContent>
              <Calendar className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
              <h2 className="text-xl font-semibold mb-2">No collab options yet</h2>
              <p className="text-muted-foreground mb-6">
                Add your first slot or space to start attracting brand collaborations
              </p>
              <Button variant="hero" onClick={() => setDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Add Your First Option
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {options.map((option) => (
              <Card key={option.id} className={cn('card-hover', !option.is_active && 'opacity-60')}>
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between mb-3">
                    <VenueOptionChip type={option.type} size="sm" />
                    {!option.is_active && (
                      <span className="text-xs px-2 py-1 bg-muted rounded-full">Inactive</span>
                    )}
                  </div>
                  
                  <h3 className="font-semibold text-lg mb-2">{option.name}</h3>
                  
                  {option.short_description && (
                    <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
                      {option.short_description}
                    </p>
                  )}

                  {option.collab_types && option.collab_types.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-3">
                      {option.collab_types.slice(0, 2).map((ct) => (
                        <CollabChip key={ct} type={ct as CollabType} size="sm" showIcon={false} />
                      ))}
                      {option.collab_types.length > 2 && (
                        <span className="text-xs text-muted-foreground px-2 py-0.5">
                          +{option.collab_types.length - 2}
                        </span>
                      )}
                    </div>
                  )}

                  <div className="space-y-1 text-xs text-muted-foreground mb-4">
                    {formatAvailability(option) && (
                      <div className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {formatAvailability(option)}
                      </div>
                    )}
                    {option.location_note && (
                      <div className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {option.location_note}
                      </div>
                    )}
                    {option.capacity_note && (
                      <div className="flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        {option.capacity_note}
                      </div>
                    )}
                    {option.pricing_note && (
                      <div className="flex items-center gap-1">
                        <DollarSign className="h-3 w-3" />
                        {option.pricing_note}
                      </div>
                    )}
                  </div>

                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => openEditDialog(option)}
                    >
                      <Edit className="h-4 w-4 mr-1" />
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(option.id)}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
