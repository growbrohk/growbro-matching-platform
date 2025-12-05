import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Layout } from '@/components/Layout';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { CollabChip } from '@/components/CollabChip';
import { Profile, CollabType } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import {
  Heart,
  X,
  MapPin,
  Eye,
  Sparkles,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Link } from 'react-router-dom';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

export default function Home() {
  const { profile } = useAuth();
  const { toast } = useToast();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [swipeDirection, setSwipeDirection] = useState<'left' | 'right' | null>(null);
  const [matchedProfile, setMatchedProfile] = useState<Profile | null>(null);

  useEffect(() => {
    fetchProfiles();
  }, [profile]);

  const fetchProfiles = async () => {
    if (!profile) return;

    setLoading(true);
    try {
      // Get users we've already interacted with
      const { data: existingLikes } = await supabase
        .from('likes')
        .select('to_user_id')
        .eq('from_user_id', profile.id);

      const excludeIds = existingLikes?.map((l) => l.to_user_id) || [];
      excludeIds.push(profile.id);

      // Fetch opposite role profiles
      const targetRole = profile.role === 'brand' ? 'venue' : 'brand';
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('role', targetRole)
        .not('id', 'in', `(${excludeIds.join(',')})`)
        .limit(20);

      if (error) throw error;
      setProfiles((data as Profile[]) || []);
    } catch (error) {
      console.error('Error fetching profiles:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAction = async (isLike: boolean) => {
    if (!profile || currentIndex >= profiles.length) return;

    const targetProfile = profiles[currentIndex];
    setActionLoading(true);
    setSwipeDirection(isLike ? 'right' : 'left');

    try {
      // Record the like/pass
      const { error } = await supabase.from('likes').insert({
        from_user_id: profile.id,
        to_user_id: targetProfile.id,
        is_like: isLike,
      });

      if (error) throw error;

      if (isLike) {
        // Check if there's a match
        const { data: match } = await supabase
          .from('matches')
          .select('*')
          .or(`user_one_id.eq.${profile.id},user_two_id.eq.${profile.id}`)
          .or(`user_one_id.eq.${targetProfile.id},user_two_id.eq.${targetProfile.id}`)
          .maybeSingle();

        if (match) {
          setMatchedProfile(targetProfile);
        }
      }

      // Delay for animation
      await new Promise((resolve) => setTimeout(resolve, 300));
      setCurrentIndex((prev) => prev + 1);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: 'Failed to record action',
        variant: 'destructive',
      });
    } finally {
      setActionLoading(false);
      setSwipeDirection(null);
    }
  };

  const currentProfile = profiles[currentIndex];

  return (
    <Layout>
      <div className="max-w-lg mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-2">Discover</h1>
          <p className="text-muted-foreground">
            Find your perfect {profile?.role === 'brand' ? 'venue' : 'brand'} partner
          </p>
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : !currentProfile ? (
          <div className="text-center py-20">
            <div className="h-20 w-20 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
              <Sparkles className="h-10 w-10 text-muted-foreground" />
            </div>
            <h2 className="text-xl font-semibold mb-2">No more profiles</h2>
            <p className="text-muted-foreground mb-6">
              Check back later for new {profile?.role === 'brand' ? 'venues' : 'brands'}
            </p>
            <Button onClick={fetchProfiles}>Refresh</Button>
          </div>
        ) : (
          <>
            {/* Profile Card */}
            <div
              className={cn(
                'relative bg-card rounded-3xl shadow-xl overflow-hidden transition-all duration-300',
                swipeDirection === 'left' && 'swipe-out-left',
                swipeDirection === 'right' && 'swipe-out-right',
                !swipeDirection && 'swipe-card'
              )}
            >
              {/* Cover Image */}
              <div className="h-48 bg-gradient-to-br from-primary/20 to-accent relative">
                {currentProfile.cover_image_url && (
                  <img
                    src={currentProfile.cover_image_url}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-card/80 to-transparent" />
              </div>

              {/* Profile Info */}
              <div className="p-6 -mt-16 relative">
                <Avatar className="h-24 w-24 border-4 border-card shadow-lg">
                  <AvatarImage src={currentProfile.avatar_url} />
                  <AvatarFallback className="text-2xl bg-primary/10 text-primary">
                    {currentProfile.display_name?.charAt(0)?.toUpperCase()}
                  </AvatarFallback>
                </Avatar>

                <div className="mt-4">
                  <h2 className="text-2xl font-bold">{currentProfile.display_name}</h2>
                  <p className="text-muted-foreground">@{currentProfile.handle}</p>
                  {currentProfile.city && (
                    <p className="flex items-center gap-1 text-sm text-muted-foreground mt-1">
                      <MapPin className="h-4 w-4" />
                      {currentProfile.city}
                      {currentProfile.country && `, ${currentProfile.country}`}
                    </p>
                  )}
                </div>

                {currentProfile.short_bio && (
                  <p className="mt-4 text-foreground/80 line-clamp-3">
                    {currentProfile.short_bio}
                  </p>
                )}

                {/* Tags */}
                {currentProfile.tags && currentProfile.tags.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-4">
                    {currentProfile.tags.slice(0, 4).map((tag) => (
                      <span
                        key={tag}
                        className="px-3 py-1 bg-muted rounded-full text-sm text-muted-foreground"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                {/* Collab Types */}
                {currentProfile.preferred_collab_types && currentProfile.preferred_collab_types.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-4">
                    {currentProfile.preferred_collab_types.map((type) => (
                      <CollabChip key={type} type={type as CollabType} size="sm" />
                    ))}
                  </div>
                )}

                {/* View Profile Link */}
                <Link to={`/profiles/${currentProfile.handle}`}>
                  <Button variant="ghost" size="sm" className="mt-4 gap-2">
                    <Eye className="h-4 w-4" />
                    View Full Profile
                  </Button>
                </Link>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex justify-center gap-6 mt-8">
              <Button
                variant="pass"
                size="iconLg"
                onClick={() => handleAction(false)}
                disabled={actionLoading}
                className="rounded-full"
              >
                <X className="h-7 w-7" />
              </Button>
              <Button
                variant="like"
                size="iconLg"
                onClick={() => handleAction(true)}
                disabled={actionLoading}
                className="rounded-full"
              >
                <Heart className="h-7 w-7" />
              </Button>
            </div>

            {/* Progress */}
            <p className="text-center text-sm text-muted-foreground mt-6">
              {currentIndex + 1} of {profiles.length}
            </p>
          </>
        )}
      </div>

      {/* Match Modal */}
      <Dialog open={!!matchedProfile} onOpenChange={() => setMatchedProfile(null)}>
        <DialogContent className="sm:max-w-md text-center">
          <DialogHeader>
            <DialogTitle className="text-2xl">It's a Match! 🎉</DialogTitle>
          </DialogHeader>
          <div className="py-6">
            <div className="flex justify-center gap-4 mb-6">
              <Avatar className="h-20 w-20 border-4 border-primary">
                <AvatarImage src={profile?.avatar_url} />
                <AvatarFallback className="text-xl bg-primary/10 text-primary">
                  {profile?.display_name?.charAt(0)?.toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <Avatar className="h-20 w-20 border-4 border-primary match-pulse">
                <AvatarImage src={matchedProfile?.avatar_url} />
                <AvatarFallback className="text-xl bg-primary/10 text-primary">
                  {matchedProfile?.display_name?.charAt(0)?.toUpperCase()}
                </AvatarFallback>
              </Avatar>
            </div>
            <p className="text-muted-foreground mb-6">
              You and <span className="font-semibold text-foreground">{matchedProfile?.display_name}</span> both liked each other!
            </p>
            <div className="flex flex-col gap-3">
              <Link to={`/collabs?newRequest=${matchedProfile?.id}`}>
                <Button variant="hero" className="w-full">
                  Send Collab Request
                </Button>
              </Link>
              <Link to="/messages">
                <Button variant="outline" className="w-full">
                  Open Chat
                </Button>
              </Link>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
