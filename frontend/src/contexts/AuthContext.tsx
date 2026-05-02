import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import type { SessionState, UserProfile, Role, EffectiveUser } from '../types';
import type { Session } from '@supabase/supabase-js';

interface AuthContextType {
  sessionState: SessionState;
  profileLoading: boolean;
  user: UserProfile | null;
  effectiveUser: EffectiveUser | null;
  login: (email: string, password?: string) => Promise<{ error: Error | null; success: boolean }>;
  logout: () => Promise<void>;
  // Method meant to be called by TenantContext to set the impersonated view
  _setImpersonatedUser: (user: UserProfile | null) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [sessionState, setSessionState] = useState<SessionState>('loading');
  const [profileLoading, setProfileLoading] = useState(false);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [impersonated, setImpersonated] = useState<UserProfile | null>(null);
  const mountedRef = React.useRef(true);
  // Tracks whether a valid profile has been successfully loaded at least once.
  // Used to skip redundant re-fetches on TOKEN_REFRESHED / SIGNED_IN events
  // that Supabase fires after INITIAL_SESSION.
  const profileLoadedRef = React.useRef(false);
  // Monotonically-increasing counter used to detect and discard stale profile
  // fetches. React StrictMode mounts components twice in dev, creating two
  // concurrent subscriptions and two concurrent profile fetches. The counter
  // ensures only the LATEST fetch's result is applied to state.
  const fetchGenRef = React.useRef(0);
  // Mirrors the `user` state synchronously so async callbacks can read the
  // current value without relying on stale closure captures. Updated alongside
  // every setUser call.
  const userRef = React.useRef<UserProfile | null>(null);

  useEffect(() => {
    mountedRef.current = true;

    // Use ONLY onAuthStateChange to handle ALL session events.
    // Previously we also called getSession() separately, but React StrictMode
    // double-mounts components, causing two concurrent lock requests on the
    // Supabase auth token. The second request "steals" the lock, aborting the first
    // and leaving sessionState stuck on 'loading'.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!mountedRef.current) return;

      // TOKEN_REFRESHED and SIGNED_IN (which Supabase emits right after
      // INITIAL_SESSION) must NOT trigger a full profile re-fetch if we
      // already have a valid profile — otherwise every token rotation causes
      // an 8-second timeout loop and a brief role downgrade to 'agent'.
      if ((_event === 'TOKEN_REFRESHED' || _event === 'SIGNED_IN') && profileLoadedRef.current) {
        return;
      }

      if (session) {
        await handleSessionUpdate(session);
      } else {
        userRef.current = null;
        setUser(null);
        profileLoadedRef.current = false;
        setSessionState('unauthenticated');
      }
    });

    return () => {
      mountedRef.current = false;
      subscription.unsubscribe();
    };
  }, []);

  const handleSessionUpdate = async (session: Session | null, retryCount = 0) => {
    if (!session) {
      setUser(null);
      setSessionState('unauthenticated');
      return;
    }

    // Claim this generation — any prior in-flight fetch will see its generation
    // is stale and discard its result, preventing StrictMode double-mount from
    // applying a timed-out fetch result AFTER a successful concurrent fetch.
    const myGen = ++fetchGenRef.current;

    console.log('[Auth] Session found for user:', session.user.id, retryCount > 0 ? `(retry ${retryCount})` : '');

    setSessionState('loading');
    setProfileLoading(true);

    try {
      const { data: profile, error } = await Promise.race([
        supabase
          .from('user_profiles')
          .select('id, full_name, avatar_url, system_role')
          .eq('id', session.user.id)
          .single(),
        new Promise<{ data: null; error: Error }>((resolve) =>
          setTimeout(() => resolve({ data: null, error: new Error('Profile fetch timeout') }), 8000)
        ),
      ]);

      // Discard result if component unmounted OR if a newer fetch has started
      if (!mountedRef.current || fetchGenRef.current !== myGen) return;

      if (!error && profile) {
        console.log('[Auth] Profile loaded:', profile.full_name, profile.system_role);
        // NOTE: DB stores 'platform_admin' but we expose 'system_admin' as the frontend role.
        // Every guard that checks for admin access MUST check for BOTH 'system_admin'
        // AND 'platform_admin' to remain safe against future DB or mapping changes.
        profileLoadedRef.current = true;
        const resolved: UserProfile = {
          id: profile.id,
          email: session.user.email || '',
          full_name: profile.full_name,
          avatar_url: profile.avatar_url,
          role: (profile.system_role === 'platform_admin' ? 'system_admin' : profile.system_role) as Role,
        };
        userRef.current = resolved;
        setUser(resolved);
      } else {
        // Timeout or transient error — retry automatically up to 3 times with
        // exponential backoff (2s, 4s, 8s). After that, fall back to 'unauthenticated'
        // so the user sees the login screen instead of being stuck loading forever.
        if (retryCount < 3) {
          const delay = Math.pow(2, retryCount) * 2000;
          console.warn(`[Auth] Profile fetch failed, retrying in ${delay}ms (attempt ${retryCount + 1}/3):`, error?.message);
          setTimeout(() => {
            if (mountedRef.current) handleSessionUpdate(session, retryCount + 1);
          }, delay);
        } else {
          console.error('[Auth] Profile fetch failed after 3 retries, redirecting to login:', error?.message);
          userRef.current = null;
          setUser(null);
          profileLoadedRef.current = false;
          setSessionState('unauthenticated');
        }
      }
    } catch (err) {
      if (!mountedRef.current || fetchGenRef.current !== myGen) return;
      console.error('[Auth] Unexpected error fetching profile:', err);
    } finally {
      if (!mountedRef.current || fetchGenRef.current !== myGen) return;
      setProfileLoading(false);
      // Only transition to 'authenticated' if we actually have a resolved user.
      // If userRef.current is null the state stays 'loading' until retry resolves.
      if (userRef.current !== null) {
        setSessionState('authenticated');
        console.log('[Auth] State set to authenticated');
      }
    }
  };

  // Magic Link or Password Login implementation
  const login = async (email: string, password?: string): Promise<{ error: Error | null; success: boolean }> => {
    setSessionState('loading');
    
    if (password) {
      // Real password auth
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (error) {
         setSessionState('unauthenticated');
         return { error, success: false };
      }

      // We successfully logged in. The onAuthStateChange listener will handle setting the profile.
      return { error: null, success: true };

    } else {
      // Magic Link Login
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          // Redirection handled naturally
        }
      });

      if (error) {
         setSessionState('unauthenticated');
         return { error, success: false };
      }

      // For OTP, they are technically unauthenticated until they click the link,
      // but we shouldn't show a spinner indefinitely.
      setSessionState('unauthenticated');
      return { error: null, success: true };
    }
  };

  const logout = async () => {
    setSessionState('loading');
    profileLoadedRef.current = false;
    userRef.current = null;
    await supabase.auth.signOut();
    setUser(null);
    setImpersonated(null);
    setSessionState('unauthenticated');
  };

  const effectiveUser: EffectiveUser | null = user 
    ? {
        ...(impersonated || user),
        isImpersonated: !!impersonated,
        trueUserId: user.id
      } 
    : null;

  return (
    <AuthContext.Provider value={{ 
      sessionState,
      profileLoading,
      user, 
      effectiveUser, 
      login, 
      logout,
      _setImpersonatedUser: setImpersonated 
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
