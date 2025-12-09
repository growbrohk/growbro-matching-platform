import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Layout } from '@/components/Layout';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CollabChip } from '@/components/CollabChip';
import { VenueOptionChip } from '@/components/VenueOptionChip';
import { Profile, Product, CollabType, VenueCollabOption, VenueOptionType } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import {
  MapPin,
  Globe,
  Instagram,
  Heart,
  MessageCircle,
  Handshake,
  Edit,
  Package,
  Calendar,
  DollarSign,
  Users,
  Loader2,
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

export default function ProfilePage() {
  const { handle } = useParams<{ handle: string }>();
  const { profile: currentUserProfile } = useAuth();
  const { toast } = useToast();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [venueOptions, setVenueOptions] = useState<VenueCollabOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedVenueOption, setSelectedVenueOption] = useState<VenueCollabOption | null>(null);

  const isOwnProfile = currentUserProfile?.handle === handle;

  useEffect(() => {
    fetchProfile();
  }, [handle]);

  const fetchProfile = async () => {
    if (!handle) return;

    setLoading(true);
    try {
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('handle', handle)
        .single();

      if (profileError) throw profileError;
      setProfile(profileData as Profile);

      // Fetch products if brand
      if (profileData.role === 'brand') {
        const { data: productsData } = await supabase
          .from('products')
          .select('*')
          .eq('owner_user_id', profileData.id)
          .eq('owner_type', 'brand')
          .eq('is_active', true)
          .order('created_at', { ascending: false });

        setProducts((productsData as Product[]) || []);
      }

      // Fetch venue collab options if venue
      if (profileData.role === 'venue') {
        const { data: optionsData } = await supabase
          .from('venue_collab_options')
          .select('*')
          .eq('venue_user_id', profileData.id)
          .eq('is_active', true)
          .order('created_at', { ascending: false });

        setVenueOptions((optionsData as VenueCollabOption[]) || []);
      }
    } catch (error) {
      console.error('Error fetching profile:', error);
      toast({
        title: 'Profile not found',
        description: 'The profile you\'re looking for doesn\'t exist.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleLike = async () => {
    if (!currentUserProfile || !profile) return;

    try {
      const { error } = await supabase.from('likes').insert({
        from_user_id: currentUserProfile.id,
        to_user_id: profile.id,
        is_like: true,
      });

      if (error) {
        if (error.message.includes('duplicate')) {
          toast({
            title: 'Already liked',
            description: 'You\'ve already liked this profile.',
          });
        } else {
          throw error;
        }
      } else {
        toast({
          title: 'Liked!',
          description: `You liked ${profile.display_name}`,
        });
      }
    } catch (error: any) {
      toast({
        title: 'Error',
        description: 'Failed to like profile',
        variant: 'destructive',
      });
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  if (!profile) {
    return (
      <Layout>
        <div className="text-center py-20">
          <h1 className="text-2xl font-bold mb-2">Profile not found</h1>
          <Link to="/home">
            <Button>Go Home</Button>
          </Link>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-4xl mx-auto">
        {/* Cover Image */}
        <div className="h-48 md:h-64 bg-gradient-to-br from-primary/20 to-accent rounded-3xl relative overflow-hidden">
          {profile.cover_image_url && (
            <img
              src={profile.cover_image_url}
              alt=""
              className="w-full h-full object-cover"
            />
          )}
        </div>

        {/* Profile Header */}
        <div className="px-4 -mt-16 relative">
          <div className="flex flex-col md:flex-row md:items-end gap-4">
            <Avatar className="h-32 w-32 border-4 border-background shadow-xl">
              <AvatarImage src={profile.avatar_url} />
              <AvatarFallback className="text-4xl bg-primary/10 text-primary">
                {profile.display_name?.charAt(0)?.toUpperCase()}
              </AvatarFallback>
            </Avatar>

            <div className="flex-1 pt-4 md:pt-0 md:pb-2">
              <div className="flex items-start justify-between">
                <div>
                  <h1 className="text-3xl font-bold">{profile.display_name}</h1>
                  <p className="text-muted-foreground">@{profile.handle}</p>
                  <span className="inline-block mt-2 px-3 py-1 bg-primary/10 text-primary rounded-full text-sm font-medium capitalize">
                    {profile.role}
                  </span>
                </div>

                {isOwnProfile ? (
                  <div className="flex gap-2">
                    {profile.role === 'brand' && (
                      <Link to="/products">
                        <Button variant="outline" size="sm">
                          <Package className="h-4 w-4 mr-2" />
                          Products
                        </Button>
                      </Link>
                    )}
                    {profile.role === 'venue' && (
                      <Link to="/venue/collab-options">
                        <Button variant="outline" size="sm">
                          <Calendar className="h-4 w-4 mr-2" />
                          Spaces
                        </Button>
                      </Link>
                    )}
                    <Button variant="outline" size="sm">
                      <Edit className="h-4 w-4 mr-2" />
                      Edit
                    </Button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <Button variant="outline" size="icon" onClick={handleLike}>
                      <Heart className="h-4 w-4" />
                    </Button>
                    <Link to="/messages">
                      <Button variant="outline" size="icon">
                        <MessageCircle className="h-4 w-4" />
                      </Button>
                    </Link>
                    <Link to={`/collabs?newRequest=${profile.id}`}>
                      <Button variant="hero" size="sm">
                        <Handshake className="h-4 w-4 mr-2" />
                        Collab
                      </Button>
                    </Link>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Profile Content */}
        <div className="grid md:grid-cols-3 gap-6 mt-8">
          {/* Sidebar */}
          <div className="space-y-6">
            {/* Location & Links */}
            <Card>
              <CardContent className="pt-6 space-y-4">
                {profile.city && (
                  <div className="flex items-center gap-3 text-muted-foreground">
                    <MapPin className="h-4 w-4" />
                    <span>
                      {profile.city}
                      {profile.country && `, ${profile.country}`}
                    </span>
                  </div>
                )}
                {profile.website_url && (
                  <a
                    href={profile.website_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 text-primary hover:underline"
                  >
                    <Globe className="h-4 w-4" />
                    Website
                  </a>
                )}
                {profile.instagram_handle && (
                  <a
                    href={`https://instagram.com/${profile.instagram_handle}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 text-primary hover:underline"
                  >
                    <Instagram className="h-4 w-4" />
                    @{profile.instagram_handle}
                  </a>
                )}
              </CardContent>
            </Card>

            {/* Tags */}
            {profile.tags && profile.tags.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Tags</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {profile.tags.map((tag) => (
                      <span
                        key={tag}
                        className="px-3 py-1 bg-muted rounded-full text-sm"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Collab Types */}
            {profile.preferred_collab_types && profile.preferred_collab_types.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Open to</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {profile.preferred_collab_types.map((type) => (
                      <CollabChip key={type} type={type as CollabType} />
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Main Content */}
          <div className="md:col-span-2 space-y-6">
            {/* Bio */}
            {profile.short_bio && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">About</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-foreground/80 whitespace-pre-wrap">
                    {profile.short_bio}
                  </p>
                </CardContent>
              </Card>
            )}

            {/* Products (for brands) */}
            {profile.role === 'brand' && products.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Package className="h-5 w-5" />
                    Product Catalog
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    {products.map((product) => (
                      <Dialog key={product.id}>
                        <DialogTrigger asChild>
                          <button
                            className="text-left rounded-xl border bg-card p-3 hover:shadow-md transition-all cursor-pointer"
                            onClick={() => setSelectedProduct(product)}
                          >
                            <div className="aspect-square bg-muted rounded-lg mb-3 overflow-hidden">
                              {product.thumbnail_url ? (
                                <img
                                  src={product.thumbnail_url}
                                  alt={product.name}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center">
                                  <Package className="h-8 w-8 text-muted-foreground" />
                                </div>
                              )}
                            </div>
                            <h4 className="font-medium text-sm truncate">{product.name}</h4>
                            {product.category && (
                              <p className="text-xs text-muted-foreground">{product.category}</p>
                            )}
                          </button>
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-lg">
                          <DialogHeader>
                            <DialogTitle>{product.name}</DialogTitle>
                          </DialogHeader>
                          <div className="space-y-4">
                            <div className="aspect-video bg-muted rounded-xl overflow-hidden">
                              {product.thumbnail_url ? (
                                <img
                                  src={product.thumbnail_url}
                                  alt={product.name}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center">
                                  <Package className="h-12 w-12 text-muted-foreground" />
                                </div>
                              )}
                            </div>
                            {product.category && (
                              <p className="text-sm text-muted-foreground">{product.category}</p>
                            )}
                            {product.short_description && (
                              <p>{product.short_description}</p>
                            )}
                            {product.full_description && (
                              <p className="text-muted-foreground text-sm">
                                {product.full_description}
                              </p>
                            )}
                            {product.suitable_collab_types && product.suitable_collab_types.length > 0 && (
                              <div className="flex flex-wrap gap-2">
                                {product.suitable_collab_types.map((type) => (
                                  <CollabChip key={type} type={type as CollabType} size="sm" />
                                ))}
                              </div>
                            )}
                            {product.price_range_min && (
                              <p className="text-sm">
                                Price range: ${product.price_range_min}
                                {product.price_range_max && ` - $${product.price_range_max}`}
                              </p>
                            )}
                          </div>
                        </DialogContent>
                      </Dialog>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Venue Collab Options (for venues) */}
            {profile.role === 'venue' && venueOptions.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Calendar className="h-5 w-5" />
                    Collab Menu
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {venueOptions.map((option) => (
                      <Dialog key={option.id}>
                        <DialogTrigger asChild>
                          <button
                            className="text-left rounded-xl border bg-card p-4 hover:shadow-md transition-all cursor-pointer"
                            onClick={() => setSelectedVenueOption(option)}
                          >
                            <div className="flex items-start justify-between mb-2">
                              <VenueOptionChip type={option.type as VenueOptionType} size="sm" />
                            </div>
                            <h4 className="font-medium mb-1">{option.name}</h4>
                            {option.short_description && (
                              <p className="text-sm text-muted-foreground line-clamp-2 mb-2">
                                {option.short_description}
                              </p>
                            )}
                            {option.collab_types && option.collab_types.length > 0 && (
                              <div className="flex flex-wrap gap-1">
                                {option.collab_types.slice(0, 2).map((ct) => (
                                  <CollabChip key={ct} type={ct as CollabType} size="sm" showIcon={false} />
                                ))}
                              </div>
                            )}
                          </button>
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-lg">
                          <DialogHeader>
                            <DialogTitle>{option.name}</DialogTitle>
                          </DialogHeader>
                          <div className="space-y-4">
                            <VenueOptionChip type={option.type as VenueOptionType} />
                            
                            {option.short_description && (
                              <p>{option.short_description}</p>
                            )}
                            {option.full_description && (
                              <p className="text-muted-foreground text-sm">
                                {option.full_description}
                              </p>
                            )}
                            
                            {option.collab_types && option.collab_types.length > 0 && (
                              <div>
                                <p className="text-sm font-medium mb-2">Suitable for:</p>
                                <div className="flex flex-wrap gap-2">
                                  {option.collab_types.map((ct) => (
                                    <CollabChip key={ct} type={ct as CollabType} size="sm" />
                                  ))}
                                </div>
                              </div>
                            )}
                            
                            <div className="space-y-2 text-sm">
                              {option.location_note && (
                                <div className="flex items-center gap-2">
                                  <MapPin className="h-4 w-4 text-muted-foreground" />
                                  <span>{option.location_note}</span>
                                </div>
                              )}
                              {option.capacity_note && (
                                <div className="flex items-center gap-2">
                                  <Users className="h-4 w-4 text-muted-foreground" />
                                  <span>{option.capacity_note}</span>
                                </div>
                              )}
                              {option.pricing_note && (
                                <div className="flex items-center gap-2">
                                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                                  <span>{option.pricing_note}</span>
                                </div>
                              )}
                              {(option.recurring_pattern || option.available_from || option.available_to) && (
                                <div className="flex items-center gap-2">
                                  <Calendar className="h-4 w-4 text-muted-foreground" />
                                  <span>
                                    {option.recurring_pattern || 
                                      `${option.available_from ? new Date(option.available_from).toLocaleDateString() : ''} – ${option.available_to ? new Date(option.available_to).toLocaleDateString() : ''}`
                                    }
                                  </span>
                                </div>
                              )}
                            </div>

                            {currentUserProfile?.role === 'brand' && !isOwnProfile && (
                              <Link to={`/collabs?newRequest=${profile.id}`}>
                                <Button variant="hero" className="w-full">
                                  <Handshake className="h-4 w-4 mr-2" />
                                  Request This Option
                                </Button>
                              </Link>
                            )}
                          </div>
                        </DialogContent>
                      </Dialog>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}
