import Dexie, { Table } from 'dexie';

export type BlockType = 'heading' | 'text' | 'checklist' | 'image' | 'columns';

export interface ChecklistItem {
  id?: string;
  text: string;
  checked: boolean;
}

export interface BaseBlock {
  id: string;
  type: BlockType;
}

export interface HeadingBlock extends BaseBlock {
  type: 'heading';
  content: string;
}

export interface TextBlock extends BaseBlock {
  type: 'text';
  content: string;
}

export interface ChecklistBlock extends BaseBlock {
  type: 'checklist';
  items: ChecklistItem[];
}

export interface ImageBlock extends BaseBlock {
  type: 'image';
  driveFileId?: string;
  localUrl?: string; // Blob URL o base64 para vista previa local inmediata
  caption?: string;
}

export interface ColumnsBlock extends BaseBlock {
  type: 'columns';
  labels: string[]; // Encabezados de columnas
  rows: string[][]; // Filas con valores de celdas en texto plano
}

export type NoteBlock =
  | HeadingBlock
  | TextBlock
  | ChecklistBlock
  | ImageBlock
  | ColumnsBlock;

export interface Note {
  id: string;
  title: string;
  tag: string; // ej: "Casa", "Proyecto", "Personal" o "Sin etiqueta"
  pinned: boolean;
  deleted: boolean;
  createdAt: string;
  updatedAt: string;
  blocks: NoteBlock[];
  driveFileId?: string; // ID asignado por Google Drive
  syncStatus?: 'synced' | 'pending' | 'syncing' | 'error';
}

export interface Tag {
  id: string;
  name: string;
  color: string;
  parentId?: string;
}

export type EventRepeat = 'none' | 'monthly' | 'yearly';

export interface AppEvent {
  id: string;
  title: string;
  description?: string;
  date: string; // YYYY-MM-DD
  time?: string; // HH:mm or undefined/empty for all-day
  repeat: EventRepeat;
  createdAt: string;
  updatedAt: string;
  driveFileId?: string;
  syncStatus?: 'synced' | 'pending' | 'syncing' | 'error';
  deleted?: boolean;
}

export interface SyncQueueItem {
  id?: number;
  noteId: string;
  action: 'upsert' | 'delete';
  queuedAt: number;
}

export class NotasDatabase extends Dexie {
  notes!: Table<Note, string>;
  tags!: Table<Tag, string>;
  syncQueue!: Table<SyncQueueItem, number>;
  events!: Table<AppEvent, string>;

  constructor() {
    super('AppNotasPersonalDB');
    this.version(1).stores({
      notes: 'id, title, tag, pinned, deleted, updatedAt, createdAt, syncStatus, driveFileId',
      tags: 'id, name',
      syncQueue: '++id, noteId, action, queuedAt',
    });
    this.version(2).stores({
      tags: 'id, name, parentId',
    });
    this.version(3).stores({
      events: 'id, date, repeat, deleted, updatedAt, createdAt, syncStatus, driveFileId',
    });
  }
}

export const db = new NotasDatabase();

/**
 * Reduce la saturación de un color HEX o RGB manteniendo el tono y brillo
 */
export function desaturateColor(hexOrRgb: string, saturationRatio = 0.45): string {
  if (!hexOrRgb) return '#8A8478';
  let hex = hexOrRgb.replace('#', '').trim();
  if (hex.length === 3) {
    hex = hex.split('').map((c) => c + c).join('');
  }
  const num = parseInt(hex, 16);
  if (isNaN(num)) return hexOrRgb;
  const r = (num >> 16) / 255;
  const g = ((num >> 8) & 0xff) / 255;
  const b = (num & 0xff) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }
    h /= 6;
  }
  const newS = Math.round(s * saturationRatio * 100);
  const newH = Math.round(h * 360);
  const newL = Math.round(l * 100);
  return `hsl(${newH}, ${newS}%, ${newL}%)`;
}

/**
 * Inicializa etiquetas por defecto y notas de bienvenida si la base de datos está vacía
 */
export async function seedInitialData() {
  const now = new Date().toISOString();
  const tagsCount = await db.tags.count();
  if (tagsCount === 0) {
    await db.tags.bulkAdd([
      { id: 'importante', name: 'Importante', color: '#B4553F' },
      { id: 'casa', name: 'Casa', color: '#C98A3D' },
      { id: 'proyecto', name: 'Proyecto', color: '#3F6E64' },
      { id: 'personal', name: 'Personal', color: '#5B7DB1' },
      { id: 'sin-etiqueta', name: 'Sin etiqueta', color: '#8A8478' },
    ]);
  }

  const notesCount = await db.notes.count();
  if (notesCount === 0) {
    await db.notes.bulkAdd([
      {
        id: 'note_compra',
        title: 'Compra semanal',
        tag: 'Casa',
        pinned: true,
        deleted: false,
        createdAt: now,
        updatedAt: now,
        syncStatus: 'pending',
        blocks: [
          {
            id: 'b1',
            type: 'checklist',
            items: [
              { id: 'c1', text: 'Leche de avena', checked: true },
              { id: 'c2', text: 'Tomates', checked: false },
              { id: 'c3', text: 'Café molido', checked: false },
              { id: 'c4', text: 'Detergente', checked: true },
              { id: 'c5', text: 'Pan de molde', checked: false },
            ],
          },
        ],
      },
      {
        id: 'note_arquitectura',
        title: 'Arquitectura app notas',
        tag: 'Proyecto',
        pinned: true,
        deleted: false,
        createdAt: now,
        updatedAt: now,
        syncStatus: 'pending',
        blocks: [
          {
            id: 'b2',
            type: 'heading',
            content: 'Decisiones de diseño',
          },
          {
            id: 'b3',
            type: 'text',
            content: 'Guardar en Drive, **un JSON por nota**. Offline-first con IndexedDB (Dexie).',
          },
          {
            id: 'b4',
            type: 'checklist',
            items: [
              { id: 'c6', text: 'Validar OAuth 2.0 y Drive API', checked: true },
              { id: 'c7', text: 'Crear base de datos IndexedDB local', checked: true },
              { id: 'c8', text: 'Implementar interfaz de 3 columnas', checked: false },
              { id: 'c9', text: 'Sincronizar cambios en segundo plano', checked: false },
            ],
          },
        ],
      },
      {
        id: 'note_ideas_finde',
        title: 'Ideas para el finde',
        tag: 'Personal',
        pinned: false,
        deleted: false,
        createdAt: now,
        updatedAt: now,
        syncStatus: 'pending',
        blocks: [
          {
            id: 'b5',
            type: 'text',
            content: 'Ruta por el monte, llevar la cámara buena. Mirar previsión del viernes.',
          },
        ],
      },
    ]);
  }

  const eventsCount = await db.events.count();
  if (eventsCount === 0) {
    const todayStr = new Date().toISOString().split('T')[0];
    await db.events.add({
      id: `event_sample_1`,
      title: 'Cena con Marta',
      description: 'Reservar mesa en el restaurante de la plaza',
      date: todayStr,
      time: '20:30',
      repeat: 'none',
      createdAt: now,
      updatedAt: now,
      syncStatus: 'pending',
      deleted: false,
    });
  }
}
