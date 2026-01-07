import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { ArrowLeft, Loader2, ExternalLink, Archive, Pause, Play } from 'lucide-react';
import { getPosterSpace, upsertPosterSpace, deletePosterSpace, type PosterSpace } from '@/lib/api/poster-spaces';
import PosterSpaceForm from './components/PosterSpaceForm';

export default function SpaceDetail() {
  const { id } = useParams<{ id: string }>();
  const { currentOrg } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [space, setSpace] = useState<PosterSpace | null>(null);

  useEffect(() => {
    if (currentOrg?.id && id) {
      fetchSpace();
    }
  }, [currentOrg?.id, id]);

  const fetchSpace = async () => {
    if (!currentOrg?.id || !id) return;

    try {
      setLoading(true);
      const data = await getPosterSpace(id);
      if (!data || data.org_id !== currentOrg.id) {
        toast.error('Space not found');
        navigate('/app/booking/resources?type=space');
        return;
      }
      setSpace(data);
    } catch (error: any) {
      console.error('Error fetching space:', error);
      toast.error('Failed to load space');
      navigate('/app/booking/resources?type=space');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (updatedSpace: PosterSpace) => {
    setSpace(updatedSpace);
    toast.success('Space updated successfully');
  };

  const handleStatusChange = async (newStatus: 'published' | 'paused' | 'archived') => {
    if (!space) return;

    try {
      const updated = await upsertPosterSpace({
        ...space,
        status: newStatus,
      });
      setSpace(updated);
      toast.success(`Space ${newStatus === 'published' ? 'published' : newStatus === 'paused' ? 'paused' : 'archived'}`);
    } catch (error: any) {
      console.error('Error updating space status:', error);
      toast.error('Failed to update space status');
    }
  };

  const handleDelete = async () => {
    if (!space || !confirm('Are you sure you want to delete this space?')) return;

    try {
      await deletePosterSpace(space.id);
      toast.success('Space deleted');
      navigate('/app/booking/resources?type=space');
    } catch (error: any) {
      console.error('Error deleting space:', error);
      toast.error('Failed to delete space');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!space) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <p className="text-muted-foreground">Space not found</p>
      </div>
    );
  }

  const orgSlug = (currentOrg as any)?.slug;
  const publicUrl = orgSlug
    ? `${window.location.origin}/o/${orgSlug}/spaces/${space.id}`
    : `${window.location.origin}/spaces/${space.id}`;

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center gap-3">
        <div className="flex items-start gap-3 md:gap-4 min-w-0 flex-1">
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0 mt-1"
            onClick={() => navigate('/app/booking/resources?type=space')}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight break-words">
              {space.title}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {publicUrl.replace(window.location.origin, '')}
            </p>
          </div>
        </div>

        <div className="w-full md:w-auto flex flex-wrap items-center justify-between md:justify-end gap-2">
          <Badge variant={space.status === 'published' ? 'default' : 'secondary'} className="shrink-0">
            {space.status}
          </Badge>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-9 px-3 text-sm"
              onClick={() => window.open(publicUrl, '_blank')}
              disabled={space.status !== 'published'}
            >
              <ExternalLink className="h-4 w-4 md:mr-2" />
              <span className="hidden md:inline">Preview</span>
            </Button>
            {space.status === 'published' && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleStatusChange('paused')}
              >
                <Pause className="h-4 w-4 mr-2" />
                Pause
              </Button>
            )}
            {space.status === 'paused' && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleStatusChange('published')}
              >
                <Play className="h-4 w-4 mr-2" />
                Publish
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleStatusChange('archived')}
            >
              <Archive className="h-4 w-4 mr-2" />
              Archive
            </Button>
          </div>
        </div>
      </div>

      {/* Public URL Card */}
      {space.status === 'published' && (
        <Card>
          <CardHeader>
            <CardTitle>Public Booking URL</CardTitle>
            <CardDescription>Share this link with your customers</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Input value={publicUrl} readOnly className="font-mono text-sm" />
              <Button
                variant="outline"
                onClick={() => {
                  navigator.clipboard.writeText(publicUrl);
                  toast.success('URL copied to clipboard');
                }}
              >
                Copy
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Form */}
      <PosterSpaceForm spaceId={space.id} initialData={space} onSave={handleSave} />
    </div>
  );
}

