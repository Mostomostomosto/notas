import React, { useRef, useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, Note, NoteBlock, ChecklistItem, ChecklistBlock, Tag } from '../db/db';
import { scheduleSync } from '../services/syncEngine';
import {
  Pin,
  Tag as TagIcon,
  Trash2,
  Plus,
  Type,
  Heading,
  CheckSquare,
  Image as ImageIcon,
  RotateCcw,
  Check,
  X,
  Undo2,
  Redo2,
} from 'lucide-react';

interface NoteDetailProps {
  note: Note | null;
  token: string | null;
  onNoteDeleted?: (deletedNote: Note) => void;
}

interface NoteSnapshot {
  title: string;
  tag: string;
  pinned: boolean;
  deleted: boolean;
  blocks: NoteBlock[];
}

const createSnapshot = (n: Note): NoteSnapshot => ({
  title: n.title,
  tag: n.tag,
  pinned: n.pinned,
  deleted: n.deleted,
  blocks: JSON.parse(JSON.stringify(n.blocks)),
});

export const NoteDetail: React.FC<NoteDetailProps> = ({ note, token, onNoteDeleted }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const itemInputsRef = useRef<Map<string, HTMLInputElement>>(new Map());
  const [focusItemId, setFocusItemId] = useState<string | null>(null);
  const tags = useLiveQuery(() => db.tags.toArray()) || [];

  // Estado local sincronizado para garantizar que la edición y la posición del cursor no salten
  const [localNote, setLocalNote] = useState<Note | null>(note);
  const pendingSaveRef = useRef<Note | null>(null);
  const saveTimeoutRef = useRef<number | null>(null);

  // Sincronizar si cambia la nota seleccionada o si llega una actualización externa
  useEffect(() => {
    if (note) {
      if (!localNote || note.id !== localNote.id || (!pendingSaveRef.current && note.updatedAt !== localNote.updatedAt)) {
        setLocalNote(note);
      }
    } else {
      setLocalNote(null);
    }
  }, [note]);

  // Guardar inmediatamente cualquier cambio pendiente al desmontar o cambiar de nota
  const flushSave = () => {
    if (saveTimeoutRef.current) {
      window.clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }
    if (pendingSaveRef.current) {
      const toSave = pendingSaveRef.current;
      pendingSaveRef.current = null;
      db.notes.update(toSave.id, {
        title: toSave.title,
        tag: toSave.tag,
        pinned: toSave.pinned,
        deleted: toSave.deleted,
        blocks: toSave.blocks,
        updatedAt: toSave.updatedAt,
        syncStatus: 'pending',
      });
      scheduleSync(token);
    }
  };

  useEffect(() => {
    return () => {
      flushSave();
    };
  }, []);

  // Guardado con debounce para eventos de tecleo continuo (evita recargas que alteren el cursor)
  const saveChangesDebounced = (updatedNote: Note) => {
    pendingSaveRef.current = updatedNote;
    if (saveTimeoutRef.current) {
      window.clearTimeout(saveTimeoutRef.current);
    }
    saveTimeoutRef.current = window.setTimeout(() => {
      flushSave();
    }, 300);
  };

  // Guardado inmediato para acciones explícitas (añadir elemento, marcar casilla, fijar, etc.)
  const saveChangesImmediate = async (updatedNote: Note) => {
    if (saveTimeoutRef.current) {
      window.clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }
    pendingSaveRef.current = null;
    setLocalNote(updatedNote);
    await db.notes.update(updatedNote.id, {
      title: updatedNote.title,
      tag: updatedNote.tag,
      pinned: updatedNote.pinned,
      deleted: updatedNote.deleted,
      blocks: updatedNote.blocks,
      updatedAt: updatedNote.updatedAt,
      syncStatus: 'pending',
    });
    scheduleSync(token);
  };

  // Efecto para enfocar automáticamente solo cuando se crea un nuevo elemento de checklist
  useEffect(() => {
    if (focusItemId) {
      const timer = setTimeout(() => {
        const el = itemInputsRef.current.get(focusItemId);
        if (el) {
          el.focus();
          const len = el.value.length;
          el.setSelectionRange(len, len);
        }
        setFocusItemId(null);
      }, 30);
      return () => clearTimeout(timer);
    }
  }, [focusItemId]);

  // Historial de cambios para Deshacer / Rehacer (Undo / Redo)
  const pastRef = useRef<NoteSnapshot[]>([]);
  const futureRef = useRef<NoteSnapshot[]>([]);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const typingBaselineRef = useRef<NoteSnapshot | null>(null);
  const typingTimerRef = useRef<number | null>(null);

  // Reiniciar historial al cambiar de nota
  const currentNoteIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (note?.id !== currentNoteIdRef.current) {
      currentNoteIdRef.current = note?.id || null;
      pastRef.current = [];
      futureRef.current = [];
      typingBaselineRef.current = null;
      if (typingTimerRef.current) {
        window.clearTimeout(typingTimerRef.current);
        typingTimerRef.current = null;
      }
      setCanUndo(false);
      setCanRedo(false);
    }
  }, [note?.id]);

  // Guardar instantánea antes de una acción discreta (añadir bloque, eliminar bloque, fijar, etc.)
  const pushDiscreteSnapshot = () => {
    if (!localNote) return;
    if (typingBaselineRef.current) {
      pastRef.current.push(typingBaselineRef.current);
      typingBaselineRef.current = null;
      if (typingTimerRef.current) {
        window.clearTimeout(typingTimerRef.current);
        typingTimerRef.current = null;
      }
    }
    pastRef.current.push(createSnapshot(localNote));
    if (pastRef.current.length > 50) pastRef.current.shift();
    futureRef.current = [];
    setCanUndo(true);
    setCanRedo(false);
  };

  // Registrar inicio de tecleo para agrupar palabras en el historial
  const registerTypingChange = () => {
    if (!localNote) return;
    if (!typingBaselineRef.current) {
      typingBaselineRef.current = createSnapshot(localNote);
    }
    if (typingTimerRef.current) {
      window.clearTimeout(typingTimerRef.current);
    }
    typingTimerRef.current = window.setTimeout(() => {
      if (typingBaselineRef.current) {
        pastRef.current.push(typingBaselineRef.current);
        if (pastRef.current.length > 50) pastRef.current.shift();
        futureRef.current = [];
        setCanUndo(true);
        setCanRedo(false);
        typingBaselineRef.current = null;
      }
      typingTimerRef.current = null;
    }, 700);
  };

  const handleUndo = () => {
    if (!localNote) return;
    if (typingTimerRef.current) {
      window.clearTimeout(typingTimerRef.current);
      typingTimerRef.current = null;
    }
    if (typingBaselineRef.current) {
      pastRef.current.push(typingBaselineRef.current);
      typingBaselineRef.current = null;
    }

    if (pastRef.current.length === 0) return;

    if (saveTimeoutRef.current) {
      window.clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }
    pendingSaveRef.current = null;

    const currentSnapshot = createSnapshot(localNote);
    futureRef.current.push(currentSnapshot);
    if (futureRef.current.length > 50) futureRef.current.shift();

    const prevSnapshot = pastRef.current.pop()!;
    const restored: Note = {
      ...localNote,
      title: prevSnapshot.title,
      tag: prevSnapshot.tag,
      pinned: prevSnapshot.pinned,
      deleted: prevSnapshot.deleted,
      blocks: prevSnapshot.blocks,
      updatedAt: new Date().toISOString(),
    };

    setLocalNote(restored);
    saveChangesImmediate(restored);

    setCanUndo(pastRef.current.length > 0);
    setCanRedo(true);
  };

  const handleRedo = () => {
    if (!localNote || futureRef.current.length === 0) return;

    if (saveTimeoutRef.current) {
      window.clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }
    pendingSaveRef.current = null;

    const currentSnapshot = createSnapshot(localNote);
    pastRef.current.push(currentSnapshot);
    if (pastRef.current.length > 50) pastRef.current.shift();

    const nextSnapshot = futureRef.current.pop()!;
    const restored: Note = {
      ...localNote,
      title: nextSnapshot.title,
      tag: nextSnapshot.tag,
      pinned: nextSnapshot.pinned,
      deleted: nextSnapshot.deleted,
      blocks: nextSnapshot.blocks,
      updatedAt: new Date().toISOString(),
    };

    setLocalNote(restored);
    saveChangesImmediate(restored);

    setCanUndo(true);
    setCanRedo(futureRef.current.length > 0);
  };

  const handleUndoRef = useRef(handleUndo);
  handleUndoRef.current = handleUndo;
  const handleRedoRef = useRef(handleRedo);
  handleRedoRef.current = handleRedo;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (localNote?.deleted) return;
      const isCtrlOrCmd = e.ctrlKey || e.metaKey;
      if (!isCtrlOrCmd) return;

      if (!e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        handleUndoRef.current();
      } else if (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z')) {
        e.preventDefault();
        handleRedoRef.current();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [localNote?.deleted]);

  if (!localNote) {
    return (
      <div className="flex-1 bg-white flex flex-col items-center justify-center p-8 text-[#8A8478]">
        <div className="w-16 h-16 rounded-2xl bg-[#F7F4EE] border border-[#E4DECE] flex items-center justify-center mb-4 text-[#8A8478]">
          <CheckSquare className="w-8 h-8 opacity-40" />
        </div>
        <h3 className="font-semibold text-base text-[#2B2A28] mb-1">Ninguna nota seleccionada</h3>
        <p className="text-xs text-[#8A8478]">Selecciona una nota de la lista o crea una nueva.</p>
      </div>
    );
  }

  // Toggle fijar / desfijar
  const handleTogglePin = () => {
    pushDiscreteSnapshot();
    const updated: Note = {
      ...localNote,
      pinned: !localNote.pinned,
      updatedAt: new Date().toISOString(),
    };
    saveChangesImmediate(updated);
  };

  // Cambiar etiqueta
  const handleSelectTag = (tagName: string) => {
    pushDiscreteSnapshot();
    const updated: Note = {
      ...localNote,
      tag: tagName,
      updatedAt: new Date().toISOString(),
    };
    saveChangesImmediate(updated);
  };

  // Mover a papelera o restaurar
  const handleToggleDelete = async () => {
    const isDeleting = !localNote.deleted;
    const updated: Note = {
      ...localNote,
      deleted: isDeleting,
      updatedAt: new Date().toISOString(),
    };
    await saveChangesImmediate(updated);
    if (isDeleting) {
      onNoteDeleted?.(updated);
    }
  };

  // Eliminar definitivamente
  const handlePermanentDelete = async () => {
    if (window.confirm('¿Seguro que deseas eliminar definitivamente esta nota?')) {
      if (saveTimeoutRef.current) {
        window.clearTimeout(saveTimeoutRef.current);
      }
      pendingSaveRef.current = null;
      await db.notes.delete(localNote.id);
      onNoteDeleted?.(localNote);
    }
  };

  // Cambiar título (actualización síncrona en localNote para mantener el cursor en su sitio)
  const handleTitleChange = (newTitle: string) => {
    registerTypingChange();
    const updated: Note = {
      ...localNote,
      title: newTitle,
      updatedAt: new Date().toISOString(),
    };
    setLocalNote(updated);
    saveChangesDebounced(updated);
  };

  // Manipulación de bloques
  const handleAddBlock = (type: 'heading' | 'text' | 'checklist') => {
    pushDiscreteSnapshot();
    const newBlockId = `b_${Date.now()}`;
    let newBlock: NoteBlock;

    if (type === 'heading') {
      newBlock = { id: newBlockId, type: 'heading', content: '' };
    } else if (type === 'checklist') {
      const newCheckId = `c_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      newBlock = {
        id: newBlockId,
        type: 'checklist',
        items: [{ id: newCheckId, text: '', checked: false }],
      };
      setFocusItemId(newCheckId);
    } else {
      newBlock = { id: newBlockId, type: 'text', content: '' };
    }

    const updated: Note = {
      ...localNote,
      blocks: [...localNote.blocks, newBlock],
      updatedAt: new Date().toISOString(),
    };
    saveChangesImmediate(updated);
  };

  const handleUpdateBlockContent = (blockId: string, newContent: string) => {
    registerTypingChange();
    const updatedBlocks = localNote.blocks.map((b) => {
      if (b.id === blockId && (b.type === 'heading' || b.type === 'text')) {
        return { ...b, content: newContent };
      }
      return b;
    });
    const updated: Note = {
      ...localNote,
      blocks: updatedBlocks,
      updatedAt: new Date().toISOString(),
    };
    setLocalNote(updated);
    saveChangesDebounced(updated);
  };

  const handleDeleteBlock = (blockId: string) => {
    pushDiscreteSnapshot();
    const updated: Note = {
      ...localNote,
      blocks: localNote.blocks.filter((b) => b.id !== blockId),
      updatedAt: new Date().toISOString(),
    };
    saveChangesImmediate(updated);
  };

  // Manipulación de items de checklist
  const handleToggleCheckItem = (blockId: string, itemIndex: number) => {
    pushDiscreteSnapshot();
    const updatedBlocks = localNote.blocks.map((b) => {
      if (b.id === blockId && b.type === 'checklist') {
        const newItems = [...b.items];
        newItems[itemIndex] = {
          ...newItems[itemIndex],
          checked: !newItems[itemIndex].checked,
        };
        return { ...b, items: newItems };
      }
      return b;
    });
    const updated: Note = {
      ...localNote,
      blocks: updatedBlocks,
      updatedAt: new Date().toISOString(),
    };
    saveChangesImmediate(updated);
  };

  const handleUpdateCheckItemText = (
    blockId: string,
    itemIndex: number,
    newText: string
  ) => {
    registerTypingChange();
    const updatedBlocks = localNote.blocks.map((b) => {
      if (b.id === blockId && b.type === 'checklist') {
        const newItems = [...b.items];
        newItems[itemIndex] = { ...newItems[itemIndex], text: newText };
        return { ...b, items: newItems };
      }
      return b;
    });
    const updated: Note = {
      ...localNote,
      blocks: updatedBlocks,
      updatedAt: new Date().toISOString(),
    };
    setLocalNote(updated);
    saveChangesDebounced(updated);
  };

  const handleAddCheckItem = (blockId: string, afterIndex?: number) => {
    pushDiscreteSnapshot();
    const newId = `c_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const updatedBlocks = localNote.blocks.map((b) => {
      if (b.id === blockId && b.type === 'checklist') {
        const newItem: ChecklistItem = {
          id: newId,
          text: '',
          checked: false,
        };
        const newItems = [...b.items];
        if (afterIndex !== undefined) {
          newItems.splice(afterIndex + 1, 0, newItem);
        } else {
          newItems.push(newItem);
        }
        return { ...b, items: newItems };
      }
      return b;
    });
    const updated: Note = {
      ...localNote,
      blocks: updatedBlocks,
      updatedAt: new Date().toISOString(),
    };
    setFocusItemId(newId);
    saveChangesImmediate(updated);
  };

  const handleDeleteCheckItem = (blockId: string, itemIndex: number) => {
    pushDiscreteSnapshot();
    const targetBlock = localNote.blocks.find(
      (b) => b.id === blockId && b.type === 'checklist'
    ) as ChecklistBlock | undefined;

    if (targetBlock && itemIndex > 0) {
      const prevItem = targetBlock.items[itemIndex - 1];
      const prevId = prevItem?.id || `${blockId}_${itemIndex - 1}`;
      setFocusItemId(prevId);
    }

    const updatedBlocks = localNote.blocks.map((b) => {
      if (b.id === blockId && b.type === 'checklist') {
        const newItems = b.items.filter((_, idx) => idx !== itemIndex);
        return { ...b, items: newItems };
      }
      return b;
    });
    const updated: Note = {
      ...localNote,
      blocks: updatedBlocks,
      updatedAt: new Date().toISOString(),
    };
    saveChangesImmediate(updated);
  };

  // Subir imagen local
  const handleImageSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    pushDiscreteSnapshot();
    const reader = new FileReader();
    reader.onload = () => {
      const localUrl = reader.result as string;
      const newBlock: NoteBlock = {
        id: `img_${Date.now()}`,
        type: 'image',
        localUrl,
        caption: file.name,
      };
      const updated: Note = {
        ...localNote,
        blocks: [...localNote.blocks, newBlock],
        updatedAt: new Date().toISOString(),
      };
      saveChangesImmediate(updated);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleUpdateCaption = (blockId: string, newCaption: string) => {
    registerTypingChange();
    const updatedBlocks = localNote.blocks.map((b) => {
      if (b.id === blockId && b.type === 'image') {
        return { ...b, caption: newCaption };
      }
      return b;
    });
    const updated: Note = {
      ...localNote,
      blocks: updatedBlocks,
      updatedAt: new Date().toISOString(),
    };
    setLocalNote(updated);
    saveChangesDebounced(updated);
  };

  const activeTag = tags.find((t) => t.name.toLowerCase() === localNote.tag?.toLowerCase());

  return (
    <div className="flex-1 bg-white flex flex-col h-full min-w-0">
      {/* Top Toolbar */}
      <div className="px-8 py-3 border-b border-[#E4DECE] flex items-center justify-between">
        <div className="flex items-center gap-2">
          {localNote.deleted ? (
            <span className="text-xs bg-[#B4553F]/10 text-[#B4553F] px-2 py-1 rounded font-medium">
              Nota en la Papelera
            </span>
          ) : (
            <button
              onClick={handleTogglePin}
              className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border transition-all cursor-pointer ${
                localNote.pinned
                  ? 'border-[#C98A3D] bg-[#C98A3D]/10 text-[#C98A3D] font-semibold'
                  : 'border-[#E4DECE] text-[#8A8478] hover:border-[#2B2A28] hover:text-[#2B2A28]'
              }`}
            >
              <Pin className="w-3.5 h-3.5" />
              <span>{localNote.pinned ? 'Fijada' : 'Fijar'}</span>
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Tag Selector */}
          {!localNote.deleted && (
            <div className="relative group">
              <button className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-[#E4DECE] text-[#8A8478] hover:border-[#2B2A28] hover:text-[#2B2A28] transition-all">
                <TagIcon className="w-3.5 h-3.5" />
                <span>{localNote.tag || 'Etiqueta'}</span>
              </button>

              {/* Dropdown de etiquetas */}
              <div className="hidden group-hover:block absolute right-0 top-full mt-1 bg-white border border-[#E4DECE] rounded-xl shadow-lg p-1.5 z-30 min-w-[140px]">
                {tags.map((t: Tag) => (
                  <button
                    key={t.id}
                    onClick={() => handleSelectTag(t.name)}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs rounded-lg hover:bg-[#F7F4EE] text-[#2B2A28] text-left"
                  >
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: t.color }}
                    />
                    <span>{t.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Delete / Restore Button */}
          {localNote.deleted ? (
            <div className="flex items-center gap-1.5">
              <button
                onClick={handleToggleDelete}
                className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-[#3F6E64] text-white hover:bg-[#345b53] transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Restaurar</span>
              </button>
              <button
                onClick={handlePermanentDelete}
                className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-[#B4553F] text-white hover:bg-[#964431] transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Eliminar definitiva</span>
              </button>
            </div>
          ) : (
            <button
              onClick={handleToggleDelete}
              className="p-1.5 text-[#8A8478] hover:text-[#B4553F] hover:bg-[#F7F4EE] rounded-lg transition-colors cursor-pointer"
              title="Mover a papelera"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Block Toolbar */}
      {!localNote.deleted && (
        <div className="px-4 sm:px-8 py-2 bg-[#F7F4EE]/60 border-b border-[#E4DECE] flex items-center justify-between gap-2 overflow-x-auto">
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={() => handleAddBlock('heading')}
              className="flex items-center gap-1.5 text-xs px-2 py-1 rounded hover:bg-white border border-transparent hover:border-[#E4DECE] text-[#2B2A28] transition-all cursor-pointer"
            >
              <Heading className="w-3.5 h-3.5 text-[#8A8478]" />
              <span>Encabezado</span>
            </button>

            <button
              onClick={() => handleAddBlock('text')}
              className="flex items-center gap-1.5 text-xs px-2 py-1 rounded hover:bg-white border border-transparent hover:border-[#E4DECE] text-[#2B2A28] transition-all cursor-pointer"
            >
              <Type className="w-3.5 h-3.5 text-[#8A8478]" />
              <span>Texto</span>
            </button>

            <button
              onClick={() => handleAddBlock('checklist')}
              className="flex items-center gap-1.5 text-xs px-2 py-1 rounded hover:bg-white border border-transparent hover:border-[#E4DECE] text-[#2B2A28] transition-all cursor-pointer"
            >
              <CheckSquare className="w-3.5 h-3.5 text-[#8A8478]" />
              <span>Lista</span>
            </button>

            <div className="w-[1px] h-4 bg-[#E4DECE] mx-1" />

            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1.5 text-xs px-2 py-1 rounded hover:bg-white border border-transparent hover:border-[#E4DECE] text-[#2B2A28] transition-all cursor-pointer"
            >
              <ImageIcon className="w-3.5 h-3.5 text-[#8A8478]" />
              <span>Imagen</span>
            </button>
          </div>

          {/* Undo / Redo controls */}
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              type="button"
              onClick={handleUndo}
              disabled={!canUndo}
              className={`flex items-center gap-1 text-xs px-2 py-1 rounded transition-all ${
                canUndo
                  ? 'text-[#2B2A28] hover:bg-white border border-transparent hover:border-[#E4DECE] cursor-pointer'
                  : 'text-[#8A8478]/30 cursor-not-allowed border border-transparent'
              }`}
              title="Deshacer (Ctrl+Z)"
            >
              <Undo2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Deshacer</span>
            </button>
            <button
              type="button"
              onClick={handleRedo}
              disabled={!canRedo}
              className={`flex items-center gap-1 text-xs px-2 py-1 rounded transition-all ${
                canRedo
                  ? 'text-[#2B2A28] hover:bg-white border border-transparent hover:border-[#E4DECE] cursor-pointer'
                  : 'text-[#8A8478]/30 cursor-not-allowed border border-transparent'
              }`}
              title="Rehacer (Ctrl+Y)"
            >
              <Redo2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Rehacer</span>
            </button>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleImageSelected}
            className="hidden"
          />
        </div>
      )}

      {/* Editor Content Area */}
      <div className="flex-1 overflow-y-auto px-8 py-8 max-w-3xl w-full select-text">
        {/* Title Input */}
        <input
          type="text"
          value={localNote.title}
          disabled={localNote.deleted}
          onChange={(e) => handleTitleChange(e.target.value)}
          placeholder="Título de la nota..."
          className="w-full text-2xl font-bold text-[#2B2A28] outline-none border-none placeholder-[#8A8478]/50 mb-2 font-sans bg-transparent"
        />

        {/* Note Metadata */}
        <div className="flex items-center gap-3 text-xs text-[#8A8478] mb-6 pb-4 border-b border-[#E4DECE]/50">
          {localNote.tag && (
            <span className="flex items-center gap-1.5 bg-[#F7F4EE] border border-[#E4DECE] px-2.5 py-0.5 rounded-full font-medium text-[11px] text-[#2B2A28]">
              <span
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: activeTag?.color || '#8A8478' }}
              />
              {localNote.tag}
            </span>
          )}
          <span>
            Editada {new Date(localNote.updatedAt).toLocaleString([], {
              day: 'numeric',
              month: 'short',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
          {localNote.syncStatus === 'synced' && (
            <span className="text-[#3F6E64] flex items-center gap-1">
              <Check className="w-3 h-3" /> Guardada en Drive
            </span>
          )}
        </div>

        {/* Blocks rendering */}
        <div className="space-y-4">
          {localNote.blocks.map((block) => (
            <div key={block.id} className="relative group">
              {/* Delete block action on hover */}
              {!localNote.deleted && (
                <button
                  onClick={() => handleDeleteBlock(block.id)}
                  className="opacity-0 group-hover:opacity-100 absolute -left-7 top-1 text-[#8A8478] hover:text-[#B4553F] p-1 rounded transition-opacity"
                  title="Eliminar bloque"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}

              {/* Heading block */}
              {block.type === 'heading' && (
                <input
                  type="text"
                  value={block.content}
                  disabled={localNote.deleted}
                  onChange={(e) => handleUpdateBlockContent(block.id, e.target.value)}
                  placeholder="Encabezado..."
                  className="w-full text-lg font-bold text-[#2B2A28] outline-none bg-transparent placeholder-[#8A8478]/40 border-b border-transparent focus:border-[#E4DECE]"
                />
              )}

              {/* Text block */}
              {block.type === 'text' && (
                <textarea
                  value={block.content}
                  disabled={localNote.deleted}
                  onChange={(e) => handleUpdateBlockContent(block.id, e.target.value)}
                  placeholder="Escribe aquí... usa **negrita** para resaltar"
                  rows={Math.max(2, block.content.split('\n').length)}
                  className="w-full text-sm leading-relaxed text-[#2B2A28] outline-none bg-transparent resize-none placeholder-[#8A8478]/40 font-sans"
                />
              )}

              {/* Checklist block */}
              {block.type === 'checklist' && (
                <div className="space-y-1.5">
                  {block.items.map((item, idx) => {
                    const itemId = item.id || `${block.id}_${idx}`;
                    return (
                      <div key={itemId} className="flex items-center gap-2 group/item">
                        <button
                          type="button"
                          disabled={localNote.deleted}
                          onClick={() => handleToggleCheckItem(block.id, idx)}
                          className={`w-4 h-4 rounded border flex items-center justify-center transition-all shrink-0 cursor-pointer ${
                            item.checked
                              ? 'bg-[#3F6E64] border-[#3F6E64] text-white'
                              : 'border-[#8A8478] hover:border-[#2B2A28] bg-white'
                          }`}
                        >
                          {item.checked && <Check className="w-3 h-3 stroke-[3]" />}
                        </button>

                        <input
                          ref={(el) => {
                            if (el) {
                              itemInputsRef.current.set(itemId, el);
                            } else {
                              itemInputsRef.current.delete(itemId);
                            }
                          }}
                          type="text"
                          value={item.text}
                          disabled={localNote.deleted}
                          onChange={(e) =>
                            handleUpdateCheckItemText(block.id, idx, e.target.value)
                          }
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.keyCode === 13) {
                              e.preventDefault();
                              handleAddCheckItem(block.id, idx);
                            } else if (
                              e.key === 'Backspace' &&
                              !item.text &&
                              block.items.length > 1
                            ) {
                              e.preventDefault();
                              handleDeleteCheckItem(block.id, idx);
                            }
                          }}
                          placeholder="Elemento de lista..."
                          className={`w-full text-sm outline-none bg-transparent ${
                            item.checked
                              ? 'line-through text-[#8A8478]'
                              : 'text-[#2B2A28]'
                          }`}
                        />

                        {!localNote.deleted && block.items.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleDeleteCheckItem(block.id, idx)}
                            className="opacity-0 group-hover/item:opacity-100 text-[#8A8478] hover:text-[#B4553F] p-0.5"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    );
                  })}

                  {!localNote.deleted && (
                    <button
                      type="button"
                      onClick={() => handleAddCheckItem(block.id)}
                      className="flex items-center gap-2 text-xs text-[#8A8478] hover:text-[#2B2A28] pt-1 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Añadir elemento</span>
                    </button>
                  )}
                </div>
              )}

              {/* Image block */}
              {block.type === 'image' && (
                <div className="space-y-1.5 my-2">
                  {block.localUrl ? (
                    <img
                      src={block.localUrl}
                      alt={block.caption || 'Imagen de la nota'}
                      className="max-h-72 max-w-md rounded-xl border border-[#E4DECE] object-cover shadow-xs"
                    />
                  ) : (
                    <div className="p-8 border border-dashed border-[#E4DECE] rounded-xl text-center text-xs text-[#8A8478]">
                      Imagen guardada en Google Drive (ID: {block.driveFileId})
                    </div>
                  )}
                  <input
                    type="text"
                    value={block.caption || ''}
                    disabled={localNote.deleted}
                    onChange={(e) => handleUpdateCaption(block.id, e.target.value)}
                    placeholder="Pie de foto opcional..."
                    className="text-xs text-[#8A8478] outline-none bg-transparent w-full italic"
                  />
                </div>
              )}
            </div>
          ))}

          {/* Quick Add block buttons if empty */}
          {localNote.blocks.length === 0 && !localNote.deleted && (
            <div className="border border-dashed border-[#E4DECE] rounded-xl p-6 text-center text-[#8A8478] space-y-3">
              <p className="text-xs">Esta nota está vacía. Añade tu primer bloque:</p>
              <div className="flex items-center justify-center gap-2">
                <button
                  onClick={() => handleAddBlock('heading')}
                  className="px-3 py-1.5 bg-[#F7F4EE] hover:bg-[#EFEBE2] border border-[#E4DECE] rounded-lg text-xs font-medium text-[#2B2A28]"
                >
                  + Encabezado
                </button>
                <button
                  onClick={() => handleAddBlock('text')}
                  className="px-3 py-1.5 bg-[#F7F4EE] hover:bg-[#EFEBE2] border border-[#E4DECE] rounded-lg text-xs font-medium text-[#2B2A28]"
                >
                  + Párrafo
                </button>
                <button
                  onClick={() => handleAddBlock('checklist')}
                  className="px-3 py-1.5 bg-[#F7F4EE] hover:bg-[#EFEBE2] border border-[#E4DECE] rounded-lg text-xs font-medium text-[#2B2A28]"
                >
                  + Checklist
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
