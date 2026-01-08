import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { ArrowLeft, Loader2, ExternalLink, Archive, Pause, Play, Trash2 } from 'lucide-react';
import {
  getPosterSpace,
  upsertPosterSpace,
  deletePosterSpace,
  getBookingRequestsForSpace,
  type PosterSpace,
} from '@/lib/api/poster-spaces';
import SpaceForm from './components/SpaceForm';

export default function SpaceDetail() {
  const { id } = useParams<{ id: string }>();
  const { currentOrg } = useAuth();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [space, setSpace] = useState<PosterSpace | null>(null);

  const [hasBookingRequests, setHasBookingRequests] = useState(false);
  const [checkingBookingRequests, setCheckingBookingRequests] = useState(false);

  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (currentOrg?.id && id) {
      void fetchSpace();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentOrg?.id, id]);

  useEffect(() => {
    // Only check booking requests for draft spaces (we only allow delete on drafts anyway)
    if (space?.status === 'draft' && id) {
      void checkBookingRequests();
    } else {
      // Not draft => no need to check; also avoid stale state from previous loads
      setHasBookingRequests(false);
      setCheckingBookingRequests(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [space?.id, space?.status, id]);

  const fetchSpace = async () => {
    if (!currentOrg?.id || !id) return;

    try {
      setLoading(true);
      const data = await getPosterSpace(id);

      if (!data || data.org_id !== currentOrg.id) {
        toast.error('Space not found');
        navigate('/app/catalog?tab=spaces');
        return;
      }

      setSpace(data);
    } catch (error: any) {
      console.error('Error fetching space:', error);
      toast.error('Failed to load space');
      navigate('/app/catalog?tab=spaces');
    } finally {
      setLoading(false);
    }
  };

  const checkBookingRequests = async () => {
    if (!id) return;

    try {
      setCheckingBookingRequests(true);
      const requests = await getBookingRequestsForSpace(id);
      setHasBookingRequests((requests?.length ?? 0) > 0);
    } catch (error: any) {
      console.error('Error checking booking requests:', error);
      // If check fails, do NOT block delete forever. Assume none and let DB/RLS enforce safety if needed.
      setHasBookingRequests(false);
    } finally {
      setCheckingBookingRequests(false);
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
      toast.success(
        `Space ${
          newStatus === 'published' ? 'published' : newStatus === 'paused' ? 'paused' : 'archived'
        }`,
      );
    } catch (error: any) {
      console.error('Error updating space status:', error);
      toast.error('Failed to update space status');
    }
  };

  const handleDelete = async () => {
    if (!space) return;

    try {
      setDeleting(true);
      await deletePosterSpace(space.id);
      toast.success('Space deleted');
      navigate('/app/catalog?tab=spaces');
    } catch (error: any) {
      console.error('Error deleting space:', error);
      toast.error(error?.message || 'Failed to delete space');
    } finally {
      setDeleting(false);
      setShowDeleteDialog(false);
    }
  };

  const orgSlug = (currentOrg as any)?.slug;

  const publicUrl = useMemo(() => {
    if (!space || !space.short_code) return '';
    const origin = window.location.origin;
    return orgSlug
      ? `${origin}/space/${space.short_code}-${orgSlug}`
      : `${origin}/space/${space.short_code}`;
  }, [orgSlug, space]);

  // Only allow delete when it's a draft AND we have confirmed there are no booking requests
  const canDelete = useMemo(() => {
    if (!space) return false;
    return space.status === 'draft' && !checkingBookingRequests && !hasBookingRequests;
  }, [space, checkingBookingRequests, hasBookingRequests]);

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

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center gap-3">
        <div className="flex items-start gap-3 md:gap-4 min-w-0 flex-1">
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0 mt-1"
            onClick={() => navigate('/app/catalog?tab=spaces')}
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
              <Button variant="outline" size="sm" onClick={() => handleStatusChange('paused')}>
                <Pause className="h-4 w-4 mr-2" />
                Pause
              </Button>
            )}

            {space.status === 'paused' && (
              <Button variant="outline" size="sm" onClick={() => handleStatusChange('published')}>
                <Play className="h-4 w-4 mr-2" />
                Publish
              </Button>
            )}

            <Button variant="outline" size="sm" onClick={() => handleStatusChange('archived')}>
              <Archive className="h-4 w-4 mr-2" />
              Archive
            </Button>

            {/* Delete: show a clear checking state to avoid “disabled destructive” confusion */}
            {space.status === 'draft' && checkingBookingRequests && (
              <Button variant="outline" size="sm" disabled>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Checking…
              </Button>
            )}

            {canDelete && (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setShowDeleteDialog(true)}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </Button>
            )}

            {/* If draft but cannot delete due to booking requests, show a non-confusing disabled info button */}
            {space.status === 'draft' && !checkingBookingRequests && hasBookingRequests && (
              <Button
                variant="outline"
                size="sm"
                disabled
                title="Cannot delete space with existing booking requests"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Has requests
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Space</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete “{space.title}”? This action cannot be undone.
              All photos associated with this space will also be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                'Delete'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
      <SpaceForm spaceId={space.id} initialData={space} onSave={handleSave} />
    </div>
  );
}
