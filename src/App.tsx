import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import Auth from "./pages/Auth";
import OnboardingNew from "./pages/OnboardingNew";
import Landing from "./pages/Landing";
import Browse from "./pages/Browse";
import ProfilePage from "./pages/ProfilePage";
import Products from "./pages/Products";
import VenueCollabOptions from "./pages/VenueCollabOptions";
import Collabs from "./pages/Collabs";
import Messages from "./pages/Messages";
import NotFound from "./pages/NotFound";
import Shop from "./pages/Shop";
import ShopProduct from "./pages/ShopProduct";
import DashboardProducts from "./pages/dashboard/products/Products";
import ProductForm from "./pages/dashboard/products/ProductForm";
import ProductTypeSelection from "./pages/dashboard/products/ProductTypeSelection";
import Inventory from "./pages/dashboard/inventory/Inventory";
import Spaces from "./pages/dashboard/spaces/Spaces";
import EventsList from "./pages/events/EventsList";
import EventForm from "./pages/events/EventForm";
import Dashboard from "./pages/Dashboard";
import Bookings from "./pages/Bookings";
import Settings from "./pages/Settings";
import { AppLayout } from "./components/AppLayout";
import { Loader2 } from "lucide-react";

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

  // If user is logged in and has org memberships, redirect to dashboard
  if (user && orgMemberships.length > 0) {
    return <Navigate to="/dashboard" replace />;
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

  // If signed in and has org membership -> redirect to dashboard
  if (user && orgMemberships.length > 0) {
    return <Navigate to="/dashboard" replace />;
  }

  // If signed in and no org membership -> redirect to onboarding
  if (user && orgMemberships.length === 0) {
    return <Navigate to="/onboarding" replace />;
  }

  // If signed out -> show auth page
  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<PublicRoute><Landing /></PublicRoute>} />
      <Route path="/auth" element={<AuthRoute><Auth /></AuthRoute>} />
      <Route path="/onboarding" element={<ProtectedRoute><OnboardingNew /></ProtectedRoute>} />
      {/* Dashboard Routes - Dashboard includes AppLayout */}
      <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      {/* Other dashboard routes need to be updated to include AppLayout individually */}
      <Route path="/dashboard/products" element={<ProtectedRoute><AppLayout><DashboardProducts /></AppLayout></ProtectedRoute>} />
      <Route path="/dashboard/products/select-type" element={<ProtectedRoute><AppLayout><ProductTypeSelection /></AppLayout></ProtectedRoute>} />
      <Route path="/dashboard/products/new" element={<ProtectedRoute><AppLayout><ProductForm /></AppLayout></ProtectedRoute>} />
      <Route path="/dashboard/products/:id/edit" element={<ProtectedRoute><AppLayout><ProductForm /></AppLayout></ProtectedRoute>} />
      <Route path="/dashboard/inventory" element={<ProtectedRoute><AppLayout><Inventory /></AppLayout></ProtectedRoute>} />
      <Route path="/dashboard/events" element={<ProtectedRoute><AppLayout><EventsList /></AppLayout></ProtectedRoute>} />
      <Route path="/dashboard/events/new" element={<ProtectedRoute><AppLayout><EventForm /></AppLayout></ProtectedRoute>} />
      <Route path="/dashboard/events/:id/edit" element={<ProtectedRoute><AppLayout><EventForm /></AppLayout></ProtectedRoute>} />
      <Route path="/dashboard/bookings" element={<ProtectedRoute><AppLayout><Bookings /></AppLayout></ProtectedRoute>} />
      <Route path="/dashboard/settings" element={<ProtectedRoute><AppLayout><Settings /></AppLayout></ProtectedRoute>} />
      {/* Legacy routes for backward compatibility - will be removed */}
      <Route path="/browse" element={<ProtectedRoute><Browse /></ProtectedRoute>} />
      <Route path="/profiles/:handle" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
      <Route path="/products" element={<ProtectedRoute><Products /></ProtectedRoute>} />
      <Route path="/venue/collab-options" element={<ProtectedRoute><VenueCollabOptions /></ProtectedRoute>} />
      <Route path="/collabs" element={<ProtectedRoute><Collabs /></ProtectedRoute>} />
      <Route path="/messages" element={<ProtectedRoute><Messages /></ProtectedRoute>} />
      <Route path="/dashboard/spaces" element={<ProtectedRoute><AppLayout><Spaces /></AppLayout></ProtectedRoute>} />
      <Route path="/events" element={<ProtectedRoute><EventsList /></ProtectedRoute>} />
      <Route path="/events/new" element={<ProtectedRoute><EventForm /></ProtectedRoute>} />
      <Route path="/events/:id/edit" element={<ProtectedRoute><EventForm /></ProtectedRoute>} />
      {/* Legacy routes - redirect to new unified routes */}
      <Route path="/dashboard/products/brand" element={<ProtectedRoute><DashboardProducts /></ProtectedRoute>} />
      <Route path="/dashboard/products/venue" element={<ProtectedRoute><DashboardProducts /></ProtectedRoute>} />
      <Route path="/dashboard/brand/inventory" element={<ProtectedRoute><Inventory /></ProtectedRoute>} />
      <Route path="/dashboard/venue/inventory" element={<ProtectedRoute><Inventory /></ProtectedRoute>} />
      {/* Public webstore routes */}
      <Route path="/shop" element={<Shop />} />
      <Route path="/shop/products/:slug" element={<ShopProduct />} />
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
