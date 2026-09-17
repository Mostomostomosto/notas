declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            callback: (response: TokenResponse) => void;
            error_callback?: (error: unknown) => void;
            prompt?: string;
          }) => TokenClient;
          revoke: (token: string, done: () => void) => void;
        };
      };
    };
  }
}

export interface TokenResponse {
  access_token: string;
  expires_in: number;
  scope: string;
  token_type: string;
  error?: string;
  error_description?: string;
}

export interface TokenClient {
  requestAccessToken: (overrideConfig?: { prompt?: string }) => void;
}

export interface UserProfile {
  email: string;
  name?: string;
  picture?: string;
}

const CLIENT_ID =
  import.meta.env.VITE_GOOGLE_CLIENT_ID ||
  '563374226640-088jeul5qu064mjk40d5a0h0ub87fp3h.apps.googleusercontent.com';
const SCOPE = 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile';

const STORAGE_KEY_TOKEN = 'app_notas_access_token';
const STORAGE_KEY_EXPIRY = 'app_notas_token_expiry';
const STORAGE_KEY_USER = 'app_notas_user_profile';

let tokenClientInstance: TokenClient | null = null;

/**
 * Espera a que el script de Google Identity Services esté cargado en window
 */
export async function waitForGoogleScript(timeoutMs = 5000): Promise<boolean> {
  const start = Date.now();
  while (!window.google?.accounts?.oauth2) {
    if (Date.now() - start > timeoutMs) {
      return false;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return true;
}

/**
 * Inicializa el cliente OAuth2 de Google Identity Services
 */
export function initGoogleAuth(
  onSuccess: (token: string, profile?: UserProfile, scope?: string) => void,
  onError: (err: unknown) => void
): TokenClient | null {
  if (!window.google?.accounts?.oauth2) {
    console.error('Google Identity Services no está cargado');
    return null;
  }

  if (!CLIENT_ID) {
    console.error('VITE_GOOGLE_CLIENT_ID no está configurado');
    return null;
  }

  tokenClientInstance = window.google.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID,
    scope: SCOPE,
    callback: async (response: TokenResponse) => {
      if (response.error) {
        onError(response);
        return;
      }

      console.log('Scopes recibidos:', response.scope);

      const expiryTime = Date.now() + (response.expires_in - 60) * 1000;
      sessionStorage.setItem(STORAGE_KEY_TOKEN, response.access_token);
      sessionStorage.setItem(STORAGE_KEY_EXPIRY, expiryTime.toString());
      sessionStorage.setItem('app_notas_granted_scopes', response.scope || '');

      // Obtener datos del perfil del usuario (email, avatar)
      try {
        const profile = await fetchUserProfile(response.access_token);
        if (profile) {
          sessionStorage.setItem(STORAGE_KEY_USER, JSON.stringify(profile));
        }
        onSuccess(response.access_token, profile, response.scope);
      } catch {
        onSuccess(response.access_token, undefined, response.scope);
      }
    },
    error_callback: (err) => {
      onError(err);
    },
  });

  return tokenClientInstance;
}

/**
 * Solicita el token de acceso mostrando la ventana de Google
 */
export function requestLogin(forcePrompt = false) {
  if (!tokenClientInstance) {
    throw new Error('Cliente OAuth no inicializado');
  }
  tokenClientInstance.requestAccessToken(forcePrompt ? { prompt: 'consent' } : {});
}

/**
 * Cierra sesión y revoca el token
 */
export function logout(onComplete?: () => void) {
  const token = sessionStorage.getItem(STORAGE_KEY_TOKEN);
  sessionStorage.removeItem(STORAGE_KEY_TOKEN);
  sessionStorage.removeItem(STORAGE_KEY_EXPIRY);
  sessionStorage.removeItem(STORAGE_KEY_USER);

  if (token && window.google?.accounts?.oauth2?.revoke) {
    window.google.accounts.oauth2.revoke(token, () => {
      onComplete?.();
    });
  } else {
    onComplete?.();
  }
}

/**
 * Recupera el token guardado en sesión si no ha expirado
 */
export function getSavedSession(): { token: string; profile?: UserProfile; scope?: string } | null {
  const token = sessionStorage.getItem(STORAGE_KEY_TOKEN);
  const expiry = sessionStorage.getItem(STORAGE_KEY_EXPIRY);
  const userStr = sessionStorage.getItem(STORAGE_KEY_USER);
  const scope = sessionStorage.getItem('app_notas_granted_scopes') || undefined;

  if (!token || !expiry) return null;

  if (Date.now() > parseInt(expiry, 10)) {
    sessionStorage.removeItem(STORAGE_KEY_TOKEN);
    sessionStorage.removeItem(STORAGE_KEY_EXPIRY);
    sessionStorage.removeItem(STORAGE_KEY_USER);
    sessionStorage.removeItem('app_notas_granted_scopes');
    return null;
  }

  const profile = userStr ? (JSON.parse(userStr) as UserProfile) : undefined;
  return { token, profile, scope };
}

/**
 * Obtiene el perfil del usuario mediante el endpoint userinfo de Google
 */
async function fetchUserProfile(token: string): Promise<UserProfile | undefined> {
  const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return undefined;
  const data = await res.json();
  return {
    email: data.email,
    name: data.name,
    picture: data.picture,
  };
}
