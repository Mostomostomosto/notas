import { db, Note, AppEvent } from '../db/db';
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
let cachedEventsFolderId: string | null = null;
let syncTimeout: number | null = null;

export function resetCachedFolderId(): void {
  cachedNotesFolderId = null;
  cachedEventsFolderId = null;
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
 * Obtiene o crea la carpeta /[driveFolderName]/events/ en Drive
 */
async function getEventsFolderId(token: string): Promise<string> {
  if (cachedEventsFolderId) return cachedEventsFolderId;

  const folderName = getSettings().driveFolderName || 'MiAppNotas';
  const root = await findOrCreateFolder(token, folderName);
  const events = await findOrCreateFolder(token, 'events', root.id);
  cachedEventsFolderId = events.id;
  return events.id;
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

  const pendingEvents = await db.events
    .filter((e) => e.syncStatus === 'pending' || e.syncStatus === 'error')
    .toArray();

  const totalPending = pendingNotes.length + pendingEvents.length;
  if (totalPending === 0) {
    notifyState('idle', 'Sincronizado');
    return;
  }

  notifyState('syncing', `Guardando ${totalPending} cambio(s)...`);

  const executeUpload = async (activeToken: string) => {
    // 1. Subir notas pendientes
    if (pendingNotes.length > 0) {
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
            if (b.type === 'columns') {
              return {
                type: 'columns',
                labels: b.labels || [],
                rows: b.rows || [],
              };
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
    }

    // 2. Subir eventos pendientes
    if (pendingEvents.length > 0) {
      const eventsFolderId = await getEventsFolderId(activeToken);

      for (const event of pendingEvents) {
        await db.events.update(event.id, { syncStatus: 'syncing' });

        const payload = {
          id: event.id,
          title: event.title,
          description: event.description || '',
          date: event.date,
          time: event.time || '',
          repeat: event.repeat || 'none',
          createdAt: event.createdAt,
          updatedAt: event.updatedAt,
          deleted: event.deleted ?? false,
        };

        const result = await uploadJsonFile(
          activeToken,
          `${event.id}.json`,
          payload,
          eventsFolderId,
          event.driveFileId
        );

        await db.events.update(event.id, {
          driveFileId: result.id,
          syncStatus: 'synced',
        });
      }
    }
  };

  try {
    await executeUpload(token);
    notifyState('idle', 'Sincronizado');
  } catch (err: unknown) {
    console.error('Error al sincronizar datos pendientes:', err);
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
 * Descarga notas y eventos remotos desde Drive y los reconcilia con la base de datos local
 */
export async function pullRemoteNotes(providedToken?: string | null): Promise<void> {
  if (!navigator.onLine) return;

  let token = providedToken || (await getValidAccessToken());
  if (!token) return;

  const executePull = async (activeToken: string) => {
    // 1. Descargar notas remotas
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

    // 2. Descargar eventos remotos
    try {
      const eventsFolderId = await getEventsFolderId(activeToken);
      const remoteEventFiles = await listFilesInFolder(activeToken, eventsFolderId);
      const jsonEventFiles = remoteEventFiles.filter((f) => f.name.endsWith('.json'));

      for (const file of jsonEventFiles) {
        try {
          const remoteEvent = await readJsonFile<AppEvent>(activeToken, file.id);
          if (!remoteEvent || !remoteEvent.id) continue;

          const localEvent = await db.events.get(remoteEvent.id);

          if (!localEvent) {
            await db.events.put({
              ...remoteEvent,
              driveFileId: file.id,
              syncStatus: 'synced',
            });
          } else {
            const remoteTime = new Date(remoteEvent.updatedAt).getTime();
            const localTime = new Date(localEvent.updatedAt).getTime();

            if (remoteTime > localTime && localEvent.syncStatus !== 'pending') {
              await db.events.put({
                ...remoteEvent,
                driveFileId: file.id,
                syncStatus: 'synced',
              });
            }
          }
        } catch (e) {
          console.warn(`No se pudo procesar evento remoto ${file.name}:`, e);
        }
      }
    } catch (e) {
      console.warn('Error al reconciliar carpeta de eventos remota:', e);
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
