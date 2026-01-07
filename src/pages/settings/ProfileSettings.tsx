import { useState, useEffect, useCallback } from 'react';
import { useAuth, OrgProfile } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';

type Role = 'brand' | 'venue' | 'content_creator';
type Category = 'f&b' | 'retail' | 'service' | 'other';

export default function ProfileSettings() {
  const navigate = useNavigate();
  const { currentOrg, refreshOrgMemberships } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profileExists, setProfileExists] = useState(true);
  
  // Form fields
  const [roles, setRoles] = useState<Role[]>([]);
  const [name, setName] = useState('');
  const [instagram, setInstagram] = useState('');
  const [category, setCategory] = useState<Category | ''>('');
  const [address, setAddress] = useState('');
  const [bio, setBio] = useState('');
  const [website, setWebsite] = useState('');
  const [logoUrl, setLogoUrl] = useState('');

  const handleRoleToggle = (role: Role) => {
    setRoles(prev => 
      prev.includes(role) 
        ? prev.filter(r => r !== role)
        : [...prev, role]
    );
  };

  const loadProfile = useCallback(async () => {
    if (!currentOrg) return;

    try {
      // Load org name
      setName(currentOrg.name || '');

      // Load profile from org_profiles table
      // Note: org_profiles table may not be in generated types yet, using type assertion
      const { data: profile, error } = await (supabase
        .from('org_profiles' as any)
        .select('*')
        .eq('org_id', currentOrg.id)
        .single()) as { data: OrgProfile | null; error: any };

      if (error) {
        // Profile doesn't exist yet - that's okay for migration
        if (error.code === 'PGRST116') {
          console.log('No profile found yet - will create on save');
          setProfileExists(false);
          
          // Optional: Try to migrate from old metadata if it exists
          const metadata = currentOrg.metadata || {};
          if (metadata.roles || metadata.category || metadata.address) {
            console.log('Found old metadata, prefilling form');
            setRoles(metadata.roles || []);
            setCategory(metadata.category || '');
            setInstagram(metadata.instagram || '');
            setAddress(metadata.address || '');
            setBio(metadata.bio || '');
            setWebsite(metadata.website || '');
            setLogoUrl(metadata.logo_url || '');
          }
        } else {
          throw error;
        }
      } else {
        // Profile exists
        setProfileExists(true);
        setRoles((profile.roles || []) as Role[]);
        setCategory((profile.category || '') as Category);
        setInstagram(profile.instagram || '');
        setAddress(profile.address || '');
        setBio(profile.bio || '');
        setWebsite(profile.website || '');
        setLogoUrl(profile.logo_url || '');
      }
    } catch (error: any) {
      console.error('Error loading profile:', error);
      toast.error('Failed to load profile');
    } finally {
      setLoading(false);
    }
  }, [currentOrg]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const handleSave = async () => {
    // Validation
    if (roles.length === 0) {
      toast.error('Please select at least one role');
      return;
    }
    if (!name.trim()) {
      toast.error('Please enter your name');
      return;
    }
    if (!category) {
      toast.error('Please select a category');
      return;
    }
    if (!address.trim()) {
      toast.error('Please enter your address');
      return;
    }

    setSaving(true);
    try {
      if (!currentOrg) throw new Error('No organization selected');

      console.log('Saving profile for org:', currentOrg.id);
      console.log('Profile data:', { roles, category, instagram, address, bio, website, logoUrl });

      // Update org name
      const { error: updateOrgError } = await supabase
        .from('orgs')
        .update({ name: name.trim() })
        .eq('id', currentOrg.id);

      if (updateOrgError) {
        console.error('Error updating org name:', updateOrgError);
        throw updateOrgError;
      }

      // Upsert org_profiles
      const profileData = {
        org_id: currentOrg.id,
        roles,
        category,
        instagram: instagram.trim() || null,
        address: address.trim(),
        bio: bio.trim() || null,
        website: website.trim() || null,
        logo_url: logoUrl.trim() || null,
      };

      console.log('Upserting profile data:', profileData);

      // Note: org_profiles table may not be in generated types yet, using type assertion
      const { data: upsertedProfile, error: profileError } = await (supabase
        .from('org_profiles' as any)
        .upsert(profileData as any, {
          onConflict: 'org_id'
        })
        .select()
        .single()) as { data: OrgProfile | null; error: any };

      if (profileError) {
        console.error('Error upserting profile:', profileError);
        console.error('Error details:', JSON.stringify(profileError, null, 2));
        throw profileError;
      }

      console.log('Profile upserted successfully:', upsertedProfile);

      // Refresh org memberships (updates org name)
      await refreshOrgMemberships();

      // Reload profile data to update local state and preview
      await loadProfile();

      setProfileExists(true);
      toast.success('Profile updated');
    } catch (error: any) {
      console.error('Error updating profile:', error);
      console.error('Error stack:', error.stack);
      toast.error(error.message || 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: '#0E7A3A' }} />
      </div>
    );
  }

  const getCategoryLabel = (cat: string) => {
    const labels: Record<string, string> = {
      'f&b': 'F&B',
      'retail': 'Retail',
      'service': 'Service',
      'other': 'Other'
    };
    return labels[cat] || cat;
  };

  return (
    <div className="max-w-3xl space-y-6 md:space-y-8">
      {/* Header */}
      <div>
        <Button 
          variant="ghost" 
          className="mb-4 -ml-2" 
          onClick={() => navigate('/app/settings')}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Settings
        </Button>
        <h1 className="text-3xl font-bold tracking-tight" style={{ fontFamily: "'Inter Tight', sans-serif", color: '#0F1F17' }}>
          Profile Settings
        </h1>
        <p className="mt-2 text-sm" style={{ color: 'rgba(15,31,23,0.72)' }}>
          Manage your brand or venue profile
        </p>
        {!profileExists && (
          <p className="mt-2 text-sm px-3 py-2 rounded-lg" style={{ backgroundColor: 'rgba(14,122,58,0.1)', color: '#0E7A3A' }}>
            Complete your profile to get started
          </p>
        )}
      </div>

      {/* A) Basic info */}
      <Card className="rounded-3xl border shadow-xl" style={{ borderColor: 'rgba(14,122,58,0.14)', backgroundColor: 'rgba(251,248,244,0.9)' }}>
        <CardHeader className="p-4 md:p-6">
          <CardTitle className="text-lg" style={{ fontFamily: "'Inter Tight', sans-serif", color: '#0F1F17' }}>
            Basic info
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 md:p-6 pt-0 space-y-4">
          
          {/* 1) Roles */}
          <div className="space-y-2">
            <Label style={{ color: '#0F1F17' }}>
              Roles <span className="text-red-500">*</span>
            </Label>
            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="role-brand" 
                  checked={roles.includes('brand')}
                  onCheckedChange={() => handleRoleToggle('brand')}
                />
                <label 
                  htmlFor="role-brand" 
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  style={{ color: '#0F1F17' }}
                >
                  Brand
                </label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="role-venue" 
                  checked={roles.includes('venue')}
                  onCheckedChange={() => handleRoleToggle('venue')}
                />
                <label 
                  htmlFor="role-venue" 
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  style={{ color: '#0F1F17' }}
                >
                  Venue
                </label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="role-content-creator" 
                  checked={roles.includes('content_creator')}
                  onCheckedChange={() => handleRoleToggle('content_creator')}
                />
                <label 
                  htmlFor="role-content-creator" 
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  style={{ color: '#0F1F17' }}
                >
                  Content Creator
                </label>
              </div>
            </div>
            <p className="text-xs" style={{ color: 'rgba(15,31,23,0.6)' }}>
              Select all that apply
            </p>
          </div>

          {/* 2) Name */}
          <div className="space-y-2">
            <Label htmlFor="name" style={{ color: '#0F1F17' }}>
              Name <span className="text-red-500">*</span>
            </Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your brand or venue name"
              className="h-10"
              style={{ backgroundColor: '#FBF8F4', color: '#0F1F17' }}
            />
          </div>

          {/* 3) Instagram */}
          <div className="space-y-2">
            <Label htmlFor="instagram" style={{ color: '#0F1F17' }}>
              Instagram <span className="text-xs text-gray-500">(optional)</span>
            </Label>
            <Input
              id="instagram"
              value={instagram}
              onChange={(e) => setInstagram(e.target.value)}
              placeholder="@handle or URL"
              className="h-10"
              style={{ backgroundColor: '#FBF8F4', color: '#0F1F17' }}
            />
          </div>

          {/* 4) Category */}
          <div className="space-y-2">
            <Label htmlFor="category" style={{ color: '#0F1F17' }}>
              Category <span className="text-red-500">*</span>
            </Label>
            <Select value={category} onValueChange={(val) => setCategory(val as Category)}>
              <SelectTrigger className="h-10" style={{ backgroundColor: '#FBF8F4', color: '#0F1F17' }}>
                <SelectValue placeholder="Select a category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="f&b">F&B</SelectItem>
                <SelectItem value="retail">Retail</SelectItem>
                <SelectItem value="service">Service</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* 5) Exact address */}
          <div className="space-y-2">
            <Label htmlFor="address" style={{ color: '#0F1F17' }}>
              Exact address <span className="text-red-500">*</span>
            </Label>
            <Textarea
              id="address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Street address, building name, unit number..."
              className="min-h-[80px]"
              style={{ backgroundColor: '#FBF8F4', color: '#0F1F17' }}
            />
            <p className="text-xs" style={{ color: 'rgba(15,31,23,0.6)' }}>
              Please type your actual address (street / building name).
            </p>
          </div>
        </CardContent>
      </Card>

      {/* B) Profile description (optional) */}
      <Card className="rounded-3xl border shadow-xl" style={{ borderColor: 'rgba(14,122,58,0.14)', backgroundColor: 'rgba(251,248,244,0.9)' }}>
        <CardHeader className="p-4 md:p-6">
          <CardTitle className="text-lg" style={{ fontFamily: "'Inter Tight', sans-serif", color: '#0F1F17' }}>
            Profile description
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 md:p-6 pt-0 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="bio" style={{ color: '#0F1F17' }}>
              Short intro <span className="text-xs text-gray-500">(optional)</span>
            </Label>
            <Textarea
              id="bio"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Tell collaborators about yourself..."
              className="min-h-[100px]"
              style={{ backgroundColor: '#FBF8F4', color: '#0F1F17' }}
            />
            <p className="text-xs" style={{ color: 'rgba(15,31,23,0.6)' }}>
              Shown to collaborators.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* C) Optional */}
      <Card className="rounded-3xl border shadow-xl" style={{ borderColor: 'rgba(14,122,58,0.14)', backgroundColor: 'rgba(251,248,244,0.9)' }}>
        <CardHeader className="p-4 md:p-6">
          <CardTitle className="text-lg" style={{ fontFamily: "'Inter Tight', sans-serif", color: '#0F1F17' }}>
            Optional
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 md:p-6 pt-0 space-y-4">
          
          {/* Website */}
          <div className="space-y-2">
            <Label htmlFor="website" style={{ color: '#0F1F17' }}>
              Website <span className="text-xs text-gray-500">(optional)</span>
            </Label>
            <Input
              id="website"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              placeholder="https://example.com"
              className="h-10"
              style={{ backgroundColor: '#FBF8F4', color: '#0F1F17' }}
            />
          </div>

          {/* Logo URL */}
          <div className="space-y-2">
            <Label htmlFor="logoUrl" style={{ color: '#0F1F17' }}>
              Logo URL <span className="text-xs text-gray-500">(optional)</span>
            </Label>
            <Input
              id="logoUrl"
              value={logoUrl}
              onChange={(e) => setLogoUrl(e.target.value)}
              placeholder="https://example.com/logo.png"
              className="h-10"
              style={{ backgroundColor: '#FBF8F4', color: '#0F1F17' }}
            />
          </div>
        </CardContent>
      </Card>

      {/* Public profile preview */}
      <Card className="rounded-3xl border shadow-xl" style={{ borderColor: 'rgba(14,122,58,0.14)', backgroundColor: 'rgba(251,248,244,0.9)' }}>
        <CardHeader className="p-4 md:p-6">
          <CardTitle className="text-lg" style={{ fontFamily: "'Inter Tight', sans-serif", color: '#0F1F17' }}>
            Public profile preview
          </CardTitle>
          <CardDescription>
            This is how your profile appears to collaborators
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4 md:p-6 pt-0">
          <div className="rounded-2xl border p-4 space-y-3" style={{ borderColor: 'rgba(14,122,58,0.14)', backgroundColor: '#FBF8F4' }}>
            {logoUrl && (
              <div className="flex justify-center mb-2">
                <img src={logoUrl} alt="Logo" className="h-16 w-16 object-cover rounded-lg" />
              </div>
            )}
            <div>
              <h3 className="font-semibold text-lg" style={{ color: '#0F1F17' }}>
                {name || 'Your name'}
              </h3>
              <p className="text-sm" style={{ color: 'rgba(15,31,23,0.72)' }}>
                {category ? getCategoryLabel(category) : 'Category not set'}
              </p>
            </div>
            {instagram && (
              <div>
                <p className="text-sm font-medium" style={{ color: '#0F1F17' }}>Instagram</p>
                <p className="text-sm" style={{ color: 'rgba(15,31,23,0.72)' }}>{instagram}</p>
              </div>
            )}
            <div>
              <p className="text-sm font-medium" style={{ color: '#0F1F17' }}>Address</p>
              <p className="text-sm" style={{ color: 'rgba(15,31,23,0.72)' }}>
                {address || 'Address not set'}
              </p>
            </div>
            {bio && (
              <div>
                <p className="text-sm font-medium" style={{ color: '#0F1F17' }}>About</p>
                <p className="text-sm" style={{ color: 'rgba(15,31,23,0.72)' }}>{bio}</p>
              </div>
            )}
            {website && (
              <div>
                <p className="text-sm font-medium" style={{ color: '#0F1F17' }}>Website</p>
                <a 
                  href={website} 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="text-sm underline"
                  style={{ color: '#0E7A3A' }}
                >
                  {website}
                </a>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Save button */}
      <div className="flex justify-end pb-8">
        <Button
          onClick={handleSave}
          disabled={saving}
          className="w-full sm:w-auto"
          style={{ backgroundColor: '#0E7A3A', color: 'white' }}
        >
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save changes
        </Button>
      </div>
    </div>
  );
}
