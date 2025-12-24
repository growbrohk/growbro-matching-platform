import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { Handshake, Mail, Lock, Loader2 } from 'lucide-react';
import { z } from 'zod';

const authSchema = z.object({
  email: z
    .string()
    .min(1, 'Email is required')
    .email('Please enter a valid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

export default function Auth() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [showSignInBanner, setShowSignInBanner] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Prevent multiple submissions
    if (isSubmitting) return;
    
    setErrors({});
    setShowSignInBanner(false);

    const result = authSchema.safeParse({ email, password });
    if (!result.success) {
      const fieldErrors: { email?: string; password?: string } = {};
      result.error.errors.forEach((err) => {
        if (err.path[0] === 'email') fieldErrors.email = err.message;
        if (err.path[0] === 'password') fieldErrors.password = err.message;
      });
      setErrors(fieldErrors);
      return;
    }

    setIsSubmitting(true);

    try {
      if (isLogin) {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        
        if (error) {
          let errorTitle = 'Sign in failed';
          let errorDescription = error.message;

          if (error.message === 'Invalid login credentials' || error.message.includes('Invalid login')) {
            errorDescription = 'Invalid email or password. Please try again.';
          } else if (error.message.includes('Email not confirmed')) {
            errorDescription = 'Please check your email and confirm your account before signing in.';
          }

          toast({
            title: errorTitle,
            description: errorDescription,
            variant: 'destructive',
          });
        } else if (data.session) {
          // Successfully signed in
          navigate('/onboarding');
        }
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
        });
        
        if (error) {
          let errorTitle = 'Sign up failed';
          let errorDescription = error.message;

          // Handle specific error cases
          if (error.message.includes('already registered') || error.message.includes('already been registered')) {
            errorTitle = 'Account exists';
            errorDescription = 'This email is already registered. Please sign in instead.';
          } else if (error.message.includes('invalid') && error.message.includes('email')) {
            errorTitle = 'Invalid email address';
            errorDescription = error.message;
          } else if (error.message.includes('Password')) {
            errorTitle = 'Password error';
            errorDescription = error.message;
          }

          toast({
            title: errorTitle,
            description: errorDescription,
            variant: 'destructive',
          });
        } else {
          // Check signup response
          if (data.session) {
            // Session exists, navigate to onboarding
            navigate('/onboarding');
          } else if (data.user) {
            // User created but no session (rare with email confirm OFF)
            setShowSignInBanner(true);
          }
        }
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-6" style={{ backgroundColor: '#FBF8F4' }}>
      {/* Subtle grid background */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.35]"
        style={{
          backgroundImage:
            "linear-gradient(to right, rgba(14,122,58,0.05) 1px, transparent 1px), linear-gradient(to bottom, rgba(14,122,58,0.05) 1px, transparent 1px)",
          backgroundSize: "72px 72px",
        }}
      />

      {/* Logo */}
      <div className="flex items-center gap-3 mb-8 relative">
        <img 
          src="/growbro-logo.jpg" 
          alt="GrowBro Logo" 
          className="h-14 w-14 rounded-2xl object-cover"
        />
        <div className="leading-none">
          <div className="font-bold tracking-tight text-2xl" style={{ fontFamily: "'Inter Tight', sans-serif" }}>
            Growbro
          </div>
          <div className="text-xs mt-1" style={{ color: "rgba(15,31,23,0.6)" }}>
            Online ↔ Offline Collaboration
          </div>
        </div>
      </div>

      {/* Auth Card */}
      <Card className="w-full max-w-md relative shadow-xl rounded-3xl" style={{ borderColor: 'rgba(14,122,58,0.14)', backgroundColor: 'rgba(251,248,244,0.9)' }}>
        <CardHeader className="text-center p-4 md:p-6 pb-4">
          <CardTitle className="text-2xl font-extrabold tracking-tight" style={{ fontFamily: "'Inter Tight', sans-serif", color: '#0F1F17' }}>
            {isLogin ? 'Welcome back' : 'Create your account'}
          </CardTitle>
          <CardDescription style={{ color: 'rgba(15,31,23,0.72)' }}>
            {isLogin
              ? 'Sign in to continue growing your business'
              : 'Join Growbro and start collaborating'}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4 md:p-6 pt-0">
          {showSignInBanner && (
            <Alert className="mb-4">
              <AlertDescription>
                Account created. Please sign in.
              </AlertDescription>
            </Alert>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email" style={{ color: '#0F1F17' }}>Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: 'rgba(15,31,23,0.5)' }} />
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-10 rounded-2xl"
                  style={{ 
                    borderColor: 'rgba(14,122,58,0.14)',
                    backgroundColor: '#FBF8F4',
                    color: '#0F1F17'
                  }}
                />
              </div>
              {errors.email && (
                <p className="text-sm text-destructive">{errors.email}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" style={{ color: '#0F1F17' }}>Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: 'rgba(15,31,23,0.5)' }} />
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-10 rounded-2xl"
                  style={{ 
                    borderColor: 'rgba(14,122,58,0.14)',
                    backgroundColor: '#FBF8F4',
                    color: '#0F1F17'
                  }}
                />
              </div>
              {errors.password && (
                <p className="text-sm text-destructive">{errors.password}</p>
              )}
            </div>

            <Button 
              type="submit" 
              className="w-full font-bold rounded-2xl h-10" 
              disabled={isSubmitting}
              style={{ backgroundColor: '#0E7A3A', color: 'white' }}
            >
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isLogin ? 'Sign In' : 'Create Account'}
            </Button>
          </form>

          <div className="mt-6 text-center">
            <button
              type="button"
              onClick={() => setIsLogin(!isLogin)}
              className="text-sm transition-colors py-2"
              style={{ color: 'rgba(15,31,23,0.72)' }}
              onMouseEnter={(e) => e.currentTarget.style.color = '#0E7A3A'}
              onMouseLeave={(e) => e.currentTarget.style.color = 'rgba(15,31,23,0.72)'}
            >
              {isLogin
                ? "Don't have an account? Sign up"
                : 'Already have an account? Sign in'}
            </button>
          </div>
        </CardContent>
      </Card>

      {/* Tagline */}
      <p className="mt-8 text-center max-w-md relative" style={{ color: 'rgba(15,31,23,0.72)' }}>
        Connect brands with venues for meaningful collaborations.
        <br />
        <span style={{ color: '#0E7A3A', fontWeight: 600 }}>One backend. One inventory. One place to grow.</span>
      </p>
    </div>
  );
}
