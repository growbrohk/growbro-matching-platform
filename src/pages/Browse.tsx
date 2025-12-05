import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Layout } from '@/components/Layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Card, CardContent } from '@/components/ui/card';
import { CollabChip } from '@/components/CollabChip';
import { Profile, CollabType, UserRole } from '@/lib/types';
import {
  Search,
  MapPin,
  Filter,
  Loader2,
  X,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';

const COLLAB_TYPES: CollabType[] = ['consignment', 'event', 'collab_product', 'cup_sleeve_marketing'];

export default function Browse() {
  const { profile } = useAuth();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRole, setSelectedRole] = useState<UserRole | 'all'>('all');
  const [selectedCity, setSelectedCity] = useState('');
  const [selectedCollabTypes, setSelectedCollabTypes] = useState<CollabType[]>([]);
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    fetchProfiles();
  }, [profile, selectedRole, selectedCity, selectedCollabTypes]);

  const fetchProfiles = async () => {
    if (!profile) return;

    setLoading(true);
    try {
      let query = supabase.from('profiles').select('*').neq('id', profile.id);

      if (selectedRole !== 'all') {
        query = query.eq('role', selectedRole);
      }

      if (selectedCity) {
        query = query.ilike('city', `%${selectedCity}%`);
      }

      if (selectedCollabTypes.length > 0) {
        query = query.overlaps('preferred_collab_types', selectedCollabTypes);
      }

      const { data, error } = await query.order('created_at', { ascending: false }).limit(50);

      if (error) throw error;
      setProfiles((data as Profile[]) || []);
    } catch (error) {
      console.error('Error fetching profiles:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredProfiles = profiles.filter((p) =>
    p.display_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.handle.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.tags?.some((tag) => tag.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const toggleCollabType = (type: CollabType) => {
    setSelectedCollabTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
  };

  const clearFilters = () => {
    setSelectedRole('all');
    setSelectedCity('');
    setSelectedCollabTypes([]);
    setSearchTerm('');
  };

  const hasActiveFilters = selectedRole !== 'all' || selectedCity || selectedCollabTypes.length > 0;

  return (
    <Layout>
      <div className="max-w-5xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Browse</h1>
          <p className="text-muted-foreground">
            Discover brands and venues to collaborate with
          </p>
        </div>

        {/* Search & Filters */}
        <div className="space-y-4 mb-8">
          <div className="flex gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, handle, or tag..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Button
              variant={showFilters ? 'secondary' : 'outline'}
              onClick={() => setShowFilters(!showFilters)}
              className="gap-2"
            >
              <Filter className="h-4 w-4" />
              Filters
              {hasActiveFilters && (
                <span className="h-2 w-2 rounded-full bg-primary" />
              )}
            </Button>
          </div>

          {showFilters && (
            <Card className="animate-in">
              <CardContent className="pt-6 space-y-4">
                {/* Role Filter */}
                <div>
                  <label className="text-sm font-medium mb-2 block">Role</label>
                  <div className="flex gap-2">
                    {(['all', 'brand', 'venue'] as const).map((role) => (
                      <Button
                        key={role}
                        variant={selectedRole === role ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setSelectedRole(role)}
                        className="capitalize"
                      >
                        {role === 'all' ? 'All' : role}
                      </Button>
                    ))}
                  </div>
                </div>

                {/* City Filter */}
                <div>
                  <label className="text-sm font-medium mb-2 block">City</label>
                  <Input
                    placeholder="Filter by city..."
                    value={selectedCity}
                    onChange={(e) => setSelectedCity(e.target.value)}
                  />
                </div>

                {/* Collab Types Filter */}
                <div>
                  <label className="text-sm font-medium mb-2 block">Collab Types</label>
                  <div className="flex flex-wrap gap-2">
                    {COLLAB_TYPES.map((type) => (
                      <button
                        key={type}
                        onClick={() => toggleCollabType(type)}
                        className={cn(
                          'px-3 py-1.5 rounded-full border text-sm transition-all',
                          selectedCollabTypes.includes(type)
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-border hover:border-primary/50'
                        )}
                      >
                        {type.replace('_', ' ')}
                      </button>
                    ))}
                  </div>
                </div>

                {hasActiveFilters && (
                  <Button variant="ghost" size="sm" onClick={clearFilters}>
                    <X className="h-4 w-4 mr-2" />
                    Clear filters
                  </Button>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Results */}
        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : filteredProfiles.length === 0 ? (
          <div className="text-center py-20">
            <Search className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">No results found</h2>
            <p className="text-muted-foreground">
              Try adjusting your search or filters
            </p>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredProfiles.map((p) => (
              <Link key={p.id} to={`/profiles/${p.handle}`}>
                <Card className="card-hover cursor-pointer h-full">
                  <CardContent className="pt-6">
                    <div className="flex items-start gap-4">
                      <Avatar className="h-14 w-14">
                        <AvatarImage src={p.avatar_url} />
                        <AvatarFallback className="bg-primary/10 text-primary text-lg">
                          {p.display_name?.charAt(0)?.toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold truncate">{p.display_name}</h3>
                        <p className="text-sm text-muted-foreground">@{p.handle}</p>
                        <span className="inline-block mt-1 px-2 py-0.5 bg-primary/10 text-primary rounded-full text-xs font-medium capitalize">
                          {p.role}
                        </span>
                      </div>
                    </div>

                    {p.city && (
                      <p className="flex items-center gap-1 text-sm text-muted-foreground mt-3">
                        <MapPin className="h-3 w-3" />
                        {p.city}
                        {p.country && `, ${p.country}`}
                      </p>
                    )}

                    {p.short_bio && (
                      <p className="text-sm text-muted-foreground mt-3 line-clamp-2">
                        {p.short_bio}
                      </p>
                    )}

                    {p.preferred_collab_types && p.preferred_collab_types.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-3">
                        {p.preferred_collab_types.slice(0, 2).map((type) => (
                          <CollabChip key={type} type={type as CollabType} size="sm" showIcon={false} />
                        ))}
                        {p.preferred_collab_types.length > 2 && (
                          <span className="text-xs text-muted-foreground px-2 py-0.5">
                            +{p.preferred_collab_types.length - 2}
                          </span>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
