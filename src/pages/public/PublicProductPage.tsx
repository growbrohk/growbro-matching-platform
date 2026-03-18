import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { getProductWithVariants } from '@/lib/api/products';
import { getOrgBySlugWithProfile } from '@/lib/api/orgs';
import NotFound from '@/pages/NotFound';
import BrandPublicHeader from '@/components/brand-public/BrandPublicHeader';
import PublicProductForm from '@/components/products/PublicProductForm';

const RESERVED_ORG_SLUGS = [
  'app', 'login', 'events', 'admin', 'api', 'auth', 'onboarding',
  'book', 'r', 'space', 'profile', 't', 'o', 'booking', 'org',
  'messages', 'dashboard', 'collab', 'enquiries', 'orders',
  'settings', 'account', 'products', 'catalog', 'notifications', 'checkout',
];

export default function PublicProductPage() {
  const { orgSlug, productId } = useParams<{ orgSlug: string; productId: string }>();
  const [loading, setLoading] = useState(true);
  const [productData, setProductData] = useState<{ product: any; variants: any[] } | null>(null);
  const [org, setOrg] = useState<any>(null);

  useEffect(() => {
    if (!orgSlug || !productId) {
      setLoading(false);
      return;
    }

    if (RESERVED_ORG_SLUGS.includes(orgSlug.toLowerCase())) {
      setLoading(false);
      return;
    }

    const fetchData = async () => {
      try {
        setLoading(true);
        const [productResult, orgResult] = await Promise.all([
          getProductWithVariants(productId),
          getOrgBySlugWithProfile(orgSlug),
        ]);

        if (!productResult || !orgResult) {
          setProductData(null);
          setOrg(null);
          return;
        }

        // Verify product belongs to org
        if (productResult.product.org_id !== orgResult.id) {
          setProductData(null);
          setOrg(null);
          return;
        }

        setProductData(productResult);
        setOrg(orgResult);
      } catch (error) {
        console.error('Error fetching product:', error);
        setProductData(null);
        setOrg(null);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [orgSlug, productId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-muted/30 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: '#0E7A3A' }} />
      </div>
    );
  }

  if (!productData || !org) {
    return <NotFound />;
  }

  return (
    <div className="min-h-screen bg-muted/30">
      <BrandPublicHeader org={org} profile={org.profile} showBackLink={true} isOwner={false} />
      <div className="w-full max-w-6xl mx-auto px-4 py-8 md:py-12">
        <PublicProductForm
          product={productData.product}
          variants={productData.variants}
          org={org}
        />
      </div>
    </div>
  );
}
