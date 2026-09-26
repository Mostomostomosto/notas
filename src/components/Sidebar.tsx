import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, Tag, desaturateColor } from '../db/db';
import { SyncState, scheduleSync } from '../services/syncEngine';
import { UserProfile } from '../services/googleAuth';
import {
  FileText,
  Pin,
  Trash2,
  Plus,
  Cloud,
  CloudOff,
  RefreshCw,
  LogOut,
  AlertCircle,
  ChevronDown,
  ShieldCheck,
  ExternalLink,
  Settings,
  MoreVertical,
  CornerDownRight,
  ArrowLeft,
  FolderInput,
  Calendar as CalendarIcon,
} from 'lucide-react';

export type SidebarFilter =
  | { type: 'calendar' }
  | { type: 'all' }
  | { type: 'pinned' }
  | { type: 'trash' }
  | { type: 'tag'; tagId: string; tagName: string };

interface SidebarProps {
  currentFilter: SidebarFilter;
  onSelectFilter: (filter: SidebarFilter) => void;
  syncState: SyncState;
  syncMessage: string;
  onTriggerSync: () => void;
  userProfile: UserProfile | null;
  onConnectGoogle: () => void;
  onLogoutGoogle: () => void;
  token: string | null;
  onOpenPreferences: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentFilter,
  onSelectFilter,
  syncState,
  syncMessage,
  onTriggerSync,
  userProfile,
  onConnectGoogle,
  onLogoutGoogle,
  token,
  onOpenPreferences,
}) => {
  const [isAddingTag, setIsAddingTag] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState('#3F6E64');
  const [newTagParentId, setNewTagParentId] = useState('');
  const [isLogoMenuOpen, setIsLogoMenuOpen] = useState(false);

  // Estados para subetiquetas y menús contextuales
  interface ContextMenuInfo {
    x: number;
    y: number;
    type: 'tag' | 'trash';
    tag?: Tag;
  }
  const [contextMenu, setContextMenu] = useState<ContextMenuInfo | null>(null);
  const [addingSubtagForId, setAddingSubtagForId] = useState<string | null>(null);
  const [subtagName, setSubtagName] = useState('');
  const [movingTag, setMovingTag] = useState<Tag | null>(null);

  // Queries reactivas con Dexie
  const tags = useLiveQuery(() => db.tags.toArray()) || [];
  const notes = useLiveQuery(() => db.notes.toArray()) || [];
  const events = useLiveQuery(() => db.events.filter((e) => !e.deleted).toArray()) || [];

  const allNotesCount = notes.filter((n) => !n.deleted).length;
  const pinnedCount = notes.filter((n) => !n.deleted && n.pinned).length;
  const trashCount = notes.filter((n) => n.deleted).length;

  const rootTags = tags.filter((t: Tag) => !t.parentId);
  const getChildTags = (parentId: string) => tags.filter((t: Tag) => t.parentId === parentId);

  const getExactTagCount = (tagName: string) => {
    return notes.filter((n) => !n.deleted && n.tag && n.tag.toLowerCase() === tagName.toLowerCase()).length;
  };

  const getTagCount = (tag: Tag) => {
    const childTags = tags.filter((t) => t.parentId === tag.id);
    const names = [tag.name.toLowerCase(), ...childTags.map((c) => c.name.toLowerCase())];
    return notes.filter((n) => !n.deleted && n.tag && names.includes(n.tag.toLowerCase())).length;
  };

  const validateCanBeParent = (targetParentId: string): boolean => {
    const parentTag = tags.find((t) => t.id === targetParentId);
    if (!parentTag) return true;
    if (parentTag.parentId) {
      alert('Esta etiqueta ya es una subetiqueta y no puede tener hijas propias.');
      return false;
    }
    return true;
  };

  const openContextMenu = (
    e: React.MouseEvent,
    type: 'tag' | 'trash',
    tag?: Tag
  ) => {
    e.preventDefault();
    e.stopPropagation();
    const menuWidth = 190;
    const menuHeight = 130;
    const x = Math.min(e.clientX, window.innerWidth - menuWidth - 10);
    const y = Math.min(e.clientY, window.innerHeight - menuHeight - 10);
    setContextMenu({ x, y, type, tag });
  };

  const handleCreateTag = async (e?: React.FormEvent | React.KeyboardEvent) => {
    if (e) e.preventDefault();
    if (!newTagName.trim()) return;
    const cleanName = newTagName.trim();

    if (newTagParentId) {
      if (!validateCanBeParent(newTagParentId)) {
        setNewTagParentId('');
        return;
      }
    }

    const tagId = newTagParentId
      ? `${newTagParentId}-${cleanName.toLowerCase().replace(/\s+/g, '-')}`
      : cleanName.toLowerCase().replace(/\s+/g, '-');

    const parentTag = newTagParentId ? tags.find((t) => t.id === newTagParentId) : null;
    const finalColor = parentTag ? parentTag.color : newTagColor;

    await db.tags.put({
      id: tagId,
      name: cleanName,
      color: finalColor,
      ...(newTagParentId ? { parentId: newTagParentId } : {}),
    });
    setNewTagName('');
    setNewTagParentId('');
    setIsAddingTag(false);
  };

  const handleCreateSubtag = async (
    parentId: string,
    parentColor: string,
    e?: React.FormEvent | React.KeyboardEvent
  ) => {
    if (e) e.preventDefault();
    if (!subtagName.trim()) return;

    if (!validateCanBeParent(parentId)) {
      setAddingSubtagForId(null);
      setSubtagName('');
      return;
    }

    const cleanName = subtagName.trim();
    const subId = `${parentId}-${cleanName.toLowerCase().replace(/\s+/g, '-')}`;
    await db.tags.put({
      id: subId,
      name: cleanName,
      color: parentColor,
      parentId: parentId,
    });
    setSubtagName('');
    setAddingSubtagForId(null);
  };

  const handleMoveTag = async (tagToMove: Tag, newParentId: string | null) => {
    setContextMenu(null);
    setMovingTag(null);
    if (!newParentId) {
      await db.tags.put({
        id: tagToMove.id,
        name: tagToMove.name,
        color: tagToMove.color,
      });
    } else {
      if (!validateCanBeParent(newParentId)) return;
      const hasChildren = tags.some((t) => t.parentId === tagToMove.id);
      if (hasChildren) {
        alert('Esta etiqueta tiene subetiquetas y no puede convertirse en subetiqueta de otra.');
        return;
      }
      const parentTag = tags.find((t) => t.id === newParentId);
      if (!parentTag) return;
      await db.tags.put({
        id: tagToMove.id,
        name: tagToMove.name,
        color: parentTag.color,
        parentId: newParentId,
      });
    }
  };

  const handleDeleteTag = async (tagToDelete: Tag) => {
    setContextMenu(null);
    const isRoot = !tagToDelete.parentId;
    const childTags = isRoot ? tags.filter((t) => t.parentId === tagToDelete.id) : [];
    const tagNamesToClear = [tagToDelete.name.toLowerCase(), ...childTags.map((c) => c.name.toLowerCase())];

    const affectedNotes = notes.filter(
      (n) => n.tag && tagNamesToClear.includes(n.tag.toLowerCase())
    );

    const confirmMsg = childTags.length > 0
      ? `¿Eliminar la etiqueta "${tagToDelete.name}" y sus ${childTags.length} subetiqueta(s)? Las ${affectedNotes.length} nota(s) pasarán a "Sin etiqueta".`
      : `¿Eliminar la etiqueta "${tagToDelete.name}"? Las ${affectedNotes.length} nota(s) pasarán a "Sin etiqueta".`;

    if (!window.confirm(confirmMsg)) return;

    // 1. Reasignar notas a "Sin etiqueta" y marcar como pendientes para sincronizar con Drive
    const now = new Date().toISOString();
    for (const note of affectedNotes) {
      await db.notes.update(note.id, {
        tag: 'Sin etiqueta',
        updatedAt: now,
        syncStatus: 'pending',
      });
    }

    // 2. Eliminar etiquetas de la base de datos
    const idsToDelete = [tagToDelete.id, ...childTags.map((c) => c.id)];
    await db.tags.bulkDelete(idsToDelete);

    // 3. Si el filtro actual es una de las etiquetas eliminadas, resetear a 'all'
    if (
      currentFilter.type === 'tag' &&
      idsToDelete.includes(currentFilter.tagId)
    ) {
      onSelectFilter({ type: 'all' });
    }

    // 4. Sincronizar si hay sesión activa
    if (token) {
      scheduleSync(token);
    }
  };

  const handleEmptyTrash = async () => {
    setContextMenu(null);
    const trashedNotes = notes.filter((n) => n.deleted);
    if (trashedNotes.length === 0) return;

    if (
      !window.confirm(
        `¿Seguro que deseas vaciar la papelera? Se eliminarán definitivamente ${trashedNotes.length} nota(s).`
      )
    ) {
      return;
    }

    await db.notes.bulkDelete(trashedNotes.map((n) => n.id));
  };

  const isFilterActive = (filter: SidebarFilter) => {
    if (currentFilter.type === 'calendar' && filter.type === 'calendar') return true;
    if (currentFilter.type === 'all' && filter.type === 'all') return true;
    if (currentFilter.type === 'pinned' && filter.type === 'pinned') return true;
    if (currentFilter.type === 'trash' && filter.type === 'trash') return true;
    if (
      currentFilter.type === 'tag' &&
      filter.type === 'tag' &&
      currentFilter.tagId === filter.tagId
    )
      return true;
    return false;
  };

  return (
    <aside className="w-60 bg-[#EDEAE2] border-r border-[#E4DECE] flex flex-col h-full select-none text-[#2B2A28]">
      {/* App Header / Brand con Menú desplegable */}
      <div className="p-3 border-b border-[#E4DECE]/70 relative">
        <button
          onClick={() => setIsLogoMenuOpen(!isLogoMenuOpen)}
          className="w-full flex items-center justify-between p-1.5 rounded-xl hover:bg-black/5 transition-colors text-left cursor-pointer"
          title="Menú de información"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-[#3F6E64] text-[#F7F4EE] flex items-center justify-center font-bold text-sm shadow-sm shrink-0">
              N
            </div>
            <div className="min-w-0">
              <span className="font-bold text-sm tracking-tight text-[#2B2A28] block leading-none">
                Mis Notas
              </span>
              <span className="text-[10px] text-[#8A8478] block mt-0.5 font-normal">
                Uso personal
              </span>
            </div>
          </div>
          <ChevronDown
            className={`w-3.5 h-3.5 text-[#8A8478] transition-transform duration-200 ${
              isLogoMenuOpen ? 'rotate-180 text-[#2B2A28]' : ''
            }`}
          />
        </button>

        {/* Menú flotante con enlaces de privacidad y términos */}
        {isLogoMenuOpen && (
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={() => setIsLogoMenuOpen(false)}
            />
            <div className="absolute left-3 right-3 top-full mt-1 bg-white border border-[#E4DECE] rounded-xl shadow-lg p-1.5 z-50">
              <div className="px-2 py-1 text-[10px] uppercase font-bold text-[#8A8478] tracking-wider border-b border-[#E4DECE]/50 mb-1">
                Configuración
              </div>
              <button
                onClick={() => {
                  setIsLogoMenuOpen(false);
                  onOpenPreferences();
                }}
                className="w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-xs hover:bg-[#F7F4EE] text-[#2B2A28] transition-colors text-left cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <Settings className="w-3.5 h-3.5 text-[#3F6E64]" />
                  <span className="font-medium">Preferencias y Drive</span>
                </div>
              </button>

              <div className="px-2 py-1 text-[10px] uppercase font-bold text-[#8A8478] tracking-wider border-b border-[#E4DECE]/50 my-1">
                Información legal
              </div>
              <a
                href="/privacidad.html"
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setIsLogoMenuOpen(false)}
                className="flex items-center justify-between px-2.5 py-2 rounded-lg text-xs hover:bg-[#F7F4EE] text-[#2B2A28] transition-colors"
              >
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-3.5 h-3.5 text-[#3F6E64]" />
                  <span>Política de privacidad</span>
                </div>
                <ExternalLink className="w-3 h-3 text-[#8A8478]" />
              </a>

              <a
                href="/terminos.html"
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setIsLogoMenuOpen(false)}
                className="flex items-center justify-between px-2.5 py-2 rounded-lg text-xs hover:bg-[#F7F4EE] text-[#2B2A28] transition-colors"
              >
                <div className="flex items-center gap-2">
                  <FileText className="w-3.5 h-3.5 text-[#3F6E64]" />
                  <span>Términos y condiciones</span>
                </div>
                <ExternalLink className="w-3 h-3 text-[#8A8478]" />
              </a>
            </div>
          </>
        )}
      </div>

      {/* Navigation Sections */}
      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
        {/* System Views */}
        <div className="space-y-1">
          <button
            onClick={() => onSelectFilter({ type: 'calendar' })}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-all cursor-pointer ${
              isFilterActive({ type: 'calendar' })
                ? 'bg-[#3F6E64] text-[#F7F4EE] font-semibold shadow-sm'
                : 'hover:bg-black/5 text-[#2B2A28]'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <CalendarIcon className="w-4 h-4 opacity-80" />
              <span>Calendario</span>
            </div>
            {events.length > 0 && (
              <span
                className={`text-[11px] px-1.5 py-0.2 rounded-full ${
                  isFilterActive({ type: 'calendar' })
                    ? 'bg-white/20 text-white'
                    : 'text-[#8A8478]'
                }`}
              >
                {events.length}
              </span>
            )}
          </button>

          <button
            onClick={() => onSelectFilter({ type: 'all' })}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-all ${
              isFilterActive({ type: 'all' })
                ? 'bg-[#3F6E64] text-[#F7F4EE] font-semibold shadow-sm'
                : 'hover:bg-black/5 text-[#2B2A28]'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <FileText className="w-4 h-4 opacity-80" />
              <span>Todas las notas</span>
            </div>
            <span
              className={`text-[11px] px-1.5 py-0.2 rounded-full ${
                isFilterActive({ type: 'all' })
                  ? 'bg-white/20 text-white'
                  : 'text-[#8A8478]'
              }`}
            >
              {allNotesCount}
            </span>
          </button>

          <button
            onClick={() => onSelectFilter({ type: 'pinned' })}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-all ${
              isFilterActive({ type: 'pinned' })
                ? 'bg-[#3F6E64] text-[#F7F4EE] font-semibold shadow-sm'
                : 'hover:bg-black/5 text-[#2B2A28]'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <Pin className="w-4 h-4 opacity-80 text-[#C98A3D]" />
              <span>Fijadas</span>
            </div>
            <span
              className={`text-[11px] px-1.5 py-0.2 rounded-full ${
                isFilterActive({ type: 'pinned' })
                  ? 'bg-white/20 text-white'
                  : 'text-[#8A8478]'
              }`}
            >
              {pinnedCount}
            </span>
          </button>

          <button
            onClick={() => onSelectFilter({ type: 'trash' })}
            onContextMenu={(e) => openContextMenu(e, 'trash')}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-all group cursor-pointer ${
              isFilterActive({ type: 'trash' })
                ? 'bg-[#3F6E64] text-[#F7F4EE] font-semibold shadow-sm'
                : 'hover:bg-black/5 text-[#2B2A28]'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <Trash2 className="w-4 h-4 opacity-80" />
              <span>Papelera</span>
            </div>
            <div className="flex items-center gap-1">
              {trashCount > 0 && (
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => {
                    e.stopPropagation();
                    openContextMenu(e, 'trash');
                  }}
                  className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-black/10 transition-opacity cursor-pointer"
                  title="Opciones de papelera"
                >
                  <MoreVertical className="w-3 h-3 text-[#8A8478]" />
                </span>
              )}
              <span
                className={`text-[11px] px-1.5 py-0.2 rounded-full ${
                  isFilterActive({ type: 'trash' })
                    ? 'bg-white/20 text-white'
                    : 'text-[#8A8478]'
                }`}
              >
                {trashCount}
              </span>
            </div>
          </button>
        </div>

        {/* Tags Section */}
        <div>
          <div className="flex items-center justify-between px-3 mb-1.5">
            <span className="text-[10px] uppercase font-bold tracking-wider text-[#8A8478]">
              Etiquetas
            </span>
            <button
              onClick={() => setIsAddingTag(true)}
              className="text-[#8A8478] hover:text-[#2B2A28] p-0.5 rounded transition-colors cursor-pointer"
              title="Nueva etiqueta"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="space-y-1">
            {rootTags.map((rootTag: Tag) => {
              const active = isFilterActive({
                type: 'tag',
                tagId: rootTag.id,
                tagName: rootTag.name,
              });
              const count = getTagCount(rootTag);
              const childTags = getChildTags(rootTag.id);

              return (
                <div key={rootTag.id} className="space-y-0.5">
                  <div
                    onContextMenu={(e) => openContextMenu(e, 'tag', rootTag)}
                    onClick={() =>
                      onSelectFilter({
                        type: 'tag',
                        tagId: rootTag.id,
                        tagName: rootTag.name,
                      })
                    }
                    className={`w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-xs font-medium transition-all group cursor-pointer ${
                      active
                        ? 'bg-[#3F6E64] text-[#F7F4EE] font-semibold shadow-sm'
                        : 'hover:bg-black/5 text-[#2B2A28]'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0 shadow-xs"
                        style={{ backgroundColor: rootTag.color }}
                      />
                      <span className="truncate">{rootTag.name}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      {rootTag.id !== 'sin-etiqueta' && (
                        <>
                          <span
                            role="button"
                            tabIndex={0}
                            onClick={(e) => {
                              e.stopPropagation();
                              setAddingSubtagForId(rootTag.id);
                              setSubtagName('');
                            }}
                            className={`p-0.5 rounded transition-opacity cursor-pointer ${
                              active
                                ? 'opacity-0 group-hover:opacity-100 text-white/80 hover:bg-white/10'
                                : 'opacity-0 group-hover:opacity-100 text-[#8A8478] hover:bg-black/10'
                            }`}
                            title={`Añadir subetiqueta a ${rootTag.name}`}
                          >
                            <Plus className="w-3 h-3" />
                          </span>
                          <span
                            role="button"
                            tabIndex={0}
                            onClick={(e) => {
                              e.stopPropagation();
                              openContextMenu(e, 'tag', rootTag);
                            }}
                            className={`p-0.5 rounded transition-opacity cursor-pointer ${
                              active
                                ? 'opacity-0 group-hover:opacity-100 text-white/80 hover:bg-white/10'
                                : 'opacity-0 group-hover:opacity-100 text-[#8A8478] hover:bg-black/10'
                            }`}
                            title="Opciones de etiqueta"
                          >
                            <MoreVertical className="w-3 h-3" />
                          </span>
                        </>
                      )}
                      <span
                        className={`text-[11px] ${
                          active ? 'text-white/80' : 'text-[#8A8478]'
                        }`}
                      >
                        {count}
                      </span>
                    </div>
                  </div>

                  {/* Formulario para añadir subetiqueta */}
                  {addingSubtagForId === rootTag.id && (
                    <form
                      onSubmit={(e) => handleCreateSubtag(rootTag.id, rootTag.color, e)}
                      className="ml-6 mr-1 my-1 p-2 bg-white rounded-lg border border-[#E4DECE] shadow-xs"
                    >
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: desaturateColor(rootTag.color) }}
                        />
                        <span className="text-[10px] text-[#8A8478] font-medium">
                          Nueva subetiqueta de {rootTag.name}
                        </span>
                      </div>
                      <input
                        type="text"
                        value={subtagName}
                        onChange={(e) => setSubtagName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleCreateSubtag(rootTag.id, rootTag.color, e);
                          } else if (e.key === 'Escape') {
                            setAddingSubtagForId(null);
                            setSubtagName('');
                          }
                        }}
                        placeholder="Nombre subetiqueta (Enter para guardar)"
                        autoFocus
                        className="w-full text-xs px-2 py-1 bg-[#F7F4EE] rounded border border-[#E4DECE] outline-none text-[#2B2A28] mb-2"
                      />
                      <div className="flex justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            setAddingSubtagForId(null);
                            setSubtagName('');
                          }}
                          className="text-[10px] px-1.5 py-0.5 text-[#8A8478] hover:text-[#2B2A28] cursor-pointer"
                        >
                          Cancelar
                        </button>
                        <button
                          type="submit"
                          className="text-[10px] px-2 py-0.5 bg-[#3F6E64] text-white rounded font-medium cursor-pointer"
                        >
                          Guardar
                        </button>
                      </div>
                    </form>
                  )}

                  {/* Subetiquetas hijas (anidadas) */}
                  {childTags.map((child: Tag) => {
                    const childActive = isFilterActive({
                      type: 'tag',
                      tagId: child.id,
                      tagName: child.name,
                    });
                    const childCount = getExactTagCount(child.name);
                    const desaturatedBg = desaturateColor(child.color);

                    return (
                      <div
                        key={child.id}
                        onContextMenu={(e) => openContextMenu(e, 'tag', child)}
                        onClick={() =>
                          onSelectFilter({
                            type: 'tag',
                            tagId: child.id,
                            tagName: child.name,
                          })
                        }
                        className={`w-full flex items-center justify-between pl-7 pr-3 py-1.5 rounded-lg text-[11.5px] font-medium transition-all group cursor-pointer ${
                          childActive
                            ? 'bg-[#3F6E64] text-[#F7F4EE] font-semibold shadow-sm'
                            : 'hover:bg-black/5 text-[#2B2A28]'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className="w-2 h-2 rounded-full shrink-0 shadow-xs"
                            style={{ backgroundColor: desaturatedBg }}
                          />
                          <span className="truncate">{child.name}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <span
                            role="button"
                            tabIndex={0}
                            onClick={(e) => {
                              e.stopPropagation();
                              alert('Esta etiqueta ya es una subetiqueta y no puede tener hijas propias.');
                            }}
                            className={`p-0.5 rounded transition-opacity cursor-pointer ${
                              childActive
                                ? 'opacity-0 group-hover:opacity-100 text-white/80 hover:bg-white/10'
                                : 'opacity-0 group-hover:opacity-100 text-[#8A8478] hover:bg-black/10'
                            }`}
                            title={`Añadir subetiqueta a ${child.name}`}
                          >
                            <Plus className="w-3 h-3" />
                          </span>
                          <span
                            role="button"
                            tabIndex={0}
                            onClick={(e) => {
                              e.stopPropagation();
                              openContextMenu(e, 'tag', child);
                            }}
                            className={`p-0.5 rounded transition-opacity cursor-pointer ${
                              childActive
                                ? 'opacity-0 group-hover:opacity-100 text-white/80 hover:bg-white/10'
                                : 'opacity-0 group-hover:opacity-100 text-[#8A8478] hover:bg-black/10'
                            }`}
                            title="Opciones de subetiqueta"
                          >
                            <MoreVertical className="w-3 h-3" />
                          </span>
                          <span
                            className={`text-[10.5px] ${
                              childActive ? 'text-white/80' : 'text-[#8A8478]'
                            }`}
                          >
                            {childCount}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>

          {/* Formulario rápido para añadir etiqueta */}
          {isAddingTag && (
            <form onSubmit={handleCreateTag} className="mt-2 p-2 bg-white rounded-lg border border-[#E4DECE] shadow-xs">
              <input
                type="text"
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleCreateTag(e);
                  } else if (e.key === 'Escape') {
                    setIsAddingTag(false);
                    setNewTagName('');
                    setNewTagParentId('');
                  }
                }}
                placeholder="Nombre etiqueta (Enter para guardar)"
                autoFocus
                className="w-full text-xs px-2 py-1 bg-[#F7F4EE] rounded border border-[#E4DECE] outline-none text-[#2B2A28] mb-2"
              />

              <div className="mb-2">
                <label className="text-[10px] text-[#8A8478] block mb-0.5">Pertenece a:</label>
                <select
                  value={newTagParentId}
                  onChange={(e) => {
                    const pid = e.target.value;
                    if (!pid) {
                      setNewTagParentId('');
                      return;
                    }
                    if (!validateCanBeParent(pid)) {
                      setNewTagParentId('');
                      return;
                    }
                    setNewTagParentId(pid);
                    const p = tags.find((t) => t.id === pid);
                    if (p) setNewTagColor(p.color);
                  }}
                  className="w-full text-xs px-1.5 py-1 bg-[#F7F4EE] rounded border border-[#E4DECE] text-[#2B2A28] outline-none cursor-pointer"
                >
                  <option value="">Principal (sin padre)</option>
                  {tags
                    .filter((t) => t.id !== 'sin-etiqueta')
                    .map((t) => {
                      const isSub = !!t.parentId;
                      return (
                        <option key={t.id} value={t.id}>
                          {isSub ? `  ↳ ${t.name} (subetiqueta)` : `Subetiqueta de ${t.name}`}
                        </option>
                      );
                    })}
                </select>
              </div>

              <div className="flex items-center justify-between gap-1">
                {!newTagParentId ? (
                  <div className="flex items-center gap-1">
                    {['#3F6E64', '#B4553F', '#C98A3D', '#5B7DB1', '#7A68A6'].map((color) => (
                      <button
                        key={color}
                        type="button"
                        onClick={() => setNewTagColor(color)}
                        className={`w-4 h-4 rounded-full border ${
                          newTagColor === color ? 'ring-2 ring-[#2B2A28]' : 'border-black/10'
                        }`}
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                ) : (
                  <span className="text-[10px] text-[#8A8478] italic">Color heredado</span>
                )}
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      setIsAddingTag(false);
                      setNewTagName('');
                      setNewTagParentId('');
                    }}
                    className="text-[10px] px-1.5 py-0.5 text-[#8A8478] hover:text-[#2B2A28] cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="text-[10px] px-2 py-0.5 bg-[#3F6E64] text-white rounded font-medium cursor-pointer"
                  >
                    Guardar
                  </button>
                </div>
              </div>
            </form>
          )}
        </div>
      </div>

      {/* Footer: Google Drive Sync & Auth Status */}
      <div className="p-3 border-t border-[#E4DECE] bg-[#EDEAE2] space-y-2">
        {/* Sync Status Badge */}
        <div className="flex items-center justify-between px-2 py-1.5 bg-white/60 rounded-lg border border-[#E4DECE]/70 text-xs">
          <div className="flex items-center gap-2 min-w-0">
            {syncState === 'syncing' ? (
              <RefreshCw className="w-3.5 h-3.5 text-[#3F6E64] animate-spin shrink-0" />
            ) : syncState === 'offline' ? (
              <CloudOff className="w-3.5 h-3.5 text-[#8A8478] shrink-0" />
            ) : syncState === 'error' ? (
              <AlertCircle className="w-3.5 h-3.5 text-[#B4553F] shrink-0" />
            ) : (
              <Cloud className="w-3.5 h-3.5 text-[#3F6E64] shrink-0" />
            )}
            <span className="text-[11px] text-[#2B2A28] font-medium truncate">
              {token ? (syncMessage || 'Sincronizado') : 'Solo local (offline)'}
            </span>
          </div>

          {token && (
            <button
              onClick={onTriggerSync}
              className="text-[#8A8478] hover:text-[#3F6E64] p-1 rounded transition-colors"
              title="Sincronizar ahora con Drive"
            >
              <RefreshCw className="w-3 h-3" />
            </button>
          )}
        </div>

        {/* User Account / Login button */}
        {token ? (
          <div className="flex items-center justify-between px-2 py-1 text-xs">
            <div
              onClick={onOpenPreferences}
              className="flex items-center gap-2 min-w-0 cursor-pointer hover:opacity-80 transition-opacity"
              title="Abrir preferencias"
            >
              {userProfile?.picture ? (
                <img
                  src={userProfile.picture}
                  alt="Avatar"
                  className="w-5 h-5 rounded-full border border-[#E4DECE] shrink-0"
                />
              ) : (
                <div className="w-5 h-5 rounded-full bg-[#3F6E64] text-[#F7F4EE] text-[10px] flex items-center justify-center shrink-0">
                  ✓
                </div>
              )}
              <span className="text-[11px] text-[#8A8478] truncate max-w-[100px]">
                {userProfile?.email || 'Google Drive'}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={onOpenPreferences}
                className="text-[#8A8478] hover:text-[#2B2A28] p-1 transition-colors cursor-pointer"
                title="Preferencias"
              >
                <Settings className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={onLogoutGoogle}
                className="text-[#8A8478] hover:text-[#B4553F] p-1 transition-colors cursor-pointer"
                title="Desconectar Google Drive"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-1.5">
            <button
              onClick={onConnectGoogle}
              className="flex-1 py-1.5 px-2 bg-[#2B2A28] hover:bg-black text-[#F7F4EE] text-xs font-medium rounded-lg flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-xs"
            >
              <Cloud className="w-3.5 h-3.5 text-[#F7F4EE]" />
              <span>Conectar Google Drive</span>
            </button>
            <button
              onClick={onOpenPreferences}
              className="p-1.5 text-[#8A8478] hover:text-[#2B2A28] bg-white/60 hover:bg-white border border-[#E4DECE] rounded-lg transition-colors cursor-pointer"
              title="Preferencias"
            >
              <Settings className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Context Menu Popup */}
      {contextMenu && (
        <>
          <div
            className="fixed inset-0 z-50 bg-transparent"
            onClick={() => setContextMenu(null)}
            onContextMenu={(e) => {
              e.preventDefault();
              setContextMenu(null);
            }}
          />
          <div
            className="fixed z-50 bg-white border border-[#E4DECE] rounded-xl shadow-xl py-1.5 px-1 min-w-[170px] text-xs text-[#2B2A28]"
            style={{
              left: `${contextMenu.x}px`,
              top: `${contextMenu.y}px`,
            }}
          >
            {contextMenu.type === 'tag' && contextMenu.tag && (() => {
              const isRoot = !contextMenu.tag.parentId;
              const parentTag = !isRoot ? tags.find((t) => t.id === contextMenu.tag!.parentId) : null;
              const otherRoots = rootTags.filter((rt) => rt.id !== contextMenu.tag!.id && rt.id !== 'sin-etiqueta');

              return (
                <>
                  <div className="px-2.5 py-1 text-[10px] uppercase font-bold text-[#8A8478] tracking-wider border-b border-[#E4DECE]/50 mb-1 flex items-center gap-1.5 truncate">
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{
                        backgroundColor: contextMenu.tag.parentId
                          ? desaturateColor(contextMenu.tag.color)
                          : contextMenu.tag.color,
                      }}
                    />
                    <span className="truncate">{contextMenu.tag.name}</span>
                  </div>

                  {/* Si es raíz: Añadir subetiqueta */}
                  {isRoot && contextMenu.tag.id !== 'sin-etiqueta' && (
                    <button
                      onClick={() => {
                        const tagId = contextMenu.tag!.id;
                        setContextMenu(null);
                        setAddingSubtagForId(tagId);
                        setSubtagName('');
                      }}
                      className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-[#F7F4EE] text-[#2B2A28] transition-colors text-left cursor-pointer"
                    >
                      <CornerDownRight className="w-3.5 h-3.5 text-[#3F6E64]" />
                      <span>Añadir subetiqueta</span>
                    </button>
                  )}

                  {/* Si es hija: Intento de añadir subetiqueta a ella misma */}
                  {!isRoot && (
                    <button
                      onClick={() => {
                        setContextMenu(null);
                        alert('Esta etiqueta ya es una subetiqueta y no puede tener hijas propias.');
                      }}
                      className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-[#F7F4EE] text-[#2B2A28] transition-colors text-left cursor-pointer"
                    >
                      <CornerDownRight className="w-3.5 h-3.5 text-[#8A8478]" />
                      <span>Añadir subetiqueta</span>
                    </button>
                  )}

                  {/* Si es raíz y hay otras etiquetas principales: Mover dentro de otra etiqueta */}
                  {isRoot && contextMenu.tag.id !== 'sin-etiqueta' && otherRoots.length > 0 && (
                    <button
                      onClick={() => {
                        setMovingTag(contextMenu.tag!);
                        setContextMenu(null);
                      }}
                      className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-[#F7F4EE] text-[#2B2A28] transition-colors text-left cursor-pointer"
                    >
                      <FolderInput className="w-3.5 h-3.5 text-[#8A8478]" />
                      <span>Hacer subetiqueta de...</span>
                    </button>
                  )}

                  {/* Si es hija: Añadir otra subetiqueta al mismo padre */}
                  {!isRoot && parentTag && (
                    <button
                      onClick={() => {
                        const parentId = contextMenu.tag!.parentId!;
                        setContextMenu(null);
                        setAddingSubtagForId(parentId);
                        setSubtagName('');
                      }}
                      className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-[#F7F4EE] text-[#2B2A28] transition-colors text-left cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5 text-[#3F6E64]" />
                      <span>Añadir subetiqueta a {parentTag.name}</span>
                    </button>
                  )}

                  {/* Si es hija: Convertir en etiqueta principal */}
                  {!isRoot && (
                    <button
                      onClick={() => handleMoveTag(contextMenu.tag!, null)}
                      className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-[#F7F4EE] text-[#2B2A28] transition-colors text-left cursor-pointer"
                    >
                      <ArrowLeft className="w-3.5 h-3.5 text-[#8A8478]" />
                      <span>Convertir en principal</span>
                    </button>
                  )}

                  {/* Eliminar etiqueta */}
                  {contextMenu.tag.id !== 'sin-etiqueta' ? (
                    <button
                      onClick={() => handleDeleteTag(contextMenu.tag!)}
                      className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-[#B4553F]/10 text-[#B4553F] transition-colors text-left cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>
                        {contextMenu.tag.parentId ? 'Eliminar subetiqueta' : 'Eliminar etiqueta'}
                      </span>
                    </button>
                  ) : (
                    <div className="px-2.5 py-1 text-[11px] text-[#8A8478] italic">
                      Etiqueta del sistema
                    </div>
                  )}
                </>
              );
            })()}

            {contextMenu.type === 'trash' && (
              <>
                <div className="px-2.5 py-1 text-[10px] uppercase font-bold text-[#8A8478] tracking-wider border-b border-[#E4DECE]/50 mb-1">
                  Papelera ({trashCount})
                </div>
                <button
                  onClick={handleEmptyTrash}
                  disabled={trashCount === 0}
                  className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg transition-colors text-left ${
                    trashCount === 0
                      ? 'opacity-40 cursor-not-allowed text-[#8A8478]'
                      : 'hover:bg-[#B4553F]/10 text-[#B4553F] cursor-pointer'
                  }`}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Vaciar papelera</span>
                </button>
              </>
            )}
          </div>
        </>
      )}

      {/* Modal para mover etiqueta dentro de otra */}
      {movingTag && (
        <div
          className="fixed inset-0 z-50 bg-black/30 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setMovingTag(null)}
        >
          <div
            className="bg-white border border-[#E4DECE] rounded-2xl shadow-2xl p-4 w-full max-w-xs text-xs text-[#2B2A28]"
            onClick={(e) => e.stopPropagation()}
          >
            <h4 className="font-semibold text-sm mb-1 text-[#2B2A28]">
              Mover "{movingTag.name}"
            </h4>
            <p className="text-[#8A8478] mb-3 text-[11px]">
              Selecciona la etiqueta principal de la cual será subetiqueta:
            </p>
            <div className="space-y-1 mb-3 max-h-48 overflow-y-auto">
              {tags
                .filter((t) => t.id !== movingTag.id && t.id !== 'sin-etiqueta')
                .map((t) => {
                  const isSub = !!t.parentId;
                  return (
                    <button
                      key={t.id}
                      onClick={() => {
                        if (isSub) {
                          alert('Esta etiqueta ya es una subetiqueta y no puede tener hijas propias.');
                          return;
                        }
                        handleMoveTag(movingTag, t.id);
                      }}
                      className="w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg hover:bg-[#F7F4EE] border border-transparent hover:border-[#E4DECE] text-left cursor-pointer transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0 shadow-xs"
                          style={{ backgroundColor: t.color }}
                        />
                        <span className="font-medium text-xs">{t.name}</span>
                      </div>
                      {isSub && (
                        <span className="text-[10px] text-[#8A8478] italic">Subetiqueta</span>
                      )}
                    </button>
                  );
                })}
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setMovingTag(null)}
                className="px-3 py-1.5 rounded-lg border border-[#E4DECE] text-[#8A8478] hover:text-[#2B2A28] text-xs cursor-pointer"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
};
