import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { Warehouse, Loader2, Plus, Search, DollarSign } from 'lucide-react';
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog';
import PosterSpaceForm from './components/PosterSpaceForm';
import AddSpaceCategoryModal, { type SpaceCategory } from './components/AddSpaceCategoryModal';
import { getPosterSpacesByOrg, type PosterSpace } from '@/lib/api/poster-spaces';

interface SpacesListProps {
  isEmbeddedInCatalog?: boolean;
}

export default function SpacesList({ isEmbeddedInCatalog = false }: SpacesListProps = {}) {
  const { currentOrg } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [spaces, setSpaces] = useState<PosterSpace[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [showPosterSpaceForm, setShowPosterSpaceForm] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<SpaceCategory | null>(null);

  useEffect(() => {
    if (currentOrg?.id) {
      fetchSpaces();
    }
  }, [currentOrg?.id]);

  const fetchSpaces = async () => {
    if (!currentOrg?.id) return;

    try {
      setLoading(true);
      const data = await getPosterSpacesByOrg(currentOrg.id);
      setSpaces(data || []);
    } catch (error: any) {
      console.error('Error fetching spaces:', error);
      toast.error('Failed to load spaces');
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'published':
        return 'bg-green-100 text-green-700';
      case 'paused':
        return 'bg-yellow-100 text-yellow-700';
      case 'archived':
        return 'bg-gray-100 text-gray-700';
      default:
        return 'bg-blue-100 text-blue-700';
    }
  };

  const getCategoryLabel = (category: string) => {
    const labels: Record<string, string> = {
      poster_space: 'Poster Space',
      consignment_shelf: 'Consignment Shelf',
      cup_sleeve_promotion: 'Cup Sleeve Promotion',
      event_hosting: 'Event Hosting',
    };
    return labels[category] || category;
  };

  const filteredSpaces = spaces.filter((space) => {
    const matchesSearch =
      space.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      space.short_description?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSearch;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: '#0E7A3A' }} />
      </div>
    );
  }

  return (
    <div className={`w-full min-w-0 ${isEmbeddedInCatalog ? 'px-4 py-6' : 'max-w-7xl mx-auto px-4 sm:px-6 lg:px-8'} space-y-4 md:space-y-6`}>
      {/* Header - Only show when NOT embedded in Catalog */}
      {!isEmbeddedInCatalog && (
        <div className="flex flex-wrap items-center justify-between gap-2 sm:gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="text-xl sm:text-2xl md:text-3xl font-extrabold tracking-tight truncate" style={{ fontFamily: "'Inter Tight', sans-serif", color: '#0F1F17' }}>
              Spaces
            </h1>
            <p className="mt-1 text-sm" style={{ color: 'rgba(15,31,23,0.72)' }}>
              Manage your bookable spaces
            </p>
          </div>
          <Button
            onClick={() => setShowCategoryModal(true)}
            style={{ backgroundColor: '#0E7A3A', color: 'white' }}
            size="icon"
            className="h-8 w-8 sm:h-9 sm:w-auto sm:px-3 shrink-0"
            title="Create new space"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline sm:ml-2">New Space</span>
          </Button>
        </div>
      )}

      {/* Embedded header - Show when embedded in Catalog */}
      {isEmbeddedInCatalog && (
        <div className="flex flex-wrap items-center justify-between gap-2 sm:gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-lg sm:text-xl font-semibold truncate" style={{ color: '#0F1F17' }}>
              Spaces
            </h2>
          </div>
          <Button
            onClick={() => setShowCategoryModal(true)}
            style={{ backgroundColor: '#0E7A3A', color: 'white' }}
            size="icon"
            className="h-8 w-8 sm:h-9 sm:w-auto sm:px-3 shrink-0"
            title="Create new space"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline sm:ml-2">New Space</span>
          </Button>
        </div>
      )}

      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search spaces..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {filteredSpaces.length === 0 ? (
        <Card className="rounded-3xl border" style={{ borderColor: 'rgba(14,122,58,0.14)', backgroundColor: 'rgba(251,248,244,0.9)' }}>
          <CardContent className="flex flex-col items-center justify-center py-16 p-4 md:p-6">
            <Warehouse className="h-16 w-16 mb-4" style={{ color: '#0E7A3A', opacity: 0.3 }} />
            <h3 className="text-xl font-semibold mb-2" style={{ color: '#0F1F17' }}>
              No spaces yet
            </h3>
            <p className="text-center text-muted-foreground mb-6 max-w-md">
              Get started by creating your first bookable space
            </p>
            <Button
              onClick={() => setShowCategoryModal(true)}
              style={{ backgroundColor: '#0E7A3A', color: 'white' }}
            >
              <Plus className="h-4 w-4 mr-2" />
              Create Your First Space
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 w-full min-w-0">
          {filteredSpaces.map((space) => (
            <Card
              key={space.id}
              className="cursor-pointer hover:shadow-md transition-shadow w-full min-w-0"
              onClick={() => navigate(`/app/booking/spaces/${space.id}/edit`)}
            >
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <CardTitle className="truncate text-base sm:text-lg">{space.title}</CardTitle>
                    <CardDescription className="line-clamp-2 mt-1">
                      {space.short_description || 'No description'}
                    </CardDescription>
                  </div>
                  <div className="flex flex-col gap-2">
                    <Badge className={getStatusColor(space.status)} variant="secondary">
                      {space.status}
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                      {getCategoryLabel(space.category)}
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {space.price_cents !== null && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <DollarSign className="h-4 w-4" />
                    <span>
                      {space.currency} {(space.price_cents / 100).toFixed(2)}
                    </span>
                  </div>
                )}
                {space.price_cents === null && (
                  <div className="text-sm text-muted-foreground">
                    Pricing by inquiry
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Category Selection Modal */}
      <AddSpaceCategoryModal
        open={showCategoryModal}
        onOpenChange={setShowCategoryModal}
        onSelectCategory={async (category) => {
          setSelectedCategory(category);
          if (!currentOrg?.id) return;

          // For all categories, open the form dialog without creating any DB record
          // Drafts will only be created when user clicks "Save Draft" or "Publish"
          setShowCategoryModal(false);
          setShowPosterSpaceForm(true);
        }}
      />

      {/* Poster Space Form Dialog - Only shown when poster_space category selected */}
      <Dialog open={showPosterSpaceForm} onOpenChange={setShowPosterSpaceForm}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
          {showPosterSpaceForm && (
            <PosterSpaceForm
              initialCategory={selectedCategory || undefined}
              onSave={(space) => {
                setShowPosterSpaceForm(false);
                setSelectedCategory(null);
                fetchSpaces();
                // Navigate to edit page after save
                navigate(`/app/booking/spaces/${space.id}/edit`);
              }}
              onCancel={() => {
                setShowPosterSpaceForm(false);
                setSelectedCategory(null);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
