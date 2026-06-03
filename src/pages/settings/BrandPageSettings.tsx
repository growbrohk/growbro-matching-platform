import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, OrgProfile } from '@/contexts/AuthContext';
import { useOrgProfileForm } from '@/hooks/use-org-profile-form';
import OrgProfileFormSections from '@/components/settings/OrgProfileFormSections';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, ArrowLeft, Upload, Image as ImageIcon, ChevronUp, ChevronDown, CreditCard, Smartphone, QrCode } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { compressReceiptImage } from '@/lib/images/compressReceiptImage';

function withCacheBust(url: string): string {
  return `${url}${url.includes('?') ? '&' : '?'}v=${Date.now()}`;
}

export default function BrandPageSettings() {
  const navigate = useNavigate();
  const { currentOrg, refreshOrgMemberships } = useAuth();
  const orgForm = useOrgProfileForm();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profileExists, setProfileExists] = useState(true);
  const [uploadingHero, setUploadingHero] = useState<number | null>(null);
  const [uploadingDesc, setUploadingDesc] = useState<number | null>(null);
  const [uploadingIllustration, setUploadingIllustration] = useState(false);
  const [uploadingFooterIllustration, setUploadingFooterIllustration] = useState(false);

  const [heroBannerImages, setHeroBannerImages] = useState<string[]>(['', '', '']);
  const [heroHeadline, setHeroHeadline] = useState('');
  const [heroSubheadline, setHeroSubheadline] = useState('');
  const [descriptionIntro, setDescriptionIntro] = useState('');
  const [descriptionBody, setDescriptionBody] = useState('');
  const [descriptionImages, setDescriptionImages] = useState<string[]>(['', '', '', '', '', '', '']);
  const [descriptionIllustrationUrl, setDescriptionIllustrationUrl] = useState('');
  const [descriptionTagline, setDescriptionTagline] = useState('');
  const [descriptionTaglineBody, setDescriptionTaglineBody] = useState('');
  const [accentColor, setAccentColor] = useState('#E85D04');
  const [topSection, setTopSection] = useState<'events' | 'products' | 'both' | 'hidden'>('events');
  const [bottomSection, setBottomSection] = useState<'events' | 'products' | 'both' | 'hidden'>('products');
  const [eventsFilter, setEventsFilter] = useState<'all' | 'non_expired'>('all');
  const [eventsSort, setEventsSort] = useState<'manual' | 'random' | 'date' | 'creation'>('creation');
  const [eventsDisplayOrder, setEventsDisplayOrder] = useState<string[]>([]);
  const [productsFilter, setProductsFilter] = useState<'all' | 'in_sale_only'>('all');
  const [productsSort, setProductsSort] = useState<'manual' | 'random' | 'date' | 'creation'>('creation');
  const [productsDisplayOrder, setProductsDisplayOrder] = useState<string[]>([]);
  const [reorderEvents, setReorderEvents] = useState<{ id: string; title: string }[]>([]);
  const [reorderProducts, setReorderProducts] = useState<{ id: string; title: string }[]>([]);
  const [footerTagline, setFooterTagline] = useState('');
  const [footerBody, setFooterBody] = useState('');
  const [footerIllustrationUrl, setFooterIllustrationUrl] = useState('');
  const [footerContactEmail, setFooterContactEmail] = useState('');
  const [enableStripe, setEnableStripe] = useState(false);
  const [enablePayme, setEnablePayme] = useState(false);
  const [enableFps, setEnableFps] = useState(false);
  const [paymeLink, setPaymeLink] = useState('');
  const [fpsLink, setFpsLink] = useState('');
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
        orgForm.hydrateFromProfileData(null, currentOrg.name);
      } else if (!error && data) {
        setProfileExists(true);
        orgForm.hydrateFromProfileData(data, currentOrg.name);
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
        setAccentColor(data.accent_color || '#E85D04');
        setTopSection((data as any).top_section || 'events');
        setBottomSection((data as any).bottom_section || 'products');
        setEventsFilter((data as any).events_filter || 'all');
        setEventsSort((data as any).events_sort || 'creation');
        setEventsDisplayOrder(Array.isArray((data as any).events_display_order) ? (data as any).events_display_order : []);
        setProductsFilter((data as any).products_filter || 'all');
        setProductsSort((data as any).products_sort || 'creation');
        setProductsDisplayOrder(Array.isArray((data as any).products_display_order) ? (data as any).products_display_order : []);
        setFooterTagline(data.footer_tagline || '');
        setFooterBody((data as any).footer_body || '');
        setFooterIllustrationUrl((data as any).footer_illustration_url || '');
        setFooterContactEmail(data.footer_contact_email || '');
        setEnableStripe((data as any).enable_stripe ?? false);
        setEnablePayme((data as any).enable_payme ?? false);
        setEnableFps((data as any).enable_fps ?? false);
        setPaymeLink((data as any).payme_link || '');
        setFpsLink((data as any).fps_link || '');
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
  }, [currentOrg, orgForm.hydrateFromProfileData]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const loadReorderItems = useCallback(async () => {
    if (!currentOrg?.id) return;
    try {
      const eventsQuery = supabase
        .from('events')
        .select('id, title, end_at, day_2_end_at')
        .eq('org_id', currentOrg.id)
        .eq('status', 'published');
      const [eventsRes, productsRes] = await Promise.all([
        eventsQuery,
        (supabase.from('products') as any).select('id, title, is_on_sale').eq('org_id', currentOrg.id).eq('type', 'physical'),
      ]);
      let eventsData = (eventsRes.data || []) as { id: string; title: string; end_at?: string; day_2_end_at?: string | null }[];
      if (eventsFilter === 'non_expired') {
        const now = new Date();
        eventsData = eventsData.filter((e) => {
          const latestEnd = e.day_2_end_at || e.end_at;
          return latestEnd && new Date(latestEnd) >= now;
        });
      }
      let productsData = (productsRes.data || []) as { id: string; title: string; is_on_sale?: boolean }[];
      if (productsFilter === 'in_sale_only') {
        productsData = productsData.filter((p: { is_on_sale?: boolean }) => p.is_on_sale !== false);
      }
      setReorderEvents(eventsData.map((e) => ({ id: e.id, title: e.title })));
      setReorderProducts(productsData.map((p) => ({ id: p.id, title: p.title })));
    } catch (err) {
      console.error('Error loading reorder items:', err);
    }
  }, [currentOrg?.id, eventsFilter, productsFilter]);

  useEffect(() => {
    loadReorderItems();
  }, [loadReorderItems]);

  const getMergedOrder = (order: string[], items: { id: string; title: string }[]) => {
    const ordered = order.filter((id) => items.some((x) => x.id === id));
    const rest = items.filter((x) => !order.includes(x.id)).map((x) => x.id);
    return [...ordered, ...rest];
  };

  const moveItem = (items: { id: string; title: string }[], order: string[], setOrder: (v: string[]) => void, index: number, direction: 'up' | 'down') => {
    const merged = getMergedOrder(order, items);
    const idx = direction === 'up' ? index - 1 : index + 1;
    if (idx < 0 || idx >= merged.length) return;
    const next = [...merged];
    [next[index], next[idx]] = [next[idx], next[index]];
    setOrder(next);
  };

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

  const uploadFooterIllustration = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentOrg?.id) return;
    e.target.value = '';

    setUploadingFooterIllustration(true);
    try {
      const compressed = await compressReceiptImage(file, {
        targetSizeBytes: 200 * 1024,
        maxDimension: 800,
      });
      const path = `${currentOrg.id}/footer/illustration.webp`;
      const { error } = await supabase.storage
        .from('brand-page-assets')
        .upload(path, compressed, { upsert: true, contentType: 'image/webp' });
      if (error) throw error;
      const { data } = supabase.storage.from('brand-page-assets').getPublicUrl(path);
      setFooterIllustrationUrl(withCacheBust(data.publicUrl));
      toast.success('Footer illustration uploaded');
    } catch (err: any) {
      toast.error(err.message || 'Upload failed');
    } finally {
      setUploadingFooterIllustration(false);
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
    if (!orgForm.validate()) return;

    setSaving(true);
    try {
      const { error: updateOrgError } = await supabase
        .from('orgs')
        .update({ name: orgForm.name.trim() })
        .eq('id', currentOrg.id);

      if (updateOrgError) throw updateOrgError;

      const { error } = await (supabase
        .from('org_profiles' as any)
        .upsert(
          {
            org_id: currentOrg.id,
            roles: orgForm.roles,
            category: orgForm.category,
            instagram: orgForm.instagram.trim() || null,
            address: orgForm.address.trim(),
            bio: orgForm.bio.trim() || null,
            website: orgForm.website.trim() || null,
            logo_url: orgForm.logoUrl.trim() || null,
            hero_banner_url: heroBannerImages[0] || null,
            hero_banner_images: heroBannerImages.filter(Boolean),
            accent_color: accentColor || '#E85D04',
            top_section: topSection,
            bottom_section: bottomSection,
            events_filter: eventsFilter,
            events_sort: eventsSort,
            events_display_order: eventsDisplayOrder,
            products_filter: productsFilter,
            products_sort: productsSort,
            products_display_order: productsDisplayOrder,
            hero_headline: heroHeadline || null,
            hero_subheadline: heroSubheadline || null,
            description_intro: descriptionIntro || null,
            description_body: descriptionBody || null,
            description_images: descriptionImages.filter(Boolean),
            description_illustration_url: descriptionIllustrationUrl || null,
            description_tagline: descriptionTagline || null,
            description_tagline_body: descriptionTaglineBody || null,
            footer_tagline: footerTagline || null,
            footer_body: footerBody || null,
            footer_contact_email: footerContactEmail || null,
            footer_illustration_url: footerIllustrationUrl || null,
            footer_links: footerLinks.filter((l) => l.label.trim() && l.url.trim()),
            enable_stripe: enableStripe || null,
            enable_payme: enablePayme || null,
            enable_fps: enableFps || null,
            payme_link: paymeLink.trim() || null,
            fps_link: fpsLink.trim() || null,
          } as any,
          { onConflict: 'org_id' }
        )) as { error: { message?: string } | null };

      if (error) throw error;

      await refreshOrgMemberships();
      setProfileExists(true);
      toast.success('Page saved');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to save';
      toast.error(message);
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
          Edit page
        </h1>
        <p className="mt-2 text-sm" style={{ color: 'rgba(15,31,23,0.72)' }}>
          Profile details, hero, events, products, and footer for your public brand page.
        </p>
        {!profileExists && (
          <p className="mt-2 text-sm px-3 py-2 rounded-lg" style={{ backgroundColor: 'rgba(14,122,58,0.1)', color: '#0E7A3A' }}>
            Complete the profile sections below, then save to publish your page.
          </p>
        )}
      </div>

      <OrgProfileFormSections
        idPrefix="brand-page"
        orgId={currentOrg.id}
        roles={orgForm.roles}
        onRoleToggle={orgForm.handleRoleToggle}
        name={orgForm.name}
        onNameChange={orgForm.setName}
        instagram={orgForm.instagram}
        onInstagramChange={orgForm.setInstagram}
        category={orgForm.category}
        onCategoryChange={orgForm.setCategory}
        address={orgForm.address}
        onAddressChange={orgForm.setAddress}
        bio={orgForm.bio}
        onBioChange={orgForm.setBio}
        logoUrl={orgForm.logoUrl}
        onLogoUrlChange={orgForm.setLogoUrl}
        uploadingLogo={orgForm.uploadingLogo}
        logoRenderNonce={orgForm.logoRenderNonce}
        logoFileInputRef={orgForm.logoFileInputRef}
        onLogoFileChange={orgForm.handleLogoFileChange}
      />

      {/* Hero */}
      <Card className="rounded-3xl border shadow-xl" style={{ borderColor: 'rgba(14,122,58,0.14)', backgroundColor: 'rgba(251,248,244,0.9)' }}>
        <CardHeader>
          <CardTitle>Hero Banner</CardTitle>
          <CardDescription>Main banner at the top of your brand page</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Accent Color</Label>
            <p className="text-sm text-muted-foreground">Used for header, section labels, links, and footer</p>
            <div className="flex items-center gap-4">
              <input
                type="color"
                value={accentColor}
                onChange={(e) => setAccentColor(e.target.value)}
                className="h-10 w-14 cursor-pointer rounded border border-input bg-muted"
              />
              <Input
                value={accentColor}
                onChange={(e) => {
                  const v = e.target.value;
                  if (/^#?[0-9A-Fa-f]{0,6}$/.test(v)) {
                    setAccentColor(v.startsWith('#') ? v : v ? `#${v}` : '#E85D04');
                  }
                }}
                placeholder="#E85D04"
                className="w-28 font-mono text-sm"
              />
            </div>
          </div>
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

      {/* Product Payment */}
      <Card className="rounded-3xl border shadow-xl" style={{ borderColor: 'rgba(14,122,58,0.14)', backgroundColor: 'rgba(251,248,244,0.9)' }}>
        <CardHeader>
          <CardTitle>Product Payment</CardTitle>
          <CardDescription>Payment methods for product sales on your brand page. Customers can pay via Stripe (card), PayMe, or FPS.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center space-x-2">
            <Checkbox id="enable_stripe" checked={enableStripe} onCheckedChange={(v) => setEnableStripe(!!v)} />
            <label htmlFor="enable_stripe" className="flex items-center gap-2 text-sm font-medium cursor-pointer">
              <CreditCard className="h-4 w-4" />
              Enable Stripe (credit card)
            </label>
          </div>
          <div className="flex items-center space-x-2">
            <Checkbox id="enable_payme" checked={enablePayme} onCheckedChange={(v) => setEnablePayme(!!v)} />
            <label htmlFor="enable_payme" className="flex items-center gap-2 text-sm font-medium cursor-pointer">
              <Smartphone className="h-4 w-4" />
              Enable PayMe
            </label>
          </div>
          {enablePayme && (
            <div className="ml-6 space-y-2">
              <Label>PayMe Link</Label>
              <Input
                value={paymeLink}
                onChange={(e) => setPaymeLink(e.target.value)}
                placeholder="https://..."
              />
            </div>
          )}
          <div className="flex items-center space-x-2">
            <Checkbox id="enable_fps" checked={enableFps} onCheckedChange={(v) => setEnableFps(!!v)} />
            <label htmlFor="enable_fps" className="flex items-center gap-2 text-sm font-medium cursor-pointer">
              <QrCode className="h-4 w-4" />
              Enable FPS
            </label>
          </div>
          {enableFps && (
            <div className="ml-6 space-y-2">
              <Label>FPS Link</Label>
              <Input
                value={fpsLink}
                onChange={(e) => setFpsLink(e.target.value)}
                placeholder="https://..."
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Events & Products Layout */}
      <Card className="rounded-3xl border shadow-xl" style={{ borderColor: 'rgba(14,122,58,0.14)', backgroundColor: 'rgba(251,248,244,0.9)' }}>
        <CardHeader>
          <CardTitle>Events & Products Layout</CardTitle>
          <CardDescription>Choose what to show in the top and bottom rows between Hero and Footer</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex flex-row gap-4 flex-nowrap">
            <div className="space-y-2 flex-1 min-w-0">
              <Label>Top Row</Label>
              <Select value={topSection} onValueChange={(v: 'events' | 'products' | 'both' | 'hidden') => setTopSection(v)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="events">Events</SelectItem>
                  <SelectItem value="products">Products</SelectItem>
                  <SelectItem value="both">Both (Events + Products)</SelectItem>
                  <SelectItem value="hidden">Hidden</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 flex-1 min-w-0">
              <Label>Bottom Row</Label>
              <Select value={bottomSection} onValueChange={(v: 'events' | 'products' | 'both' | 'hidden') => setBottomSection(v)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="events">Events</SelectItem>
                  <SelectItem value="products">Products</SelectItem>
                  <SelectItem value="both">Both (Events + Products)</SelectItem>
                  <SelectItem value="hidden">Hidden</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="border-t pt-6 space-y-4">
            <h3 className="font-medium text-sm" style={{ color: '#0F1F17' }}>Events</h3>
            <div className="flex flex-row gap-4 flex-nowrap">
              <div className="space-y-2 flex-1 min-w-0">
                <Label>Filter</Label>
                <Select value={eventsFilter} onValueChange={(v: 'all' | 'non_expired') => setEventsFilter(v)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All events</SelectItem>
                    <SelectItem value="non_expired">Non-expired only</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 flex-1 min-w-0">
                <Label>Sort</Label>
                <Select value={eventsSort} onValueChange={(v: 'manual' | 'random' | 'date' | 'creation') => setEventsSort(v)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manual">Manual</SelectItem>
                    <SelectItem value="random">Random</SelectItem>
                    <SelectItem value="date">Date</SelectItem>
                    <SelectItem value="creation">Creation</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {eventsSort === 'manual' && (
              <div className="space-y-2">
                <Label>Reorder events</Label>
                <div className="rounded-lg border bg-muted/30 divide-y max-h-48 overflow-y-auto">
                  {getMergedOrder(eventsDisplayOrder, reorderEvents).map((id, idx) => {
                    const item = reorderEvents.find((e) => e.id === id);
                    if (!item) return null;
                    return (
                      <div key={id} className="flex items-center justify-between gap-2 px-3 py-2">
                        <span className="text-sm truncate flex-1">{item.title}</span>
                        <div className="flex gap-1">
                          <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => moveItem(reorderEvents, eventsDisplayOrder, setEventsDisplayOrder, idx, 'up')} disabled={idx === 0}>
                            <ChevronUp className="h-4 w-4" />
                          </Button>
                          <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => moveItem(reorderEvents, eventsDisplayOrder, setEventsDisplayOrder, idx, 'down')} disabled={idx === getMergedOrder(eventsDisplayOrder, reorderEvents).length - 1}>
                            <ChevronDown className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                  {reorderEvents.length === 0 && <p className="px-3 py-4 text-sm text-muted-foreground">No events yet</p>}
                </div>
              </div>
            )}
          </div>

          <div className="border-t pt-6 space-y-4">
            <h3 className="font-medium text-sm" style={{ color: '#0F1F17' }}>Products</h3>
            <div className="flex flex-row gap-4 flex-nowrap">
              <div className="space-y-2 flex-1 min-w-0">
                <Label>Filter</Label>
                <Select value={productsFilter} onValueChange={(v: 'all' | 'in_sale_only') => setProductsFilter(v)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All products</SelectItem>
                    <SelectItem value="in_sale_only">In sale only</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 flex-1 min-w-0">
                <Label>Sort</Label>
                <Select value={productsSort} onValueChange={(v: 'manual' | 'random' | 'date' | 'creation') => setProductsSort(v)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manual">Manual</SelectItem>
                    <SelectItem value="random">Random</SelectItem>
                    <SelectItem value="date">Date</SelectItem>
                    <SelectItem value="creation">Creation</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {productsSort === 'manual' && (
              <div className="space-y-2">
                <Label>Reorder products</Label>
                <div className="rounded-lg border bg-muted/30 divide-y max-h-48 overflow-y-auto">
                  {getMergedOrder(productsDisplayOrder, reorderProducts).map((id, idx) => {
                    const item = reorderProducts.find((p) => p.id === id);
                    if (!item) return null;
                    return (
                      <div key={id} className="flex items-center justify-between gap-2 px-3 py-2">
                        <span className="text-sm truncate flex-1">{item.title}</span>
                        <div className="flex gap-1">
                          <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => moveItem(reorderProducts, productsDisplayOrder, setProductsDisplayOrder, idx, 'up')} disabled={idx === 0}>
                            <ChevronUp className="h-4 w-4" />
                          </Button>
                          <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => moveItem(reorderProducts, productsDisplayOrder, setProductsDisplayOrder, idx, 'down')} disabled={idx === getMergedOrder(productsDisplayOrder, reorderProducts).length - 1}>
                            <ChevronDown className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                  {reorderProducts.length === 0 && <p className="px-3 py-4 text-sm text-muted-foreground">No products yet</p>}
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Footer */}
      <Card className="rounded-3xl border shadow-xl" style={{ borderColor: 'rgba(14,122,58,0.14)', backgroundColor: 'rgba(251,248,244,0.9)' }}>
        <CardHeader>
          <CardTitle>Footer</CardTitle>
          <CardDescription>Footer tagline, body text, contact, and logo-area illustration</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Footer Tagline (header)</Label>
            <Input
              value={footerTagline}
              onChange={(e) => setFooterTagline(e.target.value)}
              placeholder="e.g. Run to explore. One baby step at a time."
            />
          </div>
          <div className="space-y-2">
            <Label>Footer Body</Label>
            <Textarea
              value={footerBody}
              onChange={(e) => setFooterBody(e.target.value)}
              placeholder="e.g. A push to refine, a push to explore and a push to make a better life."
              rows={3}
            />
          </div>
          <div className="space-y-2">
            <Label>Logo Area Illustration</Label>
            <p className="text-sm text-muted-foreground">Shown in the footer logo area (replaces org logo when set)</p>
            <div className="flex items-center gap-4">
              {footerIllustrationUrl ? (
                <img src={footerIllustrationUrl} alt="Footer illustration" className="h-24 w-24 object-contain rounded-lg border" />
              ) : (
                <div className="h-24 w-24 rounded-lg border border-dashed flex items-center justify-center bg-muted/50">
                  <ImageIcon className="h-8 w-8 text-muted-foreground" />
                </div>
              )}
              <div className="flex gap-2">
                <label className="cursor-pointer">
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={uploadingFooterIllustration}
                    onChange={uploadFooterIllustration}
                  />
                  <span className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border text-sm hover:bg-muted">
                    <Upload className="h-4 w-4" />
                    {uploadingFooterIllustration ? 'Uploading...' : 'Upload'}
                  </span>
                </label>
                {footerIllustrationUrl && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setFooterIllustrationUrl('')}
                  >
                    Remove
                  </Button>
                )}
              </div>
            </div>
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
          disabled={saving}
          style={{ backgroundColor: '#0E7A3A', color: 'white' }}
        >
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save changes
        </Button>
      </div>
    </div>
  );
}
