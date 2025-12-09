import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import Auth from "./pages/Auth";
import Onboarding from "./pages/Onboarding";
import Home from "./pages/Home";
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
import { Loader2 } from "lucide-react";

const queryClient = new QueryClient();

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, profile, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  if (!profile) {
    return <Navigate to="/onboarding" replace />;
  }

  return <>{children}</>;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { user, profile, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // If user is logged in and has profile, redirect to home
  if (user && profile) {
    return <Navigate to="/home" replace />;
  }

  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<PublicRoute><Landing /></PublicRoute>} />
      <Route path="/auth" element={<Auth />} />
      <Route path="/onboarding" element={<Onboarding />} />
      <Route path="/home" element={<ProtectedRoute><Home /></ProtectedRoute>} />
      <Route path="/browse" element={<ProtectedRoute><Browse /></ProtectedRoute>} />
      <Route path="/profiles/:handle" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
      <Route path="/products" element={<ProtectedRoute><Products /></ProtectedRoute>} />
      <Route path="/venue/collab-options" element={<ProtectedRoute><VenueCollabOptions /></ProtectedRoute>} />
      <Route path="/collabs" element={<ProtectedRoute><Collabs /></ProtectedRoute>} />
      <Route path="/messages" element={<ProtectedRoute><Messages /></ProtectedRoute>} />
      {/* Unified Product Management Routes */}
      <Route path="/dashboard/products" element={<ProtectedRoute><DashboardProducts /></ProtectedRoute>} />
      <Route path="/dashboard/products/select-type" element={<ProtectedRoute><ProductTypeSelection /></ProtectedRoute>} />
      <Route path="/dashboard/products/new" element={<ProtectedRoute><ProductForm /></ProtectedRoute>} />
      <Route path="/dashboard/products/:id/edit" element={<ProtectedRoute><ProductForm /></ProtectedRoute>} />
      {/* Unified Inventory Route */}
      <Route path="/dashboard/inventory" element={<ProtectedRoute><Inventory /></ProtectedRoute>} />
      {/* Spaces Route (Venue only) */}
      <Route path="/dashboard/spaces" element={<ProtectedRoute><Spaces /></ProtectedRoute>} />
      {/* Events Routes */}
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
