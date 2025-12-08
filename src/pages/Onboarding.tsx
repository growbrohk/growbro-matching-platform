import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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

// Hong Kong location data
const HK_REGIONS = ['HK Island', 'Kowloon', 'New Territories'] as const;
const HK_DISTRICTS: Record<string, string[]> = {
  'HK Island': ['Central & Western', 'Eastern', 'Southern', 'Wan Chai'],
  'Kowloon': ['Kowloon City', 'Kwun Tong', 'Sham Shui Po', 'Wong Tai Sin', 'Yau Tsim Mong'],
  'New Territories': ['Islands', 'North', 'Sai Kung', 'Sha Tin', 'Tai Po', 'Tsuen Wan', 'Tuen Mun', 'Yuen Long'],
};

// Business types
const BUSINESS_TYPES = [
  'Café / Coffee Shop',
  'Restaurant',
  'Retail Store',
  'Event Space',
  'Gallery',
  'Workshop',
  'Co-working Space',
  'Pop-up Store',
  'Online Store',
  'Other',
] as const;

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
  const [hkRegion, setHkRegion] = useState<string>('');
  const [hkDistrict, setHkDistrict] = useState<string>('');
  const [businessType, setBusinessType] = useState<string>('');
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

      const finalHandle = handle.trim() 
        ? handle.toLowerCase().replace(/[^a-z0-9_]/g, '')
        : displayName.toLowerCase().replace(/[^a-z0-9_]/g, '') || defaultHandle;

      const { error: profileError } = await supabase.from('profiles').insert({
        id: user.id,
        role: role || 'brand', // Default to brand if no role selected
        display_name: displayName || defaultDisplayName,
        handle: finalHandle,
        city: hkDistrict || null,
        country: 'Hong Kong',
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
            city: hkDistrict || null,
            country: 'Hong Kong',
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
      // Generate handle from display name if not provided
      const finalHandle = handle.trim() 
        ? handle.toLowerCase().replace(/[^a-z0-9_]/g, '')
        : displayName.toLowerCase().replace(/[^a-z0-9_]/g, '') || `user_${user.id.slice(0, 8)}`;

      const { error: profileError } = await supabase.from('profiles').insert({
        id: user.id,
        role: role || 'brand', // Default to brand
        display_name: displayName,
        handle: finalHandle,
        city: hkDistrict || null,
        country: 'Hong Kong',
        short_bio: shortBio || null,
        website_url: websiteUrl || null,
        instagram_handle: instagramHandle || null,
        tags: tags.length > 0 ? tags : [],
        preferred_collab_types: selectedCollabTypes,
      });

      if (profileError) {
        if (profileError.message.includes('duplicate key') && profileError.message.includes('handle')) {
          toast({
            title: 'Handle taken',
            description: 'This handle is already in use. Please choose another.',
            variant: 'destructive',
          });
          setStep(1);
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
        // Required: brand name, location (region + district), business type
        return displayName.trim() && hkRegion && hkDistrict && businessType;
      case 2:
        // Optional fields - always can proceed (all optional)
        return true;
      case 3:
        return selectedCollabTypes.length > 0;
      case 4:
        return role === 'venue' || (productName.trim() && productCollabTypes.length > 0);
      default:
        return false;
    }
  };

  const totalSteps = role === 'brand' ? 4 : 3;

  // Reset district when region changes
  const handleRegionChange = (region: string) => {
    setHkRegion(region);
    setHkDistrict(''); // Reset district when region changes
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-gradient-hero relative">
      {/* Skip button - upper right corner (hidden on step 2) */}
      {step !== 2 && (
        <button
          onClick={handleSkip}
          disabled={loading}
          className="absolute top-4 right-4 text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-background/50 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <X className="h-4 w-4" />
          <span>Skip for now</span>
        </button>
      )}

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

      {/* Step 1: Required Information */}
      {step === 1 && (
        <Card className="w-full max-w-md shadow-xl border-0 animate-in">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">Tell us about your business</CardTitle>
            <CardDescription>
              We need some basic information to get started
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="displayName">Brand / Business Name *</Label>
              <Input
                id="displayName"
                placeholder="Enter your brand or business name"
                value={displayName}
                onChange={(e) => {
                  setDisplayName(e.target.value);
                  // Auto-generate handle from display name
                  if (!handle) {
                    const generatedHandle = e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '');
                    setHandle(generatedHandle);
                  }
                }}
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
              <p className="text-xs text-muted-foreground">This will be your unique identifier</p>
            </div>

            <div className="space-y-2">
              <Label>Location *</Label>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="region" className="text-xs">Region</Label>
                  <Select value={hkRegion} onValueChange={handleRegionChange}>
                    <SelectTrigger id="region">
                      <SelectValue placeholder="Select region" />
                    </SelectTrigger>
                    <SelectContent>
                      {HK_REGIONS.map((region) => (
                        <SelectItem key={region} value={region}>
                          {region}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="district" className="text-xs">District</Label>
                  <Select 
                    value={hkDistrict} 
                    onValueChange={setHkDistrict}
                    disabled={!hkRegion}
                  >
                    <SelectTrigger id="district">
                      <SelectValue placeholder={hkRegion ? "Select district" : "Select region first"} />
                    </SelectTrigger>
                    <SelectContent>
                      {hkRegion && HK_DISTRICTS[hkRegion]?.map((district) => (
                        <SelectItem key={district} value={district}>
                          {district}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="businessType">Business Type *</Label>
              <Select value={businessType} onValueChange={setBusinessType}>
                <SelectTrigger id="businessType">
                  <SelectValue placeholder="Select your business type" />
                </SelectTrigger>
                <SelectContent>
                  {BUSINESS_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button
              onClick={() => {
                // Set default role to brand if not set
                if (!role) setRole('brand');
                setStep(2);
              }}
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

      {/* Step 2: Optional Information */}
      {step === 2 && (
        <Card className="w-full max-w-md shadow-xl border-0 animate-in">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">Additional Information</CardTitle>
            <CardDescription>
              Optional details to enhance your profile
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="bio">Bio</Label>
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

            <div className="flex gap-3 mt-6">
              <Button variant="outline" onClick={() => setStep(1)} className="flex-1">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Button>
              <Button
                onClick={() => setStep(3)}
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
