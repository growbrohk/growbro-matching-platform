import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

export interface Org {
  id: string;
  name: string;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface OrgMember {
  id: string;
  org_id: string;
  user_id: string;
  role: 'owner' | 'admin' | 'member';
  created_at: string;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  currentOrg: Org | null;
  orgMemberships: OrgMember[];
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  refreshOrgMemberships: () => Promise<void>;
  setCurrentOrg: (org: Org | null) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [currentOrg, setCurrentOrg] = useState<Org | null>(null);
  const [orgMemberships, setOrgMemberships] = useState<OrgMember[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchOrgMemberships = async (userId: string) => {
    const { data: memberships, error } = await supabase
      .from('org_members')
      .select('*, orgs(*)')
      .eq('user_id', userId);
    
    if (error) {
      console.error('Error fetching org memberships:', error);
      setOrgMemberships([]);
      setCurrentOrg(null);
      return;
    }

    if (memberships && memberships.length > 0) {
      const memberData = memberships.map((m: any) => ({
        id: m.id,
        org_id: m.org_id,
        user_id: m.user_id,
        role: m.role,
        created_at: m.created_at,
      }));
      setOrgMemberships(memberData);

      // Set current org to first membership if not already set
      if (!currentOrg) {
        const firstOrg = memberships[0].orgs as Org;
        setCurrentOrg(firstOrg);
      } else {
        // Refresh current org data
        const orgData = memberships.find((m: any) => m.org_id === currentOrg.id)?.orgs as Org | undefined;
        if (orgData) {
          setCurrentOrg(orgData);
        }
      }
    } else {
      setOrgMemberships([]);
      setCurrentOrg(null);
    }
  };

  const refreshOrgMemberships = async () => {
    if (user) {
      await fetchOrgMemberships(user.id);
    }
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        console.log('[auth]', event, session?.user?.id);
        setSession(session);
        setUser(session?.user ?? null);
        
        if (session?.user) {
          setTimeout(() => {
            fetchOrgMemberships(session.user.id);
          }, 0);
        } else {
          setOrgMemberships([]);
          setCurrentOrg(null);
        }
        setLoading(false);
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      console.log('[auth]', 'INITIAL_SESSION', session?.user?.id);
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchOrgMemberships(session.user.id);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { error };
  };

  const signUp = async (email: string, password: string) => {
    const redirectUrl = `${window.location.origin}/`;
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
      },
    });
    return { error };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setOrgMemberships([]);
    setCurrentOrg(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        currentOrg,
        orgMemberships,
        loading,
        signIn,
        signUp,
        signOut,
        refreshOrgMemberships,
        setCurrentOrg,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
