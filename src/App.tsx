import React, { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, Note, seedInitialData } from './db/db';
import { Sidebar, SidebarFilter } from './components/Sidebar';
import { NoteList } from './components/NoteList';
import { NoteDetail } from './components/NoteDetail';
import {
  initGoogleAuth,
  requestLogin,
  logout,
  getSavedSession,
  waitForGoogleScript,
  UserProfile,
} from './services/googleAuth';
import {
  subscribeSyncState,
  runFullSync,
  SyncState,
} from './services/syncEngine';
import { PreferencesModal } from './components/PreferencesModal';
import { ArrowLeft, Menu, Settings } from 'lucide-react';

export const App: React.FC = () => {
  const [currentFilter, setCurrentFilter] = useState<SidebarFilter>({ type: 'all' });
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isPreferencesOpen, setIsPreferencesOpen] = useState(false);

  // Estados de autenticación y sincronización con Google Drive
  const [token, setToken] = useState<string | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [syncState, setSyncState] = useState<SyncState>('idle');
  const [syncMessage, setSyncMessage] = useState<string>('Sincronizado');

  // Consulta reactiva de todas las notas en Dexie
  const notes = useLiveQuery(() => db.notes.orderBy('updatedAt').reverse().toArray()) || [];

  // Inicializar base de datos y Google Identity al montar
  useEffect(() => {
    let isMounted = true;

    // Cargar datos de prueba si es la primera vez
    seedInitialData();

    // Suscribirse al estado del motor de sincronización
    const unsubscribeSync = subscribeSyncState((state, message) => {
      if (!isMounted) return;
      setSyncState(state);
      if (message) setSyncMessage(message);
    });

    // Restaurar sesión de Google si existe
    const session = getSavedSession();
    if (session) {
      setToken(session.token);
      if (session.profile) setUserProfile(session.profile);
      // Sincronizar en segundo plano si el token está activo
      if (session.token) {
        runFullSync(session.token);
      }
    }

    // Inicializar cliente de Google
    waitForGoogleScript().then((ready) => {
      if (!ready || !isMounted) return;

      initGoogleAuth(
        (newToken, profile) => {
          setToken(newToken);
          if (profile) setUserProfile(profile);
          runFullSync(newToken);
        },
        (err) => {
          console.error('Error al iniciar sesión con Google:', err);
        }
      );
    });

    return () => {
      isMounted = false;
      unsubscribeSync();
    };
  }, []);

  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 768 : true
  );

  useEffect(() => {
    const handleResize = () => {
      setIsDesktop(window.innerWidth >= 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Seleccionar la primera nota automáticamente SOLO en escritorio
  useEffect(() => {
    if (isDesktop && !selectedNoteId && notes.length > 0) {
      const activeNotes = notes.filter((n) => !n.deleted);
      if (activeNotes.length > 0) {
        setSelectedNoteId(activeNotes[0].id);
      }
    }
  }, [isDesktop, notes, selectedNoteId]);

  // Manejadores de autenticación
  const handleConnectGoogle = () => {
    try {
      requestLogin(true);
    } catch (e) {
      console.error(e);
    }
  };

  const handleLogoutGoogle = () => {
    logout(() => {
      setToken(null);
      setUserProfile(null);
    });
  };

  const handleTriggerSync = () => {
    if (token) {
      runFullSync(token);
    }
  };

  // Crear una nueva nota
  const handleCreateNote = async () => {
    const now = new Date().toISOString();
    const newId = `note_${Date.now()}`;
    const initialTag = currentFilter.type === 'tag' ? currentFilter.tagName : 'Personal';

    const newNote: Note = {
      id: newId,
      title: 'Nueva nota',
      tag: initialTag,
      pinned: false,
      deleted: false,
      createdAt: now,
      updatedAt: now,
      syncStatus: 'pending',
      blocks: [
        {
          id: `b_${Date.now()}`,
          type: 'text',
          content: '',
        },
      ],
    };

    await db.notes.add(newNote);
    setSelectedNoteId(newId);
  };

  // Nota actualmente seleccionada
  const activeNote = notes.find((n) => n.id === selectedNoteId) || null;

  return (
    <div className="flex h-screen w-screen bg-[#F7F4EE] text-[#2B2A28] overflow-hidden font-sans select-none">
      {/* 1. Barra Lateral Izquierda (Escritorio y Drawer Móvil) */}
      <div
        className={`fixed inset-y-0 left-0 z-40 transform md:relative md:translate-x-0 transition-transform duration-200 ease-in-out ${
          isMobileSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
      >
        <Sidebar
          currentFilter={currentFilter}
          onSelectFilter={(filter) => {
            setCurrentFilter(filter);
            setIsMobileSidebarOpen(false);
          }}
          syncState={syncState}
          syncMessage={syncMessage}
          onTriggerSync={handleTriggerSync}
          userProfile={userProfile}
          onConnectGoogle={handleConnectGoogle}
          onLogoutGoogle={handleLogoutGoogle}
          token={token}
          onOpenPreferences={() => setIsPreferencesOpen(true)}
        />
      </div>

      {/* Overlay para móvil cuando el sidebar está abierto */}
      {isMobileSidebarOpen && (
        <div
          onClick={() => setIsMobileSidebarOpen(false)}
          className="fixed inset-0 bg-black/30 z-30 md:hidden"
        />
      )}

      {/* 2. Columna Intermedia: Lista de notas */}
      <div
        className={`h-full border-r border-[#E4DECE] flex-shrink-0 ${
          selectedNoteId ? 'hidden md:flex' : 'flex w-full md:w-80'
        }`}
      >
        <div className="w-full flex flex-col h-full">
          {/* Barra superior en móvil para abrir menú y ajustes */}
          <div className="md:hidden p-3 border-b border-[#E4DECE] bg-[#EDEAE2] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsMobileSidebarOpen(true)}
                className="p-1.5 rounded-lg bg-white border border-[#E4DECE] text-[#2B2A28] cursor-pointer"
                title="Menú"
              >
                <Menu className="w-4 h-4" />
              </button>
              <span className="font-semibold text-xs">Mis Notas</span>
            </div>
            <div className="flex items-center gap-2 text-[11px] text-[#8A8478]">
              <button
                onClick={() => setIsPreferencesOpen(true)}
                className="p-1.5 rounded-lg bg-white border border-[#E4DECE] text-[#3F6E64] hover:text-[#2B2A28] flex items-center gap-1 cursor-pointer transition-colors shadow-xs"
                title="Preferencias y Google Drive"
              >
                <Settings className="w-3.5 h-3.5" />
              </button>
              <a href="/privacidad.html" target="_blank" rel="noopener noreferrer" className="hover:underline">
                Privacidad
              </a>
              <span>·</span>
              <a href="/terminos.html" target="_blank" rel="noopener noreferrer" className="hover:underline">
                Términos
              </a>
            </div>
          </div>

          <div className="flex-1 min-h-0">
            <NoteList
              currentFilter={currentFilter}
              notes={notes}
              selectedNoteId={selectedNoteId}
              onSelectNote={(noteId) => setSelectedNoteId(noteId)}
              onCreateNote={handleCreateNote}
            />
          </div>
        </div>
      </div>

      {/* 3. Columna Derecha: Detalle / Editor de la nota */}
      <div
        className={`flex-1 h-full flex flex-col bg-white min-w-0 ${
          !selectedNoteId ? 'hidden md:flex' : 'flex'
        }`}
      >
        {/* Botón de volver en móvil (estilo Apple Notas en iPhone) */}
        <div className="md:hidden px-4 py-2 border-b border-[#E4DECE] bg-[#F7F4EE] flex items-center gap-2">
          <button
            onClick={() => setSelectedNoteId(null)}
            className="flex items-center gap-1.5 text-xs font-semibold text-[#3F6E64] py-1 px-2 rounded hover:bg-black/5"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Notas</span>
          </button>
        </div>

        <div className="flex-1 min-h-0">
          <NoteDetail
            note={activeNote}
            token={token}
            onNoteDeleted={() => {
              if (isDesktop) {
                const remaining = notes.filter((n) => !n.deleted && n.id !== selectedNoteId);
                setSelectedNoteId(remaining.length > 0 ? remaining[0].id : null);
              } else {
                setSelectedNoteId(null);
              }
            }}
          />
        </div>
      </div>

      {/* Modal de Preferencias y Google Drive */}
      <PreferencesModal
        isOpen={isPreferencesOpen}
        onClose={() => setIsPreferencesOpen(false)}
        token={token}
        userProfile={userProfile}
        syncState={syncState}
        syncMessage={syncMessage}
        onConnectGoogle={handleConnectGoogle}
        onLogoutGoogle={handleLogoutGoogle}
        onTriggerSync={handleTriggerSync}
      />
    </div>
  );
};

export default App;
