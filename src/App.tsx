import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useParams, useNavigate } from "react-router-dom";
import { useState, useEffect, lazy, Suspense } from "react";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import Auth from "./pages/Auth";
import OnboardingNew from "./pages/OnboardingNew";
import Landing from "./pages/Landing";
import NotFound from "./pages/NotFound";
import DashboardProducts from "./pages/dashboard/products/Products";
import ProductForm from "./pages/dashboard/products/ProductForm";
import ProductTypeSelection from "./pages/dashboard/products/ProductTypeSelection";
// Old events system deprecated - using new placeholder pages
import EventsList from "./pages/events/EventsList.new";
import EventForm from "./pages/events/EventForm.new";
import EventDetail from "./pages/events/EventDetail";
import Dashboard from "./pages/Dashboard";
import DashboardPage from "./pages/DashboardPage";
import OrdersPage from "./pages/OrdersPage";
import PipelinePage from "./pages/dashboard/PipelinePage";
import PipelineRevenuePage from "./pages/dashboard/PipelineRevenuePage";
import Catalog from "./pages/Catalog";
import Settings from "./pages/Settings";
import CatalogSettings from "./pages/settings/CatalogSettings";
import ProfileSettings from "./pages/settings/ProfileSettings";
import BrandPageSettings from "./pages/settings/BrandPageSettings";
import ProfilePage from "./pages/ProfilePage";
import Collab from "./pages/Collab";
import CollabSearch from "./pages/collab/CollabSearch";
import CollabResults from "./pages/collab/CollabResults";
const Enquiries = lazy(() => import("./pages/Enquiries"));
import ConnectRequestsPage from "./pages/enquiries/ConnectRequestsPage";
import OrgConnectionsPage from "./pages/org/OrgConnectionsPage";
// Poster Space pages
import SpaceDetail from "./pages/booking/SpaceDetail";
// Public pages
import PublicEventPage from "./pages/public/PublicEventPage";
import PublicPosterSpace from "./pages/public/PublicPosterSpace";
import PublicPosterSpaceRequest from "./pages/public/PublicPosterSpaceRequest";
import PublicPosterSpaceRequestSuccess from "./pages/public/PublicPosterSpaceRequestSuccess";
import PublicProfile from "./pages/public/PublicProfile";
import PublicProductPage from "./pages/public/PublicProductPage";
import PublicProductByIdRedirect from "./pages/public/PublicProductByIdRedirect";
import TrackingRedirect from "./pages/public/TrackingRedirect";
import TrackingRedirectHandler from "./pages/public/TrackingRedirectHandler";
import MessagesComposerPage from "./pages/messages/MessagesComposerPage";
import MessagesThreadPage from "./pages/messages/MessagesThreadPage";
// Checkout pages
import CompleteBookingPage from "./pages/checkout/CompleteBookingPage";
import PaymentPage from "./pages/booking/PaymentPage";
import PendingBookingPage from "./pages/booking/PendingBookingPage";
import PendingConfirmationPage from "./pages/booking/PendingConfirmationPage";
import SuccessfulBookingPage from "./pages/booking/SuccessfulBookingPage";
import PublicCheckoutPage from "./pages/checkout/PublicCheckoutPage";
import ProductPaymentPage from "./pages/checkout/ProductPaymentPage";
import ProductCheckoutSuccessPage from "./pages/checkout/ProductCheckoutSuccessPage";
import ProductCheckoutPendingPage from "./pages/checkout/ProductCheckoutPendingPage";
import { AppLayout } from "./components/AppLayout";
import { PublicCartProvider } from "./contexts/PublicCartContext";
import { Button } from "./components/ui/button";
import { Loader2 } from "lucide-react";
import { getShortCodeById, getPublicPosterSpaceByShortCode } from "@/lib/api/poster-spaces";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Prevent React Query from refiring every active query on browser
      // tab refocus, which caused visible spinners and network churn.
      // Hooks that genuinely need focus refetching opt in explicitly
      // (e.g. use-connected-orgs, use-pending-connections-count).
      refetchOnWindowFocus: false,
      staleTime: 30_000,
    },
  },
});

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, orgMemberships, orgMembershipsStatus, loading, refreshOrgMemberships } = useAuth();

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

  // Only block rendering on the very first membership load. Background refreshes
  // (e.g. after a Supabase TOKEN_REFRESHED on tab refocus) must not unmount
  // `{children}`, otherwise unsaved form state would be lost.
  if (orgMembershipsStatus === 'loading' && orgMemberships.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#FBF8F4' }}>
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: '#0E7A3A' }} />
      </div>
    );
  }

  // Fetch failed - show retry option
  if (orgMembershipsStatus === 'error') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-4" style={{ backgroundColor: '#FBF8F4' }}>
        <p className="text-center" style={{ color: '#0F1F17' }}>Unable to load your account. Please try again.</p>
        <Button onClick={() => refreshOrgMemberships()} style={{ backgroundColor: '#0E7A3A' }}>
          Retry
        </Button>
      </div>
    );
  }

  // Only redirect to onboarding when we've confirmed user has no org memberships
  if (orgMemberships.length === 0) {
    return <Navigate to="/onboarding" replace />;
  }

  return <>{children}</>;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { user, orgMemberships, orgMembershipsStatus, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#FBF8F4' }}>
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: '#0E7A3A' }} />
      </div>
    );
  }

  // If user exists, wait for org memberships before deciding
  if (user && orgMembershipsStatus === 'loading') {
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
  const { user, orgMemberships, orgMembershipsStatus, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#FBF8F4' }}>
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: '#0E7A3A' }} />
      </div>
    );
  }

  // If user exists, wait for org memberships before deciding
  if (user && orgMembershipsStatus === 'loading') {
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
  const { user, orgMemberships, orgMembershipsStatus, loading } = useAuth();

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

  // Still loading org memberships - wait before deciding to redirect
  if (orgMembershipsStatus === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ backgroundColor: '#FBF8F4' }}>
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2" style={{ color: '#0E7A3A' }} />
          <p style={{ color: '#0F1F17' }}>Loading your account...</p>
        </div>
      </div>
    );
  }

  // If signed in and has org membership -> redirect to app dashboard
  if (user && orgMemberships.length > 0) {
    return <Navigate to="/app/dashboard" replace />;
  }

  // If signed in and no org membership (or error) -> allow access to onboarding
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

function LegacyBookingSuccessRedirect() {
  const { orderId } = useParams<{ orderId: string }>();
  return <Navigate to={`/booking/success/${orderId}`} replace />;
}

function ChannelsEditRedirect() {
  const { id } = useParams<{ id: string }>();
  return <Navigate to={`/app/dashboard/channels/${id}/edit`} replace />;
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
      
      {/* Tracking redirect route */}
      <Route path="/t/:shortCode" element={<TrackingRedirect />} />
      
      {/* New tracking link redirect route */}
      <Route path="/r/:slug" element={<TrackingRedirectHandler />} />
      
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
      <Route path="/app/dashboard" element={<ProtectedRoute><AppLayout><DashboardPage /></AppLayout></ProtectedRoute>} />
      
      {/* Pipelines page */}
      <Route path="/app/dashboard/pipelines" element={<ProtectedRoute><AppLayout><PipelinePage /></AppLayout></ProtectedRoute>} />
      <Route path="/app/dashboard/pipeline-revenue" element={<ProtectedRoute><AppLayout><PipelineRevenuePage /></AppLayout></ProtectedRoute>} />
      <Route path="/app/dashboard/channels" element={<Navigate to="/app/dashboard/pipelines" replace />} />
      <Route path="/app/dashboard/channels/:id/edit" element={<ProtectedRoute><AppLayout><div className="p-6"><p>Edit pipeline (placeholder)</p></div></AppLayout></ProtectedRoute>} />
      {/* Redirect canonical /dashboard/channels to /app/dashboard/pipelines */}
      <Route path="/dashboard/channels" element={<Navigate to="/app/dashboard/pipelines" replace />} />
      <Route path="/dashboard/channels/:id/edit" element={<ChannelsEditRedirect />} />
      
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
      
      {/* Events CRUD routes */}
      <Route path="/app/events/new" element={<ProtectedRoute><AppLayout><EventForm /></AppLayout></ProtectedRoute>} />
      <Route path="/app/events/:id" element={<ProtectedRoute><AppLayout><EventDetail /></AppLayout></ProtectedRoute>} />
      <Route path="/app/events/:id/edit" element={<ProtectedRoute><AppLayout><EventDetail /></AppLayout></ProtectedRoute>} />
      
      {/* Redirect old list routes to Catalog with appropriate tabs */}
      <Route path="/app/events" element={<Navigate to="/app/catalog?tab=events" replace />} />
      <Route path="/app/bookings" element={<Navigate to="/app/catalog?tab=events" replace />} />
      
      {/* New: Collab page */}
      <Route path="/app/collab" element={<ProtectedRoute><AppLayout><CollabSearch /></AppLayout></ProtectedRoute>} />
      
      {/* Collab Results - Protected route for search results */}
      <Route path="/collab/results" element={<ProtectedRoute><AppLayout><CollabResults /></AppLayout></ProtectedRoute>} />
      
      {/* Enquiries page (canonical route) */}
      <Route
        path="/app/enquiries"
        element={
          <ProtectedRoute>
            <AppLayout>
              <Suspense
                fallback={
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-6 w-6 animate-spin" style={{ color: "#0E7A3A" }} />
                  </div>
                }
              >
                <Enquiries />
              </Suspense>
            </AppLayout>
          </ProtectedRoute>
        }
      />
      <Route path="/app/enquiries/connect-requests" element={<ProtectedRoute><AppLayout><ConnectRequestsPage /></AppLayout></ProtectedRoute>} />
      
      {/* Org Connections page */}
      <Route path="/app/org/:orgId/connections" element={<ProtectedRoute><AppLayout><OrgConnectionsPage /></AppLayout></ProtectedRoute>} />
      
      {/* Orders page - new mobile-first orders list */}
      <Route 
        path="/app/orders" 
        element={
          <ProtectedRoute>
            <AppLayout>
              <OrdersPage />
            </AppLayout>
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/app/orders/:orderId" 
        element={
          <ProtectedRoute>
            <AppLayout>
              <OrdersPage />
            </AppLayout>
          </ProtectedRoute>
        } 
      />
      
      {/* Legacy routes redirect to Enquiries */}
      <Route path="/app/notifications" element={<Navigate to="/app/enquiries" replace />} />
      
      {/* Messaging routes (fullscreen, no AppLayout) */}
      <Route path="/messages/new" element={<ProtectedRoute><MessagesComposerPage /></ProtectedRoute>} />
      <Route path="/messages/:conversationId" element={<ProtectedRoute><MessagesThreadPage /></ProtectedRoute>} />
      
      {/* Settings routes */}
      <Route path="/app/settings" element={<ProtectedRoute><AppLayout><Settings /></AppLayout></ProtectedRoute>} />
      <Route path="/app/settings/catalog" element={<ProtectedRoute><AppLayout><CatalogSettings /></AppLayout></ProtectedRoute>} />
      <Route path="/app/settings/profile" element={<ProtectedRoute><AppLayout><ProfileSettings /></AppLayout></ProtectedRoute>} />
      <Route path="/app/settings/brand-page" element={<ProtectedRoute><AppLayout><BrandPageSettings /></AppLayout></ProtectedRoute>} />
      
      {/* Account route - Profile page (new preferred route) */}
      <Route path="/app/account" element={<ProtectedRoute><AppLayout><ProfilePage /></AppLayout></ProtectedRoute>} />
      
      {/* Poster Space routes */}
      <Route path="/app/booking/spaces/:id/edit" element={<ProtectedRoute><AppLayout><SpaceDetail /></AppLayout></ProtectedRoute>} />
      
      {/* Public Profile Page - Must be before generic orgSlug route */}
      <Route path="/profile/:orgSlug" element={<PublicProfile />} />
      
      {/* Short product URL → canonical /:orgSlug/products/:productId */}
      <Route path="/products/:productId" element={<PublicProductByIdRedirect />} />
      
      {/* Public Product Page - Must be before /:orgSlug/:eventSlug */}
      <Route path="/:orgSlug/products/:productId" element={<PublicProductPage />} />
      
      {/* Product checkout flow */}
      <Route path="/:orgSlug/checkout" element={<PublicCheckoutPage />} />
      <Route path="/:orgSlug/checkout/payment/:orderId" element={<ProductPaymentPage />} />
      <Route path="/:orgSlug/checkout/success/:orderId" element={<ProductCheckoutSuccessPage />} />
      <Route path="/:orgSlug/checkout/pending/:orderId" element={<ProductCheckoutPendingPage />} />
      
      {/* Public Brand Page - Single segment, before event route */}
      <Route path="/:brandSlug" element={<PublicProfile />} />
      
      {/* Explicit /org/* route - shows NotFound (hard cutover, no redirects) */}
      <Route path="/org/*" element={<NotFound />} />
      
      {/* Checkout route - Must be before generic orgSlug route */}
      <Route path="/events/:eventId/checkout" element={<CompleteBookingPage />} />
      
      {/* Booking routes - Must be before generic orgSlug route */}
      <Route path="/booking/payment/:orderId" element={<PaymentPage />} />
      <Route path="/booking/pending/:orderId" element={<PendingConfirmationPage />} />
      <Route path="/booking/success/:orderId" element={<SuccessfulBookingPage />} />
      
      {/* Legacy booking success route - redirect to new route */}
      <Route path="/booking/:orderId/success" element={<LegacyBookingSuccessRedirect />} />
      
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
          <PublicCartProvider>
            <AppRoutes />
          </PublicCartProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
