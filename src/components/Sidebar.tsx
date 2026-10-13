import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  db,
  Tag,
  desaturateColor,
  isNoteArchived,
  getTagDepth,
  getDescendantTags,
} from '../db/db';
import { SyncState, scheduleSync } from '../services/syncEngine';
import { DropboxUserProfile } from '../services/dropboxAuth';
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
  Archive,
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
  userProfile: DropboxUserProfile | null;
  onConnectDropbox: () => void;
  onLogoutDropbox: () => void;
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
  onConnectDropbox,
  onLogoutDropbox,
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

  const allNotesCount = notes.filter((n) => !n.deleted && !isNoteArchived(n.tag, tags)).length;
  const pinnedCount = notes.filter((n) => !n.deleted && n.pinned && !isNoteArchived(n.tag, tags)).length;
  const trashCount = notes.filter((n) => n.deleted).length;

  const rootTags = tags.filter((t: Tag) => !t.parentId && !t.archived);
  const getChildTags = (parentId: string) => tags.filter((t: Tag) => t.parentId === parentId && !t.archived);

  // Listas para la sección de etiquetas archivadas
  const archivedRootTags = tags.filter((t: Tag) => !t.parentId && t.archived);
  const getArchivedChildTags = (parentId: string) => tags.filter((t: Tag) => t.parentId === parentId);
  const orphanArchivedChildTags = tags.filter((t: Tag) => {
    if (!t.parentId || !t.archived) return false;
    const parent = tags.find((p) => p.id === t.parentId);
    return !parent || !parent.archived;
  });
  const totalArchivedCount = tags.filter((t: Tag) => t.archived).length;

  const getExactTagCount = (tagName: string) => {
    return notes.filter((n) => !n.deleted && n.tag && n.tag.toLowerCase() === tagName.toLowerCase()).length;
  };

  const getTagCount = (tag: Tag) => {
    const descendants = getDescendantTags(tag.id, tags);
    const names = [tag.name.toLowerCase(), ...descendants.map((c) => c.name.toLowerCase())];
    return notes.filter((n) => !n.deleted && n.tag && names.includes(n.tag.toLowerCase())).length;
  };

  const validateCanBeParent = (targetParentId: string): boolean => {
    const parentTag = tags.find((t) => t.id === targetParentId);
    if (!parentTag) return true;
    const depth = getTagDepth(targetParentId, tags);
    if (depth >= 2) {
      alert('Esta etiqueta ya está en el nivel máximo de subetiquetas y no puede tener hijas propias.');
      return false;
    }
    return true;
  };

  const getMaxSubtreeDepth = (tagId: string, allTags: Tag[]): number => {
    const children = allTags.filter((t) => t.parentId === tagId);
    if (children.length === 0) return 0;
    return 1 + Math.max(...children.map((c) => getMaxSubtreeDepth(c.id, allTags)));
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
    if (token) {
      scheduleSync(token);
    }
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
    if (token) {
      scheduleSync(token);
    }
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
      if (newParentId === tagToMove.id) return;
      if (!validateCanBeParent(newParentId)) return;

      const descendants = getDescendantTags(tagToMove.id, tags);
      if (descendants.some((d) => d.id === newParentId)) {
        alert('No se puede mover una etiqueta dentro de uno de sus propios descendientes.');
        return;
      }

      const targetParentDepth = getTagDepth(newParentId, tags);
      const subtreeDepth = getMaxSubtreeDepth(tagToMove.id, tags);
      if (targetParentDepth + 1 + subtreeDepth > 2) {
        alert('Mover esta etiqueta aquí excedería el límite de 2 niveles de subetiquetas.');
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
    if (token) {
      scheduleSync(token);
    }
  };

  const handleArchiveTag = async (tagToArchive: Tag) => {
    setContextMenu(null);
    const descendants = getDescendantTags(tagToArchive.id, tags);
    if (descendants.length > 0) {
      const allNames = [
        tagToArchive.name.toLowerCase(),
        ...descendants.map((c) => c.name.toLowerCase()),
      ];
      const hiddenNotesCount = notes.filter(
        (n) => !n.deleted && n.tag && allNames.includes(n.tag.toLowerCase())
      ).length;
      const confirmMsg = `¿Archivar la etiqueta "${tagToArchive.name}"? Quedarán ocultas un total de ${hiddenNotesCount} nota(s) sumando las de esta etiqueta y sus ${descendants.length} subetiqueta(s).`;
      if (!window.confirm(confirmMsg)) {
        return;
      }
    }
    await db.tags.update(tagToArchive.id, { archived: true });
    if (token) {
      scheduleSync(token);
    }
  };

  const handleUnarchiveTag = async (tagToUnarchive: Tag) => {
    setContextMenu(null);
    await db.tags.update(tagToUnarchive.id, { archived: false });
    if (token) {
      scheduleSync(token);
    }
  };

  const handleDeleteTag = async (tagToDelete: Tag) => {
    setContextMenu(null);
    const descendants = getDescendantTags(tagToDelete.id, tags);
    const tagNamesToClear = [
      tagToDelete.name.toLowerCase(),
      ...descendants.map((c) => c.name.toLowerCase()),
    ];

    const affectedNotes = notes.filter(
      (n) => n.tag && tagNamesToClear.includes(n.tag.toLowerCase())
    );

    const confirmMsg = descendants.length > 0
      ? `¿Eliminar la etiqueta "${tagToDelete.name}" y sus ${descendants.length} subetiqueta(s)? Las ${affectedNotes.length} nota(s) pasarán a "Sin etiqueta".`
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
    const idsToDelete = [tagToDelete.id, ...descendants.map((c) => c.id)];
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
            <img
              src="/def-ico.png"
              alt="Bitácora"
              className="w-7 h-7 rounded-lg object-contain shadow-xs shrink-0"
            />
            <div className="min-w-0">
              <span className="font-bold text-sm tracking-tight text-[#2B2A28] block leading-none">
                Bitácora
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

        {/* Sección Archivadas (debajo de Papelera) */}
        <div className="pt-2 border-t border-[#E4DECE]/70">
          <div className="flex items-center justify-between px-3 mb-1">
            <div className="flex items-center gap-1.5 text-[10px] uppercase font-bold tracking-wider text-[#8A8478]">
              <Archive className="w-3.5 h-3.5 text-[#8A8478]" />
              <span>Archivadas</span>
            </div>
            <span className="text-[10px] text-[#8A8478] font-medium">
              {totalArchivedCount}
            </span>
          </div>

          {totalArchivedCount === 0 ? (
            <div className="px-3 py-1 text-[11px] text-[#8A8478]/70 italic">
              Sin etiquetas archivadas
            </div>
          ) : (
            <div className="space-y-1">
              {archivedRootTags.map((rootTag: Tag) => {
                const active = isFilterActive({
                  type: 'tag',
                  tagId: rootTag.id,
                  tagName: rootTag.name,
                });
                const count = getTagCount(rootTag);
                const childTags = getArchivedChildTags(rootTag.id);

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
                          : 'hover:bg-black/5 text-[#2B2A28]/80'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0 opacity-70"
                          style={{ backgroundColor: rootTag.color }}
                        />
                        <span className="truncate">{rootTag.name}</span>
                        <span className="text-[9px] px-1 py-0.2 rounded bg-black/5 text-[#8A8478]">
                          archivada
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
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
                          title="Opciones de etiqueta archivada"
                        >
                          <MoreVertical className="w-3 h-3" />
                        </span>
                        <span
                          className={`text-[11px] ${
                            active ? 'text-white/80' : 'text-[#8A8478]'
                          }`}
                        >
                          {count}
                        </span>
                      </div>
                    </div>

                    {/* Subetiquetas hijas de la raíz archivada */}
                    {childTags.map((child: Tag) => {
                      const childActive = isFilterActive({
                        type: 'tag',
                        tagId: child.id,
                        tagName: child.name,
                      });
                      const childCount = getTagCount(child);
                      const grandChildren = getArchivedChildTags(child.id);

                      return (
                        <div key={child.id} className="space-y-0.5">
                          <div
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
                                : 'hover:bg-black/5 text-[#2B2A28]/80'
                            }`}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <span
                                className="w-2 h-2 rounded-full shrink-0 opacity-70"
                                style={{ backgroundColor: desaturateColor(child.color, 0.55) }}
                              />
                              <span className="truncate">{child.name}</span>
                              {child.archived && (
                                <span className="text-[9px] px-1 py-0.2 rounded bg-black/5 text-[#8A8478]">
                                  archivada
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1">
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

                          {/* Subetiquetas nietas archivadas */}
                          {grandChildren.map((grandChild: Tag) => {
                            const grandChildActive = isFilterActive({
                              type: 'tag',
                              tagId: grandChild.id,
                              tagName: grandChild.name,
                            });
                            const grandChildCount = getExactTagCount(grandChild.name);
                            return (
                              <div
                                key={grandChild.id}
                                onContextMenu={(e) => openContextMenu(e, 'tag', grandChild)}
                                onClick={() =>
                                  onSelectFilter({
                                    type: 'tag',
                                    tagId: grandChild.id,
                                    tagName: grandChild.name,
                                  })
                                }
                                className={`w-full flex items-center justify-between pl-11 pr-3 py-1.5 rounded-lg text-[11px] font-medium transition-all group cursor-pointer ${
                                  grandChildActive
                                    ? 'bg-[#3F6E64] text-[#F7F4EE] font-semibold shadow-sm'
                                    : 'hover:bg-black/5 text-[#2B2A28]/80'
                                }`}
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <span
                                    className="w-1.5 h-1.5 rounded-full shrink-0 opacity-70"
                                    style={{ backgroundColor: desaturateColor(grandChild.color, 0.3) }}
                                  />
                                  <span className="truncate">{grandChild.name}</span>
                                  {grandChild.archived && (
                                    <span className="text-[9px] px-1 py-0.2 rounded bg-black/5 text-[#8A8478]">
                                      archivada
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-1">
                                  <span
                                    role="button"
                                    tabIndex={0}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      openContextMenu(e, 'tag', grandChild);
                                    }}
                                    className={`p-0.5 rounded transition-opacity cursor-pointer ${
                                      grandChildActive
                                        ? 'opacity-0 group-hover:opacity-100 text-white/80 hover:bg-white/10'
                                        : 'opacity-0 group-hover:opacity-100 text-[#8A8478] hover:bg-black/10'
                                    }`}
                                    title="Opciones de subetiqueta"
                                  >
                                    <MoreVertical className="w-3 h-3" />
                                  </span>
                                  <span
                                    className={`text-[10px] ${
                                      grandChildActive ? 'text-white/80' : 'text-[#8A8478]'
                                    }`}
                                  >
                                    {grandChildCount}
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                );
              })}

              {/* Subetiquetas archivadas por su cuenta cuyo padre NO está archivado */}
              {orphanArchivedChildTags.map((child: Tag) => {
                const parent = tags.find((p) => p.id === child.parentId);
                const childActive = isFilterActive({
                  type: 'tag',
                  tagId: child.id,
                  tagName: child.name,
                });
                const childCount = getExactTagCount(child.name);
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
                    className={`w-full flex items-center justify-between pl-6 pr-3 py-1.5 rounded-lg text-[11.5px] font-medium transition-all group cursor-pointer ${
                      childActive
                        ? 'bg-[#3F6E64] text-[#F7F4EE] font-semibold shadow-sm'
                        : 'hover:bg-black/5 text-[#2B2A28]/80'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="w-2 h-2 rounded-full shrink-0 opacity-70"
                        style={{ backgroundColor: desaturateColor(child.color) }}
                      />
                      <span className="truncate">{child.name}</span>
                      {parent && (
                        <span className="text-[9.5px] text-[#8A8478] italic truncate">
                          (de {parent.name})
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
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
                        title="Opciones de subetiqueta archivada"
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
          )}
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
                    const childCount = getTagCount(child);
                    const desaturatedBg = desaturateColor(child.color, 0.55);
                    const grandChildren = getChildTags(child.id);

                    return (
                      <div key={child.id} className="space-y-0.5">
                        <div
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
                                setAddingSubtagForId(child.id);
                                setSubtagName('');
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

                        {/* Formulario para añadir subetiqueta de nivel 2 */}
                        {addingSubtagForId === child.id && (
                          <form
                            onSubmit={(e) => handleCreateSubtag(child.id, child.color, e)}
                            className="ml-9 mr-1 my-1 p-2 bg-white rounded-lg border border-[#E4DECE] shadow-xs"
                          >
                            <div className="flex items-center gap-1.5 mb-1.5">
                              <span
                                className="w-1.5 h-1.5 rounded-full shrink-0"
                                style={{ backgroundColor: desaturateColor(child.color, 0.3) }}
                              />
                              <span className="text-[10px] text-[#8A8478] font-medium">
                                Nueva subetiqueta de {child.name}
                              </span>
                            </div>
                            <input
                              type="text"
                              value={subtagName}
                              onChange={(e) => setSubtagName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  handleCreateSubtag(child.id, child.color, e);
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

                        {/* Subetiquetas de nivel 2 (nietas) */}
                        {grandChildren.map((grandChild: Tag) => {
                          const grandChildActive = isFilterActive({
                            type: 'tag',
                            tagId: grandChild.id,
                            tagName: grandChild.name,
                          });
                          const grandChildCount = getExactTagCount(grandChild.name);
                          const grandChildBg = desaturateColor(grandChild.color, 0.3);

                          return (
                            <div
                              key={grandChild.id}
                              onContextMenu={(e) => openContextMenu(e, 'tag', grandChild)}
                              onClick={() =>
                                onSelectFilter({
                                  type: 'tag',
                                  tagId: grandChild.id,
                                  tagName: grandChild.name,
                                })
                              }
                              className={`w-full flex items-center justify-between pl-11 pr-3 py-1.5 rounded-lg text-[11px] font-medium transition-all group cursor-pointer ${
                                grandChildActive
                                  ? 'bg-[#3F6E64] text-[#F7F4EE] font-semibold shadow-sm'
                                  : 'hover:bg-black/5 text-[#2B2A28]'
                              }`}
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <span
                                  className="w-1.5 h-1.5 rounded-full shrink-0 shadow-xs"
                                  style={{ backgroundColor: grandChildBg }}
                                />
                                <span className="truncate">{grandChild.name}</span>
                              </div>
                              <div className="flex items-center gap-1">
                                <span
                                  role="button"
                                  tabIndex={0}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openContextMenu(e, 'tag', grandChild);
                                  }}
                                  className={`p-0.5 rounded transition-opacity cursor-pointer ${
                                    grandChildActive
                                      ? 'opacity-0 group-hover:opacity-100 text-white/80 hover:bg-white/10'
                                      : 'opacity-0 group-hover:opacity-100 text-[#8A8478] hover:bg-black/10'
                                  }`}
                                  title="Opciones de subetiqueta"
                                >
                                  <MoreVertical className="w-3 h-3" />
                                </span>
                                <span
                                  className={`text-[10px] ${
                                    grandChildActive ? 'text-white/80' : 'text-[#8A8478]'
                                  }`}
                                >
                                  {grandChildCount}
                                </span>
                              </div>
                            </div>
                          );
                        })}
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
                    .filter((t) => t.id !== 'sin-etiqueta' && !t.archived && getTagDepth(t.id, tags) < 2)
                    .map((t) => {
                      const depth = getTagDepth(t.id, tags);
                      return (
                        <option key={t.id} value={t.id}>
                          {depth === 0 ? `Subetiqueta de ${t.name}` : `  ↳ Subetiqueta (nivel 2) de ${t.name}`}
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

      {/* Footer: Dropbox Sync & Auth Status */}
      <div className="p-3 border-t border-[#E4DECE] bg-[#EDEAE2] space-y-2">
        {/* Sync Status Badge */}
        <div className="flex items-center justify-between px-2 py-1.5 bg-white/60 rounded-lg border border-[#E4DECE]/70 text-xs">
          <div className="flex items-center gap-2 min-w-0">
            {syncState === 'syncing' ? (
              <RefreshCw className="w-3.5 h-3.5 text-[#0061FE] animate-spin shrink-0" />
            ) : syncState === 'offline' ? (
              <CloudOff className="w-3.5 h-3.5 text-[#8A8478] shrink-0" />
            ) : syncState === 'error' ? (
              <AlertCircle className="w-3.5 h-3.5 text-[#B4553F] shrink-0" />
            ) : (
              <Cloud className="w-3.5 h-3.5 text-[#0061FE] shrink-0" />
            )}
            <span className="text-[11px] text-[#2B2A28] font-medium truncate">
              {token ? (syncMessage || 'Sincronizado') : 'Solo local (offline)'}
            </span>
          </div>

          {token && (
            <button
              onClick={onTriggerSync}
              className="text-[#8A8478] hover:text-[#0061FE] p-1 rounded transition-colors"
              title="Sincronizar ahora con Dropbox"
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
                <div className="w-5 h-5 rounded-full bg-[#0061FE] text-[#F7F4EE] text-[10px] flex items-center justify-center shrink-0">
                  {userProfile?.name?.charAt(0) || 'D'}
                </div>
              )}
              <span className="text-[11px] text-[#8A8478] truncate max-w-[100px]">
                {userProfile?.name || userProfile?.email || 'Dropbox'}
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
                onClick={onLogoutDropbox}
                className="text-[#8A8478] hover:text-[#B4553F] p-1 transition-colors cursor-pointer"
                title="Desconectar Dropbox"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-1.5">
            <button
              onClick={onConnectDropbox}
              className="flex-1 py-1.5 px-2 bg-[#0061FE] hover:bg-[#0052D9] text-[#F7F4EE] text-xs font-medium rounded-lg flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-xs"
            >
              <Cloud className="w-3.5 h-3.5 text-[#F7F4EE]" />
              <span>Conectar Dropbox</span>
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
              const tag = contextMenu.tag!;
              const depth = getTagDepth(tag.id, tags);
              const parentTag = tag.parentId ? tags.find((t) => t.id === tag.parentId) : null;
              const grandparentTag = parentTag?.parentId ? tags.find((t) => t.id === parentTag.parentId) : null;

              return (
                <>
                  <div className="px-2.5 py-1 text-[10px] uppercase font-bold text-[#8A8478] tracking-wider border-b border-[#E4DECE]/50 mb-1 flex items-center gap-1.5 truncate">
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{
                        backgroundColor: depth === 0
                          ? tag.color
                          : desaturateColor(tag.color, depth === 1 ? 0.55 : 0.3),
                      }}
                    />
                    <span className="truncate">{tag.name}</span>
                  </div>

                  {/* Si está archivada: botón Desarchivar */}
                  {tag.archived && (
                    <button
                      onClick={() => handleUnarchiveTag(tag)}
                      className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-[#F7F4EE] text-[#3F6E64] transition-colors text-left cursor-pointer font-medium"
                    >
                      <Archive className="w-3.5 h-3.5 text-[#3F6E64]" />
                      <span>Desarchivar etiqueta</span>
                    </button>
                  )}

                  {/* Añadir subetiqueta (permitido en nivel 0 y nivel 1) */}
                  {!tag.archived && tag.id !== 'sin-etiqueta' && depth < 2 && (
                    <button
                      onClick={() => {
                        const tagId = tag.id;
                        setContextMenu(null);
                        setAddingSubtagForId(tagId);
                        setSubtagName('');
                      }}
                      className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-[#F7F4EE] text-[#2B2A28] transition-colors text-left cursor-pointer"
                    >
                      <CornerDownRight className="w-3.5 h-3.5 text-[#3F6E64]" />
                      <span>{depth === 0 ? 'Añadir subetiqueta' : 'Añadir subetiqueta de 2º nivel'}</span>
                    </button>
                  )}

                  {/* Mover / Hacer subetiqueta de... */}
                  {!tag.archived && tag.id !== 'sin-etiqueta' && (
                    <button
                      onClick={() => {
                        setMovingTag(tag);
                        setContextMenu(null);
                      }}
                      className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-[#F7F4EE] text-[#2B2A28] transition-colors text-left cursor-pointer"
                    >
                      <FolderInput className="w-3.5 h-3.5 text-[#8A8478]" />
                      <span>Hacer subetiqueta de...</span>
                    </button>
                  )}

                  {/* Si es subetiqueta de 2º nivel: Subir a nivel 1 */}
                  {!tag.archived && depth === 2 && grandparentTag && (
                    <button
                      onClick={() => handleMoveTag(tag, grandparentTag.id)}
                      className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-[#F7F4EE] text-[#2B2A28] transition-colors text-left cursor-pointer"
                    >
                      <ArrowLeft className="w-3.5 h-3.5 text-[#8A8478]" />
                      <span>Subir nivel (hija de {grandparentTag.name})</span>
                    </button>
                  )}

                  {/* Si es subetiqueta (nivel 1 o 2): Convertir en principal */}
                  {!tag.archived && depth > 0 && (
                    <button
                      onClick={() => handleMoveTag(tag, null)}
                      className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-[#F7F4EE] text-[#2B2A28] transition-colors text-left cursor-pointer"
                    >
                      <ArrowLeft className="w-3.5 h-3.5 text-[#8A8478]" />
                      <span>Convertir en principal</span>
                    </button>
                  )}

                  {/* Archivar etiqueta (si está activa) */}
                  {!tag.archived && tag.id !== 'sin-etiqueta' && (
                    <button
                      onClick={() => handleArchiveTag(tag)}
                      className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-[#F7F4EE] text-[#8A8478] hover:text-[#2B2A28] transition-colors text-left cursor-pointer"
                    >
                      <Archive className="w-3.5 h-3.5 text-[#8A8478]" />
                      <span>Archivar etiqueta</span>
                    </button>
                  )}

                  {/* Eliminar etiqueta */}
                  {tag.id !== 'sin-etiqueta' ? (
                    <button
                      onClick={() => handleDeleteTag(tag)}
                      className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-[#B4553F]/10 text-[#B4553F] transition-colors text-left cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>
                        {tag.parentId ? 'Eliminar subetiqueta' : 'Eliminar etiqueta'}
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
      {movingTag && (() => {
        const movingSubtreeDepth = getMaxSubtreeDepth(movingTag.id, tags);
        const movingDescendants = getDescendantTags(movingTag.id, tags);
        const candidateParents = tags.filter((t) => {
          if (t.id === movingTag.id) return false;
          if (t.id === 'sin-etiqueta' || t.archived) return false;
          if (movingDescendants.some((d) => d.id === t.id)) return false;
          const parentDepth = getTagDepth(t.id, tags);
          if (parentDepth >= 2) return false;
          if (parentDepth + 1 + movingSubtreeDepth > 2) return false;
          return true;
        });

        return (
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
                Selecciona la etiqueta de la cual será subetiqueta:
              </p>

              <div className="space-y-1 mb-3 max-h-56 overflow-y-auto">
                {movingTag.parentId && (
                  <button
                    onClick={() => handleMoveTag(movingTag, null)}
                    className="w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg hover:bg-[#F7F4EE] border border-dashed border-[#E4DECE] text-left cursor-pointer transition-colors mb-2 text-[#3F6E64] font-medium"
                  >
                    <div className="flex items-center gap-2">
                      <ArrowLeft className="w-3.5 h-3.5 text-[#3F6E64]" />
                      <span>Convertir en principal (sin padre)</span>
                    </div>
                  </button>
                )}

                {candidateParents.length === 0 ? (
                  <p className="text-[11px] text-[#8A8478] italic py-2 text-center">
                    No hay otras etiquetas compatibles para ser padre.
                  </p>
                ) : (
                  candidateParents.map((t) => {
                    const depth = getTagDepth(t.id, tags);
                    return (
                      <button
                        key={t.id}
                        onClick={() => handleMoveTag(movingTag, t.id)}
                        className={`w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg hover:bg-[#F7F4EE] border border-transparent hover:border-[#E4DECE] text-left cursor-pointer transition-colors ${
                          depth === 1 ? 'pl-6' : ''
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0 shadow-xs"
                            style={{
                              backgroundColor: depth === 0 ? t.color : desaturateColor(t.color, 0.55),
                            }}
                          />
                          <span className="font-medium text-xs">
                            {depth === 1 ? `↳ ${t.name}` : t.name}
                          </span>
                        </div>
                        <span className="text-[10px] text-[#8A8478] italic">
                          {depth === 0 ? 'Raíz' : 'Nivel 1'}
                        </span>
                      </button>
                    );
                  })
                )}
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
        );
      })()}
    </aside>
  );
};
