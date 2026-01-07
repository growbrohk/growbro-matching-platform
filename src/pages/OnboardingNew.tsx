import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

type Role = 'brand' | 'venue' | 'content_creator';
type Category = 'f&b' | 'retail' | 'service' | 'other';

export default function OnboardingNew() {
  const navigate = useNavigate();
  const { user, refreshOrgMemberships } = useAuth();
  const [loading, setLoading] = useState(false);
  
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

  const handleSubmit = async () => {
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

    setLoading(true);
    try {
      // Step 1: Create org
      const { data: createOrgData, error: createOrgError } = await supabase.rpc('create_org', { 
        p_name: name.trim() 
      });
      
      if (createOrgError) throw createOrgError;
      
      // Step 2: Refresh memberships to get the new org
      await refreshOrgMemberships();
      
      // Step 3: Get the created org id
      const { data: memberships, error: membershipError } = await supabase
        .from('org_members')
        .select('org_id')
        .eq('user_id', user?.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      
      if (membershipError || !memberships) {
        throw new Error('Failed to retrieve organization');
      }

      const orgId = memberships.org_id;

      // Step 4: Update org name
      const { error: updateOrgError } = await supabase
        .from('orgs')
        .update({ name: name.trim() })
        .eq('id', orgId);

      if (updateOrgError) throw updateOrgError;

      // Step 5: Insert/upsert org_profiles
      const { error: profileError } = await supabase
        .from('org_profiles')
        .upsert({
          org_id: orgId,
          roles,
          category,
          instagram: instagram.trim() || null,
          address: address.trim(),
          bio: bio.trim() || null,
          website: website.trim() || null,
          logo_url: logoUrl.trim() || null,
        }, {
          onConflict: 'org_id'
        });

      if (profileError) throw profileError;

      // Step 6: Final refresh and redirect
      await refreshOrgMemberships();
      toast.success('Profile created successfully!');
      navigate('/app/dashboard');
    } catch (error: any) {
      console.error('Error creating profile:', error);
      toast.error(error.message || 'Failed to create profile');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-6" style={{ backgroundColor: '#FBF8F4' }}>
      <div className="w-full max-w-2xl">
        <Card className="rounded-3xl border shadow-xl" style={{ borderColor: 'rgba(14,122,58,0.14)', backgroundColor: 'rgba(251,248,244,0.9)' }}>
          <CardHeader className="p-4 md:p-6">
            <CardTitle className="text-2xl" style={{ fontFamily: "'Inter Tight', sans-serif", color: '#0F1F17' }}>
              Create your Growbro profile
            </CardTitle>
            <CardDescription style={{ color: 'rgba(15,31,23,0.72)' }}>
              Takes less than 2 minutes
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4 md:p-6 pt-0 space-y-6">
            
            {/* A) Basic info */}
            <Card className="rounded-2xl border" style={{ borderColor: 'rgba(14,122,58,0.14)', backgroundColor: '#FBF8F4' }}>
              <CardHeader className="p-4">
                <CardTitle className="text-lg" style={{ fontFamily: "'Inter Tight', sans-serif", color: '#0F1F17' }}>
                  Basic info
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-0 space-y-4">
                
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
                    Select all that apply (You can change this later in Settings → Profile)
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

                <p className="text-xs pt-2 border-t" style={{ color: 'rgba(15,31,23,0.6)', borderColor: 'rgba(14,122,58,0.14)' }}>
                  You can edit your profile anytime via Settings → Profile
                </p>
              </CardContent>
            </Card>

            {/* B) Profile description (optional) */}
            <Card className="rounded-2xl border" style={{ borderColor: 'rgba(14,122,58,0.14)', backgroundColor: '#FBF8F4' }}>
              <CardHeader className="p-4">
                <CardTitle className="text-lg" style={{ fontFamily: "'Inter Tight', sans-serif", color: '#0F1F17' }}>
                  Profile description
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-0 space-y-4">
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
            <Card className="rounded-2xl border" style={{ borderColor: 'rgba(14,122,58,0.14)', backgroundColor: '#FBF8F4' }}>
              <CardHeader className="p-4">
                <CardTitle className="text-lg" style={{ fontFamily: "'Inter Tight', sans-serif", color: '#0F1F17' }}>
                  Optional
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-0 space-y-4">
                
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

            {/* Save button */}
            <div className="space-y-2">
              <Button
                onClick={handleSubmit}
                disabled={loading}
                className="w-full h-11"
                style={{ backgroundColor: '#0E7A3A', color: 'white' }}
              >
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create profile
              </Button>
              <p className="text-xs text-center" style={{ color: 'rgba(15,31,23,0.6)' }}>
                You can edit your profile anytime via Settings → Profile
              </p>
            </div>

          </CardContent>
        </Card>
      </div>
    </div>
  );
}
