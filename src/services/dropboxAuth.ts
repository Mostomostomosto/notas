import { dropboxGetAccount } from './dropboxApi';

export interface DropboxUserProfile {
  email: string;
  name?: string;
  picture?: string;
  accountId?: string;
}

export const DROPBOX_STORAGE_KEYS = {
  APP_KEY: 'app_notas_dropbox_app_key',
  ACCESS_TOKEN: 'app_notas_dropbox_access_token',
  REFRESH_TOKEN: 'app_notas_dropbox_refresh_token',
  TOKEN_EXPIRY: 'app_notas_dropbox_token_expiry',
  USER_PROFILE: 'app_notas_dropbox_user_profile',
  CODE_VERIFIER: 'app_notas_dropbox_code_verifier',
  IS_LOGGED_IN: 'app_notas_dropbox_is_logged_in',
};

const tokenListeners = new Set<(token: string | null) => void>();

export function subscribeDropboxTokenUpdates(listener: (token: string | null) => void): () => void {
  tokenListeners.add(listener);
  return () => {
    tokenListeners.delete(listener);
  };
}

function notifyTokenUpdated(token: string | null) {
  tokenListeners.forEach((l) => l(token));
}

/**
 * Genera una cadena aleatoria criptográfica para PKCE (code_verifier)
 */
function generateRandomString(length = 64): string {
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  const array = new Uint8Array(length);
  window.crypto.getRandomValues(array);
  return Array.from(array)
    .map((byte) => charset[byte % charset.length])
    .join('');
}

/**
 * Calcula el hash SHA-256 en Base64-URL sin padding para el code_challenge
 */
async function generateCodeChallenge(codeVerifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(codeVerifier);
  const digest = await window.crypto.subtle.digest('SHA-256', data);
  const bytes = new Uint8Array(digest);

  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }

  return window
    .btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Obtiene la URI de redirección para OAuth según el entorno actual
 */
export function getDropboxRedirectUri(): string {
  if (typeof window === 'undefined') return 'http://localhost:5174/oauth/dropbox/callback';
  // En Electron o Web local/remoto
  return `${window.location.origin}/oauth/dropbox/callback`;
}

/**
 * Obtiene la App Key configurada (desde localStorage o variable de entorno)
 */
export function getDropboxAppKey(): string {
  const saved = localStorage.getItem(DROPBOX_STORAGE_KEYS.APP_KEY);
  if (saved && saved.trim()) return saved.trim();

  const envKey = (import.meta as any).env?.VITE_DROPBOX_APP_KEY;
  if (envKey && typeof envKey === 'string' && envKey.trim()) return envKey.trim();

  return '';
}

/**
 * Guarda la App Key en el almacenamiento local
 */
export function setDropboxAppKey(appKey: string): void {
  localStorage.setItem(DROPBOX_STORAGE_KEYS.APP_KEY, appKey.trim());
}

/**
 * Construye la URL de autorización OAuth 2.0 PKCE para Dropbox
 */
export async function buildDropboxAuthUrl(appKey: string): Promise<string> {
  const verifier = generateRandomString(64);
  const challenge = await generateCodeChallenge(verifier);
  const redirectUri = getDropboxRedirectUri();

  localStorage.setItem(DROPBOX_STORAGE_KEYS.CODE_VERIFIER, verifier);
  localStorage.setItem(DROPBOX_STORAGE_KEYS.APP_KEY, appKey);

  const params = new URLSearchParams({
    client_id: appKey,
    response_type: 'code',
    code_challenge: challenge,
    code_challenge_method: 'S256',
    token_access_type: 'offline', // Imprescindible para obtener refresh_token permanente
    redirect_uri: redirectUri,
  });

  return `https://www.dropbox.com/oauth2/authorize?${params.toString()}`;
}

/**
 * Intercambia el código de autorización obtenido por access_token y refresh_token permanentes
 */
export async function exchangeDropboxCode(
  code: string,
  appKey: string,
  codeVerifier: string,
  redirectUri: string
): Promise<{ accessToken: string; refreshToken?: string; profile?: DropboxUserProfile }> {
  const bodyParams = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    client_id: appKey,
    code_verifier: codeVerifier,
    redirect_uri: redirectUri,
  });

  const res = await fetch('https://api.dropboxapi.com/oauth2/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: bodyParams.toString(),
  });

  if (!res.ok) {
    const errorJson = await res.json().catch(() => ({}));
    throw new Error(errorJson.error_description || errorJson.error || 'Error al autenticar con Dropbox');
  }

  const data = await res.json();
  const accessToken = data.access_token;
  const refreshToken = data.refresh_token;
  const expiresIn = data.expires_in || 14400; // Dropbox devuelve normalmente 14400s (4h)

  const expiryTime = Date.now() + (expiresIn - 60) * 1000;

  localStorage.setItem(DROPBOX_STORAGE_KEYS.ACCESS_TOKEN, accessToken);
  localStorage.setItem(DROPBOX_STORAGE_KEYS.TOKEN_EXPIRY, expiryTime.toString());
  localStorage.setItem(DROPBOX_STORAGE_KEYS.IS_LOGGED_IN, 'true');

  if (refreshToken) {
    localStorage.setItem(DROPBOX_STORAGE_KEYS.REFRESH_TOKEN, refreshToken);
  }

  // Obtener perfil del usuario
  let profile: DropboxUserProfile | undefined;
  try {
    const account = await dropboxGetAccount(accessToken);
    profile = {
      email: account.email,
      name: account.name?.display_name || account.email,
      picture: account.profile_photo_url,
      accountId: account.account_id,
    };
    localStorage.setItem(DROPBOX_STORAGE_KEYS.USER_PROFILE, JSON.stringify(profile));
  } catch (err) {
    console.warn('No se pudo obtener el perfil de Dropbox:', err);
  }

  notifyTokenUpdated(accessToken);
  return { accessToken, refreshToken, profile };
}

/**
 * Renueva el token de acceso usando el refresh_token
 */
export async function refreshDropboxAccessToken(): Promise<string | null> {
  const refreshToken = localStorage.getItem(DROPBOX_STORAGE_KEYS.REFRESH_TOKEN);
  const appKey = getDropboxAppKey();

  if (!refreshToken || !appKey) {
    return null;
  }

  try {
    const bodyParams = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: appKey,
    });

    const res = await fetch('https://api.dropboxapi.com/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: bodyParams.toString(),
    });

    if (!res.ok) {
      console.warn('Error al renovar token de Dropbox:', await res.text());
      return null;
    }

    const data = await res.json();
    const newAccessToken = data.access_token;
    const expiresIn = data.expires_in || 14400;
    const expiryTime = Date.now() + (expiresIn - 60) * 1000;

    localStorage.setItem(DROPBOX_STORAGE_KEYS.ACCESS_TOKEN, newAccessToken);
    localStorage.setItem(DROPBOX_STORAGE_KEYS.TOKEN_EXPIRY, expiryTime.toString());
    notifyTokenUpdated(newAccessToken);

    return newAccessToken;
  } catch (err) {
    console.warn('Fallo de red al renovar token de Dropbox:', err);
    return null;
  }
}

/**
 * Devuelve un token de acceso válido de Dropbox. Si ha caducado, lo renueva en segundo plano.
 */
export async function getValidDropboxAccessToken(): Promise<string | null> {
  const token = localStorage.getItem(DROPBOX_STORAGE_KEYS.ACCESS_TOKEN);
  const expiry = localStorage.getItem(DROPBOX_STORAGE_KEYS.TOKEN_EXPIRY);

  if (!token) return null;

  // Si aún no ha caducado
  if (expiry && Date.now() < parseInt(expiry, 10)) {
    return token;
  }

  // Si ha caducado o está cerca, renovamos
  const refreshed = await refreshDropboxAccessToken();
  return refreshed || token;
}

/**
 * Guarda un token de acceso introducido manualmente (por ejemplo, generado en Dropbox Developers)
 */
export async function setManualDropboxToken(token: string): Promise<DropboxUserProfile | undefined> {
  const cleanToken = token.trim();
  if (!cleanToken) throw new Error('Token vacío');

  // Verificar que el token funcione obteniendo la cuenta
  const account = await dropboxGetAccount(cleanToken);

  const profile: DropboxUserProfile = {
    email: account.email,
    name: account.name?.display_name || account.email,
    picture: account.profile_photo_url,
    accountId: account.account_id,
  };

  localStorage.setItem(DROPBOX_STORAGE_KEYS.ACCESS_TOKEN, cleanToken);
  localStorage.setItem(DROPBOX_STORAGE_KEYS.IS_LOGGED_IN, 'true');
  localStorage.setItem(DROPBOX_STORAGE_KEYS.USER_PROFILE, JSON.stringify(profile));
  // Si es token manual, le damos una expiración lejana o indefinida
  localStorage.setItem(DROPBOX_STORAGE_KEYS.TOKEN_EXPIRY, (Date.now() + 365 * 24 * 3600 * 1000).toString());

  notifyTokenUpdated(cleanToken);
  return profile;
}

/**
 * Cierra la sesión de Dropbox y borra credenciales locales
 */
export function logoutDropbox(onComplete?: () => void): void {
  localStorage.removeItem(DROPBOX_STORAGE_KEYS.ACCESS_TOKEN);
  localStorage.removeItem(DROPBOX_STORAGE_KEYS.REFRESH_TOKEN);
  localStorage.removeItem(DROPBOX_STORAGE_KEYS.TOKEN_EXPIRY);
  localStorage.removeItem(DROPBOX_STORAGE_KEYS.USER_PROFILE);
  localStorage.removeItem(DROPBOX_STORAGE_KEYS.IS_LOGGED_IN);
  localStorage.removeItem(DROPBOX_STORAGE_KEYS.CODE_VERIFIER);

  notifyTokenUpdated(null);
  onComplete?.();
}

/**
 * Obtiene el perfil guardado de Dropbox
 */
export function getSavedDropboxUserProfile(): DropboxUserProfile | undefined {
  const raw = localStorage.getItem(DROPBOX_STORAGE_KEYS.USER_PROFILE);
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as DropboxUserProfile;
  } catch {
    return undefined;
  }
}

/**
 * Comprueba el estado de sesión actual de Dropbox
 */
export function getDropboxAuthState(): {
  isLoggedIn: boolean;
  token: string | null;
  user?: DropboxUserProfile;
} {
  const isLoggedIn = localStorage.getItem(DROPBOX_STORAGE_KEYS.IS_LOGGED_IN) === 'true';
  const token = localStorage.getItem(DROPBOX_STORAGE_KEYS.ACCESS_TOKEN);
  const user = getSavedDropboxUserProfile();

  return {
    isLoggedIn: isLoggedIn && !!token,
    token: isLoggedIn ? token : null,
    user,
  };
}

/**
 * Abre la ventana emergente de login de Dropbox y espera la autorización
 */
export async function startDropboxLoginPopup(appKey: string): Promise<{
  token: string;
  profile?: DropboxUserProfile;
}> {
  const authUrl = await buildDropboxAuthUrl(appKey);
  const redirectUri = getDropboxRedirectUri();
  const verifier = localStorage.getItem(DROPBOX_STORAGE_KEYS.CODE_VERIFIER) || '';

  return new Promise((resolve, reject) => {
    const width = 560;
    const height = 680;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;

    const popup = window.open(
      authUrl,
      'dropbox-oauth',
      `width=${width},height=${height},left=${left},top=${top},status=no,toolbar=no,menubar=no`
    );

    if (!popup) {
      reject(new Error('No se pudo abrir la ventana emergente. Permite ventanas emergentes en tu navegador.'));
      return;
    }

    let resolved = false;

    const messageHandler = async (event: MessageEvent) => {
      if (event.data?.type === 'DROPBOX_AUTH_RESULT') {
        window.removeEventListener('message', messageHandler);
        clearInterval(checkClosedInterval);
        resolved = true;

        if (event.data.error) {
          reject(new Error(event.data.error));
          return;
        }

        if (event.data.code) {
          try {
            const res = await exchangeDropboxCode(event.data.code, appKey, verifier, redirectUri);
            resolve({ token: res.accessToken, profile: res.profile });
          } catch (e) {
            reject(e);
          }
        } else {
          reject(new Error('No se recibió código de autorización'));
        }
      }
    };

    window.addEventListener('message', messageHandler);

    const checkClosedInterval = setInterval(() => {
      if (popup.closed && !resolved) {
        clearInterval(checkClosedInterval);
        window.removeEventListener('message', messageHandler);
        reject(new Error('Ventana de autenticación cerrada por el usuario'));
      }
    }, 800);
  });
}
