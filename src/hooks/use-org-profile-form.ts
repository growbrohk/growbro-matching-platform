import { useState, useCallback, useRef } from 'react';
import { useAuth, OrgProfile } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { uploadOrgProfileLogo } from '@/lib/storage/uploadOrgProfileLogo';
import { toast } from 'sonner';

export type OrgProfileCategory = 'f&b' | 'retail' | 'service' | 'other';

export interface OrgProfileFormState {
  name: string;
  instagram: string;
  category: OrgProfileCategory | '';
  address: string;
  bio: string;
  website: string;
  logoUrl: string;
}

export function useOrgProfileForm() {
  const { currentOrg, refreshOrgMemberships } = useAuth();
  const [loading, setLoading] = useState(true);
  const [profileExists, setProfileExists] = useState(true);
  const [name, setName] = useState('');
  const [instagram, setInstagram] = useState('');
  const [category, setCategory] = useState<OrgProfileCategory | ''>('');
  const [address, setAddress] = useState('');
  const [bio, setBio] = useState('');
  const [website, setWebsite] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [logoRenderNonce, setLogoRenderNonce] = useState(0);
  const logoFileInputRef = useRef<HTMLInputElement>(null);

  const applyProfileRow = useCallback((profile: OrgProfile) => {
    setProfileExists(true);
    setCategory((profile.category || '') as OrgProfileCategory);
    setInstagram(profile.instagram || '');
    setAddress(profile.address || '');
    setBio(profile.bio || '');
    setWebsite(profile.website || '');
    setLogoUrl(profile.logo_url || '');
  }, []);

  const loadProfile = useCallback(async () => {
    if (!currentOrg) return;

    try {
      setLoading(true);
      setName(currentOrg.name || '');

      const { data: profile, error } = await (supabase
        .from('org_profiles' as any)
        .select('*')
        .eq('org_id', currentOrg.id)
        .single()) as { data: OrgProfile | null; error: { code?: string } | null };

      if (error?.code === 'PGRST116') {
        setProfileExists(false);
        const metadata = currentOrg.metadata || {};
        if (metadata.category || metadata.address) {
          setCategory(metadata.category || '');
          setInstagram(metadata.instagram || '');
          setAddress(metadata.address || '');
          setBio(metadata.bio || '');
          setWebsite(metadata.website || '');
          setLogoUrl(metadata.logo_url || '');
        }
      } else if (error) {
        throw error;
      } else if (profile) {
        applyProfileRow(profile);
      }
    } catch (error: unknown) {
      console.error('Error loading profile:', error);
      toast.error('Failed to load profile');
    } finally {
      setLoading(false);
    }
  }, [currentOrg, applyProfileRow]);

  const hydrateFromProfileData = useCallback(
    (data: OrgProfile | null, orgName?: string) => {
      if (orgName !== undefined) setName(orgName);
      if (!data) {
        setProfileExists(false);
        return;
      }
      applyProfileRow(data);
    },
    [applyProfileRow]
  );

  const handleLogoFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !currentOrg?.id) return;

    setUploadingLogo(true);
    try {
      const publicUrl = await uploadOrgProfileLogo(file, currentOrg.id);
      setLogoUrl(publicUrl);
      setLogoRenderNonce((n) => n + 1);
      toast.success('Logo uploaded');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to upload logo';
      toast.error(message);
    } finally {
      setUploadingLogo(false);
    }
  };

  const validate = (): boolean => {
    if (!name.trim()) {
      toast.error('Please enter your name');
      return false;
    }
    if (!category) {
      toast.error('Please select a category');
      return false;
    }
    if (!address.trim()) {
      toast.error('Please enter your address');
      return false;
    }
    return true;
  };

  const saveProfile = async (): Promise<boolean> => {
    if (!validate() || !currentOrg) return false;

    const { error: updateOrgError } = await supabase
      .from('orgs')
      .update({ name: name.trim() })
      .eq('id', currentOrg.id);

    if (updateOrgError) throw updateOrgError;

    const profileData = {
      org_id: currentOrg.id,
      category,
      instagram: instagram.trim() || null,
      address: address.trim(),
      bio: bio.trim() || null,
      website: website.trim() || null,
      logo_url: logoUrl.trim() || null,
    };

    const { error: profileError } = await (supabase
      .from('org_profiles' as any)
      .upsert(profileData as any, { onConflict: 'org_id' })) as { error: { message?: string } | null };

    if (profileError) throw profileError;

    await refreshOrgMemberships();
    setProfileExists(true);
    return true;
  };

  const getFormState = (): OrgProfileFormState => ({
    name,
    instagram,
    category,
    address,
    bio,
    website,
    logoUrl,
  });

  return {
    currentOrg,
    loading,
    profileExists,
    name,
    setName,
    instagram,
    setInstagram,
    category,
    setCategory,
    address,
    setAddress,
    bio,
    setBio,
    website,
    setWebsite,
    logoUrl,
    setLogoUrl,
    uploadingLogo,
    logoRenderNonce,
    logoFileInputRef,
    handleLogoFileChange,
    loadProfile,
    hydrateFromProfileData,
    validate,
    saveProfile,
    getFormState,
  };
}
