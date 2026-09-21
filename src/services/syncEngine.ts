import { db, Note } from '../db/db';
import {
  findOrCreateFolder,
  uploadJsonFile,
  listFilesInFolder,
  readJsonFile,
} from './googleDrive';
import { getSettings } from './settings';
import { getValidAccessToken, refreshAccessToken } from './googleAuth';

export type SyncState = 'idle' | 'syncing' | 'error' | 'offline';

type SyncListener = (state: SyncState, message?: string) => void;

let currentState: SyncState = 'idle';
let currentMessage = '';
const listeners = new Set<SyncListener>();

let cachedNotesFolderId: string | null = null;
let syncTimeout: number | null = null;

export function resetCachedFolderId(): void {
  cachedNotesFolderId = null;
}

export function subscribeSyncState(listener: SyncListener): () => void {
  listeners.add(listener);
  listener(currentState, currentMessage);
  return () => {
    listeners.delete(listener);
  };
}

function notifyState(state: SyncState, message = '') {
  currentState = state;
  currentMessage = message;
  listeners.forEach((l) => l(state, message));
}

/**
 * Obtiene o crea la carpeta /[driveFolderName]/notes/ en Drive
 */
async function getNotesFolderId(token: string): Promise<string> {
  if (cachedNotesFolderId) return cachedNotesFolderId;

  const folderName = getSettings().driveFolderName || 'MiAppNotas';
  const root = await findOrCreateFolder(token, folderName);
  const notes = await findOrCreateFolder(token, 'notes', root.id);
  cachedNotesFolderId = notes.id;
  return notes.id;
}

/**
 * Sube a Google Drive todas las notas con syncStatus === 'pending'
 */
export async function syncPendingNotes(providedToken?: string | null): Promise<void> {
  if (!navigator.onLine) {
    notifyState('offline', 'Sin conexión a internet');
    return;
  }

  let token = providedToken || (await getValidAccessToken());
  if (!token) {
    return;
  }

  const pendingNotes = await db.notes
    .filter((n) => n.syncStatus === 'pending' || n.syncStatus === 'error')
    .toArray();

  if (pendingNotes.length === 0) {
    notifyState('idle', 'Sincronizado');
    return;
  }

  notifyState('syncing', `Guardando ${pendingNotes.length} cambio(s)...`);

  const executeUpload = async (activeToken: string) => {
    const folderId = await getNotesFolderId(activeToken);

    for (const note of pendingNotes) {
      await db.notes.update(note.id, { syncStatus: 'syncing' });

      const payload = {
        id: note.id,
        title: note.title,
        tag: note.tag,
        pinned: note.pinned,
        deleted: note.deleted,
        createdAt: note.createdAt,
        updatedAt: note.updatedAt,
        blocks: note.blocks.map((b) => {
          if (b.type === 'heading') return { type: 'heading', content: b.content };
          if (b.type === 'text') return { type: 'text', content: b.content };
          if (b.type === 'checklist') {
            return {
              type: 'checklist',
              items: b.items.map((i) => ({ text: i.text, checked: i.checked })),
            };
          }
          if (b.type === 'image') {
            return { type: 'image', driveFileId: b.driveFileId, caption: b.caption || '' };
          }
          return b;
        }),
      };

      const result = await uploadJsonFile(
        activeToken,
        `${note.id}.json`,
        payload,
        folderId,
        note.driveFileId
      );

      await db.notes.update(note.id, {
        driveFileId: result.id,
        syncStatus: 'synced',
      });
    }
  };

  try {
    await executeUpload(token);
    notifyState('idle', 'Sincronizado');
  } catch (err: unknown) {
    console.error('Error al sincronizar notas pendientes:', err);
    const errStr = String(err);

    // Si el error es 401 (token expirado), renovamos y reintentamos de inmediato
    if (errStr.includes('401')) {
      const newToken = await refreshAccessToken();
      if (newToken) {
        try {
          resetCachedFolderId();
          await executeUpload(newToken);
          notifyState('idle', 'Sincronizado');
          return;
        } catch (retryErr) {
          console.error('Fallo en reintento con token renovado:', retryErr);
        }
      }
    }

    notifyState('error', 'Error al sincronizar con Google Drive');
  }
}

/**
 * Descarga notas remotas desde Drive y las reconcilia con la base de datos local
 */
export async function pullRemoteNotes(providedToken?: string | null): Promise<void> {
  if (!navigator.onLine) return;

  let token = providedToken || (await getValidAccessToken());
  if (!token) return;

  const executePull = async (activeToken: string) => {
    const folderId = await getNotesFolderId(activeToken);
    const remoteFiles = await listFilesInFolder(activeToken, folderId);

    const jsonFiles = remoteFiles.filter((f) => f.name.endsWith('.json'));

    for (const file of jsonFiles) {
      try {
        const remoteNote = await readJsonFile<Note>(activeToken, file.id);
        if (!remoteNote || !remoteNote.id) continue;

        const localNote = await db.notes.get(remoteNote.id);

        if (!localNote) {
          await db.notes.put({
            ...remoteNote,
            driveFileId: file.id,
            syncStatus: 'synced',
          });
        } else {
          const remoteTime = new Date(remoteNote.updatedAt).getTime();
          const localTime = new Date(localNote.updatedAt).getTime();

          if (remoteTime > localTime && localNote.syncStatus !== 'pending') {
            await db.notes.put({
              ...remoteNote,
              driveFileId: file.id,
              syncStatus: 'synced',
            });
          }
        }
      } catch (e) {
        console.warn(`No se pudo procesar archivo remoto ${file.name}:`, e);
      }
    }
  };

  try {
    notifyState('syncing', 'Buscando cambios en Drive...');
    await executePull(token);
    notifyState('idle', 'Sincronizado');
  } catch (err: unknown) {
    console.error('Error al descargar notas remotas:', err);
    const errStr = String(err);

    if (errStr.includes('401')) {
      const newToken = await refreshAccessToken();
      if (newToken) {
        try {
          resetCachedFolderId();
          await executePull(newToken);
          notifyState('idle', 'Sincronizado');
          return;
        } catch (retryErr) {
          console.error('Fallo en reintento pull tras renovar:', retryErr);
        }
      }
    }

    notifyState('error', 'Error al consultar Drive');
  }
}

/**
 * Ejecuta una sincronización completa (subida de cambios y descarga de novedades)
 */
export async function runFullSync(token?: string | null): Promise<void> {
  const activeToken = token || (await getValidAccessToken());
  if (!activeToken) return;
  await syncPendingNotes(activeToken);
  await pullRemoteNotes(activeToken);
}

/**
 * Planifica una sincronización con debounce de 1500ms tras una edición
 */
export function scheduleSync(token: string | null): void {
  if (!getSettings().autoSync) return;

  if (syncTimeout) {
    window.clearTimeout(syncTimeout);
  }

  notifyState('idle', 'Cambios pendientes...');

  syncTimeout = window.setTimeout(async () => {
    const activeToken = token || (await getValidAccessToken());
    if (activeToken) {
      syncPendingNotes(activeToken);
    }
  }, 1500);
}
