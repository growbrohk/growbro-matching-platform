import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Handshake, Mail, Lock, Loader2 } from 'lucide-react';
import { z } from 'zod';

const authSchema = z.object({
  email: z
    .string()
    .min(1, 'Email is required')
    .email('Please enter a valid email address')
    .refine(
      (email) => {
        const localPart = email.split('@')[0];
        if (!localPart || localPart.length < 2) {
          return false;
        }
        // Supabase requires at least one letter (not just numbers) in the local part
        // This matches common email validation patterns
        return /[a-zA-Z]/.test(localPart);
      },
      {
        message: 'Email must contain at least one letter before the @ symbol',
      }
    ),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

export default function Auth() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [formLoading, setFormLoading] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const { signIn, signUp, user, profile, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    // Don't redirect while auth state is still loading
    if (authLoading) return;
    
    if (user) {
      if (profile) {
        navigate('/home');
      } else {
        navigate('/onboarding');
      }
    }
  }, [user, profile, authLoading, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

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

    setFormLoading(true);

    try {
      if (isLogin) {
        const { error } = await signIn(email, password);
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
        }
      } else {
        const { error } = await signUp(email, password);
        if (error) {
          let errorTitle = 'Sign up failed';
          let errorDescription = error.message;

          // Handle specific error cases
          if (error.message.includes('already registered') || error.message.includes('already been registered')) {
            errorTitle = 'Account exists';
            errorDescription = 'This email is already registered. Please sign in instead.';
          } else if (error.message.includes('invalid') && error.message.includes('email')) {
            errorTitle = 'Invalid email address';
            errorDescription = 'Please enter a valid email address. The email must contain at least one letter before the @ symbol (e.g., "user@example.com" not "12@example.com").';
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
          toast({
            title: 'Welcome to Growbro!',
            description: 'Your account has been created. Let\'s set up your profile!',
          });
        }
      }
    } finally {
      setFormLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-gradient-hero">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-10 w-72 h-72 bg-primary/5 rounded-full blur-3xl" />
        <div className="absolute bottom-20 right-10 w-96 h-96 bg-accent/30 rounded-full blur-3xl" />
      </div>

      {/* Logo */}
      <div className="flex items-center gap-3 mb-8 relative">
        <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-primary to-[hsl(30_90%_65%)] flex items-center justify-center shadow-lg">
          <Handshake className="h-8 w-8 text-primary-foreground" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Growbro</h1>
          <p className="text-sm text-muted-foreground">Collab Hub</p>
        </div>
      </div>

      {/* Auth Card */}
      <Card className="w-full max-w-md relative shadow-xl border-0">
        <CardHeader className="text-center pb-4">
          <CardTitle className="text-2xl">
            {isLogin ? 'Welcome back' : 'Create your account'}
          </CardTitle>
          <CardDescription>
            {isLogin
              ? 'Sign in to find your perfect collab partner'
              : 'Join the community and start collaborating'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-10"
                />
              </div>
              {errors.email && (
                <p className="text-sm text-destructive">{errors.email}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-10"
                />
              </div>
              {errors.password && (
                <p className="text-sm text-destructive">{errors.password}</p>
              )}
            </div>

            <Button type="submit" className="w-full" variant="hero" size="lg" disabled={formLoading}>
              {formLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isLogin ? 'Sign In' : 'Create Account'}
            </Button>
          </form>

          <div className="mt-6 text-center">
            <button
              type="button"
              onClick={() => setIsLogin(!isLogin)}
              className="text-sm text-muted-foreground hover:text-primary transition-colors"
            >
              {isLogin
                ? "Don't have an account? Sign up"
                : 'Already have an account? Sign in'}
            </button>
          </div>
        </CardContent>
      </Card>

      {/* Tagline */}
      <p className="mt-8 text-center text-muted-foreground max-w-md relative">
        Connect brands with venues for meaningful collaborations.
        <br />
        <span className="text-primary font-medium">Swipe. Match. Collab.</span>
      </p>
    </div>
  );
}
