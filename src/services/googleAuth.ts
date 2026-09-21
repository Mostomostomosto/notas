declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initCodeClient: (config: {
            client_id: string;
            scope: string;
            ux_mode?: 'popup' | 'redirect';
            callback: (response: { code?: string; error?: string; error_description?: string }) => void;
            error_callback?: (error: unknown) => void;
          }) => CodeClient;
          initTokenClient: (config: unknown) => unknown;
          revoke: (token: string, done: () => void) => void;
        };
      };
    };
  }
}

export interface CodeClient {
  requestCode: (overrideConfig?: { prompt?: string; hint?: string }) => void;
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

// Claves persistentes en localStorage
const STORAGE_KEY_TOKEN = 'app_notas_access_token';
const STORAGE_KEY_EXPIRY = 'app_notas_token_expiry';
const STORAGE_KEY_REFRESH_TOKEN = 'app_notas_refresh_token';
const STORAGE_KEY_USER = 'app_notas_user_profile';
const STORAGE_KEY_SCOPES = 'app_notas_granted_scopes';
const STORAGE_KEY_LOGGED_IN = 'app_notas_is_logged_in';

let codeClientInstance: CodeClient | null = null;
let activeSuccessHandler: ((token: string, profile?: UserProfile, scope?: string) => void) | null = null;

const tokenListeners = new Set<(token: string | null) => void>();

export function subscribeTokenUpdates(listener: (token: string | null) => void): () => void {
  tokenListeners.add(listener);
  return () => {
    tokenListeners.delete(listener);
  };
}

function notifyTokenUpdated(token: string | null) {
  tokenListeners.forEach((l) => l(token));
}

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
 * Intercambia el código de autorización obtenido en el popup por tokens permanentes
 */
async function exchangeCodeForTokens(code: string): Promise<{
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
}> {
  const res = await fetch('/api/auth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error_description || err.error || 'Error al intercambiar código de Google');
  }

  return await res.json();
}

/**
 * Renueva el token de acceso de Google silenciosamente usando el refresh_token
 */
export async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = localStorage.getItem(STORAGE_KEY_REFRESH_TOKEN);
  if (!refreshToken) {
    return null;
  }

  try {
    const res = await fetch('/api/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.warn('Error al renovar token en backend:', err);
      if (err.error === 'invalid_grant') {
        // Si el usuario revocó el acceso desde su cuenta de Google
        logout();
      }
      return null;
    }

    const data = await res.json();
    const newAccessToken = data.access_token;
    const expiryTime = Date.now() + (data.expires_in - 60) * 1000;

    localStorage.setItem(STORAGE_KEY_TOKEN, newAccessToken);
    localStorage.setItem(STORAGE_KEY_EXPIRY, expiryTime.toString());
    notifyTokenUpdated(newAccessToken);

    return newAccessToken;
  } catch (err) {
    console.warn('Fallo de conexión al renovar token:', err);
    return null;
  }
}

/**
 * Devuelve un token de acceso válido. Si ha caducado, lo renueva automáticamente en segundo plano.
 */
export async function getValidAccessToken(): Promise<string | null> {
  const token = localStorage.getItem(STORAGE_KEY_TOKEN);
  const expiry = localStorage.getItem(STORAGE_KEY_EXPIRY);
  const hasRefreshToken = !!localStorage.getItem(STORAGE_KEY_REFRESH_TOKEN);

  // Si el token aún es válido
  if (token && expiry && Date.now() < parseInt(expiry, 10)) {
    return token;
  }

  // Si ha caducado pero tenemos refresh_token, renovamos en segundo plano
  if (hasRefreshToken) {
    return await refreshAccessToken();
  }

  return token;
}

/**
 * Inicializa el cliente de autorización por código (OAuth 2.0 Authorization Code Flow)
 */
export function initGoogleAuth(
  onSuccess: (token: string, profile?: UserProfile, scope?: string) => void,
  onError: (err: unknown) => void
): CodeClient | null {
  if (!window.google?.accounts?.oauth2) {
    console.error('Google Identity Services no está cargado');
    return null;
  }

  activeSuccessHandler = onSuccess;

  try {
    codeClientInstance = window.google.accounts.oauth2.initCodeClient({
      client_id: CLIENT_ID,
      scope: SCOPE,
      ux_mode: 'popup',
      callback: async (response) => {
        if (response.error) {
          console.warn('Error OAuth:', response);
          onError(response);
          return;
        }

        if (!response.code) {
          onError(new Error('No se recibió código de autorización'));
          return;
        }

        try {
          // Intercambiar código por access_token y refresh_token permanente
          const tokens = await exchangeCodeForTokens(response.code);
          const expiryTime = Date.now() + (tokens.expires_in - 60) * 1000;

          localStorage.setItem(STORAGE_KEY_TOKEN, tokens.access_token);
          localStorage.setItem(STORAGE_KEY_EXPIRY, expiryTime.toString());
          if (tokens.refresh_token) {
            localStorage.setItem(STORAGE_KEY_REFRESH_TOKEN, tokens.refresh_token);
          }
          if (tokens.scope) {
            localStorage.setItem(STORAGE_KEY_SCOPES, tokens.scope);
          }
          localStorage.setItem(STORAGE_KEY_LOGGED_IN, 'true');

          // Obtener perfil de usuario
          let profile = getSavedUserProfile();
          try {
            const fresh = await fetchUserProfile(tokens.access_token);
            if (fresh) {
              profile = fresh;
              localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(profile));
            }
          } catch {
            // usar perfil cacheado
          }

          notifyTokenUpdated(tokens.access_token);
          activeSuccessHandler?.(tokens.access_token, profile, tokens.scope);
        } catch (err) {
          console.error('Error al completar autenticación:', err);
          onError(err);
        }
      },
      error_callback: (err) => {
        console.warn('Error de Google Identity:', err);
        onError(err);
      },
    });

    return codeClientInstance;
  } catch (e) {
    console.error('No se pudo inicializar initCodeClient:', e);
    return null;
  }
}

/**
 * Solicita el código de acceso abriendo la ventana emergente de Google
 */
export function requestLogin(forceConsent = false) {
  if (!codeClientInstance) {
    throw new Error('Cliente OAuth no inicializado');
  }
  const user = getSavedUserProfile();
  const hasRefresh = !!localStorage.getItem(STORAGE_KEY_REFRESH_TOKEN);

  codeClientInstance.requestCode({
    // Forzamos consent si no tenemos refresh_token para asegurar que Google lo entregue
    prompt: forceConsent || !hasRefresh ? 'consent' : '',
    hint: user?.email || undefined,
  });
}

/**
 * Compatibilidad con la llamada anterior
 */
export function silentRefreshToken(): void {
  refreshAccessToken().catch((e) => console.warn('silentRefreshToken:', e));
}

/**
 * Cierra sesión y revoca el token
 */
export function logout(onComplete?: () => void) {
  const token = localStorage.getItem(STORAGE_KEY_TOKEN);
  localStorage.removeItem(STORAGE_KEY_TOKEN);
  localStorage.removeItem(STORAGE_KEY_EXPIRY);
  localStorage.removeItem(STORAGE_KEY_REFRESH_TOKEN);
  localStorage.removeItem(STORAGE_KEY_USER);
  localStorage.removeItem(STORAGE_KEY_SCOPES);
  localStorage.removeItem(STORAGE_KEY_LOGGED_IN);
  notifyTokenUpdated(null);

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
 */
export function getSavedSession(): {
  token: string | null;
  profile?: UserProfile;
  scope?: string;
  hasRefreshToken: boolean;
  isLoggedIn: boolean;
} | null {
  const isLoggedIn = localStorage.getItem(STORAGE_KEY_LOGGED_IN) === 'true';
  const token = localStorage.getItem(STORAGE_KEY_TOKEN);
  const expiry = localStorage.getItem(STORAGE_KEY_EXPIRY);
  const refreshToken = localStorage.getItem(STORAGE_KEY_REFRESH_TOKEN);
  const profile = getSavedUserProfile();
  const scope = localStorage.getItem(STORAGE_KEY_SCOPES) || undefined;

  if (!isLoggedIn) return null;

  const isExpired = !token || !expiry || Date.now() > parseInt(expiry, 10);

  return {
    token: isExpired ? null : token,
    profile,
    scope,
    hasRefreshToken: !!refreshToken,
    isLoggedIn: true,
  };
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
