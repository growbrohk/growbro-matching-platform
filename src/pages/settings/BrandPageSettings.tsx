import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, OrgProfile } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, ArrowLeft, Upload, Image as ImageIcon } from 'lucide-react';
import { toast } from 'sonner';
import { compressReceiptImage } from '@/lib/images/compressReceiptImage';

function withCacheBust(url: string): string {
  return `${url}${url.includes('?') ? '&' : '?'}v=${Date.now()}`;
}

export default function BrandPageSettings() {
  const navigate = useNavigate();
  const { currentOrg } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profileExists, setProfileExists] = useState(true);
  const [uploadingHero, setUploadingHero] = useState<number | null>(null);
  const [uploadingDesc, setUploadingDesc] = useState<number | null>(null);
  const [uploadingIllustration, setUploadingIllustration] = useState(false);

  const [heroBannerImages, setHeroBannerImages] = useState<string[]>(['', '', '']);
  const [heroHeadline, setHeroHeadline] = useState('');
  const [heroSubheadline, setHeroSubheadline] = useState('');
  const [descriptionIntro, setDescriptionIntro] = useState('');
  const [descriptionBody, setDescriptionBody] = useState('');
  const [descriptionImages, setDescriptionImages] = useState<string[]>(['', '', '', '', '', '', '']);
  const [descriptionIllustrationUrl, setDescriptionIllustrationUrl] = useState('');
  const [descriptionTagline, setDescriptionTagline] = useState('');
  const [descriptionTaglineBody, setDescriptionTaglineBody] = useState('');
  const [footerTagline, setFooterTagline] = useState('');
  const [footerContactEmail, setFooterContactEmail] = useState('');
  const [footerLinks, setFooterLinks] = useState<{ label: string; url: string }[]>([
    { label: 'Meet us on the Run', url: '' },
    { label: 'FAQs', url: '' },
    { label: 'Contact', url: '' },
  ]);

  const loadProfile = useCallback(async () => {
    if (!currentOrg) return;
    try {
      const { data, error } = await (supabase
        .from('org_profiles' as any)
        .select('*')
        .eq('org_id', currentOrg.id)
        .single()) as { data: OrgProfile | null; error: any };

      if (error?.code === 'PGRST116') {
        setProfileExists(false);
      } else if (!error && data) {
        setProfileExists(true);
        const heroImgs = data.hero_banner_images;
        const heroArr = Array.isArray(heroImgs) ? heroImgs : [];
        if (heroArr.length > 0) {
          setHeroBannerImages([heroArr[0] || '', heroArr[1] || '', heroArr[2] || '']);
        } else if (data.hero_banner_url) {
          setHeroBannerImages([data.hero_banner_url, '', '']);
        } else {
          setHeroBannerImages(['', '', '']);
        }
        setHeroHeadline(data.hero_headline || '');
        setHeroSubheadline(data.hero_subheadline || '');
        setDescriptionIntro(data.description_intro || '');
        setDescriptionBody(data.description_body || '');
        const imgs = data.description_images;
        const imgArr = Array.isArray(imgs) ? imgs : [];
        setDescriptionImages([imgArr[0] || '', imgArr[1] || '', imgArr[2] || '', imgArr[3] || '', imgArr[4] || '', imgArr[5] || '', imgArr[6] || '']);
        setDescriptionIllustrationUrl(data.description_illustration_url || '');
        setDescriptionTagline(data.description_tagline || '');
        setDescriptionTaglineBody(data.description_tagline_body || '');
        setFooterTagline(data.footer_tagline || '');
        setFooterContactEmail(data.footer_contact_email || '');
        setFooterLinks(
          Array.isArray(data.footer_links) && data.footer_links.length > 0
            ? data.footer_links
            : [
                { label: 'Meet us on the Run', url: '' },
                { label: 'FAQs', url: '' },
                { label: 'Contact', url: '' },
              ]
        );
      }
    } catch (err) {
      console.error('Error loading brand page:', err);
      toast.error('Failed to load brand page settings');
    } finally {
      setLoading(false);
    }
  }, [currentOrg]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const uploadHeroBannerImage = async (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentOrg?.id) return;
    e.target.value = '';

    setUploadingHero(index);
    try {
      const compressed = await compressReceiptImage(file, {
        targetSizeBytes: 500 * 1024,
        maxDimension: 1920,
      });
      const path = `${currentOrg.id}/hero/${index + 1}.webp`;
      const { error } = await supabase.storage
        .from('brand-page-assets')
        .upload(path, compressed, { upsert: true, contentType: 'image/webp' });
      if (error) throw error;
      const { data } = supabase.storage.from('brand-page-assets').getPublicUrl(path);
      setHeroBannerImages((prev) => {
        const next = [...prev];
        next[index] = withCacheBust(data.publicUrl);
        return next;
      });
      toast.success(`Hero image ${index + 1} uploaded`);
    } catch (err: any) {
      toast.error(err.message || 'Upload failed');
    } finally {
      setUploadingHero(null);
    }
  };

  const uploadDescriptionIllustration = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentOrg?.id) return;
    e.target.value = '';

    setUploadingIllustration(true);
    try {
      const compressed = await compressReceiptImage(file, {
        targetSizeBytes: 200 * 1024,
        maxDimension: 800,
      });
      const path = `${currentOrg.id}/description/illustration.webp`;
      const { error } = await supabase.storage
        .from('brand-page-assets')
        .upload(path, compressed, { upsert: true, contentType: 'image/webp' });
      if (error) throw error;
      const { data } = supabase.storage.from('brand-page-assets').getPublicUrl(path);
      setDescriptionIllustrationUrl(withCacheBust(data.publicUrl));
      toast.success('Illustration uploaded');
    } catch (err: any) {
      toast.error(err.message || 'Upload failed');
    } finally {
      setUploadingIllustration(false);
    }
  };

  const uploadDescriptionImage = async (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentOrg?.id) return;
    e.target.value = '';

    setUploadingDesc(index);
    try {
      const compressed = await compressReceiptImage(file, {
        targetSizeBytes: 300 * 1024,
        maxDimension: 1200,
      });
      const path = `${currentOrg.id}/description/${index + 1}.webp`;
      const { error } = await supabase.storage
        .from('brand-page-assets')
        .upload(path, compressed, { upsert: true, contentType: 'image/webp' });
      if (error) throw error;
      const { data } = supabase.storage.from('brand-page-assets').getPublicUrl(path);
      setDescriptionImages((prev) => {
        const next = [...prev];
        next[index] = withCacheBust(data.publicUrl);
        return next;
      });
      toast.success(`Image ${index + 1} uploaded`);
    } catch (err: any) {
      toast.error(err.message || 'Upload failed');
    } finally {
      setUploadingDesc(null);
    }
  };

  const handleSave = async () => {
    if (!currentOrg) return;
    setSaving(true);
    try {
      const { error } = await (supabase
        .from('org_profiles' as any)
        .update({
          hero_banner_url: heroBannerImages[0] || null,
          hero_banner_images: heroBannerImages.filter(Boolean),
          hero_headline: heroHeadline || null,
          hero_subheadline: heroSubheadline || null,
          description_intro: descriptionIntro || null,
          description_body: descriptionBody || null,
          description_images: descriptionImages.filter(Boolean),
          description_illustration_url: descriptionIllustrationUrl || null,
          description_tagline: descriptionTagline || null,
          description_tagline_body: descriptionTaglineBody || null,
          footer_tagline: footerTagline || null,
          footer_contact_email: footerContactEmail || null,
          footer_links: footerLinks.filter((l) => l.label.trim() && l.url.trim()),
        })
        .eq('org_id', currentOrg.id)) as { error: any };

      if (error) throw error;
      toast.success('Brand page saved');
    } catch (err: any) {
      toast.error(err.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  if (!currentOrg) {
    return (
      <div className="flex items-center justify-center py-12">
        <p style={{ color: '#0F1F17' }}>No organization selected</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: '#0E7A3A' }} />
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-6 md:space-y-8">
      <div>
        <Button variant="ghost" className="mb-4 -ml-2" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
        <h1 className="text-3xl font-bold tracking-tight" style={{ fontFamily: "'Inter Tight', sans-serif", color: '#0F1F17' }}>
          Brand Page
        </h1>
        <p className="mt-2 text-sm" style={{ color: 'rgba(15,31,23,0.72)' }}>
          Customize your public brand page. Add hero, description, and footer content.
        </p>
        {!profileExists && (
          <p className="mt-2 text-sm px-3 py-2 rounded-lg" style={{ backgroundColor: 'rgba(239,68,68,0.1)', color: '#dc2626' }}>
            Complete your profile first in{' '}
            <button type="button" onClick={() => navigate('/app/settings/profile')} className="underline font-medium">
              Edit Profile
            </button>
          </p>
        )}
      </div>

      {/* Hero */}
      <Card className="rounded-3xl border shadow-xl" style={{ borderColor: 'rgba(14,122,58,0.14)', backgroundColor: 'rgba(251,248,244,0.9)' }}>
        <CardHeader>
          <CardTitle>Hero Banner</CardTitle>
          <CardDescription>Main banner at the top of your brand page</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Banner Carousel (3 photos)</Label>
            <div className="grid grid-cols-3 gap-4">
              {[0, 1, 2].map((i) => (
                <div key={i} className="space-y-2">
                  {heroBannerImages[i] ? (
                    <img src={heroBannerImages[i]} alt="" className="aspect-[16/10] w-full object-cover rounded-lg" />
                  ) : (
                    <div className="aspect-[16/10] w-full rounded-lg border border-dashed flex items-center justify-center bg-muted/50">
                      <ImageIcon className="h-8 w-8 text-muted-foreground" />
                    </div>
                  )}
                  <label className="block">
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      disabled={uploadingHero === i}
                      onChange={(e) => uploadHeroBannerImage(i, e)}
                    />
                    <span className="text-xs text-primary cursor-pointer hover:underline">
                      {uploadingHero === i ? 'Uploading...' : 'Upload'}
                    </span>
                  </label>
                </div>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <Label>Headline</Label>
            <Input
              value={heroHeadline}
              onChange={(e) => setHeroHeadline(e.target.value)}
              placeholder="e.g. Run to EXPLORE"
            />
          </div>
          <div className="space-y-2">
            <Label>Subheadline</Label>
            <Input
              value={heroSubheadline}
              onChange={(e) => setHeroSubheadline(e.target.value)}
              placeholder="e.g. One baby step at a time."
            />
          </div>
        </CardContent>
      </Card>

      {/* Description */}
      <Card className="rounded-3xl border shadow-xl" style={{ borderColor: 'rgba(14,122,58,0.14)', backgroundColor: 'rgba(251,248,244,0.9)' }}>
        <CardHeader>
          <CardTitle>About Section</CardTitle>
          <CardDescription>Layout: illustration + text, square photo carousel, tagline heading + paragraph</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Illustration (e.g. dog + frog mascot)</Label>
            <div className="flex items-center gap-4">
              {descriptionIllustrationUrl ? (
                <img src={descriptionIllustrationUrl} alt="Illustration" className="h-24 w-24 object-contain rounded-lg border" />
              ) : (
                <div className="h-24 w-24 rounded-lg border border-dashed flex items-center justify-center bg-muted/50">
                  <ImageIcon className="h-8 w-8 text-muted-foreground" />
                </div>
              )}
              <label className="cursor-pointer">
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={uploadingIllustration}
                  onChange={uploadDescriptionIllustration}
                />
                <span className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border text-sm hover:bg-muted">
                  <Upload className="h-4 w-4" />
                  {uploadingIllustration ? 'Uploading...' : 'Upload'}
                </span>
              </label>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Intro Paragraph (orange text)</Label>
            <Textarea
              value={descriptionIntro}
              onChange={(e) => setDescriptionIntro(e.target.value)}
              placeholder="First paragraph..."
              rows={3}
            />
          </div>
          <div className="space-y-2">
            <Label>Body Paragraph (dark grey text)</Label>
            <Textarea
              value={descriptionBody}
              onChange={(e) => setDescriptionBody(e.target.value)}
              placeholder="Second paragraph..."
              rows={3}
            />
          </div>
          <div className="space-y-2">
            <Label>Square Photo Carousel (up to 7)</Label>
            <div className="grid grid-cols-4 md:grid-cols-7 gap-4">
              {[0, 1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="space-y-2">
                  {descriptionImages[i] ? (
                    <img src={descriptionImages[i]} alt="" className="aspect-square w-full object-cover rounded-lg" />
                  ) : (
                    <div className="aspect-square w-full rounded-lg border border-dashed flex items-center justify-center bg-muted/50">
                      <ImageIcon className="h-8 w-8 text-muted-foreground" />
                    </div>
                  )}
                  <label className="block">
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      disabled={uploadingDesc === i}
                      onChange={(e) => uploadDescriptionImage(i, e)}
                    />
                    <span className="text-xs text-primary cursor-pointer hover:underline">
                      {uploadingDesc === i ? 'Uploading...' : 'Upload'}
                    </span>
                  </label>
                </div>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <Label>Tagline Heading</Label>
            <Input
              value={descriptionTagline}
              onChange={(e) => setDescriptionTagline(e.target.value)}
              placeholder="e.g. 777 run club isn't just events."
            />
          </div>
          <div className="space-y-2">
            <Label>Tagline Paragraph</Label>
            <Textarea
              value={descriptionTaglineBody}
              onChange={(e) => setDescriptionTaglineBody(e.target.value)}
              placeholder="e.g. it's a proof that when we move together. we build something lasting - stronger bodies, stronger bonds, stronger brand love."
              rows={3}
            />
          </div>
        </CardContent>
      </Card>

      {/* Footer */}
      <Card className="rounded-3xl border shadow-xl" style={{ borderColor: 'rgba(14,122,58,0.14)', backgroundColor: 'rgba(251,248,244,0.9)' }}>
        <CardHeader>
          <CardTitle>Footer</CardTitle>
          <CardDescription>Footer tagline and contact</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Footer Tagline</Label>
            <Input
              value={footerTagline}
              onChange={(e) => setFooterTagline(e.target.value)}
              placeholder="e.g. Run to explore. One baby step at a time."
            />
          </div>
          <div className="space-y-2">
            <Label>Contact Email</Label>
            <Input
              type="email"
              value={footerContactEmail}
              onChange={(e) => setFooterContactEmail(e.target.value)}
              placeholder="hello@example.com"
            />
          </div>
          <div className="space-y-2">
            <Label>Footer Links</Label>
            {footerLinks.map((link, i) => (
              <div key={i} className="flex gap-2">
                <Input
                  value={link.label}
                  onChange={(e) =>
                    setFooterLinks((prev) => {
                      const next = [...prev];
                      next[i] = { ...next[i], label: e.target.value };
                      return next;
                    })
                  }
                  placeholder="Label"
                  className="flex-1"
                />
                <Input
                  value={link.url}
                  onChange={(e) =>
                    setFooterLinks((prev) => {
                      const next = [...prev];
                      next[i] = { ...next[i], url: e.target.value };
                      return next;
                    })
                  }
                  placeholder="URL"
                  className="flex-1"
                />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end pb-8">
        <Button
          onClick={handleSave}
          disabled={saving || !profileExists}
          style={{ backgroundColor: '#0E7A3A', color: 'white' }}
        >
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save
        </Button>
      </div>
    </div>
  );
}
