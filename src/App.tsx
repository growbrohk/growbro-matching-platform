import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useParams, useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import Auth from "./pages/Auth";
import OnboardingNew from "./pages/OnboardingNew";
import Landing from "./pages/Landing";
import NotFound from "./pages/NotFound";
import DashboardProducts from "./pages/dashboard/products/Products";
import ProductForm from "./pages/dashboard/products/ProductForm";
import ProductTypeSelection from "./pages/dashboard/products/ProductTypeSelection";
import Inventory from "./pages/dashboard/inventory/Inventory";
// Old events system deprecated - using new placeholder pages
import EventsList from "./pages/events/EventsList.new";
import EventForm from "./pages/events/EventForm.new";
import Dashboard from "./pages/Dashboard";
import Catalog from "./pages/Catalog";
import Settings from "./pages/Settings";
import CatalogSettings from "./pages/settings/CatalogSettings";
import ProfileSettings from "./pages/settings/ProfileSettings";
import ProfilePage from "./pages/ProfilePage";
import Collab from "./pages/Collab";
import Orders from "./pages/Orders";
// Poster Space pages
import SpaceDetail from "./pages/booking/SpaceDetail";
// Public pages
import PublicEventPage from "./pages/public/PublicEventPage";
import PublicPosterSpace from "./pages/public/PublicPosterSpace";
import PublicPosterSpaceRequest from "./pages/public/PublicPosterSpaceRequest";
import PublicPosterSpaceRequestSuccess from "./pages/public/PublicPosterSpaceRequestSuccess";
import { AppLayout } from "./components/AppLayout";
import { Loader2 } from "lucide-react";
import { getShortCodeById, getPublicPosterSpaceByShortCode } from "@/lib/api/poster-spaces";

const queryClient = new QueryClient();

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, currentOrg, orgMemberships, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#FBF8F4' }}>
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: '#0E7A3A' }} />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  // If user has no org memberships, redirect to onboarding
  if (orgMemberships.length === 0) {
    return <Navigate to="/onboarding" replace />;
  }

  return <>{children}</>;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { user, orgMemberships, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#FBF8F4' }}>
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: '#0E7A3A' }} />
      </div>
    );
  }

  // If user is logged in and has org memberships, redirect to app dashboard
  if (user && orgMemberships.length > 0) {
    return <Navigate to="/app/dashboard" replace />;
  }

  return <>{children}</>;
}

function AuthRoute({ children }: { children: React.ReactNode }) {
  const { user, orgMemberships, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#FBF8F4' }}>
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: '#0E7A3A' }} />
      </div>
    );
  }

  // If signed in and has org membership -> redirect to app dashboard
  if (user && orgMemberships.length > 0) {
    return <Navigate to="/app/dashboard" replace />;
  }

  // If signed in and no org membership -> redirect to onboarding
  if (user && orgMemberships.length === 0) {
    return <Navigate to="/onboarding" replace />;
  }

  // If signed out -> show auth page
  return <>{children}</>;
}

function OnboardingRoute({ children }: { children: React.ReactNode }) {
  const { user, orgMemberships, loading } = useAuth();

  // If auth is still loading, show loading state
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ backgroundColor: '#FBF8F4' }}>
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2" style={{ color: '#0E7A3A' }} />
          <p style={{ color: '#0F1F17' }}>Loading your account...</p>
        </div>
      </div>
    );
  }

  // If signed out -> redirect to auth
  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  // If signed in and has org membership -> redirect to app dashboard
  if (user && orgMemberships.length > 0) {
    return <Navigate to="/app/dashboard" replace />;
  }

  // If signed in and no org membership -> allow access to onboarding
  return <>{children}</>;
}

// Legacy redirect components for backward compatibility
function LegacyPosterSpaceRedirect() {
  const { orgSlug, spaceId } = useParams<{ orgSlug: string; spaceId: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function redirect() {
      if (!spaceId) {
        navigate('/');
        return;
      }

      const shortCode = await getShortCodeById(spaceId);
      if (!shortCode) {
        navigate('/');
        return;
      }

      // Try to get org slug from the space
      const result = await getPublicPosterSpaceByShortCode(shortCode);
      if (result?.org?.slug) {
        navigate(`/space/${shortCode}-${result.org.slug}`, { replace: true });
      } else {
        navigate(`/space/${shortCode}`, { replace: true });
      }
    }

    void redirect().finally(() => setLoading(false));
  }, [spaceId, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#FBF8F4' }}>
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return null;
}

function LegacyPosterSpaceRequestRedirect() {
  const { orgSlug, spaceId } = useParams<{ orgSlug: string; spaceId: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function redirect() {
      if (!spaceId) {
        navigate('/');
        return;
      }

      const shortCode = await getShortCodeById(spaceId);
      if (!shortCode) {
        navigate('/');
        return;
      }

      const result = await getPublicPosterSpaceByShortCode(shortCode);
      if (result?.org?.slug) {
        navigate(`/space/${shortCode}-${result.org.slug}/request`, { replace: true });
      } else {
        navigate(`/space/${shortCode}/request`, { replace: true });
      }
    }

    void redirect().finally(() => setLoading(false));
  }, [spaceId, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#FBF8F4' }}>
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return null;
}

function LegacyPosterSpaceRequestSuccessRedirect() {
  const { orgSlug, spaceId, requestId } = useParams<{ orgSlug: string; spaceId: string; requestId: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function redirect() {
      if (!spaceId) {
        navigate('/');
        return;
      }

      const shortCode = await getShortCodeById(spaceId);
      if (!shortCode) {
        navigate('/');
        return;
      }

      const result = await getPublicPosterSpaceByShortCode(shortCode);
      if (result?.org?.slug) {
        navigate(`/space/${shortCode}-${result.org.slug}/request/${requestId}/success`, { replace: true });
      } else {
        navigate(`/space/${shortCode}/request/${requestId}/success`, { replace: true });
      }
    }

    void redirect().finally(() => setLoading(false));
  }, [spaceId, requestId, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#FBF8F4' }}>
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return null;
}

function LegacyPosterSpaceRedirectSimple() {
  const { spaceId } = useParams<{ spaceId: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function redirect() {
      if (!spaceId) {
        navigate('/');
        return;
      }

      const shortCode = await getShortCodeById(spaceId);
      if (!shortCode) {
        navigate('/');
        return;
      }

      const result = await getPublicPosterSpaceByShortCode(shortCode);
      if (result?.org?.slug) {
        navigate(`/space/${shortCode}-${result.org.slug}`, { replace: true });
      } else {
        navigate(`/space/${shortCode}`, { replace: true });
      }
    }

    void redirect().finally(() => setLoading(false));
  }, [spaceId, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#FBF8F4' }}>
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return null;
}

function AppRoutes() {
  return (
    <Routes>
      {/* Public Routes */}
      <Route path="/" element={<PublicRoute><Landing /></PublicRoute>} />
      <Route path="/auth" element={<AuthRoute><Auth /></AuthRoute>} />
      <Route path="/onboarding" element={<OnboardingRoute><OnboardingNew /></OnboardingRoute>} />
      
      {/* Public Poster Space Pages - New canonical format */}
      <Route path="/space/:spaceParam" element={<PublicPosterSpace />} />
      <Route path="/space/:spaceParam/request" element={<PublicPosterSpaceRequest />} />
      <Route path="/space/:spaceParam/request/:requestId/success" element={<PublicPosterSpaceRequestSuccess />} />
      
      {/* Legacy routes - backward compatibility redirects */}
      <Route path="/o/:orgSlug/spaces/:spaceId" element={<LegacyPosterSpaceRedirect />} />
      <Route path="/o/:orgSlug/spaces/:spaceId/request" element={<LegacyPosterSpaceRequestRedirect />} />
      <Route path="/o/:orgSlug/spaces/:spaceId/request/:requestId/success" element={<LegacyPosterSpaceRequestSuccessRedirect />} />
      <Route path="/spaces/:spaceId" element={<LegacyPosterSpaceRedirectSimple />} />
      
      {/* 
        Protected Routes - Use /app prefix
        
        BOTTOM TAB NAVIGATION:
        - Dashboard | Catalog | Collab | Orders | Account
        - Products/Events/Spaces are subtabs inside Catalog
        - Old routes redirect to new Catalog structure
      */}
      <Route path="/app/dashboard" element={<ProtectedRoute><AppLayout><Dashboard /></AppLayout></ProtectedRoute>} />
      
      {/* Catalog page with subtabs (Products | Events | Spaces) */}
      <Route path="/app/catalog" element={<ProtectedRoute><AppLayout><Catalog /></AppLayout></ProtectedRoute>} />
      
      {/* Product CRUD routes (outside Catalog container for full-page forms) */}
      <Route path="/app/products/select-type" element={<ProtectedRoute><AppLayout><ProductTypeSelection /></AppLayout></ProtectedRoute>} />
      <Route path="/app/products/new" element={<ProtectedRoute><AppLayout><ProductForm /></AppLayout></ProtectedRoute>} />
      <Route path="/app/products/:id/edit" element={<ProtectedRoute><AppLayout><ProductForm /></AppLayout></ProtectedRoute>} />
      <Route path="/app/catalog/select-type" element={<ProtectedRoute><AppLayout><ProductTypeSelection /></AppLayout></ProtectedRoute>} />
      <Route path="/app/catalog/new" element={<ProtectedRoute><AppLayout><ProductForm /></AppLayout></ProtectedRoute>} />
      <Route path="/app/catalog/:id/edit" element={<ProtectedRoute><AppLayout><ProductForm /></AppLayout></ProtectedRoute>} />
      
      {/* Redirect old routes to Catalog with appropriate tab */}
      <Route path="/app/products" element={<Navigate to="/app/catalog?tab=products" replace />} />
      
      {/* Inventory - removed from bottom nav but routes still work */}
      <Route path="/app/inventory" element={<ProtectedRoute><AppLayout><Inventory /></AppLayout></ProtectedRoute>} />
      
      {/* Events CRUD routes */}
      <Route path="/app/events/new" element={<ProtectedRoute><AppLayout><EventForm /></AppLayout></ProtectedRoute>} />
      <Route path="/app/events/:id/edit" element={<ProtectedRoute><AppLayout><EventForm /></AppLayout></ProtectedRoute>} />
      
      {/* Redirect old list routes to Catalog with appropriate tabs */}
      <Route path="/app/events" element={<Navigate to="/app/catalog?tab=events" replace />} />
      <Route path="/app/bookings" element={<Navigate to="/app/catalog?tab=events" replace />} />
      
      {/* New: Collab page */}
      <Route path="/app/collab" element={<ProtectedRoute><AppLayout><Collab /></AppLayout></ProtectedRoute>} />
      
      {/* New: Orders page */}
      <Route path="/app/orders" element={<ProtectedRoute><AppLayout><Orders /></AppLayout></ProtectedRoute>} />
      
      {/* Settings routes */}
      <Route path="/app/settings" element={<ProtectedRoute><AppLayout><Settings /></AppLayout></ProtectedRoute>} />
      <Route path="/app/settings/catalog" element={<ProtectedRoute><AppLayout><CatalogSettings /></AppLayout></ProtectedRoute>} />
      <Route path="/app/settings/profile" element={<ProtectedRoute><AppLayout><ProfileSettings /></AppLayout></ProtectedRoute>} />
      
      {/* Account route - Profile page (new preferred route) */}
      <Route path="/app/account" element={<ProtectedRoute><AppLayout><ProfilePage /></AppLayout></ProtectedRoute>} />
      
      {/* Poster Space routes */}
      <Route path="/app/booking/spaces/:id/edit" element={<ProtectedRoute><AppLayout><SpaceDetail /></AppLayout></ProtectedRoute>} />
      
      {/* Public Event Page - Must be after all reserved routes */}
      <Route path="/:orgSlug/:eventSlug" element={<PublicEventPage />} />
      
      {/* Catch-all */}
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
