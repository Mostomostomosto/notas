import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  db,
  Note,
  Tag,
  isNoteArchived,
  getDescendantTags,
  getArchivedAncestor,
  desaturateColor,
} from '../db/db';
import { scheduleSync } from '../services/syncEngine';
import { SidebarFilter } from './Sidebar';
import {
  Search,
  Plus,
  Pin,
  FileText,
  Image as ImageIcon,
  Archive,
  Trash2,
  CornerDownRight,
  ChevronRight,
  Check,
} from 'lucide-react';

interface NoteListProps {
  currentFilter: SidebarFilter;
  notes: Note[];
  selectedNoteId: string | null;
  onSelectNote: (noteId: string) => void;
  onCreateNote: () => void;
  onDeleteNote: (note: Note) => void;
  token: string | null;
}

export const NoteList: React.FC<NoteListProps> = ({
  currentFilter,
  notes,
  selectedNoteId,
  onSelectNote,
  onCreateNote,
  onDeleteNote,
  token,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const tags = useLiveQuery(() => db.tags.toArray()) || [];

  interface NoteContextMenuInfo {
    x: number;
    y: number;
    note: Note;
  }
  const [contextMenu, setContextMenu] = useState<NoteContextMenuInfo | null>(null);
  const [isSubmenuOpen, setIsSubmenuOpen] = useState(false);

  const handleOpenContextMenu = (e: React.MouseEvent, note: Note) => {
    e.preventDefault();
    e.stopPropagation();
    const menuWidth = 200;
    const menuHeight = 160;
    const padding = 10;
    const x = Math.min(e.clientX, window.innerWidth - menuWidth - padding);
    const y = Math.min(e.clientY, window.innerHeight - menuHeight - padding);
    setContextMenu({ x, y, note });
    setIsSubmenuOpen(false);
  };

  const handleAssignTag = async (note: Note, newTagName: string) => {
    setContextMenu(null);
    setIsSubmenuOpen(false);
    await db.notes.update(note.id, {
      tag: newTagName,
      updatedAt: new Date().toISOString(),
      syncStatus: 'pending',
    });
    scheduleSync(token);
  };

  const handleTogglePin = async (note: Note) => {
    setContextMenu(null);
    setIsSubmenuOpen(false);
    await db.notes.update(note.id, {
      pinned: !note.pinned,
      updatedAt: new Date().toISOString(),
      syncStatus: 'pending',
    });
    scheduleSync(token);
  };

  const renderSubmenuTagItem = (t: Tag, depth: number = 0): React.ReactNode => {
    const children = tags.filter((c: Tag) => c.parentId === t.id && !c.archived);
    const isCurrent =
      contextMenu?.note.tag &&
      contextMenu.note.tag.toLowerCase() === t.name.toLowerCase();

    return (
      <div key={t.id}>
        <button
          type="button"
          onClick={() => handleAssignTag(contextMenu!.note, t.name)}
          className={`w-full flex items-center justify-between gap-1.5 pr-2 py-1.5 rounded-lg text-xs hover:bg-[#F7F4EE] transition-colors text-left cursor-pointer ${
            isCurrent ? 'bg-[#3F6E64]/10 text-[#3F6E64] font-semibold' : 'text-[#2B2A28]'
          }`}
          style={{ paddingLeft: `${10 + depth * 12}px` }}
        >
          <div className="flex items-center gap-2 min-w-0">
            <span
              className="rounded-full shrink-0 shadow-xs"
              style={{
                width: depth === 0 ? '8px' : '6px',
                height: depth === 0 ? '8px' : '6px',
                backgroundColor:
                  depth === 0
                    ? t.color
                    : desaturateColor(t.color, Math.min(0.65, 0.25 + depth * 0.15)),
              }}
            />
            <span className="truncate">{t.name}</span>
          </div>
          {isCurrent && <Check className="w-3 h-3 text-[#3F6E64] shrink-0" />}
        </button>
        {children.map((child: Tag) => renderSubmenuTagItem(child, depth + 1))}
      </div>
    );
  };

  // Filtrar notas según el sidebar actual
  const filteredByView = notes.filter((note) => {
    if (currentFilter.type === 'trash') {
      return note.deleted === true;
    }
    if (note.deleted === true) return false;

    if (currentFilter.type === 'pinned') {
      return note.pinned === true && !isNoteArchived(note.tag, tags);
    }
    if (currentFilter.type === 'tag') {
      const descendantTags = getDescendantTags(currentFilter.tagId, tags);
      const allTagNames = [
        currentFilter.tagName.toLowerCase(),
        ...descendantTags.map((t: Tag) => t.name.toLowerCase()),
      ];
      const noteTag = (note.tag || '').toLowerCase();
      return allTagNames.includes(noteTag);
    }
    return !isNoteArchived(note.tag, tags); // 'all'
  });

  // Filtrar por texto de búsqueda (título y contenido de bloques)
  const query = searchQuery.trim().toLowerCase();
  const searchResults = filteredByView.filter((note) => {
    if (!query) return true;
    if (note.title.toLowerCase().includes(query)) return true;
    return note.blocks.some((b) => {
      if (b.type === 'heading' || b.type === 'text') {
        const clean = b.content.replace(/<[^>]*>/g, ' ');
        return clean.toLowerCase().includes(query);
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
      if (b.type === 'markdown' && b.content) {
        const clean = b.content.replace(/<[^>]*>/g, ' ');
        return clean.toLowerCase().includes(query);
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
        const clean = b.content
          .replace(/<[^>]*>/g, ' ')
          .replace(/\*\*(.*?)\*\*/g, '$1')
          .replace(/&nbsp;/g, ' ')
          .trim();
        if (clean) return clean;
      }
      if (b.type === 'heading' && b.content.trim()) {
        const clean = b.content
          .replace(/<[^>]*>/g, ' ')
          .replace(/&nbsp;/g, ' ')
          .trim();
        if (clean) return clean;
      }
      if (b.type === 'columns' && b.labels.length > 0) {
        if (b.rows.length > 0) {
          const firstRowFilled = b.rows[0].filter(Boolean);
          if (firstRowFilled.length > 0) return firstRowFilled.join(' · ');
        }
        return `Tabla: ${b.labels.join(' · ')}`;
      }
      if (b.type === 'markdown' && b.content.trim()) {
        const clean = b.content
          .replace(/^[#\s>*-]+/gm, '')
          .replace(/[*`_~\[\]]/g, '')
          .replace(/<[^>]*>/g, '')
          .trim();
        return clean.length > 100 ? `${clean.slice(0, 100)}...` : clean;
      }
      if (b.type === 'gallery' && b.items && b.items.length > 0) {
        const count = b.items.length;
        const title = b.title ? `${b.title} · ` : '';
        return `📷 ${title}${count} ${count === 1 ? 'foto' : 'fotos'}`;
      }
    }
    return 'Nota vacía';
  };

  // Obtener miniatura de imagen si tiene
  const getNoteThumbnail = (note: Note) => {
    const imgBlock = note.blocks.find((b) => b.type === 'image');
    if (imgBlock && imgBlock.type === 'image' && imgBlock.localUrl) {
      return imgBlock.localUrl;
    }
    const galleryBlock = note.blocks.find((b) => b.type === 'gallery');
    if (galleryBlock && galleryBlock.type === 'gallery' && galleryBlock.items?.length > 0) {
      return galleryBlock.items[0].url;
    }
    return null;
  };

  const getViewTitle = () => {
    if (currentFilter.type === 'pinned') return 'Notas fijadas';
    if (currentFilter.type === 'trash') return 'Papelera';
    if (currentFilter.type === 'tag') return `Etiqueta: ${currentFilter.tagName}`;
    return 'Todas las notas';
  };

  const currentTag = currentFilter.type === 'tag' ? tags.find((t) => t.id === currentFilter.tagId) : null;
  const isCurrentTagArchived = currentTag?.archived === true;
  const archivedAncestor = currentTag ? getArchivedAncestor(currentTag, tags) : null;

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

        {/* Banner de etiqueta archivada */}
        {isCurrentTagArchived && (
          <div className="mb-2.5 p-2.5 bg-[#EDEAE2] border border-[#E4DECE] rounded-lg flex items-center justify-between gap-2 shadow-2xs">
            <div className="flex items-center gap-2 min-w-0">
              <Archive className="w-4 h-4 text-[#8A8478] shrink-0" />
              <div className="min-w-0">
                <span className="text-xs font-semibold text-[#2B2A28] block truncate">
                  Etiqueta archivada
                </span>
                <span className="text-[10px] text-[#8A8478] block truncate">
                  Oculta de "Todas las notas"
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={async () => {
                await db.tags.update(currentTag.id, { archived: false });
              }}
              className="px-2.5 py-1 bg-[#3F6E64] hover:bg-[#345951] text-[#F7F4EE] rounded-md text-xs font-semibold shrink-0 cursor-pointer transition-colors shadow-xs"
            >
              Desarchivar
            </button>
          </div>
        )}
        {!isCurrentTagArchived && archivedAncestor && (
          <div className="mb-2.5 p-2.5 bg-[#EDEAE2] border border-[#E4DECE] rounded-lg flex items-center justify-between gap-2 shadow-2xs">
            <div className="flex items-center gap-2 min-w-0">
              <Archive className="w-4 h-4 text-[#8A8478] shrink-0" />
              <div className="min-w-0">
                <span className="text-xs font-semibold text-[#2B2A28] block truncate">
                  Etiqueta superior "{archivedAncestor.name}" archivada
                </span>
                <span className="text-[10px] text-[#8A8478] block truncate">
                  Oculta por pertenecer a una etiqueta archivada
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={async () => {
                await db.tags.update(archivedAncestor.id, { archived: false });
              }}
              className="px-2.5 py-1 bg-[#3F6E64] hover:bg-[#345951] text-[#F7F4EE] rounded-md text-xs font-semibold shrink-0 cursor-pointer transition-colors shadow-xs"
            >
              Desarchivar {archivedAncestor.name}
            </button>
          </div>
        )}

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

      {/* Menú contextual de nota */}
      {contextMenu && (
        <>
          <div
            className="fixed inset-0 z-50 bg-transparent"
            onClick={() => {
              setContextMenu(null);
              setIsSubmenuOpen(false);
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              setContextMenu(null);
              setIsSubmenuOpen(false);
            }}
          />
          <div
            className="fixed z-50 bg-white border border-[#E4DECE] rounded-xl shadow-xl py-1.5 px-1 min-w-[190px] text-xs text-[#2B2A28]"
            style={{
              left: `${contextMenu.x}px`,
              top: `${contextMenu.y}px`,
            }}
          >
            <div className="px-2.5 py-1 text-[10px] uppercase font-bold text-[#8A8478] tracking-wider border-b border-[#E4DECE]/50 mb-1 truncate max-w-[200px]">
              {contextMenu.note.title || 'Nota sin título'}
            </div>

            {/* Opción: Hacer hija de... con flechita y submenú en cascada */}
            <div
              className="relative group/submenu"
              onMouseEnter={() => setIsSubmenuOpen(true)}
              onMouseLeave={() => setIsSubmenuOpen(false)}
            >
              <button
                type="button"
                onClick={() => setIsSubmenuOpen(!isSubmenuOpen)}
                className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg hover:bg-[#F7F4EE] text-[#2B2A28] transition-colors text-left cursor-pointer font-medium"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <CornerDownRight className="w-3.5 h-3.5 text-[#3F6E64] shrink-0" />
                  <span className="truncate">Hacer hija de...</span>
                </div>
                <ChevronRight className="w-3.5 h-3.5 text-[#8A8478] shrink-0" />
              </button>

              {/* Submenú desplegable con todas las etiquetas */}
              <div
                className={`${
                  isSubmenuOpen ? 'block' : 'hidden group-hover/submenu:block'
                } absolute ${
                  contextMenu.x > window.innerWidth - 380 ? 'right-full mr-1' : 'left-full ml-1'
                } top-0 bg-white border border-[#E4DECE] rounded-xl shadow-2xl p-1.5 z-50 min-w-[200px] max-w-[260px] max-h-64 overflow-y-auto`}
              >
                <div className="px-2 py-1 text-[10px] uppercase font-bold text-[#8A8478] tracking-wider border-b border-[#E4DECE]/50 mb-1">
                  Seleccionar etiqueta
                </div>

                {/* Opción Sin etiqueta */}
                <button
                  type="button"
                  onClick={() => handleAssignTag(contextMenu.note, '')}
                  className={`w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg text-xs hover:bg-[#F7F4EE] transition-colors text-left cursor-pointer mb-0.5 ${
                    !contextMenu.note.tag ? 'bg-[#3F6E64]/10 text-[#3F6E64] font-semibold' : 'text-[#8A8478]'
                  }`}
                >
                  <span>Sin etiqueta</span>
                  {!contextMenu.note.tag && <Check className="w-3 h-3 text-[#3F6E64] shrink-0" />}
                </button>

                {/* Árbol recursivo de todas las etiquetas */}
                {tags
                  .filter((t: Tag) => !t.parentId && !t.archived)
                  .map((rootTag: Tag) => renderSubmenuTagItem(rootTag, 0))}
              </div>
            </div>

            {/* Opción: Fijar / Desfijar */}
            <button
              type="button"
              onClick={() => handleTogglePin(contextMenu.note)}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-[#F7F4EE] text-[#2B2A28] transition-colors text-left cursor-pointer"
            >
              <Pin className="w-3.5 h-3.5 text-[#C98A3D] shrink-0" />
              <span>{contextMenu.note.pinned ? 'Desfijar nota' : 'Fijar nota'}</span>
            </button>

            {/* Separador */}
            <div className="my-1 border-t border-[#E4DECE]/50" />

            {/* Opción: Eliminar nota */}
            <button
              type="button"
              onClick={() => {
                const noteToDelete = contextMenu.note;
                setContextMenu(null);
                setIsSubmenuOpen(false);
                onDeleteNote(noteToDelete);
              }}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-[#B4553F]/10 text-[#B4553F] transition-colors text-left cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5 shrink-0" />
              <span>{contextMenu.note.deleted ? 'Eliminar definitivamente' : 'Eliminar nota'}</span>
            </button>
          </div>
        </>
      )}
    </div>
  );

  function renderNoteCard(note: Note) {
    const isSelected = selectedNoteId === note.id;
    const thumb = getNoteThumbnail(note);

    return (
      <div
        key={note.id}
        onClick={() => onSelectNote(note.id)}
        onContextMenu={(e) => handleOpenContextMenu(e, note)}
        className={`p-3 rounded-xl cursor-pointer transition-all mb-1 flex items-start justify-between gap-3 group relative ${
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

        <div className="flex items-center gap-1 shrink-0">
          {/* Botón de papelera visible en hover */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDeleteNote(note);
            }}
            className="opacity-0 group-hover:opacity-100 p-1.5 text-[#8A8478] hover:text-[#B4553F] hover:bg-[#B4553F]/10 rounded-lg transition-all cursor-pointer"
            title={note.deleted ? 'Eliminar nota' : 'Mover a papelera'}
          >
            <Trash2 className="w-4 h-4" />
          </button>

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
      </div>
    );
  }
};
