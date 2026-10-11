import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://zabuhagyyfhhhhpuwldn.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_l1oaHm5uLnOZmXiJQ1w47w_M5Bx3hwn';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

/**
 * Initiates Google OAuth sign in flow via Supabase
 */
export const signInWithGoogle = async () => {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${window.location.origin}/`,
    },
  });

  if (error) {
    console.error('Supabase Google OAuth error:', error);
    throw error;
  }

  return data;
};
