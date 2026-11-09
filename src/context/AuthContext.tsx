'use client';

import { createContext, useContext, useSyncExternalStore, ReactNode } from 'react';
import type { User } from '@supabase/supabase-js';
import { getAuthSnapshot, getServerAuthSnapshot, subscribeAuth, supabaseClient } from '@/lib/auth-store';
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

/**
 * Who is signed in. The session lives in `src/lib/auth-store.ts`, which
 * fetches the Supabase client only when there can be one (Task 16.11): a
 * visitor who has never signed in is not sent supabase-js with every page.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const { user, loading } = useSyncExternalStore(subscribeAuth, getAuthSnapshot, getServerAuthSnapshot);

  // Read from the session's JWT — refreshed on load (auth-store.ts).
  const role = roleOf(user);

  const signIn = async (email: string, password: string) => {
    const supabase = await supabaseClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  };

  const signOut = async () => {
    const supabase = await supabaseClient();
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
