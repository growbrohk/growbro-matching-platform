import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { CollabChip } from '@/components/CollabChip';
import { UserRole, CollabType } from '@/lib/types';
import {
  Building2,
  Store,
  ArrowRight,
  ArrowLeft,
  Loader2,
  Check,
  Package,
  CalendarDays,
  Sparkles,
  Coffee,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const COLLAB_TYPES: { type: CollabType; label: string; icon: React.ElementType; description: string }[] = [
  { type: 'consignment', label: 'Consignment', icon: Package, description: 'Sell products at venues' },
  { type: 'event', label: 'Event', icon: CalendarDays, description: 'Host or sponsor events' },
  { type: 'collab_product', label: 'Collab Product', icon: Sparkles, description: 'Create together' },
  { type: 'cup_sleeve_marketing', label: 'Cup Sleeve', icon: Coffee, description: 'Branded marketing' },
];

export default function Onboarding() {
  const { user, profile, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);

  // Form state
  const [role, setRole] = useState<UserRole | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [handle, setHandle] = useState('');
  const [city, setCity] = useState('');
  const [country, setCountry] = useState('');
  const [shortBio, setShortBio] = useState('');
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [instagramHandle, setInstagramHandle] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [selectedCollabTypes, setSelectedCollabTypes] = useState<CollabType[]>([]);

  // Product state (for brands)
  const [productName, setProductName] = useState('');
  const [productDescription, setProductDescription] = useState('');
  const [productCategory, setProductCategory] = useState('');
  const [productCollabTypes, setProductCollabTypes] = useState<CollabType[]>([]);

  useEffect(() => {
    if (!user) {
      navigate('/auth');
    } else if (profile) {
      navigate('/home');
    }
  }, [user, profile, navigate]);

  const handleAddTag = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && tagInput.trim()) {
      e.preventDefault();
      if (!tags.includes(tagInput.trim())) {
        setTags([...tags, tagInput.trim()]);
      }
      setTagInput('');
    }
  };

  const removeTag = (tag: string) => {
    setTags(tags.filter((t) => t !== tag));
  };

  const toggleCollabType = (type: CollabType) => {
    setSelectedCollabTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
  };

  const toggleProductCollabType = (type: CollabType) => {
    setProductCollabTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
  };

  const handleSkip = async () => {
    if (!user) return;

    setLoading(true);
    try {
      // Create minimal profile with defaults
      const defaultHandle = `user_${user.id.slice(0, 8)}`;
      const defaultDisplayName = user.email?.split('@')[0] || 'User';

      const { error: profileError } = await supabase.from('profiles').insert({
        id: user.id,
        role: role || 'brand', // Default to brand if no role selected
        display_name: displayName || defaultDisplayName,
        handle: handle || defaultHandle,
        city: city || null,
        country: country || null,
        short_bio: shortBio || null,
        website_url: websiteUrl || null,
        instagram_handle: instagramHandle || null,
        tags: tags.length > 0 ? tags : [],
        preferred_collab_types: selectedCollabTypes.length > 0 ? selectedCollabTypes : [],
      });

      if (profileError) {
        // If handle is taken, try with a different suffix
        if (profileError.message.includes('duplicate key') && profileError.message.includes('handle')) {
          const fallbackHandle = `${defaultHandle}_${Date.now().toString().slice(-4)}`;
          const { error: retryError } = await supabase.from('profiles').insert({
            id: user.id,
            role: role || 'brand',
            display_name: displayName || defaultDisplayName,
            handle: fallbackHandle,
            city: city || null,
            country: country || null,
            short_bio: shortBio || null,
            website_url: websiteUrl || null,
            instagram_handle: instagramHandle || null,
            tags: tags.length > 0 ? tags : [],
            preferred_collab_types: selectedCollabTypes.length > 0 ? selectedCollabTypes : [],
          });
          if (retryError) throw retryError;
        } else {
          throw profileError;
        }
      }

      await refreshProfile();
      toast({
        title: 'Welcome to Growbro!',
        description: 'You can complete your profile later from settings.',
      });
      navigate('/home');
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to create profile',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleComplete = async () => {
    if (!user || !role) return;

    setLoading(true);
    try {
      // Create profile
      const { error: profileError } = await supabase.from('profiles').insert({
        id: user.id,
        role,
        display_name: displayName,
        handle: handle.toLowerCase().replace(/[^a-z0-9_]/g, ''),
        city,
        country,
        short_bio: shortBio,
        website_url: websiteUrl || null,
        instagram_handle: instagramHandle || null,
        tags,
        preferred_collab_types: selectedCollabTypes,
      });

      if (profileError) {
        if (profileError.message.includes('duplicate key') && profileError.message.includes('handle')) {
          toast({
            title: 'Handle taken',
            description: 'This handle is already in use. Please choose another.',
            variant: 'destructive',
          });
          setStep(2);
          return;
        }
        throw profileError;
      }

      // Create initial product for brands
      if (role === 'brand' && productName) {
        const { error: productError } = await supabase.from('products').insert({
          brand_user_id: user.id,
          name: productName,
          short_description: productDescription,
          category: productCategory,
          suitable_collab_types: productCollabTypes,
          is_active: true,
        });

        if (productError) throw productError;
      }

      await refreshProfile();
      toast({
        title: 'Profile created!',
        description: 'Welcome to Growbro. Start exploring collaborations!',
      });
      navigate('/home');
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to create profile',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const canProceed = () => {
    switch (step) {
      case 1:
        return role !== null;
      case 2:
        return displayName.trim() && handle.trim();
      case 3:
        return selectedCollabTypes.length > 0;
      case 4:
        return role === 'venue' || (productName.trim() && productCollabTypes.length > 0);
      default:
        return false;
    }
  };

  const totalSteps = role === 'brand' ? 4 : 3;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-gradient-hero relative">
      {/* Skip button - upper right corner */}
      <button
        onClick={handleSkip}
        disabled={loading}
        className="absolute top-4 right-4 text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-background/50 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <X className="h-4 w-4" />
        <span>Skip for now</span>
      </button>

      {/* Progress indicator */}
      <div className="w-full max-w-md mb-8">
        <div className="flex items-center justify-between mb-2">
          {Array.from({ length: totalSteps }).map((_, i) => (
            <div
              key={i}
              className={cn(
                'h-2 flex-1 rounded-full mx-1 transition-colors',
                i + 1 <= step ? 'bg-primary' : 'bg-muted'
              )}
            />
          ))}
        </div>
        <p className="text-sm text-muted-foreground text-center">
          Step {step} of {totalSteps}
        </p>
      </div>

      {/* Step 1: Role Selection */}
      {step === 1 && (
        <Card className="w-full max-w-md shadow-xl border-0 animate-in">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">What brings you here?</CardTitle>
            <CardDescription>
              Choose your role to personalize your experience
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <button
              onClick={() => setRole('brand')}
              className={cn(
                'w-full p-6 rounded-2xl border-2 text-left transition-all',
                role === 'brand'
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-primary/50'
              )}
            >
              <div className="flex items-start gap-4">
                <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Building2 className="h-6 w-6 text-primary" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-lg">I'm a Brand</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Looking for venues to showcase products, host events, or create collaborations
                  </p>
                </div>
                {role === 'brand' && (
                  <Check className="h-5 w-5 text-primary" />
                )}
              </div>
            </button>

            <button
              onClick={() => setRole('venue')}
              className={cn(
                'w-full p-6 rounded-2xl border-2 text-left transition-all',
                role === 'venue'
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-primary/50'
              )}
            >
              <div className="flex items-start gap-4">
                <div className="h-12 w-12 rounded-xl bg-secondary flex items-center justify-center">
                  <Store className="h-6 w-6 text-secondary-foreground" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-lg">I'm a Venue / Host</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Have a space or platform to host brands, events, or collaborations
                  </p>
                </div>
                {role === 'venue' && (
                  <Check className="h-5 w-5 text-primary" />
                )}
              </div>
            </button>

            <Button
              onClick={() => setStep(2)}
              disabled={!canProceed()}
              className="w-full mt-6"
              variant="hero"
              size="lg"
            >
              Continue
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Step 2: Basic Profile */}
      {step === 2 && (
        <Card className="w-full max-w-md shadow-xl border-0 animate-in">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">Tell us about yourself</CardTitle>
            <CardDescription>
              Create your public profile
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="displayName">Display Name *</Label>
              <Input
                id="displayName"
                placeholder={role === 'brand' ? 'Your brand name' : 'Your venue name'}
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="handle">Handle *</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">@</span>
                <Input
                  id="handle"
                  placeholder="yourhandle"
                  value={handle}
                  onChange={(e) => setHandle(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                  className="pl-8"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="city">City</Label>
                <Input
                  id="city"
                  placeholder="Hong Kong"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="country">Country</Label>
                <Input
                  id="country"
                  placeholder="China"
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="bio">Short Bio</Label>
              <Textarea
                id="bio"
                placeholder="Tell others what you're about..."
                value={shortBio}
                onChange={(e) => setShortBio(e.target.value)}
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="website">Website</Label>
              <Input
                id="website"
                placeholder="https://yoursite.com"
                value={websiteUrl}
                onChange={(e) => setWebsiteUrl(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="instagram">Instagram</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">@</span>
                <Input
                  id="instagram"
                  placeholder="yourinstagram"
                  value={instagramHandle}
                  onChange={(e) => setInstagramHandle(e.target.value)}
                  className="pl-8"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Tags</Label>
              <Input
                placeholder="Type and press Enter (e.g. coffee shop, streetwear)"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={handleAddTag}
              />
              {tags.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {tags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center gap-1 px-3 py-1 bg-secondary rounded-full text-sm cursor-pointer hover:bg-secondary/80"
                      onClick={() => removeTag(tag)}
                    >
                      {tag}
                      <span className="text-muted-foreground">×</span>
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="flex gap-3 mt-6">
              <Button variant="outline" onClick={() => setStep(1)} className="flex-1">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Button>
              <Button
                onClick={() => setStep(3)}
                disabled={!canProceed()}
                variant="hero"
                className="flex-1"
              >
                Continue
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 3: Collab Types */}
      {step === 3 && (
        <Card className="w-full max-w-md shadow-xl border-0 animate-in">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">Collaboration Preferences</CardTitle>
            <CardDescription>
              What types of collaborations interest you?
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              {COLLAB_TYPES.map(({ type, label, icon: Icon, description }) => (
                <button
                  key={type}
                  onClick={() => toggleCollabType(type)}
                  className={cn(
                    'p-4 rounded-xl border-2 text-left transition-all',
                    selectedCollabTypes.includes(type)
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-primary/50'
                  )}
                >
                  <Icon className={cn(
                    'h-6 w-6 mb-2',
                    selectedCollabTypes.includes(type) ? 'text-primary' : 'text-muted-foreground'
                  )} />
                  <h4 className="font-medium text-sm">{label}</h4>
                  <p className="text-xs text-muted-foreground mt-1">{description}</p>
                </button>
              ))}
            </div>

            <div className="flex gap-3 mt-6">
              <Button variant="outline" onClick={() => setStep(2)} className="flex-1">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Button>
              <Button
                onClick={() => role === 'brand' ? setStep(4) : handleComplete()}
                disabled={!canProceed() || loading}
                variant="hero"
                className="flex-1"
              >
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {role === 'brand' ? (
                  <>Continue <ArrowRight className="ml-2 h-4 w-4" /></>
                ) : (
                  'Complete'
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 4: Initial Product (Brands only) */}
      {step === 4 && role === 'brand' && (
        <Card className="w-full max-w-md shadow-xl border-0 animate-in">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">Add Your First Product</CardTitle>
            <CardDescription>
              Showcase what you offer in your product catalog
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="productName">Product Name *</Label>
              <Input
                id="productName"
                placeholder="e.g. Signature Coffee Blend"
                value={productName}
                onChange={(e) => setProductName(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="productDescription">Description</Label>
              <Textarea
                id="productDescription"
                placeholder="Describe your product..."
                value={productDescription}
                onChange={(e) => setProductDescription(e.target.value)}
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="productCategory">Category</Label>
              <Input
                id="productCategory"
                placeholder="e.g. Apparel, Drinkware, Snacks"
                value={productCategory}
                onChange={(e) => setProductCategory(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Suitable for</Label>
              <div className="flex flex-wrap gap-2">
                {COLLAB_TYPES.map(({ type, label }) => (
                  <button
                    key={type}
                    onClick={() => toggleProductCollabType(type)}
                    className={cn(
                      'px-3 py-1.5 rounded-full border text-sm transition-all',
                      productCollabTypes.includes(type)
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border hover:border-primary/50'
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <Button variant="outline" onClick={() => setStep(3)} className="flex-1">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Button>
              <Button
                onClick={handleComplete}
                disabled={!canProceed() || loading}
                variant="hero"
                className="flex-1"
              >
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Complete
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
