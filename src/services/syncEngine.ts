import { db, Note } from '../db/db';
import {
  findOrCreateFolder,
  uploadJsonFile,
  listFilesInFolder,
  readJsonFile,
} from './googleDrive';

export type SyncState = 'idle' | 'syncing' | 'error' | 'offline';

type SyncListener = (state: SyncState, message?: string) => void;

let currentState: SyncState = 'idle';
let currentMessage = '';
const listeners = new Set<SyncListener>();

let cachedNotesFolderId: string | null = null;
let syncTimeout: number | null = null;

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
 * Obtiene o crea la carpeta /MiAppNotas/notes/ en Drive
 */
async function getNotesFolderId(token: string): Promise<string> {
  if (cachedNotesFolderId) return cachedNotesFolderId;

  const root = await findOrCreateFolder(token, 'MiAppNotas');
  const notes = await findOrCreateFolder(token, 'notes', root.id);
  cachedNotesFolderId = notes.id;
  return notes.id;
}

/**
 * Sube a Google Drive todas las notas con syncStatus === 'pending'
 */
export async function syncPendingNotes(token: string): Promise<void> {
  if (!navigator.onLine) {
    notifyState('offline', 'Sin conexión a internet');
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

  try {
    const folderId = await getNotesFolderId(token);

    for (const note of pendingNotes) {
      // Marcar como en proceso
      await db.notes.update(note.id, { syncStatus: 'syncing' });

      // Formato limpio según especificación del proyecto
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
        token,
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

    notifyState('idle', 'Sincronizado');
  } catch (err) {
    console.error('Error al sincronizar notas pendientes:', err);
    notifyState('error', 'Error al sincronizar con Google Drive');
  }
}

/**
 * Descarga notas remotas desde Drive y las reconcilia con la base de datos local
 */
export async function pullRemoteNotes(token: string): Promise<void> {
  if (!navigator.onLine) return;

  try {
    notifyState('syncing', 'Buscando cambios en Drive...');
    const folderId = await getNotesFolderId(token);
    const remoteFiles = await listFilesInFolder(token, folderId);

    const jsonFiles = remoteFiles.filter((f) => f.name.endsWith('.json'));

    for (const file of jsonFiles) {
      try {
        const remoteNote = await readJsonFile<Note>(token, file.id);
        if (!remoteNote || !remoteNote.id) continue;

        const localNote = await db.notes.get(remoteNote.id);

        if (!localNote) {
          // Nota nueva en remoto: guardar localmente
          await db.notes.put({
            ...remoteNote,
            driveFileId: file.id,
            syncStatus: 'synced',
          });
        } else {
          // Reconciliación LWW (Last-Write-Wins)
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

    notifyState('idle', 'Sincronizado');
  } catch (err) {
    console.error('Error al descargar notas remotas:', err);
    notifyState('error', 'Error al consultar Drive');
  }
}

/**
 * Ejecuta una sincronización completa (subida de cambios y descarga de novedades)
 */
export async function runFullSync(token: string): Promise<void> {
  await syncPendingNotes(token);
  await pullRemoteNotes(token);
}

/**
 * Planifica una sincronización con debounce de 1500ms tras una edición
 */
export function scheduleSync(token: string | null): void {
  if (!token) return;

  if (syncTimeout) {
    window.clearTimeout(syncTimeout);
  }

  notifyState('idle', 'Cambios pendientes...');

  syncTimeout = window.setTimeout(() => {
    syncPendingNotes(token);
  }, 1500);
}
