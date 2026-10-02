import React, { useState, useEffect, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, Note, Tag, AppEvent, seedInitialData, isNoteArchived } from './db/db';
import { Sidebar, SidebarFilter } from './components/Sidebar';
import { NoteList } from './components/NoteList';
import { NoteDetail } from './components/NoteDetail';
import { CalendarView } from './components/CalendarView';
import { CalendarDetail } from './components/CalendarDetail';
import { EventModal } from './components/EventModal';
import { getTodayISO } from './utils/calendarUtils';
import {
  getDropboxAuthState,
  subscribeDropboxTokenUpdates,
  getValidDropboxAccessToken,
  logoutDropbox,
  startDropboxLoginPopup,
  setManualDropboxToken,
  DropboxUserProfile,
} from './services/dropboxAuth';
import {
  subscribeSyncState,
  runFullSync,
  scheduleSync,
  SyncState,
} from './services/syncEngine';
import { PreferencesModal } from './components/PreferencesModal';
import { ArrowLeft, Menu, Settings, RotateCcw, Trash2, X } from 'lucide-react';

export const App: React.FC = () => {
  const [currentFilter, setCurrentFilter] = useState<SidebarFilter>({ type: 'all' });
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isPreferencesOpen, setIsPreferencesOpen] = useState(false);

  // Estados para Calendario
  const [selectedDate, setSelectedDate] = useState<string>(() => getTodayISO());
  const [isEventModalOpen, setIsEventModalOpen] = useState(false);
  const [eventToEdit, setEventToEdit] = useState<AppEvent | null>(null);
  const [modalDefaultDate, setModalDefaultDate] = useState<string>(() => getTodayISO());

  // Estados para Deshacer eliminación de nota
  const [lastDeletedNote, setLastDeletedNote] = useState<Note | null>(null);
  const [deleteToastTimeout, setDeleteToastTimeout] = useState<number | null>(null);

  // Estados de autenticación y sincronización con Dropbox
  const [token, setToken] = useState<string | null>(null);
  const [userProfile, setUserProfile] = useState<DropboxUserProfile | null>(null);
  const [syncState, setSyncState] = useState<SyncState>('idle');
  const [syncMessage, setSyncMessage] = useState<string>('Sincronizado');

  // Consulta reactiva de todas las notas, etiquetas y eventos en Dexie
  const notes = useLiveQuery(() => db.notes.orderBy('updatedAt').reverse().toArray()) || [];
  const tags = useLiveQuery(() => db.tags.toArray()) || [];
  const events = useLiveQuery(() => db.events.filter((e) => !e.deleted).toArray()) || [];

  // Inicializar base de datos y autenticación de Dropbox al montar
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

    // Suscribirse a actualizaciones de token de Dropbox
    const unsubscribeToken = subscribeDropboxTokenUpdates((newToken) => {
      if (!isMounted) return;
      setToken(newToken);
    });

    // Restaurar sesión de Dropbox si existe
    const authState = getDropboxAuthState();
    if (authState.isLoggedIn && authState.token) {
      setToken(authState.token);
      if (authState.user) setUserProfile(authState.user);

      getValidDropboxAccessToken().then((validToken) => {
        if (!isMounted || !validToken) return;
        setToken(validToken);
        runFullSync(validToken);
      });
    }

    return () => {
      isMounted = false;
      unsubscribeSync();
      unsubscribeToken();
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

  const hasInitialSelectionRun = useRef(false);

  // Seleccionar la primera nota automáticamente SOLO al cargar la app en escritorio
  useEffect(() => {
    if (isDesktop && !hasInitialSelectionRun.current && notes.length > 0) {
      hasInitialSelectionRun.current = true;
      const activeNotes = notes.filter((n) => !n.deleted && !isNoteArchived(n.tag, tags));
      if (activeNotes.length > 0) {
        setSelectedNoteId(activeNotes[0].id);
      }
    }
  }, [isDesktop, notes, tags]);

  // Manejadores de autenticación Dropbox
  const handleConnectDropbox = async (appKey: string) => {
    const res = await startDropboxLoginPopup(appKey);
    setToken(res.token);
    if (res.profile) setUserProfile(res.profile);
    await runFullSync(res.token);
  };

  const handleSaveManualToken = async (manualToken: string) => {
    const profile = await setManualDropboxToken(manualToken);
    setToken(manualToken);
    if (profile) setUserProfile(profile);
    await runFullSync(manualToken);
  };

  const handleLogoutDropbox = () => {
    logoutDropbox(() => {
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

  // Manejador al eliminar una nota (guarda referencia para poder deshacer)
  const handleNoteDeleted = (deletedNote: Note) => {
    setLastDeletedNote(deletedNote);
    if (deleteToastTimeout) {
      window.clearTimeout(deleteToastTimeout);
    }
    const timer = window.setTimeout(() => {
      setLastDeletedNote(null);
    }, 7000);
    setDeleteToastTimeout(timer);

    if (isDesktop) {
      const childTagNames =
        currentFilter.type === 'tag'
          ? tags
              .filter((t: Tag) => t.parentId === currentFilter.tagId)
              .map((t: Tag) => t.name.toLowerCase())
          : [];

      const remaining = notes.filter((n) => {
        if (n.id === deletedNote.id) return false;
        if (currentFilter.type === 'trash') return n.deleted === true;
        if (n.deleted === true) return false;
        if (currentFilter.type === 'pinned') return n.pinned === true && !isNoteArchived(n.tag, tags);
        if (currentFilter.type === 'tag') {
          const noteTag = (n.tag || '').toLowerCase();
          return (
            noteTag === currentFilter.tagName.toLowerCase() ||
            childTagNames.includes(noteTag)
          );
        }
        return !isNoteArchived(n.tag, tags);
      });
      setSelectedNoteId(remaining.length > 0 ? remaining[0].id : null);
    } else {
      setSelectedNoteId(null);
    }
  };

  // Restaurar la última nota eliminada
  const handleUndoDeleteNote = async () => {
    if (!lastDeletedNote) return;
    if (deleteToastTimeout) {
      window.clearTimeout(deleteToastTimeout);
      setDeleteToastTimeout(null);
    }
    const noteToRestore = lastDeletedNote;
    setLastDeletedNote(null);

    await db.notes.update(noteToRestore.id, {
      deleted: false,
      updatedAt: new Date().toISOString(),
      syncStatus: 'pending',
    });

    setSelectedNoteId(noteToRestore.id);
    scheduleSync(token);
  };

  // Atajo de teclado global Ctrl+Z para deshacer eliminación cuando no se edita texto
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        const activeEl = document.activeElement;
        const isEditingInput =
          activeEl &&
          (activeEl.tagName === 'INPUT' ||
            activeEl.tagName === 'TEXTAREA' ||
            activeEl.getAttribute('contenteditable') === 'true');

        if (!isEditingInput && lastDeletedNote) {
          e.preventDefault();
          handleUndoDeleteNote();
        }
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [lastDeletedNote, token]);

  // Manejadores para eventos de Calendario
  const handleOpenNewEvent = (dateStr?: string) => {
    setEventToEdit(null);
    setModalDefaultDate(dateStr || selectedDate);
    setIsEventModalOpen(true);
  };

  const handleEditEvent = (event: AppEvent) => {
    setEventToEdit(event);
    setModalDefaultDate(event.date);
    setIsEventModalOpen(true);
  };

  // Cambiar filtro y seleccionar automáticamente la nota más reciente de esa nueva etiqueta/vista
  const handleSelectFilter = (filter: SidebarFilter) => {
    setCurrentFilter(filter);
    setIsMobileSidebarOpen(false);

    if (filter.type === 'calendar') {
      return;
    }

    const childTagNames =
      filter.type === 'tag'
        ? tags
            .filter((t: Tag) => t.parentId === filter.tagId)
            .map((t: Tag) => t.name.toLowerCase())
        : [];

    const matchingNotes = notes.filter((n) => {
      if (filter.type === 'trash') return n.deleted === true;
      if (n.deleted === true) return false;
      if (filter.type === 'pinned') return n.pinned === true && !isNoteArchived(n.tag, tags);
      if (filter.type === 'tag') {
        const noteTag = (n.tag || '').toLowerCase();
        return (
          noteTag === filter.tagName.toLowerCase() ||
          childTagNames.includes(noteTag)
        );
      }
      return !isNoteArchived(n.tag, tags); // 'all'
    });

    if (matchingNotes.length > 0) {
      setSelectedNoteId(matchingNotes[0].id);
    } else {
      setSelectedNoteId(null);
    }
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
          onSelectFilter={handleSelectFilter}
          syncState={syncState}
          syncMessage={syncMessage}
          onTriggerSync={handleTriggerSync}
          userProfile={userProfile}
          onConnectDropbox={() => setIsPreferencesOpen(true)}
          onLogoutDropbox={handleLogoutDropbox}
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

      {/* 2. Columna Intermedia: Lista de notas o Calendario */}
      <div
        className={`h-full border-r border-[#E4DECE] flex-shrink-0 ${
          currentFilter.type === 'calendar'
            ? 'flex w-full md:w-[480px] lg:w-[520px]'
            : selectedNoteId
            ? 'hidden md:flex'
            : 'flex w-full md:w-80'
        }`}
      >
        <div className="w-full flex flex-col h-full min-w-0">
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
              <div className="flex items-center gap-1.5">
                <img
                  src="/def-ico.png"
                  alt="Bitácora"
                  className="w-4 h-4 rounded object-contain shrink-0"
                />
                <span className="font-semibold text-xs">
                  {currentFilter.type === 'calendar' ? 'Calendario' : 'Bitácora'}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2 text-[11px] text-[#8A8478]">
              <button
                onClick={() => setIsPreferencesOpen(true)}
                className="p-1.5 rounded-lg bg-white border border-[#E4DECE] text-[#3F6E64] hover:text-[#2B2A28] flex items-center gap-1 cursor-pointer transition-colors shadow-xs"
                title="Preferencias y Google Drive"
              >
                <Settings className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="flex-1 min-h-0">
            {currentFilter.type === 'calendar' ? (
              <CalendarView
                selectedDate={selectedDate}
                onSelectDate={(newDate) => setSelectedDate(newDate)}
                events={events}
                onOpenNewEvent={handleOpenNewEvent}
                onEditEvent={handleEditEvent}
              />
            ) : (
              <NoteList
                currentFilter={currentFilter}
                notes={notes}
                selectedNoteId={selectedNoteId}
                onSelectNote={(noteId) => setSelectedNoteId(noteId)}
                onCreateNote={handleCreateNote}
              />
            )}
          </div>
        </div>
      </div>

      {/* 3. Columna Derecha: Detalle / Editor de nota O Detalle del día de Calendario */}
      <div
        className={`flex-1 h-full flex flex-col bg-white min-w-0 ${
          currentFilter.type === 'calendar'
            ? 'hidden md:flex'
            : !selectedNoteId
            ? 'hidden md:flex'
            : 'flex'
        }`}
      >
        {currentFilter.type === 'calendar' ? (
          <CalendarDetail
            selectedDate={selectedDate}
            events={events}
            token={token}
            onOpenNewEvent={handleOpenNewEvent}
            onEditEvent={handleEditEvent}
          />
        ) : (
          <>
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
                key={activeNote?.id || 'empty'}
                note={activeNote}
                token={token}
                onNoteDeleted={handleNoteDeleted}
              />
            </div>
          </>
        )}
      </div>

      {/* Modal para Crear / Editar Evento de Calendario */}
      <EventModal
        isOpen={isEventModalOpen}
        onClose={() => setIsEventModalOpen(false)}
        eventToEdit={eventToEdit}
        defaultDate={modalDefaultDate}
        token={token}
      />

      {/* Toast Flotante de Deshacer eliminación de nota */}
      {lastDeletedNote && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-[#2B2A28] text-white px-4 py-2.5 rounded-xl shadow-2xl border border-white/10 text-sm select-none animate-in fade-in slide-in-from-bottom-2 duration-200">
          <Trash2 className="w-4 h-4 text-[#C98A3D] flex-shrink-0" />
          <span className="truncate max-w-[200px] sm:max-w-xs font-medium">
            Nota «{lastDeletedNote.title || 'Sin título'}» eliminada
          </span>
          <button
            onClick={handleUndoDeleteNote}
            className="flex items-center gap-1.5 font-semibold text-[#8FD5C3] hover:text-white bg-white/10 hover:bg-white/20 px-3 py-1 rounded-lg transition-colors cursor-pointer ml-1"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Deshacer</span>
          </button>
          <button
            onClick={() => {
              if (deleteToastTimeout) window.clearTimeout(deleteToastTimeout);
              setLastDeletedNote(null);
            }}
            className="p-1 text-white/50 hover:text-white rounded-md transition-colors cursor-pointer"
            title="Cerrar aviso"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Modal de Preferencias y Dropbox */}
      <PreferencesModal
        isOpen={isPreferencesOpen}
        onClose={() => setIsPreferencesOpen(false)}
        token={token}
        userProfile={userProfile}
        syncState={syncState}
        syncMessage={syncMessage}
        onConnectDropbox={handleConnectDropbox}
        onLogoutDropbox={handleLogoutDropbox}
        onTriggerSync={handleTriggerSync}
        onSaveManualToken={handleSaveManualToken}
      />
    </div>
  );
};

export default App;
