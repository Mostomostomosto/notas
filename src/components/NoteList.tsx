import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, Note, Tag } from '../db/db';
import { SidebarFilter } from './Sidebar';
import { Search, Plus, Pin, FileText, Image as ImageIcon } from 'lucide-react';

interface NoteListProps {
  currentFilter: SidebarFilter;
  notes: Note[];
  selectedNoteId: string | null;
  onSelectNote: (noteId: string) => void;
  onCreateNote: () => void;
}

export const NoteList: React.FC<NoteListProps> = ({
  currentFilter,
  notes,
  selectedNoteId,
  onSelectNote,
  onCreateNote,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const tags = useLiveQuery(() => db.tags.toArray()) || [];

  // Filtrar notas según el sidebar actual
  const filteredByView = notes.filter((note) => {
    if (currentFilter.type === 'trash') {
      return note.deleted === true;
    }
    if (note.deleted === true) return false;

    if (currentFilter.type === 'pinned') {
      return note.pinned === true;
    }
    if (currentFilter.type === 'tag') {
      const childTagNames = tags
        .filter((t: Tag) => t.parentId === currentFilter.tagId)
        .map((t: Tag) => t.name.toLowerCase());
      const noteTag = (note.tag || '').toLowerCase();
      return (
        noteTag === currentFilter.tagName.toLowerCase() ||
        childTagNames.includes(noteTag)
      );
    }
    return true; // 'all'
  });

  // Filtrar por texto de búsqueda (título y contenido de bloques)
  const query = searchQuery.trim().toLowerCase();
  const searchResults = filteredByView.filter((note) => {
    if (!query) return true;
    if (note.title.toLowerCase().includes(query)) return true;
    return note.blocks.some((b) => {
      if (b.type === 'heading' || b.type === 'text') {
        return b.content.toLowerCase().includes(query);
      }
      if (b.type === 'checklist') {
        return b.items.some((item) => item.text.toLowerCase().includes(query));
      }
      if (b.type === 'columns') {
        return (
          b.labels.some((l) => l.toLowerCase().includes(query)) ||
          b.rows.some((r) => r.some((cell) => cell.toLowerCase().includes(query)))
        );
      }
      return false;
    });
  });

  // Separar en fijadas y otras (si no estamos en vista 'pinned' ni 'trash')
  const showGrouped = currentFilter.type === 'all' || currentFilter.type === 'tag';
  const pinnedNotes = showGrouped ? searchResults.filter((n) => n.pinned) : [];
  const otherNotes = showGrouped ? searchResults.filter((n) => !n.pinned) : searchResults;

  // Formateador de fechas
  const formatNoteDate = (isoString: string) => {
    const d = new Date(isoString);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const isYesterday = d.toDateString() === yesterday.toDateString();

    const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (isToday) return `Hoy, ${timeStr}`;
    if (isYesterday) return `Ayer, ${timeStr}`;

    return d.toLocaleDateString([], { day: 'numeric', month: 'short' });
  };

  // Generador de preview del texto
  const getNotePreview = (note: Note) => {
    for (const b of note.blocks) {
      if (b.type === 'checklist' && b.items.length > 0) {
        return b.items
          .slice(0, 3)
          .map((i) => (i.checked ? `☑ ${i.text}` : `☐ ${i.text}`))
          .join(' · ');
      }
      if (b.type === 'text' && b.content.trim()) {
        return b.content.replace(/\*\*(.*?)\*\*/g, '$1');
      }
      if (b.type === 'heading' && b.content.trim()) {
        return b.content;
      }
      if (b.type === 'columns' && b.labels.length > 0) {
        if (b.rows.length > 0) {
          const firstRowFilled = b.rows[0].filter(Boolean);
          if (firstRowFilled.length > 0) return firstRowFilled.join(' · ');
        }
        return `Tabla: ${b.labels.join(' · ')}`;
      }
    }
    return 'Nota vacía';
  };

  // Obtener miniatura de imagen si tiene
  const getNoteThumbnail = (note: Note) => {
    const imgBlock = note.blocks.find((b) => b.type === 'image');
    if (!imgBlock || imgBlock.type !== 'image') return null;
    return imgBlock.localUrl || null;
  };

  const getViewTitle = () => {
    if (currentFilter.type === 'pinned') return 'Notas fijadas';
    if (currentFilter.type === 'trash') return 'Papelera';
    if (currentFilter.type === 'tag') return `Etiqueta: ${currentFilter.tagName}`;
    return 'Todas las notas';
  };

  return (
    <div className="w-80 bg-white border-r border-[#E4DECE] flex flex-col h-full min-w-0">
      {/* Header */}
      <div className="p-4 border-b border-[#E4DECE]">
        <div className="flex items-center justify-between mb-3">
          <h1 className="font-bold text-lg text-[#2B2A28] leading-tight truncate">
            {getViewTitle()}
          </h1>
          <span className="text-xs text-[#8A8478] font-medium shrink-0">
            {searchResults.length} {searchResults.length === 1 ? 'nota' : 'notas'}
          </span>
        </div>

        {/* Search input */}
        <div className="flex items-center gap-2 bg-[#F7F4EE] border border-[#E4DECE] rounded-lg px-2.5 py-1.5 mb-2.5 focus-within:border-[#3F6E64] transition-colors">
          <Search className="w-3.5 h-3.5 text-[#8A8478] shrink-0" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar en tus notas..."
            className="w-full text-xs bg-transparent outline-none text-[#2B2A28] placeholder-[#8A8478]"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="text-[10px] text-[#8A8478] hover:text-[#2B2A28]"
            >
              ✕
            </button>
          )}
        </div>

        {/* New note button */}
        {currentFilter.type !== 'trash' && (
          <button
            onClick={onCreateNote}
            className="w-full py-2 px-3 bg-[#2B2A28] hover:bg-black text-[#F7F4EE] rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-all shadow-xs cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Nueva nota</span>
          </button>
        )}
      </div>

      {/* Notes List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {searchResults.length === 0 ? (
          <div className="p-8 text-center text-[#8A8478]">
            <FileText className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-xs">No hay notas que mostrar</p>
          </div>
        ) : (
          <>
            {/* Pinned Group */}
            {pinnedNotes.length > 0 && (
              <div className="mb-2">
                <div className="text-[10px] uppercase font-bold tracking-wider text-[#8A8478] px-2.5 py-1 flex items-center gap-1">
                  <Pin className="w-3 h-3 text-[#C98A3D]" />
                  <span>Fijadas</span>
                </div>
                {pinnedNotes.map((note) => renderNoteCard(note))}
              </div>
            )}

            {/* Other Notes Group */}
            {otherNotes.length > 0 && (
              <div>
                {showGrouped && pinnedNotes.length > 0 && (
                  <div className="text-[10px] uppercase font-bold tracking-wider text-[#8A8478] px-2.5 py-1 mt-2">
                    Otras
                  </div>
                )}
                {otherNotes.map((note) => renderNoteCard(note))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );

  function renderNoteCard(note: Note) {
    const isSelected = selectedNoteId === note.id;
    const thumb = getNoteThumbnail(note);

    return (
      <div
        key={note.id}
        onClick={() => onSelectNote(note.id)}
        className={`p-3 rounded-xl cursor-pointer transition-all mb-1 flex items-start justify-between gap-3 ${
          isSelected
            ? 'bg-[#E4EEEC] text-[#2B2A28] ring-1 ring-[#3F6E64]/30 shadow-xs'
            : 'hover:bg-[#F7F4EE] text-[#2B2A28]'
        }`}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-1">
            {note.pinned && <span className="text-xs text-[#C98A3D]">📌</span>}
            <h3 className="text-xs font-semibold truncate">
              {note.title || 'Sin título'}
            </h3>
          </div>

          <p className="text-[11px] text-[#8A8478] line-clamp-2 leading-relaxed mb-1.5">
            {getNotePreview(note)}
          </p>

          <div className="flex items-center gap-2 text-[10px] text-[#8A8478]">
            <span>{formatNoteDate(note.updatedAt)}</span>
            <span>·</span>
            <span className="truncate">{note.tag || 'Sin etiqueta'}</span>
            {note.syncStatus === 'pending' && (
              <span className="w-1.5 h-1.5 rounded-full bg-[#C98A3D]" title="Pendiente de sincronizar" />
            )}
          </div>
        </div>

        {thumb ? (
          <img
            src={thumb}
            alt="Preview"
            className="w-10 h-10 rounded-lg object-cover border border-[#E4DECE] shrink-0"
          />
        ) : note.blocks.some((b) => b.type === 'image') ? (
          <div className="w-10 h-10 rounded-lg bg-[#EFEBE2] border border-[#E4DECE] flex items-center justify-center text-[#8A8478] shrink-0">
            <ImageIcon className="w-4 h-4" />
          </div>
        ) : null}
      </div>
    );
  }
};
