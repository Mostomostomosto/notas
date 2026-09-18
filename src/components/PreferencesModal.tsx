import React, { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { getSettings, saveSettings } from '../services/settings';
import { resetCachedFolderId, SyncState } from '../services/syncEngine';
import { UserProfile } from '../services/googleAuth';
import {
  X,
  Settings,
  Folder,
  Cloud,
  RefreshCw,
  LogOut,
  ShieldCheck,
  FileText,
  ExternalLink,
  Check,
  RotateCcw,
} from 'lucide-react';

interface PreferencesModalProps {
  isOpen: boolean;
  onClose: () => void;
  token: string | null;
  userProfile: UserProfile | null;
  syncState: SyncState;
  syncMessage: string;
  onConnectGoogle: () => void;
  onLogoutGoogle: () => void;
  onTriggerSync: () => void;
}

export const PreferencesModal: React.FC<PreferencesModalProps> = ({
  isOpen,
  onClose,
  token,
  userProfile,
  syncState,
  syncMessage,
  onConnectGoogle,
  onLogoutGoogle,
  onTriggerSync,
}) => {
  const [folderName, setFolderName] = useState('');
  const [autoSync, setAutoSync] = useState(true);
  const [savedSuccess, setSavedSuccess] = useState(false);

  // Consultar notas pendientes de sincronizar
  const pendingNotes =
    useLiveQuery(() =>
      db.notes
        .filter((n) => n.syncStatus === 'pending' || n.syncStatus === 'error')
        .toArray()
    ) || [];

  useEffect(() => {
    if (isOpen) {
      const current = getSettings();
      setFolderName(current.driveFolderName);
      setAutoSync(current.autoSync);
      setSavedSuccess(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSaveSettings = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanFolder =
      folderName.trim().replace(/[/\\:*?"<>|]/g, '_') || 'MiAppNotas';
    setFolderName(cleanFolder);
    saveSettings({
      driveFolderName: cleanFolder,
      autoSync,
    });
    resetCachedFolderId();
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2500);

    if (token) {
      onTriggerSync();
    }
  };

  const handleResetFolder = () => {
    setFolderName('MiAppNotas');
    saveSettings({ driveFolderName: 'MiAppNotas' });
    resetCachedFolderId();
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2500);
    if (token) {
      onTriggerSync();
    }
  };

  const handleToggleAutoSync = () => {
    const newVal = !autoSync;
    setAutoSync(newVal);
    saveSettings({ autoSync: newVal });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in duration-150 select-none">
      <div
        className="bg-[#F7F4EE] border border-[#E4DECE] w-full max-w-lg rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 border-b border-[#E4DECE] bg-[#EDEAE2] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#3F6E64] text-white flex items-center justify-center shadow-xs">
              <Settings className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-bold text-sm text-[#2B2A28] leading-tight">
                Preferencias y Google Drive
              </h2>
              <p className="text-[11px] text-[#8A8478]">
                Configuración de almacenamiento y sincronización
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#8A8478] hover:text-[#2B2A28] hover:bg-black/5 transition-colors cursor-pointer"
            title="Cerrar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto space-y-5 text-[#2B2A28]">
          {/* 1. Estado de Google Drive */}
          <div className="bg-white p-4 rounded-xl border border-[#E4DECE] shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-[#8A8478]">
                Cuenta de Google Drive
              </span>
              {token ? (
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium bg-[#3F6E64]/10 text-[#3F6E64]">
                  <span className="w-2 h-2 rounded-full bg-[#3F6E64] animate-pulse" />
                  Conectado
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium bg-black/5 text-[#8A8478]">
                  <span className="w-2 h-2 rounded-full bg-[#8A8478]" />
                  Desconectado
                </span>
              )}
            </div>

            {token ? (
              <div className="flex items-center justify-between pt-1">
                <div className="flex items-center gap-3 min-w-0">
                  {userProfile?.picture ? (
                    <img
                      src={userProfile.picture}
                      alt="Avatar"
                      className="w-10 h-10 rounded-full border border-[#E4DECE] shrink-0"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-[#3F6E64] text-white flex items-center justify-center font-bold text-sm shrink-0">
                      {userProfile?.name?.charAt(0) || 'G'}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-[#2B2A28] truncate">
                      {userProfile?.name || 'Usuario Google'}
                    </p>
                    <p className="text-[11px] text-[#8A8478] truncate">
                      {userProfile?.email || 'Sesión activa'}
                    </p>
                  </div>
                </div>

                <button
                  onClick={onLogoutGoogle}
                  className="px-2.5 py-1.5 text-xs text-[#B4553F] hover:bg-[#B4553F]/10 rounded-lg transition-colors flex items-center gap-1.5 font-medium cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Desconectar</span>
                </button>
              </div>
            ) : (
              <div className="space-y-2 pt-1">
                <p className="text-xs text-[#8A8478]">
                  Conecta tu cuenta para sincronizar tus notas directamente con tu propio Google Drive. No usamos servidores externos ni intermediarios.
                </p>
                <button
                  onClick={onConnectGoogle}
                  className="w-full py-2 px-3 bg-[#2B2A28] hover:bg-black text-[#F7F4EE] text-xs font-semibold rounded-xl flex items-center justify-center gap-2 transition-colors cursor-pointer shadow-xs"
                >
                  <Cloud className="w-4 h-4 text-[#F7F4EE]" />
                  <span>Conectar con Google Drive</span>
                </button>
              </div>
            )}

            {token && (
              <p className="text-[11px] text-[#3F6E64] bg-[#3F6E64]/5 p-2 rounded-lg leading-relaxed">
                ✓ Tu sesión permanece guardada y se renueva automáticamente en segundo plano para evitar desconexiones en iPhone y Safari.
              </p>
            )}
          </div>

          {/* 2. Carpeta de Google Drive */}
          <div className="bg-white p-4 rounded-xl border border-[#E4DECE] shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-[#8A8478] flex items-center gap-1.5">
                <Folder className="w-3.5 h-3.5 text-[#3F6E64]" />
                Carpeta en tu Google Drive
              </span>
            </div>

            <p className="text-xs text-[#8A8478]">
              Elige el nombre de la carpeta raíz en tu Google Drive donde se almacenarán las notas (dentro se creará la subcarpeta <code className="bg-[#EDEAE2] px-1 py-0.5 rounded text-[#2B2A28]">/notes/</code>):
            </p>

            <form onSubmit={handleSaveSettings} className="space-y-2">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <span className="absolute inset-y-0 left-0 pl-2.5 flex items-center text-[#8A8478] text-xs">
                    📁
                  </span>
                  <input
                    type="text"
                    value={folderName}
                    onChange={(e) => setFolderName(e.target.value)}
                    placeholder="MiAppNotas"
                    className="w-full text-xs pl-8 pr-3 py-2 bg-[#F7F4EE] border border-[#E4DECE] rounded-lg outline-none focus:border-[#3F6E64] font-medium text-[#2B2A28]"
                  />
                </div>
                <button
                  type="submit"
                  className="px-3 py-2 bg-[#3F6E64] hover:bg-[#345951] text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer shadow-xs shrink-0"
                >
                  Guardar
                </button>
              </div>

              <div className="flex items-center justify-between pt-1">
                <button
                  type="button"
                  onClick={handleResetFolder}
                  className="text-[11px] text-[#8A8478] hover:text-[#2B2A28] flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Restablecer a &quot;MiAppNotas&quot;</span>
                </button>

                {savedSuccess && (
                  <span className="text-[11px] font-semibold text-[#3F6E64] flex items-center gap-1 animate-in fade-in">
                    <Check className="w-3 h-3" />
                    ¡Guardado!
                  </span>
                )}
              </div>
            </form>
          </div>

          {/* 3. Sincronización y Estado */}
          <div className="bg-white p-4 rounded-xl border border-[#E4DECE] shadow-xs space-y-3">
            <span className="text-xs font-bold uppercase tracking-wider text-[#8A8478]">
              Control de sincronización
            </span>

            {/* Toggle auto-sync */}
            <div className="flex items-center justify-between py-1">
              <div>
                <p className="text-xs font-semibold text-[#2B2A28]">Guardar automáticamente al editar</p>
                <p className="text-[11px] text-[#8A8478]">
                  Sube los cambios a Drive 1,5 segundos tras dejar de teclear
                </p>
              </div>
              <button
                type="button"
                onClick={handleToggleAutoSync}
                className={`w-10 h-6 rounded-full transition-colors p-0.5 cursor-pointer relative ${
                  autoSync ? 'bg-[#3F6E64]' : 'bg-[#E4DECE]'
                }`}
              >
                <div
                  className={`w-5 h-5 rounded-full bg-white shadow-xs transition-transform transform ${
                    autoSync ? 'translate-x-4' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Sync now action */}
            <div className="pt-2 border-t border-[#E4DECE]/60 flex items-center justify-between">
              <div className="text-xs">
                <span className="text-[#8A8478]">Estado actual: </span>
                <span className="font-semibold text-[#2B2A28]">{syncMessage || 'Al día'}</span>
                {pendingNotes.length > 0 && (
                  <span className="text-[#C98A3D] font-medium ml-1">
                    ({pendingNotes.length} pendiente{pendingNotes.length > 1 ? 's' : ''})
                  </span>
                )}
              </div>

              {token && (
                <button
                  type="button"
                  onClick={onTriggerSync}
                  disabled={syncState === 'syncing'}
                  className="px-2.5 py-1.5 bg-[#EDEAE2] hover:bg-[#E4DECE] text-[#2B2A28] text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw
                    className={`w-3.5 h-3.5 ${
                      syncState === 'syncing' ? 'animate-spin text-[#3F6E64]' : ''
                    }`}
                  />
                  <span>Sincronizar ahora</span>
                </button>
              )}
            </div>
          </div>

          {/* 4. Enlaces legales */}
          <div className="flex items-center justify-between px-2 text-[11px] text-[#8A8478]">
            <a
              href="/privacidad.html"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 hover:text-[#2B2A28] transition-colors"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-[#3F6E64]" />
              <span>Política de Privacidad</span>
              <ExternalLink className="w-2.5 h-2.5" />
            </a>
            <span>·</span>
            <a
              href="/terminos.html"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 hover:text-[#2B2A28] transition-colors"
            >
              <FileText className="w-3.5 h-3.5 text-[#3F6E64]" />
              <span>Términos y Condiciones</span>
              <ExternalLink className="w-2.5 h-2.5" />
            </a>
          </div>
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-[#E4DECE] bg-[#EDEAE2] flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-[#2B2A28] hover:bg-black text-[#F7F4EE] text-xs font-semibold rounded-lg transition-colors cursor-pointer"
          >
            Listo
          </button>
        </div>
      </div>
    </div>
  );
};
