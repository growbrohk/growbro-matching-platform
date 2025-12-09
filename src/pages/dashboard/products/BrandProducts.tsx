import { useState, useEffect, useRef } from 'react';
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
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { getMyProducts, deleteProduct, createProduct } from '@/lib/api/products';
import { Product, PRODUCT_CLASS_LABELS, PRODUCT_CLASS_COLORS, ProductClass } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { Plus, Edit, Trash2, Loader2, Image as ImageIcon, Download, Upload } from 'lucide-react';
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

export default function BrandProducts() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [productToDelete, setProductToDelete] = useState<Product | null>(null);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0 });
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (profile) {
      fetchProducts();
    }
  }, [profile]);

  const fetchProducts = async () => {
    if (!profile) return;

    setLoading(true);
    try {
      const { data, error } = await getMyProducts(profile, 'brand');
      if (error) throw error;
      setProducts(data || []);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to load products',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!productToDelete || !profile) return;

    setDeletingId(productToDelete.id);
    try {
      const { error } = await deleteProduct(productToDelete.id, profile);
      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Product deleted successfully',
      });
      setDeleteDialogOpen(false);
      setProductToDelete(null);
      fetchProducts();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete product',
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

  // Download CSV template (when no products)
  const handleDownloadTemplate = () => {
    // CSV Headers
    const headers = [
      'name',
      'slug',
      'product_class',
      'short_description',
      'full_description',
      'category',
      'thumbnail_url',
      'price_in_cents',
      'currency',
      'is_purchasable',
      'is_public',
      'is_active',
      'suitable_collab_types',
      'margin_notes',
      'inventory_notes',
    ];

    // Example row for template
    const exampleRow = [
      'Example Product Name',
      'example-product-name',
      'physical',
      'Short description of the product',
      'Full detailed description of the product',
      'Category Name',
      'https://example.com/image.jpg',
      '1000',
      'hkd',
      'true',
      'false',
      'true',
      'consignment;event',
      'Margin notes here',
      'Inventory notes here',
    ];

    // Combine headers and example row
    const csvContent = [headers.join(','), exampleRow.join(',')].join('\n');

    // Create download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `product-import-template.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast({
      title: 'Template downloaded',
      description: 'CSV template downloaded. Fill in your products and import them.',
    });
  };

  // Export products to CSV
  const handleExportCSV = () => {
    if (!products.length) {
      handleDownloadTemplate();
      return;
    }

    // CSV Headers
    const headers = [
      'name',
      'slug',
      'product_class',
      'short_description',
      'full_description',
      'category',
      'thumbnail_url',
      'price_in_cents',
      'currency',
      'is_purchasable',
      'is_public',
      'is_active',
      'suitable_collab_types',
      'margin_notes',
      'inventory_notes',
    ];

    // Convert products to CSV rows
    const rows = products.map((product) => {
      return [
        product.name || '',
        product.slug || '',
        product.product_class || 'physical',
        product.short_description || '',
        product.full_description || '',
        product.category || '',
        product.thumbnail_url || '',
        (product.price_in_cents || 0).toString(),
        product.currency || 'hkd',
        product.is_purchasable ? 'true' : 'false',
        product.is_public ? 'true' : 'false',
        product.is_active ? 'true' : 'false',
        (product.suitable_collab_types || []).join(';'),
        product.margin_notes || '',
        product.inventory_notes || '',
      ].map((field) => {
        // Escape commas and quotes in CSV
        const str = String(field);
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      });
    });

    // Combine headers and rows
    const csvContent = [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');

    // Create download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `brand-products-${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast({
      title: 'Export successful',
      description: `Exported ${products.length} products to CSV`,
    });
  };

  // Parse CSV file
  const parseCSV = (csvText: string): any[] => {
    const lines = csvText.split('\n').filter((line) => line.trim());
    if (lines.length < 2) {
      throw new Error('CSV file must have at least a header row and one data row');
    }

    const headers = lines[0].split(',').map((h) => h.trim().replace(/^"|"$/g, ''));
    const rows: any[] = [];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      const values: string[] = [];
      let currentValue = '';
      let inQuotes = false;

      for (let j = 0; j < line.length; j++) {
        const char = line[j];
        const nextChar = line[j + 1];

        if (char === '"') {
          if (inQuotes && nextChar === '"') {
            currentValue += '"';
            j++; // Skip next quote
          } else {
            inQuotes = !inQuotes;
          }
        } else if (char === ',' && !inQuotes) {
          values.push(currentValue.trim());
          currentValue = '';
        } else {
          currentValue += char;
        }
      }
      values.push(currentValue.trim()); // Add last value

      if (values.length !== headers.length) {
        throw new Error(`Row ${i + 1} has ${values.length} columns, expected ${headers.length}`);
      }

      const row: any = {};
      headers.forEach((header, index) => {
        row[header] = values[index] || '';
      });
      rows.push(row);
    }

    return rows;
  };

  // Handle CSV file upload
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !profile) return;

    if (!file.name.endsWith('.csv')) {
      toast({
        title: 'Invalid file',
        description: 'Please upload a CSV file',
        variant: 'destructive',
      });
      return;
    }

    setUploading(true);
    setUploadProgress({ current: 0, total: 0 });

    try {
      const text = await file.text();
      const rows = parseCSV(text);

      if (rows.length === 0) {
        throw new Error('CSV file is empty');
      }

      setUploadProgress({ current: 0, total: rows.length });

      const validProductClasses: ProductClass[] = ['physical', 'ticket', 'booking', 'service', 'space'];
      const errors: string[] = [];
      const successes: number[] = [];

      // Process each row
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        setUploadProgress({ current: i + 1, total: rows.length });

        try {
          // Validate required fields
          if (!row.name || !row.name.trim()) {
            errors.push(`Row ${i + 2}: Name is required`);
            continue;
          }

          if (!row.product_class || !validProductClasses.includes(row.product_class)) {
            errors.push(`Row ${i + 2}: Invalid product_class. Must be one of: ${validProductClasses.join(', ')}`);
            continue;
          }

          // Prepare product data
          const productData = {
            name: row.name.trim(),
            slug: row.slug?.trim() || undefined,
            product_class: row.product_class as ProductClass,
            owner_type: 'brand' as const,
            short_description: row.short_description?.trim() || undefined,
            full_description: row.full_description?.trim() || undefined,
            category: row.category?.trim() || undefined,
            thumbnail_url: row.thumbnail_url?.trim() || undefined,
            price_in_cents: row.price_in_cents ? parseInt(row.price_in_cents) : 0,
            currency: row.currency?.trim() || 'hkd',
            is_purchasable: row.is_purchasable === 'true' || row.is_purchasable === true,
            is_public: row.is_public === 'true' || row.is_public === true,
            is_active: row.is_active !== 'false' && row.is_active !== false,
            suitable_collab_types: row.suitable_collab_types
              ? row.suitable_collab_types.split(';').filter((t: string) => t.trim())
              : [],
            margin_notes: row.margin_notes?.trim() || undefined,
            inventory_notes: row.inventory_notes?.trim() || undefined,
          };

          // Create product
          const { error } = await createProduct(productData, profile);
          if (error) {
            errors.push(`Row ${i + 2}: ${error.message}`);
          } else {
            successes.push(i + 2);
          }
        } catch (error: any) {
          errors.push(`Row ${i + 2}: ${error.message || 'Unknown error'}`);
        }
      }

      // Show results
      if (successes.length > 0) {
        toast({
          title: 'Upload complete',
          description: `Successfully imported ${successes.length} product(s)${errors.length > 0 ? `. ${errors.length} error(s) occurred.` : ''}`,
        });
      }

      if (errors.length > 0) {
        console.error('Import errors:', errors);
        toast({
          title: 'Import errors',
          description: `${errors.length} product(s) failed to import. Check console for details.`,
          variant: 'destructive',
        });
      }

      // Refresh products list
      await fetchProducts();
      setUploadDialogOpen(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (error: any) {
      toast({
        title: 'Upload failed',
        description: error.message || 'Failed to process CSV file',
        variant: 'destructive',
      });
    } finally {
      setUploading(false);
      setUploadProgress({ current: 0, total: 0 });
    }
  };

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
            <h1 className="text-3xl font-bold">Brand Products</h1>
            <p className="text-muted-foreground mt-1">
              Manage your brand product catalog
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={handleExportCSV}>
              <Download className="mr-2 h-4 w-4" />
              {products.length > 0 ? 'Export CSV' : 'Download CSV Template'}
            </Button>
            <Button variant="outline" onClick={() => setUploadDialogOpen(true)}>
              <Upload className="mr-2 h-4 w-4" />
              Import CSV
            </Button>
            <Button onClick={() => navigate('/dashboard/products/select-type?owner_type=brand')}>
              <Plus className="mr-2 h-4 w-4" />
              New Product
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Products ({products.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {products.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-muted-foreground mb-4">No products yet</p>
                <Button onClick={() => navigate('/dashboard/products/select-type?owner_type=brand')}>
                  <Plus className="mr-2 h-4 w-4" />
                  Create Your First Product
                </Button>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[80px]">Image</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Class</TableHead>
                    <TableHead>Price</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {products.map((product) => (
                    <TableRow key={product.id}>
                      <TableCell>
                        {product.thumbnail_url ? (
                          <img
                            src={product.thumbnail_url}
                            alt={product.name}
                            className="w-12 h-12 object-cover rounded"
                          />
                        ) : (
                          <div className="w-12 h-12 bg-muted rounded flex items-center justify-center">
                            <ImageIcon className="h-6 w-6 text-muted-foreground" />
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="font-medium">{product.name}</TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={PRODUCT_CLASS_COLORS[product.product_class]}
                        >
                          {PRODUCT_CLASS_LABELS[product.product_class]}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {formatPrice(product.price_in_cents || 0, product.currency)}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          {product.is_public && (
                            <Badge variant="outline" className="text-xs">
                              Public
                            </Badge>
                          )}
                          {product.is_purchasable && (
                            <Badge variant="outline" className="text-xs">
                              Purchasable
                            </Badge>
                          )}
                          {!product.is_active && (
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
                            onClick={() => navigate(`/dashboard/products/${product.id}/edit`)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setProductToDelete(product);
                              setDeleteDialogOpen(true);
                            }}
                            disabled={deletingId === product.id}
                          >
                            {deletingId === product.id ? (
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
              <AlertDialogTitle>Delete Product</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete "{productToDelete?.name}"? This action cannot be undone.
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

        {/* CSV Upload Dialog */}
        <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Import Products from CSV</DialogTitle>
              <DialogDescription>
                Upload a CSV file to bulk import products. The CSV should match the format exported from this page.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="csv-file">CSV File</Label>
                <Input
                  id="csv-file"
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  onChange={handleFileUpload}
                  disabled={uploading}
                />
                <p className="text-xs text-muted-foreground">
                  Required columns: name, product_class. Optional: slug, short_description, full_description, category, thumbnail_url, price_in_cents, currency, is_purchasable, is_public, is_active, suitable_collab_types, margin_notes, inventory_notes
                </p>
              </div>
              {uploading && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span>Processing...</span>
                    <span>
                      {uploadProgress.current} / {uploadProgress.total}
                    </span>
                  </div>
                  <div className="w-full bg-secondary rounded-full h-2">
                    <div
                      className="bg-primary h-2 rounded-full transition-all"
                      style={{
                        width: `${(uploadProgress.current / uploadProgress.total) * 100}%`,
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setUploadDialogOpen(false);
                  if (fileInputRef.current) {
                    fileInputRef.current.value = '';
                  }
                }}
                disabled={uploading}
              >
                Cancel
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}

