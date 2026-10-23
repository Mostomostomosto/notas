import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
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

  // Ancho redimensionable de la primera columna con persistencia en localStorage
  const [sidebarWidth, setSidebarWidth] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('sidebar_width');
      if (saved) {
        const parsed = parseInt(saved, 10);
        if (!isNaN(parsed) && parsed >= 180 && parsed <= 480) {
          return parsed;
        }
      }
    } catch {}
    return 240;
  });
  const [isResizing, setIsResizing] = useState(false);
  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 768 : true
  );

  useEffect(() => {
    const handleResize = () => setIsDesktop(window.innerWidth >= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    const startX = e.clientX;
    const startWidth = sidebarWidth;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const newWidth = Math.min(480, Math.max(180, startWidth + (moveEvent.clientX - startX)));
      setSidebarWidth(newWidth);
    };

    const onMouseUp = (upEvent: MouseEvent) => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      setIsResizing(false);
      const finalWidth = Math.min(480, Math.max(180, startWidth + (upEvent.clientX - startX)));
      try {
        localStorage.setItem('sidebar_width', String(finalWidth));
      } catch {}
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

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

  // Cerrar menú contextual al hacer clic fuera o en cualquier otra columna
  useEffect(() => {
    if (!contextMenu) return;
    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest('.sidebar-context-menu')) return;
      setContextMenu(null);
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setContextMenu(null);
    };

    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('contextmenu', handleOutsideClick);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('contextmenu', handleOutsideClick);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [contextMenu]);

  // Estados para Drag & Drop de etiquetas
  const [draggedTagId, setDraggedTagId] = useState<string | null>(null);
  const [dragOverTargetId, setDragOverTargetId] = useState<string | null>(null);
  const [isOverRootZone, setIsOverRootZone] = useState(false);
  const dragOccurredRef = React.useRef(false);

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


  const getTagCount = (tag: Tag) => {
    const descendants = getDescendantTags(tag.id, tags);
    const names = [tag.name.toLowerCase(), ...descendants.map((c) => c.name.toLowerCase())];
    return notes.filter((n) => !n.deleted && n.tag && names.includes(n.tag.toLowerCase())).length;
  };

  const validateCanBeParent = (_targetParentId: string): boolean => {
    // Sin límite de anidado: cualquier etiqueta puede tener subetiquetas
    return true;
  };

  const canDropTag = (sourceId: string | null, targetId: string | null): boolean => {
    if (!sourceId) return false;
    if (sourceId === 'sin-etiqueta') return false;
    if (targetId === 'sin-etiqueta') return false;
    if (sourceId === targetId) return false;

    const sourceTag = tags.find((t) => t.id === sourceId);
    if (!sourceTag) return false;

    // Soltar en raíz (desanidar a etiqueta principal)
    if (!targetId) {
      return Boolean(sourceTag.parentId);
    }

    const targetTag = tags.find((t) => t.id === targetId);
    if (!targetTag) return false;

    // No mezclar etiquetas archivadas con activas
    if (Boolean(sourceTag.archived) !== Boolean(targetTag.archived)) return false;

    // Ya es hija de este destino
    if (sourceTag.parentId === targetTag.id) return false;

    // No se puede soltar en uno de sus propios descendientes (evita ciclos)
    const descendants = getDescendantTags(sourceTag.id, tags);
    if (descendants.some((d) => d.id === targetTag.id)) return false;

    return true;
  };

  const getTagDragProps = (tag: Tag) => {
    if (tag.id === 'sin-etiqueta') {
      return {
        draggable: false,
        isDraggingThis: false,
        isDragOverThis: false,
        isValidDropTarget: false,
      };
    }

    const isDraggingThis = draggedTagId === tag.id;
    const isDragOverThis = dragOverTargetId === tag.id;
    const isValidDropTarget = draggedTagId ? canDropTag(draggedTagId, tag.id) : false;

    return {
      draggable: true,
      onDragStart: (e: React.DragEvent) => {
        e.stopPropagation();
        dragOccurredRef.current = true;
        setDraggedTagId(tag.id);
        e.dataTransfer.setData('text/plain', tag.id);
        e.dataTransfer.effectAllowed = 'move';
      },
      onDragEnd: (e: React.DragEvent) => {
        e.stopPropagation();
        setDraggedTagId(null);
        setDragOverTargetId(null);
        setIsOverRootZone(false);
        setTimeout(() => {
          dragOccurredRef.current = false;
        }, 120);
      },
      onDragOver: (e: React.DragEvent) => {
        if (draggedTagId && canDropTag(draggedTagId, tag.id)) {
          e.preventDefault();
          e.stopPropagation();
          e.dataTransfer.dropEffect = 'move';
          if (dragOverTargetId !== tag.id) {
            setDragOverTargetId(tag.id);
          }
        }
      },
      onDragLeave: (e: React.DragEvent) => {
        e.stopPropagation();
        const related = e.relatedTarget as Node | null;
        if (!e.currentTarget.contains(related)) {
          if (dragOverTargetId === tag.id) {
            setDragOverTargetId(null);
          }
        }
      },
      onDrop: (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        const sourceId = e.dataTransfer.getData('text/plain') || draggedTagId;
        setDraggedTagId(null);
        setDragOverTargetId(null);
        setIsOverRootZone(false);

        if (sourceId && canDropTag(sourceId, tag.id)) {
          const sourceTag = tags.find((t) => t.id === sourceId);
          if (sourceTag) {
            handleMoveTag(sourceTag, tag.id);
          }
        }
      },
      isDraggingThis,
      isDragOverThis,
      isValidDropTarget,
    };
  };

  const draggedTag = tags.find((t) => t.id === draggedTagId);
  const isDraggingSubtag = Boolean(draggedTag?.parentId && !draggedTag.archived);
  const isDraggingArchivedSubtag = Boolean(draggedTag?.parentId && draggedTag.archived);

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
        parentId: '',
        ...(tagToMove.archived !== undefined ? { archived: tagToMove.archived } : {}),
      });
    } else {
      if (newParentId === tagToMove.id) return;
      if (!validateCanBeParent(newParentId)) return;

      const descendants = getDescendantTags(tagToMove.id, tags);
      if (descendants.some((d) => d.id === newParentId)) {
        alert('No se puede mover una etiqueta dentro de uno de sus propios descendientes.');
        return;
      }


      const parentTag = tags.find((t) => t.id === newParentId);
      if (!parentTag) return;
      await db.tags.put({
        id: tagToMove.id,
        name: tagToMove.name,
        color: parentTag.color,
        parentId: newParentId,
        ...(tagToMove.archived !== undefined ? { archived: tagToMove.archived } : {}),
      });

      // Actualizar también el color de todos sus descendientes para mantener armonía visual
      for (const d of descendants) {
        await db.tags.update(d.id, { color: parentTag.color });
      }
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

  // Renderizador recursivo para etiquetas a cualquier nivel de anidado
  const renderTagItem = (
    tag: Tag,
    depth: number = 0,
    isArchivedContext: boolean = false
  ): React.ReactNode => {
    const active = isFilterActive({
      type: 'tag',
      tagId: tag.id,
      tagName: tag.name,
    });
    const count = getTagCount(tag);
    const childTags = isArchivedContext ? getArchivedChildTags(tag.id) : getChildTags(tag.id);
    const { isDraggingThis, isDragOverThis, isValidDropTarget, ...dragHandlers } =
      getTagDragProps(tag);
    const parentTag = tag.parentId ? tags.find((t) => t.id === tag.parentId) : null;

    const dotColor =
      depth === 0
        ? tag.color
        : desaturateColor(tag.color, Math.min(0.65, 0.25 + depth * 0.15));

    return (
      <div key={tag.id} className="space-y-0.5">
        <div
          {...dragHandlers}
          onContextMenu={(e) => openContextMenu(e, 'tag', tag)}
          onClick={() => {
            if (dragOccurredRef.current) return;
            onSelectFilter({
              type: 'tag',
              tagId: tag.id,
              tagName: tag.name,
            });
          }}
          style={{ paddingLeft: `${12 + depth * 14}px` }}
          className={`w-full flex items-center justify-between pr-3 py-1.5 rounded-lg font-medium transition-all group cursor-pointer ${
            depth === 0 ? 'text-xs' : 'text-[11.5px]'
          } ${
            active
              ? 'bg-[#3F6E64] text-[#F7F4EE] font-semibold shadow-sm'
              : 'hover:bg-black/5 text-[#2B2A28]'
          } ${
            isDraggingThis
              ? 'opacity-35 scale-[0.98] border border-dashed border-[#8A8478]'
              : ''
          } ${
            isDragOverThis
              ? 'ring-2 ring-[#3F6E64] bg-[#3F6E64]/15 shadow-sm scale-[1.01]'
              : ''
          }`}
        >
          <div className="flex items-center gap-2 min-w-0">
            <span
              className={`rounded-full shrink-0 shadow-xs ${
                depth === 0 ? 'w-2.5 h-2.5' : 'w-2 h-2 opacity-85'
              }`}
              style={{ backgroundColor: dotColor }}
            />
            <span className="truncate">{tag.name}</span>
            {isArchivedContext && tag.archived && (
              <span className="text-[9px] px-1 py-0.2 rounded bg-black/5 text-[#8A8478]">
                archivada
              </span>
            )}
            {isArchivedContext && parentTag && !parentTag.archived && (
              <span className="text-[9.5px] text-[#8A8478] italic truncate">
                (de {parentTag.name})
              </span>
            )}
          </div>

          {isDragOverThis ? (
            <span className="text-[10px] text-[#3F6E64] font-semibold flex items-center gap-1 bg-white/95 px-1.5 py-0.5 rounded shadow-2xs">
              <CornerDownRight className="w-3 h-3" />
              Hacer subetiqueta
            </span>
          ) : (
            <div className="flex items-center gap-1">
              {!isArchivedContext && tag.id !== 'sin-etiqueta' && (
                <span
                  role="button"
                  tabIndex={0}
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    setAddingSubtagForId(tag.id);
                    setSubtagName('');
                  }}
                  className={`p-0.5 rounded transition-opacity cursor-pointer ${
                    active
                      ? 'opacity-0 group-hover:opacity-100 text-white/80 hover:bg-white/10'
                      : 'opacity-0 group-hover:opacity-100 text-[#8A8478] hover:bg-black/10'
                  }`}
                  title={`Añadir subetiqueta a ${tag.name}`}
                >
                  <Plus className="w-3 h-3" />
                </span>
              )}
              {tag.id !== 'sin-etiqueta' && (
                <span
                  role="button"
                  tabIndex={0}
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    openContextMenu(e, 'tag', tag);
                  }}
                  className={`p-0.5 rounded transition-opacity cursor-pointer ${
                    active
                      ? 'opacity-0 group-hover:opacity-100 text-white/80 hover:bg-white/10'
                      : 'opacity-0 group-hover:opacity-100 text-[#8A8478] hover:bg-black/10'
                  }`}
                  title={isArchivedContext ? 'Opciones de etiqueta archivada' : 'Opciones de etiqueta'}
                >
                  <MoreVertical className="w-3 h-3" />
                </span>
              )}
              <span
                className={`text-[11px] ${
                  active ? 'text-white/80' : 'text-[#8A8478]'
                }`}
              >
                {count}
              </span>
            </div>
          )}
        </div>

        {/* Formulario para añadir subetiqueta */}
        {addingSubtagForId === tag.id && (
          <form
            onSubmit={(e) => handleCreateSubtag(tag.id, tag.color, e)}
            className="mr-1 my-1 p-2 bg-white rounded-lg border border-[#E4DECE] shadow-xs"
            style={{ marginLeft: `${24 + depth * 14}px` }}
          >
            <div className="flex items-center gap-1.5 mb-1.5">
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{
                  backgroundColor: desaturateColor(
                    tag.color,
                    Math.min(0.65, 0.25 + (depth + 1) * 0.15)
                  ),
                }}
              />
              <span className="text-[10px] text-[#8A8478] font-medium truncate">
                Nueva subetiqueta de {tag.name}
              </span>
            </div>
            <input
              type="text"
              value={subtagName}
              onChange={(e) => setSubtagName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleCreateSubtag(tag.id, tag.color, e);
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

        {/* Subetiquetas hijas recursivas */}
        {childTags.map((child: Tag) => renderTagItem(child, depth + 1, isArchivedContext))}
      </div>
    );
  };

  return (
    <aside
      className="relative flex-shrink-0 bg-[#EDEAE2] border-r border-[#E4DECE] flex flex-col h-full select-none text-[#2B2A28]"
      style={isDesktop ? { width: `${sidebarWidth}px`, minWidth: `${sidebarWidth}px` } : { width: '16rem' }}
    >
      {/* Barra de redimensionamiento arrastrable en escritorio */}
      <div
        onMouseDown={handleResizeStart}
        className="hidden md:block absolute top-0 -right-1.5 w-3 h-full cursor-col-resize z-30 group"
        title="Arrastra para redimensionar la primera columna"
      >
        <div className="w-0.5 h-full mx-auto group-hover:bg-[#3F6E64]/60 group-active:bg-[#3F6E64] transition-colors" />
      </div>

      {isResizing && (
        <div className="fixed inset-0 z-50 cursor-col-resize select-none" />
      )}
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
              {/* Zona para soltar y convertir en raíz archivada si se arrastra una subetiqueta archivada */}
              {isDraggingArchivedSubtag && (
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    e.dataTransfer.dropEffect = 'move';
                    if (!isOverRootZone) setIsOverRootZone(true);
                  }}
                  onDragLeave={(e) => {
                    e.stopPropagation();
                    const related = e.relatedTarget as Node | null;
                    if (!e.currentTarget.contains(related)) {
                      setIsOverRootZone(false);
                    }
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const sourceId = e.dataTransfer.getData('text/plain') || draggedTagId;
                    setDraggedTagId(null);
                    setDragOverTargetId(null);
                    setIsOverRootZone(false);
                    if (sourceId) {
                      const sourceTag = tags.find((t) => t.id === sourceId);
                      if (sourceTag && sourceTag.parentId) {
                        handleMoveTag(sourceTag, null);
                      }
                    }
                  }}
                  className={`mb-2 mx-1 px-3 py-1.5 border-2 border-dashed rounded-lg text-center transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    isOverRootZone
                      ? 'border-[#3F6E64] bg-[#3F6E64]/15 text-[#3F6E64] font-semibold scale-[1.02] shadow-sm'
                      : 'border-[#E4DECE] bg-[#FAF8F5] text-[#8A8478]'
                  }`}
                >
                  <FolderInput className="w-3.5 h-3.5" />
                  <span className="text-[10.5px]">Soltar aquí para convertir en raíz archivada</span>
                </div>
              )}

              {archivedRootTags.map((rootTag: Tag) => renderTagItem(rootTag, 0, true))}

              {/* Subetiquetas archivadas por su cuenta cuyo padre NO está archivado */}
              {orphanArchivedChildTags.map((orphan: Tag) =>
                renderTagItem(orphan, Math.max(1, getTagDepth(orphan.id, tags)), true)
              )}
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

          {/* Zona para soltar y convertir en etiqueta principal si se arrastra una subetiqueta */}
          {isDraggingSubtag && (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
                e.dataTransfer.dropEffect = 'move';
                if (!isOverRootZone) setIsOverRootZone(true);
              }}
              onDragLeave={(e) => {
                e.stopPropagation();
                const related = e.relatedTarget as Node | null;
                if (!e.currentTarget.contains(related)) {
                  setIsOverRootZone(false);
                }
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                const sourceId = e.dataTransfer.getData('text/plain') || draggedTagId;
                setDraggedTagId(null);
                setDragOverTargetId(null);
                setIsOverRootZone(false);
                if (sourceId) {
                  const sourceTag = tags.find((t) => t.id === sourceId);
                  if (sourceTag && sourceTag.parentId) {
                    handleMoveTag(sourceTag, null);
                  }
                }
              }}
              className={`mb-2 mx-1 px-3 py-2 border-2 border-dashed rounded-lg text-center transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                isOverRootZone
                  ? 'border-[#3F6E64] bg-[#3F6E64]/15 text-[#3F6E64] font-semibold scale-[1.02] shadow-sm'
                  : 'border-[#E4DECE] bg-[#FAF8F5] text-[#8A8478]'
              }`}
            >
              <FolderInput className="w-3.5 h-3.5" />
              <span className="text-[11px]">Soltar aquí para convertir en etiqueta principal</span>
            </div>
          )}

          <div className="space-y-1">
            {rootTags.map((rootTag: Tag) => renderTagItem(rootTag, 0, false))}
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
                    .filter((t) => t.id !== 'sin-etiqueta' && !t.archived)
                    .map((t) => {
                      const depth = getTagDepth(t.id, tags);
                      const prefix = depth === 0 ? '' : `${'  '.repeat(depth)}↳ `;
                      return (
                        <option key={t.id} value={t.id}>
                          {depth === 0
                            ? `Subetiqueta de ${t.name}`
                            : `${prefix}Subetiqueta (nivel ${depth + 1}) de ${t.name}`}
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
      {contextMenu &&
        createPortal(
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
              className="sidebar-context-menu fixed z-50 bg-white border border-[#E4DECE] rounded-xl shadow-xl py-1.5 px-1 min-w-[170px] text-xs text-[#2B2A28]"
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
                          : desaturateColor(tag.color, Math.min(0.65, 0.25 + depth * 0.15)),
                      }}
                    />
                    <span className="truncate">{tag.name}</span>
                    {depth > 0 && (
                      <span className="text-[9px] text-[#8A8478] font-normal lowercase">
                        (nivel {depth})
                      </span>
                    )}
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

                  {/* Añadir subetiqueta (permitido en cualquier nivel) */}
                  {!tag.archived && tag.id !== 'sin-etiqueta' && (
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
                      <span>Añadir subetiqueta</span>
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

                  {/* Si tiene abuelo (profundidad >= 2): Subir a nivel de abuelo */}
                  {!tag.archived && grandparentTag && (
                    <button
                      onClick={() => handleMoveTag(tag, grandparentTag.id)}
                      className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-[#F7F4EE] text-[#2B2A28] transition-colors text-left cursor-pointer"
                    >
                      <ArrowLeft className="w-3.5 h-3.5 text-[#8A8478]" />
                      <span>Subir nivel (hija de {grandparentTag.name})</span>
                    </button>
                  )}

                  {/* Si es subetiqueta (nivel > 0): Convertir en principal */}
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
        </>,
        document.body
      )}

      {/* Modal para mover etiqueta dentro de otra */}
      {movingTag &&
        createPortal(
          (() => {
        const movingDescendants = getDescendantTags(movingTag.id, tags);
        const candidateParents = tags.filter((t) => {
          if (t.id === movingTag.id) return false;
          if (t.id === 'sin-etiqueta' || t.archived) return false;
          if (movingDescendants.some((d) => d.id === t.id)) return false;
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
                        style={{ paddingLeft: `${10 + depth * 14}px` }}
                        className="w-full flex items-center justify-between gap-2 pr-2.5 py-2 rounded-lg hover:bg-[#F7F4EE] border border-transparent hover:border-[#E4DECE] text-left cursor-pointer transition-colors"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className="rounded-full shrink-0 shadow-xs"
                            style={{
                              width: depth === 0 ? '10px' : '8px',
                              height: depth === 0 ? '10px' : '8px',
                              backgroundColor:
                                depth === 0
                                  ? t.color
                                  : desaturateColor(
                                      t.color,
                                      Math.min(0.65, 0.25 + depth * 0.15)
                                    ),
                            }}
                          />
                          <span className="font-medium text-xs truncate">
                            {depth > 0 ? `↳ ${t.name}` : t.name}
                          </span>
                        </div>
                        <span className="text-[10px] text-[#8A8478] italic shrink-0">
                          {depth === 0 ? 'Raíz' : `Nivel ${depth}`}
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
      })(),
      document.body
    )}
    </aside>
  );
};
