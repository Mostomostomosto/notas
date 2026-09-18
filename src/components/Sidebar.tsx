import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, Tag } from '../db/db';
import { SyncState } from '../services/syncEngine';
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
} from 'lucide-react';

export type SidebarFilter =
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
  const [isLogoMenuOpen, setIsLogoMenuOpen] = useState(false);

  // Queries reactivas con Dexie
  const tags = useLiveQuery(() => db.tags.toArray()) || [];
  const notes = useLiveQuery(() => db.notes.toArray()) || [];

  const allNotesCount = notes.filter((n) => !n.deleted).length;
  const pinnedCount = notes.filter((n) => !n.deleted && n.pinned).length;
  const trashCount = notes.filter((n) => n.deleted).length;

  const getTagCount = (tagName: string) => {
    return notes.filter((n) => !n.deleted && n.tag.toLowerCase() === tagName.toLowerCase()).length;
  };

  const handleCreateTag = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTagName.trim()) return;
    const tagId = newTagName.toLowerCase().trim().replace(/\s+/g, '-');
    await db.tags.put({
      id: tagId,
      name: newTagName.trim(),
      color: newTagColor,
    });
    setNewTagName('');
    setIsAddingTag(false);
  };

  const isFilterActive = (filter: SidebarFilter) => {
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
            className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-all ${
              isFilterActive({ type: 'trash' })
                ? 'bg-[#3F6E64] text-[#F7F4EE] font-semibold shadow-sm'
                : 'hover:bg-black/5 text-[#2B2A28]'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <Trash2 className="w-4 h-4 opacity-80" />
              <span>Papelera</span>
            </div>
            <span
              className={`text-[11px] px-1.5 py-0.2 rounded-full ${
                isFilterActive({ type: 'trash' })
                  ? 'bg-white/20 text-white'
                  : 'text-[#8A8478]'
              }`}
            >
              {trashCount}
            </span>
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
              className="text-[#8A8478] hover:text-[#2B2A28] p-0.5 rounded transition-colors"
              title="Nueva etiqueta"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="space-y-1">
            {tags.map((tag: Tag) => {
              const active = isFilterActive({
                type: 'tag',
                tagId: tag.id,
                tagName: tag.name,
              });
              const count = getTagCount(tag.name);
              return (
                <button
                  key={tag.id}
                  onClick={() =>
                    onSelectFilter({
                      type: 'tag',
                      tagId: tag.id,
                      tagName: tag.name,
                    })
                  }
                  className={`w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    active
                      ? 'bg-[#3F6E64] text-[#F7F4EE] font-semibold shadow-sm'
                      : 'hover:bg-black/5 text-[#2B2A28]'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0 shadow-xs"
                      style={{ backgroundColor: tag.color }}
                    />
                    <span className="truncate">{tag.name}</span>
                  </div>
                  <span
                    className={`text-[11px] ${
                      active ? 'text-white/80' : 'text-[#8A8478]'
                    }`}
                  >
                    {count}
                  </span>
                </button>
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
                placeholder="Nombre etiqueta"
                autoFocus
                className="w-full text-xs px-2 py-1 bg-[#F7F4EE] rounded border border-[#E4DECE] outline-none text-[#2B2A28] mb-2"
              />
              <div className="flex items-center justify-between gap-1">
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
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => setIsAddingTag(false)}
                    className="text-[10px] px-1.5 py-0.5 text-[#8A8478] hover:text-[#2B2A28]"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="text-[10px] px-2 py-0.5 bg-[#3F6E64] text-white rounded font-medium"
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
    </aside>
  );
};
