'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { Role, roleOf } from '@/lib/roles';

interface AuthContextType {
  user: User | null;
  /** null while signed out. See src/lib/roles.ts. */
  role: Role | null;
  isAdmin: boolean;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Initial session lookup
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) {
        setUser(null);
        setLoading(false);
        return;
      }
      // The stored session carries the role it was issued with. Refresh once
      // on load, so a role set with `npm run user:role` applies on the next
      // visit instead of after the token expires — or after a sign-out that
      // nobody thinks to do. A refresh that fails leaves the stored session.
      const { data: fresh } = await supabase.auth.refreshSession();
      setUser(fresh.session?.user ?? data.session.user);
      setLoading(false);
    });

    // Subscribe to auth state changes (login, logout, token refresh)
    const { data: subscription } = supabase.auth.onAuthStateChange((event, session) => {
      // The first session is handled above, after the refresh — taking it here
      // would show the stale role for a moment.
      if (event === 'INITIAL_SESSION') return;
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => {
      subscription.subscription.unsubscribe();
    };
  }, []);

  // Read from the session's JWT — refreshed on load, see above.
  const role = roleOf(user);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  };

  return (
    <AuthContext.Provider value={{ user, role, isAdmin: role === 'admin', loading, signIn, signOut }}>
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
