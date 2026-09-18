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
            hint?: string;
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
  requestAccessToken: (overrideConfig?: { prompt?: string; hint?: string }) => void;
}

export interface UserProfile {
  email: string;
  name?: string;
  picture?: string;
}

const CLIENT_ID =
  import.meta.env.VITE_GOOGLE_CLIENT_ID ||
  '563374226640-088jeul5qu064mjk40d5a0h0ub87fp3h.apps.googleusercontent.com';
const SCOPE =
  'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile';

// Usamos localStorage para que la sesión persista de forma permanente en iOS y PC
const STORAGE_KEY_TOKEN = 'app_notas_access_token';
const STORAGE_KEY_EXPIRY = 'app_notas_token_expiry';
const STORAGE_KEY_USER = 'app_notas_user_profile';
const STORAGE_KEY_SCOPES = 'app_notas_granted_scopes';
const STORAGE_KEY_LOGGED_IN = 'app_notas_is_logged_in';

let tokenClientInstance: TokenClient | null = null;
let activeSuccessHandler: ((token: string, profile?: UserProfile, scope?: string) => void) | null = null;

/**
 * Espera a que el script de Google Identity Services esté cargado en window
 */
export async function waitForGoogleScript(timeoutMs = 6000): Promise<boolean> {
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

  activeSuccessHandler = onSuccess;

  tokenClientInstance = window.google.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID,
    scope: SCOPE,
    callback: async (response: TokenResponse) => {
      if (response.error) {
        // Si el fallo fue silencioso por no haber interacción del usuario, no es error crítico
        console.warn('Respuesta OAuth:', response);
        onError(response);
        return;
      }

      const expiryTime = Date.now() + (response.expires_in - 60) * 1000;
      localStorage.setItem(STORAGE_KEY_TOKEN, response.access_token);
      localStorage.setItem(STORAGE_KEY_EXPIRY, expiryTime.toString());
      localStorage.setItem(STORAGE_KEY_SCOPES, response.scope || '');
      localStorage.setItem(STORAGE_KEY_LOGGED_IN, 'true');

      // Obtener datos del perfil del usuario (email, avatar)
      try {
        const profile = await fetchUserProfile(response.access_token);
        if (profile) {
          localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(profile));
        }
        activeSuccessHandler?.(response.access_token, profile, response.scope);
      } catch {
        const cachedUser = getSavedUserProfile();
        activeSuccessHandler?.(response.access_token, cachedUser, response.scope);
      }
    },
    error_callback: (err) => {
      console.warn('Error de autenticación Google:', err);
      onError(err);
    },
  });

  return tokenClientInstance;
}

/**
 * Solicita el token de acceso mostrando la ventana de Google si es necesario
 */
export function requestLogin(forcePrompt = false) {
  if (!tokenClientInstance) {
    throw new Error('Cliente OAuth no inicializado');
  }
  const user = getSavedUserProfile();
  tokenClientInstance.requestAccessToken({
    prompt: forcePrompt ? 'consent' : '',
    hint: user?.email || undefined,
  });
}

/**
 * Intenta renovar el token en segundo plano sin mostrar ninguna ventana
 */
export function silentRefreshToken(): void {
  if (!tokenClientInstance) return;
  const user = getSavedUserProfile();
  try {
    tokenClientInstance.requestAccessToken({
      prompt: '',
      hint: user?.email || undefined,
    });
  } catch (err) {
    console.warn('No se pudo renovar token de forma silenciosa:', err);
  }
}

/**
 * Cierra sesión y revoca el token
 */
export function logout(onComplete?: () => void) {
  const token = localStorage.getItem(STORAGE_KEY_TOKEN);
  localStorage.removeItem(STORAGE_KEY_TOKEN);
  localStorage.removeItem(STORAGE_KEY_EXPIRY);
  localStorage.removeItem(STORAGE_KEY_USER);
  localStorage.removeItem(STORAGE_KEY_SCOPES);
  localStorage.removeItem(STORAGE_KEY_LOGGED_IN);

  if (token && window.google?.accounts?.oauth2?.revoke) {
    window.google.accounts.oauth2.revoke(token, () => {
      onComplete?.();
    });
  } else {
    onComplete?.();
  }
}

/**
 * Obtiene el perfil guardado localmente
 */
export function getSavedUserProfile(): UserProfile | undefined {
  const userStr = localStorage.getItem(STORAGE_KEY_USER);
  if (!userStr) return undefined;
  try {
    return JSON.parse(userStr) as UserProfile;
  } catch {
    return undefined;
  }
}

/**
 * Recupera la sesión guardada en localStorage.
 * Si el token ha expirado pero el usuario estaba conectado, desencadena renovación silenciosa automática.
 */
export function getSavedSession(): {
  token: string | null;
  profile?: UserProfile;
  scope?: string;
  isExpired?: boolean;
} | null {
  const isLoggedIn = localStorage.getItem(STORAGE_KEY_LOGGED_IN) === 'true';
  const token = localStorage.getItem(STORAGE_KEY_TOKEN);
  const expiry = localStorage.getItem(STORAGE_KEY_EXPIRY);
  const profile = getSavedUserProfile();
  const scope = localStorage.getItem(STORAGE_KEY_SCOPES) || undefined;

  if (!isLoggedIn) return null;

  // Si no hay token o ha expirado
  const isExpired = !token || !expiry || Date.now() > parseInt(expiry, 10);

  if (isExpired) {
    // Desencadenar renovación en segundo plano silenciosa si es posible
    setTimeout(() => {
      silentRefreshToken();
    }, 100);

    return { token: null, profile, scope, isExpired: true };
  }

  return { token, profile, scope, isExpired: false };
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
