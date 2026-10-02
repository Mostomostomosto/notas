import { db, Note, AppEvent } from '../db/db';
import {
  dropboxUploadJson,
  dropboxDownloadJson,
  dropboxListFolder,
  DropboxFileEntry,
} from './dropboxApi';
import { getSettings } from './settings';
import {
  getValidDropboxAccessToken,
  refreshDropboxAccessToken,
} from './dropboxAuth';

export type SyncState = 'idle' | 'syncing' | 'error' | 'offline';

type SyncListener = (state: SyncState, message?: string) => void;

let currentState: SyncState = 'idle';
let currentMessage = '';
const listeners = new Set<SyncListener>();
let syncTimeout: number | null = null;

export function resetCachedFolderId(): void {
  // En Dropbox no necesitamos IDs abstractos de carpetas, usamos rutas estables
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
 * Obtiene el prefijo de ruta para Dropbox según la configuración
 */
function getNotesPath(): string {
  return '/notes';
}

function getEventsPath(): string {
  return '/events';
}

/**
 * Sube a Dropbox todas las notas y eventos con syncStatus === 'pending' o 'error'
 */
export async function syncPendingNotes(providedToken?: string | null): Promise<void> {
  if (!navigator.onLine) {
    notifyState('offline', 'Sin conexión a internet');
    return;
  }

  let token = providedToken || (await getValidDropboxAccessToken());
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

  notifyState('syncing', `Guardando ${totalPending} cambio(s) en Dropbox...`);

  const executeUpload = async (activeToken: string) => {
    // 1. Subir notas pendientes
    if (pendingNotes.length > 0) {
      const notesFolder = getNotesPath();

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
          blocks: note.blocks,
        };

        const filePath = `${notesFolder}/${note.id}.json`;
        await dropboxUploadJson(activeToken, filePath, payload);

        await db.notes.update(note.id, {
          syncStatus: 'synced',
        });
      }
    }

    // 2. Subir eventos pendientes
    if (pendingEvents.length > 0) {
      const eventsFolder = getEventsPath();

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

        const filePath = `${eventsFolder}/${event.id}.json`;
        await dropboxUploadJson(activeToken, filePath, payload);

        await db.events.update(event.id, {
          syncStatus: 'synced',
        });
      }
    }
  };

  try {
    await executeUpload(token);
    notifyState('idle', 'Sincronizado');
  } catch (err: unknown) {
    console.error('Error al sincronizar datos pendientes con Dropbox:', err);
    const errStr = String(err);

    // Si el error es 401 o token expirado, intentamos renovar
    if (errStr.includes('401') || errStr.includes('expired_access_token') || errStr.includes('invalid_access_token')) {
      const newToken = await refreshDropboxAccessToken();
      if (newToken) {
        try {
          await executeUpload(newToken);
          notifyState('idle', 'Sincronizado');
          return;
        } catch (retryErr) {
          console.error('Fallo en reintento Dropbox tras renovar token:', retryErr);
        }
      }
    }

    const userMessage = err instanceof Error ? err.message : 'Error al sincronizar con Dropbox';
    notifyState('error', userMessage);
  }
}

/**
 * Descarga notas y eventos remotos desde Dropbox y los reconcilia con la base de datos local
 */
export async function pullRemoteNotes(providedToken?: string | null): Promise<void> {
  if (!navigator.onLine) return;

  let token = providedToken || (await getValidDropboxAccessToken());
  if (!token) return;

  const executePull = async (activeToken: string) => {
    // 1. Descargar notas remotas
    const notesFolder = getNotesPath();
    let remoteFiles: DropboxFileEntry[] = [];
    try {
      remoteFiles = await dropboxListFolder(activeToken, notesFolder);
    } catch (e: any) {
      console.warn('Carpeta /notes aún no disponible o vacía en Dropbox:', e);
      remoteFiles = [];
    }

    const jsonFiles = remoteFiles.filter((f) => f.name.endsWith('.json'));

    // Si Dropbox no tiene notas aún pero existen notas locales, subirlas como copia inicial
    const allLocalNotes = await db.notes.toArray();
    if (jsonFiles.length === 0 && allLocalNotes.length > 0) {
      for (const n of allLocalNotes) {
        if (n.syncStatus !== 'pending') {
          await db.notes.update(n.id, { syncStatus: 'pending' });
        }
      }
      await syncPendingNotes(activeToken);
    }

    for (const file of jsonFiles) {
      try {
        const filePath = file.path_display || file.path_lower || `${notesFolder}/${file.name}`;
        const remoteNote = await dropboxDownloadJson<Note>(activeToken, filePath);
        if (!remoteNote || !remoteNote.id) continue;

        const localNote = await db.notes.get(remoteNote.id);

        if (!localNote) {
          await db.notes.put({
            ...remoteNote,
            syncStatus: 'synced',
          });
        } else {
          const remoteTime = new Date(remoteNote.updatedAt).getTime();
          const localTime = new Date(localNote.updatedAt).getTime();

          // Si el archivo remoto es más reciente y no tenemos cambios pendientes locales
          if (remoteTime > localTime && localNote.syncStatus !== 'pending') {
            await db.notes.put({
              ...remoteNote,
              syncStatus: 'synced',
            });
          }
        }
      } catch (e) {
        console.warn(`No se pudo procesar nota remota ${file.name}:`, e);
      }
    }

    // 2. Descargar eventos remotos
    try {
      const eventsFolder = getEventsPath();
      let remoteEventFiles: DropboxFileEntry[] = [];
      try {
        remoteEventFiles = await dropboxListFolder(activeToken, eventsFolder);
      } catch (e: any) {
        console.warn('Carpeta /events aún no disponible o vacía en Dropbox:', e);
        remoteEventFiles = [];
      }
      const jsonEventFiles = remoteEventFiles.filter((f) => f.name.endsWith('.json'));

      // Si Dropbox no tiene eventos aún pero existen eventos locales, subirlos
      const allLocalEvents = await db.events.toArray();
      if (jsonEventFiles.length === 0 && allLocalEvents.length > 0) {
        for (const ev of allLocalEvents) {
          if (ev.syncStatus !== 'pending') {
            await db.events.update(ev.id, { syncStatus: 'pending' });
          }
        }
        await syncPendingNotes(activeToken);
      }

      for (const file of jsonEventFiles) {
        try {
          const filePath = file.path_display || file.path_lower || `${eventsFolder}/${file.name}`;
          const remoteEvent = await dropboxDownloadJson<AppEvent>(activeToken, filePath);
          if (!remoteEvent || !remoteEvent.id) continue;

          const localEvent = await db.events.get(remoteEvent.id);

          if (!localEvent) {
            await db.events.put({
              ...remoteEvent,
              syncStatus: 'synced',
            });
          } else {
            const remoteTime = new Date(remoteEvent.updatedAt).getTime();
            const localTime = new Date(localEvent.updatedAt).getTime();

            if (remoteTime > localTime && localEvent.syncStatus !== 'pending') {
              await db.events.put({
                ...remoteEvent,
                syncStatus: 'synced',
              });
            }
          }
        } catch (e) {
          console.warn(`No se pudo procesar evento remoto ${file.name}:`, e);
        }
      }
    } catch (e) {
      console.warn('Error al reconciliar eventos remotos de Dropbox:', e);
    }
  };

  try {
    notifyState('syncing', 'Buscando cambios en Dropbox...');
    await executePull(token);
    notifyState('idle', 'Sincronizado');
  } catch (err: unknown) {
    console.error('Error al descargar datos de Dropbox:', err);
    const errStr = String(err);

    if (errStr.includes('401') || errStr.includes('expired_access_token') || errStr.includes('invalid_access_token')) {
      const newToken = await refreshDropboxAccessToken();
      if (newToken) {
        try {
          await executePull(newToken);
          notifyState('idle', 'Sincronizado');
          return;
        } catch (retryErr) {
          console.error('Fallo en reintento pull de Dropbox:', retryErr);
        }
      }
    }

    const userMessage = err instanceof Error ? err.message : 'Error al consultar Dropbox';
    notifyState('error', userMessage);
  }
}

/**
 * Ejecuta una sincronización completa (subida de cambios pendientes y descarga de novedades)
 */
export async function runFullSync(token?: string | null): Promise<void> {
  const activeToken = token || (await getValidDropboxAccessToken());
  if (!activeToken) return;
  await syncPendingNotes(activeToken);
  await pullRemoteNotes(activeToken);
}

/**
 * Planifica una sincronización con debounce de 1500ms tras una edición
 */
export function scheduleSync(token?: string | null): void {
  if (!getSettings().autoSync) return;

  if (syncTimeout) {
    window.clearTimeout(syncTimeout);
  }

  notifyState('idle', 'Cambios pendientes...');

  syncTimeout = window.setTimeout(async () => {
    const activeToken = token || (await getValidDropboxAccessToken());
    if (activeToken) {
      await syncPendingNotes(activeToken);
    }
  }, 1500);
}
