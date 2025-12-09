import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Layout } from '@/components/Layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { getMyProducts, deleteProduct } from '@/lib/api/products';
import { Product } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { Plus, Edit, Trash2, Loader2, Image as ImageIcon } from 'lucide-react';
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
import { supabase } from '@/integrations/supabase/client';

export default function Spaces() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [spaces, setSpaces] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [spaceToDelete, setSpaceToDelete] = useState<Product | null>(null);

  useEffect(() => {
    if (profile) {
      if (!profile.is_venue) {
        toast({
          title: 'Access Denied',
          description: 'Only venue users can access Spaces',
          variant: 'destructive',
        });
        navigate('/dashboard/products');
        return;
      }
      fetchSpaces();
    }
  }, [profile, navigate, toast]);

  const fetchSpaces = async () => {
    if (!profile || !profile.is_venue) return;

    setLoading(true);
    try {
      // Fetch venue products with product_type IN ('space', 'booking')
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('owner_user_id', profile.id)
        .eq('owner_type', 'venue')
        .in('product_type', ['space', 'booking'])
        .order('created_at', { ascending: false });

      if (error) throw error;
      setSpaces((data as Product[]) || []);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to load spaces',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!spaceToDelete || !profile) return;

    setDeletingId(spaceToDelete.id);
    try {
      const { error } = await deleteProduct(spaceToDelete.id, profile);
      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Space deleted successfully',
      });
      setDeleteDialogOpen(false);
      setSpaceToDelete(null);
      fetchSpaces();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete space',
        variant: 'destructive',
      });
    } finally {
      setDeletingId(null);
    }
  };

  const formatPrice = (cents: number, currency: string = 'hkd'): string => {
    if (cents === 0) return 'Free';
    const amount = cents / 100;
    const symbols: Record<string, string> = {
      hkd: 'HK$',
      usd: '$',
      eur: '€',
      gbp: '£',
    };
    const symbol = symbols[currency.toLowerCase()] || currency.toUpperCase() + ' ';
    return `${symbol}${amount.toFixed(2)}`;
  };

  if (!profile?.is_venue) {
    return (
      <Layout>
        <div className="container mx-auto py-8 px-4">
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground mb-4">
                This page is only available for venue users.
              </p>
              <Button onClick={() => navigate('/dashboard/products')}>
                Go to Products
              </Button>
            </CardContent>
          </Card>
        </div>
      </Layout>
    );
  }

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="container mx-auto py-8 px-4">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold">Spaces</h1>
            <p className="text-muted-foreground mt-1">
              Manage your venue space offerings (rentals, consignment, poster space, cup sleeves)
            </p>
          </div>
          <Button onClick={() => navigate('/dashboard/products/select-type?owner_type=venue')}>
            <Plus className="mr-2 h-4 w-4" />
            Add Space
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Venue Spaces ({spaces.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {spaces.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-muted-foreground mb-4">No spaces yet</p>
                <Button onClick={() => navigate('/dashboard/products/select-type?owner_type=venue')}>
                  <Plus className="mr-2 h-4 w-4" />
                  Create Your First Space
                </Button>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[80px]">Image</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Price</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {spaces.map((space) => (
                    <TableRow key={space.id}>
                      <TableCell>
                        {space.thumbnail_url ? (
                          <img
                            src={space.thumbnail_url}
                            alt={space.name}
                            className="w-12 h-12 object-cover rounded"
                          />
                        ) : (
                          <div className="w-12 h-12 bg-muted rounded flex items-center justify-center">
                            <ImageIcon className="h-6 w-6 text-muted-foreground" />
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="font-medium">{space.name}</TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className="bg-blue-100 text-blue-800"
                        >
                          {space.product_type === 'space' ? 'Space' : space.product_type === 'booking' ? 'Booking' : space.product_type}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-xs">
                        <p className="text-sm text-muted-foreground truncate">
                          {space.short_description || 'No description'}
                        </p>
                      </TableCell>
                      <TableCell>
                        {formatPrice(space.price_in_cents || 0, space.currency)}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          {space.is_public && (
                            <Badge variant="outline" className="text-xs">
                              Public
                            </Badge>
                          )}
                          {space.is_purchasable && (
                            <Badge variant="outline" className="text-xs">
                              Purchasable
                            </Badge>
                          )}
                          {!space.is_active && (
                            <Badge variant="destructive" className="text-xs">
                              Inactive
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => navigate(`/dashboard/products/${space.id}/edit`)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setSpaceToDelete(space);
                              setDeleteDialogOpen(true);
                            }}
                            disabled={deletingId === space.id}
                          >
                            {deletingId === space.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Trash2 className="h-4 w-4 text-destructive" />
                            )}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Space</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete "{spaceToDelete?.name}"? This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete} className="bg-destructive">
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </Layout>
  );
}

