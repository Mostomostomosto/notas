import React, { useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, Note, NoteBlock, ChecklistItem, Tag } from '../db/db';
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
} from 'lucide-react';

interface NoteDetailProps {
  note: Note | null;
  token: string | null;
  onNoteDeleted?: () => void;
}

export const NoteDetail: React.FC<NoteDetailProps> = ({ note, token, onNoteDeleted }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const tags = useLiveQuery(() => db.tags.toArray()) || [];

  if (!note) {
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

  // Guardar cambios en Dexie y encolar sincronización
  const saveChanges = async (updatedFields: Partial<Note>) => {
    const updatedNote: Partial<Note> = {
      ...updatedFields,
      updatedAt: new Date().toISOString(),
      syncStatus: 'pending',
    };
    await db.notes.update(note.id, updatedNote);
    scheduleSync(token);
  };

  // Toggle fijar / desfijar
  const handleTogglePin = async () => {
    await saveChanges({ pinned: !note.pinned });
  };

  // Cambiar etiqueta
  const handleSelectTag = async (tagName: string) => {
    await saveChanges({ tag: tagName });
  };

  // Mover a papelera o restaurar
  const handleToggleDelete = async () => {
    if (note.deleted) {
      await saveChanges({ deleted: false });
    } else {
      await saveChanges({ deleted: true });
      onNoteDeleted?.();
    }
  };

  // Eliminar definitivamente
  const handlePermanentDelete = async () => {
    if (window.confirm('¿Seguro que deseas eliminar definitivamente esta nota?')) {
      await db.notes.delete(note.id);
      onNoteDeleted?.();
    }
  };

  // Cambiar título
  const handleTitleChange = (newTitle: string) => {
    saveChanges({ title: newTitle });
  };

  // Manipulación de bloques
  const handleAddBlock = (type: 'heading' | 'text' | 'checklist') => {
    const newBlockId = `b_${Date.now()}`;
    let newBlock: NoteBlock;

    if (type === 'heading') {
      newBlock = { id: newBlockId, type: 'heading', content: '' };
    } else if (type === 'checklist') {
      newBlock = {
        id: newBlockId,
        type: 'checklist',
        items: [{ id: `c_${Date.now()}`, text: '', checked: false }],
      };
    } else {
      newBlock = { id: newBlockId, type: 'text', content: '' };
    }

    saveChanges({ blocks: [...note.blocks, newBlock] });
  };

  const handleUpdateBlockContent = (blockId: string, newContent: string) => {
    const updatedBlocks = note.blocks.map((b) => {
      if (b.id === blockId && (b.type === 'heading' || b.type === 'text')) {
        return { ...b, content: newContent };
      }
      return b;
    });
    saveChanges({ blocks: updatedBlocks });
  };

  const handleDeleteBlock = (blockId: string) => {
    saveChanges({ blocks: note.blocks.filter((b) => b.id !== blockId) });
  };

  // Manipulación de items de checklist
  const handleToggleCheckItem = (blockId: string, itemIndex: number) => {
    const updatedBlocks = note.blocks.map((b) => {
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
    saveChanges({ blocks: updatedBlocks });
  };

  const handleUpdateCheckItemText = (
    blockId: string,
    itemIndex: number,
    newText: string
  ) => {
    const updatedBlocks = note.blocks.map((b) => {
      if (b.id === blockId && b.type === 'checklist') {
        const newItems = [...b.items];
        newItems[itemIndex] = { ...newItems[itemIndex], text: newText };
        return { ...b, items: newItems };
      }
      return b;
    });
    saveChanges({ blocks: updatedBlocks });
  };

  const handleAddCheckItem = (blockId: string, afterIndex?: number) => {
    const updatedBlocks = note.blocks.map((b) => {
      if (b.id === blockId && b.type === 'checklist') {
        const newItem: ChecklistItem = {
          id: `c_${Date.now()}_${Math.random()}`,
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
    saveChanges({ blocks: updatedBlocks });
  };

  const handleDeleteCheckItem = (blockId: string, itemIndex: number) => {
    const updatedBlocks = note.blocks.map((b) => {
      if (b.id === blockId && b.type === 'checklist') {
        const newItems = b.items.filter((_, idx) => idx !== itemIndex);
        return { ...b, items: newItems };
      }
      return b;
    });
    saveChanges({ blocks: updatedBlocks });
  };

  // Subir imagen local
  const handleImageSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const localUrl = reader.result as string;
      const newBlock: NoteBlock = {
        id: `img_${Date.now()}`,
        type: 'image',
        localUrl,
        caption: file.name,
      };
      saveChanges({ blocks: [...note.blocks, newBlock] });
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const activeTag = tags.find((t) => t.name.toLowerCase() === note.tag?.toLowerCase());

  return (
    <div className="flex-1 bg-white flex flex-col h-full min-w-0">
      {/* Top Toolbar */}
      <div className="px-8 py-3 border-b border-[#E4DECE] flex items-center justify-between">
        <div className="flex items-center gap-2">
          {note.deleted ? (
            <span className="text-xs bg-[#B4553F]/10 text-[#B4553F] px-2 py-1 rounded font-medium">
              Nota en la Papelera
            </span>
          ) : (
            <button
              onClick={handleTogglePin}
              className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border transition-all cursor-pointer ${
                note.pinned
                  ? 'border-[#C98A3D] bg-[#C98A3D]/10 text-[#C98A3D] font-semibold'
                  : 'border-[#E4DECE] text-[#8A8478] hover:border-[#2B2A28] hover:text-[#2B2A28]'
              }`}
            >
              <Pin className="w-3.5 h-3.5" />
              <span>{note.pinned ? 'Fijada' : 'Fijar'}</span>
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Tag Selector */}
          {!note.deleted && (
            <div className="relative group">
              <button className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-[#E4DECE] text-[#8A8478] hover:border-[#2B2A28] hover:text-[#2B2A28] transition-all">
                <TagIcon className="w-3.5 h-3.5" />
                <span>{note.tag || 'Etiqueta'}</span>
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
          {note.deleted ? (
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
      {!note.deleted && (
        <div className="px-8 py-2 bg-[#F7F4EE]/60 border-b border-[#E4DECE] flex items-center gap-1">
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
      <div className="flex-1 overflow-y-auto px-8 py-8 max-w-3xl w-full">
        {/* Title Input */}
        <input
          type="text"
          value={note.title}
          disabled={note.deleted}
          onChange={(e) => handleTitleChange(e.target.value)}
          placeholder="Título de la nota..."
          className="w-full text-2xl font-bold text-[#2B2A28] outline-none border-none placeholder-[#8A8478]/50 mb-2 font-sans bg-transparent"
        />

        {/* Note Metadata */}
        <div className="flex items-center gap-3 text-xs text-[#8A8478] mb-6 pb-4 border-b border-[#E4DECE]/50">
          {note.tag && (
            <span className="flex items-center gap-1.5 bg-[#F7F4EE] border border-[#E4DECE] px-2.5 py-0.5 rounded-full font-medium text-[11px] text-[#2B2A28]">
              <span
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: activeTag?.color || '#8A8478' }}
              />
              {note.tag}
            </span>
          )}
          <span>
            Editada {new Date(note.updatedAt).toLocaleString([], {
              day: 'numeric',
              month: 'short',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
          {note.syncStatus === 'synced' && (
            <span className="text-[#3F6E64] flex items-center gap-1">
              <Check className="w-3 h-3" /> Guardada en Drive
            </span>
          )}
        </div>

        {/* Blocks rendering */}
        <div className="space-y-4">
          {note.blocks.map((block) => (
            <div key={block.id} className="relative group">
              {/* Delete block action on hover */}
              {!note.deleted && (
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
                  disabled={note.deleted}
                  onChange={(e) => handleUpdateBlockContent(block.id, e.target.value)}
                  placeholder="Encabezado..."
                  className="w-full text-lg font-bold text-[#2B2A28] outline-none bg-transparent placeholder-[#8A8478]/40 border-b border-transparent focus:border-[#E4DECE]"
                />
              )}

              {/* Text block */}
              {block.type === 'text' && (
                <textarea
                  value={block.content}
                  disabled={note.deleted}
                  onChange={(e) => handleUpdateBlockContent(block.id, e.target.value)}
                  placeholder="Escribe aquí... usa **negrita** para resaltar"
                  rows={Math.max(2, block.content.split('\n').length)}
                  className="w-full text-sm leading-relaxed text-[#2B2A28] outline-none bg-transparent resize-none placeholder-[#8A8478]/40 font-sans"
                />
              )}

              {/* Checklist block */}
              {block.type === 'checklist' && (
                <div className="space-y-1.5">
                  {block.items.map((item, idx) => (
                    <div key={item.id || idx} className="flex items-center gap-2 group/item">
                      <button
                        type="button"
                        disabled={note.deleted}
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
                        type="text"
                        value={item.text}
                        disabled={note.deleted}
                        onChange={(e) =>
                          handleUpdateCheckItemText(block.id, idx, e.target.value)
                        }
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
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

                      {!note.deleted && block.items.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleDeleteCheckItem(block.id, idx)}
                          className="opacity-0 group-hover/item:opacity-100 text-[#8A8478] hover:text-[#B4553F] p-0.5"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  ))}

                  {!note.deleted && (
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
                    disabled={note.deleted}
                    onChange={(e) => {
                      const updatedBlocks = note.blocks.map((b) => {
                        if (b.id === block.id && b.type === 'image') {
                          return { ...b, caption: e.target.value };
                        }
                        return b;
                      });
                      saveChanges({ blocks: updatedBlocks });
                    }}
                    placeholder="Pie de foto opcional..."
                    className="text-xs text-[#8A8478] outline-none bg-transparent w-full italic"
                  />
                </div>
              )}
            </div>
          ))}

          {/* Quick Add block buttons if empty */}
          {note.blocks.length === 0 && !note.deleted && (
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
