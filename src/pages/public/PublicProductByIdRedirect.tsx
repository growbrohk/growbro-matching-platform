import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { getProduct } from '@/lib/api/products';
import { getPublicOrgSlugForOrgId } from '@/lib/api/orgs';
import NotFound from '@/pages/NotFound';

/**
 * Resolves /products/:productId to the canonical /:orgSlug/products/:productId URL.
 */
export default function PublicProductByIdRedirect() {
  const { productId } = useParams<{ productId: string }>();
  const navigate = useNavigate();
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!productId) {
      setNotFound(true);
      return;
    }

    let cancelled = false;

    async function run() {
      try {
        const product = await getProduct(productId);
        if (cancelled) return;
        if (!product) {
          setNotFound(true);
          return;
        }
        const slug = await getPublicOrgSlugForOrgId(product.org_id);
        if (cancelled) return;
        if (!slug) {
          setNotFound(true);
          return;
        }
        navigate(`/${slug}/products/${productId}`, { replace: true });
      } catch {
        if (!cancelled) setNotFound(true);
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [productId, navigate]);

  if (notFound) return <NotFound />;

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#FBF8F4' }}>
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
}
