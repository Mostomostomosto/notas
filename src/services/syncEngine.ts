import { db, Note, AppEvent, Tag } from '../db/db';
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
 * Sube a Dropbox todas las notas y eventos con syncStatus === 'pending', 'error' o 'syncing'
 */
export async function syncPendingNotes(providedToken?: string | null): Promise<void> {
  if (!navigator.onLine) {
    notifyState('offline', 'Sin conexión a internet');
    return;
  }

  let token = providedToken || (await getValidDropboxAccessToken());
  if (!token) {
    notifyState('error', 'No hay sesión de Dropbox activa');
    return;
  }

  const pendingNotes = await db.notes
    .filter((n) => n.syncStatus === 'pending' || n.syncStatus === 'error' || n.syncStatus === 'syncing')
    .toArray();

  const pendingEvents = await db.events
    .filter((e) => e.syncStatus === 'pending' || e.syncStatus === 'error' || e.syncStatus === 'syncing')
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
        try {
          const uploadResult = await dropboxUploadJson(activeToken, filePath, payload);
          await db.notes.update(note.id, {
            syncStatus: 'synced',
            remoteRev: uploadResult.rev,
            remoteModified: uploadResult.server_modified,
          });
        } catch (uploadErr) {
          await db.notes.update(note.id, { syncStatus: 'error' });
          throw uploadErr;
        }
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
        try {
          const uploadResult = await dropboxUploadJson(activeToken, filePath, payload);
          await db.events.update(event.id, {
            syncStatus: 'synced',
            remoteRev: uploadResult.rev,
            remoteModified: uploadResult.server_modified,
          });
        } catch (uploadErr) {
          await db.events.update(event.id, { syncStatus: 'error' });
          throw uploadErr;
        }
      }
    }

    // 3. Sincronizar catálogo de etiquetas
    try {
      await syncTags(activeToken);
    } catch (tagsErr) {
      console.warn('No se pudo sincronizar catálogo de etiquetas con Dropbox:', tagsErr);
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
    throw err;
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
    // 0. Sincronizar catálogo de etiquetas antes de procesar notas
    try {
      await syncTags(activeToken);
    } catch (tagsErr) {
      console.warn('Aviso al sincronizar etiquetas previo a pullRemoteNotes:', tagsErr);
    }

    // 1. Descargar notas remotas
    const notesFolder = getNotesPath();
    let remoteFiles: DropboxFileEntry[] = [];
    try {
      remoteFiles = await dropboxListFolder(activeToken, notesFolder);
    } catch (e: any) {
      const errStr = String(e);
      if (errStr.includes('not_found')) {
        remoteFiles = [];
      } else {
        throw e;
      }
    }

    const jsonFiles = remoteFiles.filter((f) => f.name.endsWith('.json'));

    // Si Dropbox no tiene notas aún pero existen notas locales, subirlas como copia inicial
    const allLocalNotes = await db.notes.toArray();
    if (jsonFiles.length === 0 && allLocalNotes.length > 0) {
      for (const n of allLocalNotes) {
        await db.notes.update(n.id, { syncStatus: 'pending' });
      }
      await syncPendingNotes(activeToken);
    }

    for (const file of jsonFiles) {
      try {
        const noteId = file.name.replace(/\.json$/i, '');
        const localNote = await db.notes.get(noteId);

        // Si ya tenemos la nota sincronizada y no ha cambiado en Dropbox, nos saltamos la descarga de red
        if (
          localNote &&
          localNote.syncStatus === 'synced' &&
          ((file.rev && localNote.remoteRev === file.rev) ||
           (file.server_modified && localNote.remoteModified === file.server_modified))
        ) {
          continue;
        }

        const filePath = file.path_display || file.path_lower || `${notesFolder}/${file.name}`;
        const remoteNote = await dropboxDownloadJson<Note>(activeToken, filePath);
        if (!remoteNote || !remoteNote.id) continue;

        if (!localNote) {
          await db.notes.put({
            ...remoteNote,
            syncStatus: 'synced',
            remoteRev: file.rev,
            remoteModified: file.server_modified,
          });
        } else {
          const remoteTime = new Date(remoteNote.updatedAt).getTime();
          const localTime = new Date(localNote.updatedAt).getTime();

          // Si el archivo remoto es más reciente o local no tiene cambios pendientes de subir
          if (localNote.syncStatus !== 'pending' && localNote.syncStatus !== 'syncing') {
            if (remoteTime >= localTime || !localNote.remoteRev) {
              await db.notes.put({
                ...remoteNote,
                syncStatus: 'synced',
                remoteRev: file.rev,
                remoteModified: file.server_modified,
              });
            }
          }
        }

        // Si la nota remota tiene una etiqueta que no existe en el catálogo local, registrarla automáticamente
        if (remoteNote.tag && remoteNote.tag.trim() && remoteNote.tag.toLowerCase() !== 'sin etiqueta') {
          const tagName = remoteNote.tag.trim();
          const existingTag = await db.tags.filter((t) => t.name.toLowerCase() === tagName.toLowerCase()).first();
          if (!existingTag) {
            await db.tags.add({
              id: `tag_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
              name: tagName,
              color: '#5B7DB1',
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
        const errStr = String(e);
        if (errStr.includes('not_found')) {
          remoteEventFiles = [];
        } else {
          throw e;
        }
      }
      const jsonEventFiles = remoteEventFiles.filter((f) => f.name.endsWith('.json'));

      // Si Dropbox no tiene eventos aún pero existen eventos locales, subirlos
      const allLocalEvents = await db.events.toArray();
      if (jsonEventFiles.length === 0 && allLocalEvents.length > 0) {
        for (const ev of allLocalEvents) {
          await db.events.update(ev.id, { syncStatus: 'pending' });
        }
        await syncPendingNotes(activeToken);
      }

      for (const file of jsonEventFiles) {
        try {
          const eventId = file.name.replace(/\.json$/i, '');
          const localEvent = await db.events.get(eventId);

          if (
            localEvent &&
            localEvent.syncStatus === 'synced' &&
            ((file.rev && localEvent.remoteRev === file.rev) ||
             (file.server_modified && localEvent.remoteModified === file.server_modified))
          ) {
            continue;
          }

          const filePath = file.path_display || file.path_lower || `${eventsFolder}/${file.name}`;
          const remoteEvent = await dropboxDownloadJson<AppEvent>(activeToken, filePath);
          if (!remoteEvent || !remoteEvent.id) continue;

          if (!localEvent) {
            await db.events.put({
              ...remoteEvent,
              syncStatus: 'synced',
              remoteRev: file.rev,
              remoteModified: file.server_modified,
            });
          } else {
            const remoteTime = new Date(remoteEvent.updatedAt).getTime();
            const localTime = new Date(localEvent.updatedAt).getTime();

            if (localEvent.syncStatus !== 'pending' && localEvent.syncStatus !== 'syncing') {
              if (remoteTime >= localTime || !localEvent.remoteRev) {
                await db.events.put({
                  ...remoteEvent,
                  syncStatus: 'synced',
                  remoteRev: file.rev,
                  remoteModified: file.server_modified,
                });
              }
            }
          }
        } catch (e) {
          console.warn(`No se pudo procesar evento remoto ${file.name}:`, e);
        }
      }
    } catch (e) {
      console.warn('Error al reconciliar eventos remotos de Dropbox:', e);
      throw e;
    }

    // 3. Descargar y reconciliar catálogo de etiquetas
    try {
      await syncTags(activeToken);
    } catch (tagsErr) {
      console.warn('Aviso al reconciliar etiquetas en pullRemoteNotes:', tagsErr);
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
    throw err;
  }
}

/**
 * Sincroniza el catálogo de etiquetas con Dropbox (/tags.json)
 * Reconcilia etiquetas locales y remotas preservando la jerarquía de subtags (parentId)
 */
export async function syncTags(activeToken: string): Promise<void> {
  let remoteTags: Tag[] = [];
  try {
    const downloaded = await dropboxDownloadJson<Tag[]>(activeToken, '/tags.json');
    if (Array.isArray(downloaded)) {
      remoteTags = downloaded;
    }
  } catch {
    // Si /tags.json no existe aún en Dropbox, se inicializa vacío
  }

  const localTags = await db.tags.toArray();

  if (localTags.length === 0 && remoteTags.length === 0) return;

  // Mapa combinado usando el nombre normalizado (lowercase)
  const tagMap = new Map<string, Tag>();

  // 1. Incorporar etiquetas remotas primero
  for (const rt of remoteTags) {
    if (!rt.name || !rt.id) continue;
    tagMap.set(rt.name.toLowerCase(), { ...rt });
  }

  // 2. Incorporar y fusionar con etiquetas locales
  for (const lt of localTags) {
    if (!lt.name || !lt.id) continue;
    const key = lt.name.toLowerCase();
    const existing = tagMap.get(key);
    if (!existing) {
      tagMap.set(key, { ...lt });
    } else {
      tagMap.set(key, {
        ...existing,
        // Si la local tiene parentId o fue desanidada (''), reflejar el estado local
        parentId: lt.parentId === '' ? undefined : (lt.parentId || existing.parentId),
        color: existing.color || lt.color,
        archived: existing.archived ?? lt.archived ?? false,
      });
    }
  }

  const unifiedTags = Array.from(tagMap.values());

  // 3. Reconciliar la base de datos local Dexie
  for (const ut of unifiedTags) {
    // Buscar si existe una etiqueta local con el mismo nombre pero diferente ID (ej: huérfana provisional)
    const existingByName = await db.tags
      .filter((t) => t.name.toLowerCase() === ut.name.toLowerCase())
      .first();

    if (existingByName && existingByName.id !== ut.id) {
      await db.tags.delete(existingByName.id);
    }
    await db.tags.put(ut);
  }

  // 4. Subir el catálogo unificado resultante a Dropbox
  try {
    await dropboxUploadJson(activeToken, '/tags.json', unifiedTags);
  } catch (err) {
    console.warn('No se pudo subir catálogo de etiquetas unificado a Dropbox:', err);
  }
}

/**
 * Ejecuta una sincronización completa (subida de cambios pendientes y descarga de novedades)
 */
export async function runFullSync(token?: string | null): Promise<void> {
  const activeToken = token || (await getValidDropboxAccessToken());
  if (!activeToken) return;

  try {
    await syncTags(activeToken);
  } catch (err) {
    console.warn('Aviso en sincronización de etiquetas durante runFullSync:', err);
  }

  try {
    await syncPendingNotes(activeToken);
  } catch (err) {
    console.warn('Aviso en subida de notas durante runFullSync:', err);
  }

  try {
    await pullRemoteNotes(activeToken);
  } catch (err) {
    console.error('Fallo en descarga de notas durante runFullSync:', err);
    throw err;
  }
}

/**
 * Fuerza la subida completa de todas las notas y eventos locales a Dropbox,
 * marcándolos como pendientes y ejecutando la subida inmediata.
 */
export async function forceUploadAllToDropbox(providedToken?: string | null): Promise<{
  notesCount: number;
  eventsCount: number;
}> {
  const token = providedToken || (await getValidDropboxAccessToken());
  if (!token) {
    throw new Error('No hay sesión de Dropbox activa. Conecta tu cuenta primero.');
  }

  notifyState('syncing', 'Preparando subida completa a Dropbox...');

  const allNotes = await db.notes.toArray();
  for (const n of allNotes) {
    await db.notes.update(n.id, { syncStatus: 'pending' });
  }

  const allEvents = await db.events.toArray();
  for (const e of allEvents) {
    await db.events.update(e.id, { syncStatus: 'pending' });
  }

  await syncPendingNotes(token);
  notifyState('idle', `Sincronizado (${allNotes.length} notas subidas)`);

  return {
    notesCount: allNotes.length,
    eventsCount: allEvents.length,
  };
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
      try {
        await syncTags(activeToken);
      } catch (e) {
        console.warn('Aviso en syncTags debounced:', e);
      }
      try {
        await syncPendingNotes(activeToken);
      } catch (e) {
        console.error('Error en sync automático debounced:', e);
      }
    }
  }, 1500);
}
