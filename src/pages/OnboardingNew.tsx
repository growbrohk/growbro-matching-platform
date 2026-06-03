import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Upload } from 'lucide-react';
import { uploadOrgProfileLogo } from '@/lib/storage/uploadOrgProfileLogo';
import { toast } from 'sonner';

type Category = 'f&b' | 'retail' | 'service' | 'other';

export default function OnboardingNew() {
  const navigate = useNavigate();
  const { user, refreshOrgMemberships } = useAuth();
  const [loading, setLoading] = useState(false);
  
  // Form fields
  const [name, setName] = useState('');
  const [instagram, setInstagram] = useState('');
  const [category, setCategory] = useState<Category | ''>('');
  const [address, setAddress] = useState('');
  const [website, setWebsite] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null);
  const logoFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!logoFile) {
      setLogoPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(logoFile);
    setLogoPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [logoFile]);

  const handleSubmit = async () => {
    // Validation
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

      // Step 5: Logo — uploaded file wins over pasted URL
      let resolvedLogoUrl: string | null = logoUrl.trim() || null;
      if (logoFile) {
        resolvedLogoUrl = await uploadOrgProfileLogo(logoFile, orgId);
      }

      // Step 6: Insert/upsert org_profiles
      // Note: org_profiles table may not be in generated types yet, using type assertion
      const { error: profileError } = await (supabase
        .from('org_profiles' as any)
        .upsert({
          org_id: orgId,
          category,
          instagram: instagram.trim() || null,
          address: address.trim(),
          bio: null,
          website: website.trim() || null,
          logo_url: resolvedLogoUrl,
        } as any, {
          onConflict: 'org_id'
        })) as { error: any };

      if (profileError) throw profileError;

      // Step 7: Final refresh and redirect
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
                {/* Name */}
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
                  You can edit your profile anytime via Account → Edit page
                </p>
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

                {/* Logo upload + optional URL */}
                <div className="space-y-2">
                  <Label style={{ color: '#0F1F17' }}>
                    Logo <span className="text-xs text-gray-500">(optional)</span>
                  </Label>
                  <input
                    ref={logoFileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    id="logo-upload-onboarding"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = '';
                      if (file) setLogoFile(file);
                    }}
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="h-10"
                      style={{ borderColor: 'rgba(14,122,58,0.25)', color: '#0F1F17' }}
                      disabled={loading}
                      onClick={() => logoFileInputRef.current?.click()}
                    >
                      <Upload className="mr-2 h-4 w-4" />
                      Upload photo
                    </Button>
                    {logoFile ? (
                      <Button
                        type="button"
                        variant="ghost"
                        className="h-10 px-2 text-xs"
                        style={{ color: 'rgba(15,31,23,0.72)' }}
                        disabled={loading}
                        onClick={() => setLogoFile(null)}
                      >
                        Remove file
                      </Button>
                    ) : null}
                    {(logoPreviewUrl || (!logoFile && logoUrl.trim())) ? (
                      <img
                        src={logoPreviewUrl || logoUrl}
                        alt=""
                        className="h-10 w-10 rounded-lg border object-cover"
                        style={{ borderColor: 'rgba(14,122,58,0.14)' }}
                      />
                    ) : null}
                  </div>
                  <Label htmlFor="logoUrl" className="text-xs font-normal" style={{ color: 'rgba(15,31,23,0.72)' }}>
                    Or paste image URL
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
                You can edit your profile anytime via Account → Edit page
              </p>
            </div>

          </CardContent>
        </Card>
      </div>
    </div>
  );
}
