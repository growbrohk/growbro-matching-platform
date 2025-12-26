import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
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
import Bookings from "./pages/Bookings";
import Settings from "./pages/Settings";
import CatalogSettings from "./pages/settings/CatalogSettings";
import Collab from "./pages/Collab";
import Orders from "./pages/Orders";
// Booking V2 pages
import BookingV2Settings from "./pages/booking-v2/Settings";
import ResourcesList from "./pages/booking-v2/ResourcesList";
import ResourceDetail from "./pages/booking-v2/ResourceDetail";
import ReservationsList from "./pages/booking-v2/ReservationsList";
import ReservationDetail from "./pages/booking-v2/ReservationDetail";
// Public booking pages
import PublicBook from "./pages/public/PublicBook";
import PublicReservation from "./pages/public/PublicReservation";
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

function AppRoutes() {
  return (
    <Routes>
      {/* Public Routes */}
      <Route path="/" element={<PublicRoute><Landing /></PublicRoute>} />
      <Route path="/auth" element={<AuthRoute><Auth /></AuthRoute>} />
      <Route path="/onboarding" element={<OnboardingRoute><OnboardingNew /></OnboardingRoute>} />
      
      {/* Public Booking Pages */}
      <Route path="/book/:orgSlug/:resourceSlug" element={<PublicBook />} />
      <Route path="/r/:qrToken" element={<PublicReservation />} />
      
      {/* 
        Protected Routes - Use /app prefix
        
        BOTTOM TAB MIGRATION NOTES:
        - Old routes maintained for backwards compatibility (no 404s)
        - New routes added as aliases where appropriate
        - Bottom nav shows: Dashboard | Catalog | Collab | Orders | Account
        - Inventory & Bookings removed from bottom nav but routes still accessible
      */}
      <Route path="/app/dashboard" element={<ProtectedRoute><AppLayout><Dashboard /></AppLayout></ProtectedRoute>} />
      
      {/* Products routes - kept for backwards compatibility */}
      {/* /app/products remains accessible but /app/catalog is now the preferred route */}
      <Route path="/app/products" element={<ProtectedRoute><AppLayout><DashboardProducts /></AppLayout></ProtectedRoute>} />
      <Route path="/app/products/select-type" element={<ProtectedRoute><AppLayout><ProductTypeSelection /></AppLayout></ProtectedRoute>} />
      <Route path="/app/products/new" element={<ProtectedRoute><AppLayout><ProductForm /></AppLayout></ProtectedRoute>} />
      <Route path="/app/products/:id/edit" element={<ProtectedRoute><AppLayout><ProductForm /></AppLayout></ProtectedRoute>} />
      
      {/* Catalog routes - aliases for products (new preferred route) */}
      <Route path="/app/catalog" element={<ProtectedRoute><AppLayout><DashboardProducts /></AppLayout></ProtectedRoute>} />
      <Route path="/app/catalog/select-type" element={<ProtectedRoute><AppLayout><ProductTypeSelection /></AppLayout></ProtectedRoute>} />
      <Route path="/app/catalog/new" element={<ProtectedRoute><AppLayout><ProductForm /></AppLayout></ProtectedRoute>} />
      <Route path="/app/catalog/:id/edit" element={<ProtectedRoute><AppLayout><ProductForm /></AppLayout></ProtectedRoute>} />
      
      {/* Inventory & Bookings - removed from bottom nav but routes still work */}
      <Route path="/app/inventory" element={<ProtectedRoute><AppLayout><Inventory /></AppLayout></ProtectedRoute>} />
      <Route path="/app/bookings" element={<ProtectedRoute><AppLayout><Bookings /></AppLayout></ProtectedRoute>} />
      
      {/* Events */}
      <Route path="/app/events" element={<ProtectedRoute><AppLayout><EventsList /></AppLayout></ProtectedRoute>} />
      <Route path="/app/events/new" element={<ProtectedRoute><AppLayout><EventForm /></AppLayout></ProtectedRoute>} />
      <Route path="/app/events/:id/edit" element={<ProtectedRoute><AppLayout><EventForm /></AppLayout></ProtectedRoute>} />
      
      {/* New: Collab page */}
      <Route path="/app/collab" element={<ProtectedRoute><AppLayout><Collab /></AppLayout></ProtectedRoute>} />
      
      {/* New: Orders page */}
      <Route path="/app/orders" element={<ProtectedRoute><AppLayout><Orders /></AppLayout></ProtectedRoute>} />
      
      {/* Settings routes */}
      <Route path="/app/settings" element={<ProtectedRoute><AppLayout><Settings /></AppLayout></ProtectedRoute>} />
      <Route path="/app/settings/catalog" element={<ProtectedRoute><AppLayout><CatalogSettings /></AppLayout></ProtectedRoute>} />
      
      {/* Account route - alias for settings (new preferred route) */}
      <Route path="/app/account" element={<ProtectedRoute><AppLayout><Settings /></AppLayout></ProtectedRoute>} />
      
      {/* Booking V2 routes */}
      <Route path="/app/booking-v2/settings" element={<ProtectedRoute><AppLayout><BookingV2Settings /></AppLayout></ProtectedRoute>} />
      <Route path="/app/booking-v2/resources" element={<ProtectedRoute><AppLayout><ResourcesList /></AppLayout></ProtectedRoute>} />
      <Route path="/app/booking-v2/resources/:id" element={<ProtectedRoute><AppLayout><ResourceDetail /></AppLayout></ProtectedRoute>} />
      <Route path="/app/booking-v2/reservations" element={<ProtectedRoute><AppLayout><ReservationsList /></AppLayout></ProtectedRoute>} />
      <Route path="/app/booking-v2/reservations/:id" element={<ProtectedRoute><AppLayout><ReservationDetail /></AppLayout></ProtectedRoute>} />
      
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
