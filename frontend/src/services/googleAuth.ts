declare global {
  interface Window {
    google?: any;
  }
}

export const GOOGLE_CLIENT_ID =
  import.meta.env.VITE_GOOGLE_CLIENT_ID ||
  '409907085197-v659jn5e0q9iol3nmgq15pdonvetb0tg.apps.googleusercontent.com';

export const isGoogleConfigured = Boolean(GOOGLE_CLIENT_ID);

/**
 * Ensures the official Google Identity Services client script is loaded in DOM
 */
export const loadGoogleScript = (): Promise<void> => {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) {
      resolve();
      return;
    }

    const existing = document.getElementById('google-gsi-client');
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('Failed to load Google Identity Services.')));
      return;
    }

    const script = document.createElement('script');
    script.id = 'google-gsi-client';
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Google Identity Services.'));
    document.head.appendChild(script);
  });
};

/**
 * Triggers Google OAuth 2.0 popup and returns authenticated user token
 */
export const triggerGoogleSignIn = async (): Promise<{ accessToken?: string; credential?: string }> => {
  await loadGoogleScript();

  if (!window.google?.accounts?.oauth2) {
    throw new Error('Google Identity Services is not available. Please check your internet connection.');
  }

  return new Promise((resolve, reject) => {
    try {
      const tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_CLIENT_ID,
        scope: 'email profile openid',
        callback: (resp: any) => {
          if (resp.error) {
            reject(new Error(resp.error_description || resp.error || 'Google sign-in was cancelled.'));
            return;
          }
          if (resp.access_token) {
            resolve({ accessToken: resp.access_token });
          } else {
            reject(new Error('No access token returned by Google.'));
          }
        },
        error_callback: (err: any) => {
          reject(new Error(err?.message || 'Google sign-in encountered an error.'));
        },
      });

      tokenClient.requestAccessToken({ prompt: 'select_account' });
    } catch (err) {
      reject(err);
    }
  });
};
