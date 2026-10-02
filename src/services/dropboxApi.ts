/**
 * Servicio cliente para interactuar con la API v2 de Dropbox (REST)
 * No requiere librerías externas pesadas, utiliza Fetch nativo.
 */

export interface DropboxAccount {
  account_id: string;
  name: {
    display_name: string;
    given_name?: string;
    surname?: string;
  };
  email: string;
  profile_photo_url?: string;
}

export interface DropboxFileEntry {
  '.tag': 'file' | 'folder' | 'deleted';
  id: string;
  name: string;
  path_lower: string;
  path_display: string;
  server_modified?: string;
  size?: number;
}

export interface DropboxListFolderResult {
  entries: DropboxFileEntry[];
  cursor: string;
  has_more: boolean;
}

const DROPBOX_API_URL = 'https://api.dropboxapi.com/2';
const DROPBOX_CONTENT_URL = 'https://content.dropboxapi.com/2';

/**
 * Obtiene el perfil de la cuenta del usuario autenticado en Dropbox
 */
export async function dropboxGetAccount(token: string): Promise<DropboxAccount> {
  const res = await fetch(`${DROPBOX_API_URL}/users/get_current_account`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: 'null',
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Error al obtener perfil de Dropbox (${res.status}): ${errorText}`);
  }

  return await res.json();
}

/**
 * Sube o sobrescribe un archivo JSON en Dropbox
 * @param path Ruta del archivo dentro de la carpeta de la app (ej: '/notes/123.json')
 * @param content Objeto que se serializará a JSON
 */
export async function dropboxUploadJson(
  token: string,
  path: string,
  content: object
): Promise<DropboxFileEntry> {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const jsonString = JSON.stringify(content, null, 2);

  const res = await fetch(`${DROPBOX_CONTENT_URL}/files/upload`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Dropbox-API-Arg': JSON.stringify({
        path: normalizedPath,
        mode: 'overwrite',
        autorename: false,
        mute: true,
        strict_conflict: false,
      }),
      'Content-Type': 'application/octet-stream',
    },
    body: new Blob([jsonString], { type: 'application/json' }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Error al subir archivo a Dropbox en ${normalizedPath} (${res.status}): ${errorText}`);
  }

  return await res.json();
}

/**
 * Descarga y parsea un archivo JSON desde Dropbox
 * @param path Ruta del archivo (ej: '/notes/123.json')
 */
export async function dropboxDownloadJson<T = unknown>(
  token: string,
  path: string
): Promise<T> {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;

  const res = await fetch(`${DROPBOX_CONTENT_URL}/files/download`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Dropbox-API-Arg': JSON.stringify({
        path: normalizedPath,
      }),
    },
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Error al descargar archivo de Dropbox ${normalizedPath} (${res.status}): ${errorText}`);
  }

  return await res.json();
}

/**
 * Lista todos los archivos de una carpeta en Dropbox (manejando paginación con has_more)
 * Si la carpeta aún no existe, devuelve un array vacío [] de forma segura.
 */
export async function dropboxListFolder(
  token: string,
  folderPath: string
): Promise<DropboxFileEntry[]> {
  const normalizedPath =
    !folderPath || folderPath === '/' || folderPath === ''
      ? ''
      : folderPath.startsWith('/')
      ? folderPath
      : `/${folderPath}`;

  const allEntries: DropboxFileEntry[] = [];

  try {
    let res = await fetch(`${DROPBOX_API_URL}/files/list_folder`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        path: normalizedPath,
        recursive: false,
        include_deleted: false,
      }),
    });

    if (!res.ok) {
      const errJson = await res.json().catch(() => null);
      // Si la carpeta no existe todavía (path/not_found), la consideramos vacía
      if (errJson?.error?.path?.['.tag'] === 'not_found') {
        return [];
      }
      throw new Error(`Error al listar carpeta ${normalizedPath} (${res.status}): ${JSON.stringify(errJson)}`);
    }

    let data: DropboxListFolderResult = await res.json();
    allEntries.push(...data.entries);

    // Si hay más resultados paginados, continuamos con cursor
    while (data.has_more) {
      const contRes = await fetch(`${DROPBOX_API_URL}/files/list_folder/continue`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ cursor: data.cursor }),
      });

      if (!contRes.ok) break;
      data = await contRes.json();
      allEntries.push(...data.entries);
    }
  } catch (err: unknown) {
    const errStr = String(err);
    if (errStr.includes('not_found')) {
      return [];
    }
    throw err;
  }

  return allEntries;
}

/**
 * Elimina un archivo o carpeta en Dropbox
 */
export async function dropboxDeleteFile(token: string, path: string): Promise<void> {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;

  const res = await fetch(`${DROPBOX_API_URL}/files/delete_v2`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ path: normalizedPath }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    // Si ya no existe, no es un error fatal
    if (errorText.includes('not_found')) return;
    throw new Error(`Error al eliminar archivo en Dropbox ${normalizedPath} (${res.status}): ${errorText}`);
  }
}
