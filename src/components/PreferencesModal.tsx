import React, { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { getSettings, saveSettings } from '../services/settings';
import { SyncState } from '../services/syncEngine';
import {
  DropboxUserProfile,
  getDropboxAppKey,
  setDropboxAppKey,
  getDropboxRedirectUri,
} from '../services/dropboxAuth';
import {
  X,
  Cloud,
  RefreshCw,
  LogOut,
  ShieldCheck,
  FileText,
  ExternalLink,
  Check,
  Key,
  HelpCircle,
  ChevronDown,
  ChevronUp,
  Copy,
  FolderSync,
} from 'lucide-react';

interface PreferencesModalProps {
  isOpen: boolean;
  onClose: () => void;
  token: string | null;
  userProfile: DropboxUserProfile | null;
  syncState: SyncState;
  syncMessage: string;
  onConnectDropbox: (appKey: string) => Promise<void>;
  onLogoutDropbox: () => void;
  onTriggerSync: () => void;
  onSaveManualToken: (token: string) => Promise<void>;
}

export const PreferencesModal: React.FC<PreferencesModalProps> = ({
  isOpen,
  onClose,
  token,
  userProfile,
  syncState,
  syncMessage,
  onConnectDropbox,
  onLogoutDropbox,
  onTriggerSync,
  onSaveManualToken,
}) => {
  const [appKey, setAppKey] = useState('');
  const [manualToken, setManualToken] = useState('');
  const [autoSync, setAutoSync] = useState(true);
  const [showGuide, setShowGuide] = useState(false);
  const [showManualToken, setShowManualToken] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isSavingManual, setIsSavingManual] = useState(false);
  const [copiedRedirect, setCopiedRedirect] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const redirectUri = getDropboxRedirectUri();

  // Consultar notas pendientes de sincronizar
  const pendingNotes =
    useLiveQuery(() =>
      db.notes
        .filter((n) => n.syncStatus === 'pending' || n.syncStatus === 'error')
        .toArray()
    ) || [];

  const pendingEvents =
    useLiveQuery(() =>
      db.events
        .filter((e) => e.syncStatus === 'pending' || e.syncStatus === 'error')
        .toArray()
    ) || [];

  const totalPending = pendingNotes.length + pendingEvents.length;

  useEffect(() => {
    if (isOpen) {
      const current = getSettings();
      setAutoSync(current.autoSync);
      const savedKey = getDropboxAppKey();
      setAppKey(savedKey);
      setErrorMessage(null);
      setIsConnecting(false);
      setIsSavingManual(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleConnect = async () => {
    const cleanKey = appKey.trim();
    if (!cleanKey) {
      setErrorMessage('Por favor introduce tu App Key de Dropbox.');
      return;
    }
    setErrorMessage(null);
    setIsConnecting(true);
    setDropboxAppKey(cleanKey);
    saveSettings({ dropboxAppKey: cleanKey });

    try {
      await onConnectDropbox(cleanKey);
    } catch (err: any) {
      console.error(err);
      setErrorMessage(err.message || 'Error al conectar con Dropbox');
    } finally {
      setIsConnecting(false);
    }
  };

  const handleSaveToken = async () => {
    const cleanToken = manualToken.trim();
    if (!cleanToken) {
      setErrorMessage('Por favor introduce el token de acceso.');
      return;
    }
    setErrorMessage(null);
    setIsSavingManual(true);
    try {
      await onSaveManualToken(cleanToken);
      setManualToken('');
    } catch (err: any) {
      console.error(err);
      setErrorMessage(err.message || 'Token de acceso no válido o caducado');
    } finally {
      setIsSavingManual(false);
    }
  };

  const handleCopyRedirectUri = () => {
    navigator.clipboard.writeText(redirectUri);
    setCopiedRedirect(true);
    setTimeout(() => setCopiedRedirect(false), 2500);
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
            <div className="w-8 h-8 rounded-xl bg-[#0061FE] text-white flex items-center justify-center shadow-xs">
              <Cloud className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-bold text-sm text-[#2B2A28] leading-tight">
                Sincronización con Dropbox
              </h2>
              <p className="text-[11px] text-[#8A8478]">
                Almacenamiento privado multidispositivo (PC, móvil y web)
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
          {/* Mensaje de error general si ocurre */}
          {errorMessage && (
            <div className="bg-[#B4553F]/10 border border-[#B4553F]/20 text-[#B4553F] p-3 rounded-xl text-xs flex items-start gap-2">
              <span className="font-bold">⚠️</span>
              <div className="flex-1">{errorMessage}</div>
            </div>
          )}

          {/* 1. Estado de la cuenta de Dropbox */}
          <div className="bg-white p-4 rounded-xl border border-[#E4DECE] shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-[#8A8478] flex items-center gap-1.5">
                <FolderSync className="w-3.5 h-3.5 text-[#0061FE]" />
                Cuenta de Dropbox
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
              <div className="space-y-3 pt-1">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    {userProfile?.picture ? (
                      <img
                        src={userProfile.picture}
                        alt="Avatar"
                        className="w-10 h-10 rounded-full border border-[#E4DECE] shrink-0"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-[#0061FE] text-white flex items-center justify-center font-bold text-sm shrink-0">
                        {userProfile?.name?.charAt(0) || 'D'}
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-[#2B2A28] truncate">
                        {userProfile?.name || 'Usuario Dropbox'}
                      </p>
                      <p className="text-[11px] text-[#8A8478] truncate">
                        {userProfile?.email || 'Sesión activa'}
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={onLogoutDropbox}
                    className="px-2.5 py-1.5 text-xs text-[#B4553F] hover:bg-[#B4553F]/10 rounded-lg transition-colors flex items-center gap-1.5 font-medium cursor-pointer"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Desconectar</span>
                  </button>
                </div>

                <div className="text-[11px] leading-relaxed bg-[#3F6E64]/10 text-[#3F6E64] p-2.5 rounded-lg font-medium flex items-center gap-2">
                  <span>✓</span>
                  <span>
                    Tus notas se sincronizan automáticamente en tu Dropbox privado en la carpeta <code>/Apps/Bitácora</code>.
                  </span>
                </div>
              </div>
            ) : (
              <div className="space-y-3 pt-1">
                <p className="text-xs text-[#8A8478] leading-relaxed">
                  Conecta tu cuenta para sincronizar tus notas de forma segura en tu propio Dropbox. 100% privado y gratuito.
                </p>

                {/* Input App Key */}
                <div className="space-y-1.5">
                  <label className="text-[11px] font-semibold text-[#2B2A28] flex items-center justify-between">
                    <span>App Key de Dropbox:</span>
                    <button
                      type="button"
                      onClick={() => setShowGuide(!showGuide)}
                      className="text-[#0061FE] hover:underline flex items-center gap-1 font-normal cursor-pointer text-[11px]"
                    >
                      <HelpCircle className="w-3 h-3" />
                      <span>{showGuide ? 'Ocultar guía' : '¿Cómo conseguirla gratis en 2 min?'}</span>
                    </button>
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-2.5 flex items-center text-[#8A8478]">
                      <Key className="w-3.5 h-3.5" />
                    </span>
                    <input
                      type="text"
                      value={appKey}
                      onChange={(e) => setAppKey(e.target.value)}
                      placeholder="Ejemplo: abc123def456ghi"
                      className="w-full text-xs pl-8 pr-3 py-2 bg-[#F7F4EE] border border-[#E4DECE] rounded-lg outline-none focus:border-[#0061FE] font-mono text-[#2B2A28]"
                    />
                  </div>
                </div>

                {/* Guía desplegable paso a paso */}
                {showGuide && (
                  <div className="bg-[#EDEAE2]/80 border border-[#E4DECE] rounded-xl p-3 text-xs space-y-2.5 animate-in fade-in">
                    <div className="font-semibold text-[#2B2A28] text-[11px] flex items-center justify-between">
                      <span>Pasos en la consola de Dropbox (gratis y en 2 minutos):</span>
                      <a
                        href="https://www.dropbox.com/developers/apps"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[#0061FE] flex items-center gap-1 hover:underline"
                      >
                        <span>Abrir consola</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                    <ol className="list-decimal list-inside space-y-1.5 text-[11px] text-[#2B2A28]">
                      <li>
                        Inicia sesión en <a href="https://www.dropbox.com/developers/apps" target="_blank" rel="noopener noreferrer" className="text-[#0061FE] underline">dropbox.com/developers/apps</a> y pulsa <b>Create app</b>.
                      </li>
                      <li>
                        Selecciona <b>Scoped access</b> y luego <b>App folder</b> (así Bitácora solo accederá a su propia carpeta). Ponle un nombre (ej: <code>Bitacora-Notas</code>).
                      </li>
                      <li>
                        En la pestaña <b>Permissions</b>, marca las casillas:
                        <div className="mt-1 ml-4 space-y-0.5 font-mono text-[10px] text-[#3F6E64]">
                          <div>• files.content.write</div>
                          <div>• files.content.read</div>
                          <div>• account_info.read</div>
                        </div>
                      </li>
                      <li>
                        En la pestaña <b>Settings</b>, bajo <i>OAuth 2 Redirect URIs</i>, añade esta URL exacta:
                        <div className="mt-1 flex items-center gap-1.5 bg-white p-1.5 rounded border border-[#E4DECE]">
                          <code className="text-[10px] text-[#2B2A28] break-all flex-1 font-mono">{redirectUri}</code>
                          <button
                            type="button"
                            onClick={handleCopyRedirectUri}
                            className="px-2 py-0.5 bg-[#EDEAE2] hover:bg-[#E4DECE] text-[10px] rounded flex items-center gap-1 text-[#2B2A28] font-sans font-medium cursor-pointer"
                          >
                            {copiedRedirect ? <Check className="w-3 h-3 text-[#3F6E64]" /> : <Copy className="w-3 h-3" />}
                            <span>{copiedRedirect ? 'Copiada' : 'Copiar'}</span>
                          </button>
                        </div>
                      </li>
                      <li>
                        Copia la <b>App key</b> que aparece en esa misma pestaña <i>Settings</i> y pégala arriba.
                      </li>
                    </ol>
                  </div>
                )}

                {/* Botón conectar con Dropbox */}
                <button
                  type="button"
                  onClick={handleConnect}
                  disabled={isConnecting}
                  className="w-full py-2.5 px-3 bg-[#0061FE] hover:bg-[#0052D9] text-white text-xs font-semibold rounded-xl flex items-center justify-center gap-2 transition-colors cursor-pointer shadow-xs disabled:opacity-50"
                >
                  {isConnecting ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Conectando con Dropbox...</span>
                    </>
                  ) : (
                    <>
                      <Cloud className="w-4 h-4 text-white" />
                      <span>Conectar con Dropbox</span>
                    </>
                  )}
                </button>

                {/* Alternativa: Token manual */}
                <div className="pt-1 border-t border-[#E4DECE]/70">
                  <button
                    type="button"
                    onClick={() => setShowManualToken(!showManualToken)}
                    className="w-full text-left text-[11px] text-[#8A8478] hover:text-[#2B2A28] flex items-center justify-between cursor-pointer py-1"
                  >
                    <span>¿Prefieres pegar un Token de Acceso directo generado en la consola?</span>
                    {showManualToken ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  </button>

                  {showManualToken && (
                    <div className="mt-2 space-y-2 bg-[#EDEAE2]/50 p-3 rounded-xl border border-[#E4DECE] animate-in fade-in">
                      <p className="text-[11px] text-[#8A8478]">
                        En la pestaña <i>Settings</i> de tu app de Dropbox puedes pulsar el botón <b>&quot;Generate access token&quot;</b> y pegarlo aquí para conectar directamente:
                      </p>
                      <div className="flex gap-2">
                        <input
                          type="password"
                          value={manualToken}
                          onChange={(e) => setManualToken(e.target.value)}
                          placeholder="sl.B..."
                          className="flex-1 text-xs px-2.5 py-1.5 bg-white border border-[#E4DECE] rounded-lg outline-none font-mono text-[#2B2A28]"
                        />
                        <button
                          type="button"
                          onClick={handleSaveToken}
                          disabled={isSavingManual}
                          className="px-3 py-1.5 bg-[#2B2A28] hover:bg-black text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer shadow-xs shrink-0 disabled:opacity-50"
                        >
                          {isSavingManual ? 'Verificando...' : 'Guardar'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* 2. Control de sincronización */}
          <div className="bg-white p-4 rounded-xl border border-[#E4DECE] shadow-xs space-y-3">
            <span className="text-xs font-bold uppercase tracking-wider text-[#8A8478]">
              Control de sincronización
            </span>

            {/* Toggle auto-sync */}
            <div className="flex items-center justify-between py-1">
              <div>
                <p className="text-xs font-semibold text-[#2B2A28]">Guardar automáticamente al editar</p>
                <p className="text-[11px] text-[#8A8478]">
                  Sube los cambios a Dropbox 1,5 segundos tras dejar de teclear
                </p>
              </div>
              <button
                type="button"
                onClick={handleToggleAutoSync}
                className={`w-10 h-6 rounded-full transition-colors p-0.5 cursor-pointer relative ${
                  autoSync ? 'bg-[#0061FE]' : 'bg-[#E4DECE]'
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
                <span className="text-[#8A8478]">Estado: </span>
                <span className="font-semibold text-[#2B2A28]">{syncMessage || 'Al día'}</span>
                {totalPending > 0 && (
                  <span className="text-[#C98A3D] font-medium ml-1">
                    ({totalPending} cambio{totalPending > 1 ? 's' : ''} pendiente{totalPending > 1 ? 's' : ''})
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
                      syncState === 'syncing' ? 'animate-spin text-[#0061FE]' : ''
                    }`}
                  />
                  <span>Sincronizar ahora</span>
                </button>
              )}
            </div>
          </div>

          {/* 3. Enlaces legales */}
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
