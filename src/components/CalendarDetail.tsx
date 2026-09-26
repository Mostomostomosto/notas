import React from 'react';
import { AppEvent, db } from '../db/db';
import { scheduleSync } from '../services/syncEngine';
import {
  formatFullDateReadable,
  isEventOnDate,
  sortEvents,
} from '../utils/calendarUtils';
import {
  Calendar as CalendarIcon,
  Clock,
  RotateCcw,
  Plus,
  Pencil,
  Trash2,
  CalendarCheck2,
} from 'lucide-react';

interface CalendarDetailProps {
  selectedDate: string;
  events: AppEvent[];
  token: string | null;
  onOpenNewEvent: (dateStr?: string) => void;
  onEditEvent: (event: AppEvent) => void;
}

export const CalendarDetail: React.FC<CalendarDetailProps> = ({
  selectedDate,
  events,
  token,
  onOpenNewEvent,
  onEditEvent,
}) => {
  const dayEvents = sortEvents(
    events.filter((e) => isEventOnDate(e, selectedDate))
  );

  const handleDeleteEvent = async (event: AppEvent) => {
    if (window.confirm(`¿Seguro que deseas eliminar "${event.title}"?`)) {
      const now = new Date().toISOString();
      await db.events.update(event.id, {
        deleted: true,
        updatedAt: now,
        syncStatus: 'pending',
      });
      scheduleSync(token);
    }
  };

  return (
    <div className="flex-1 bg-white flex flex-col h-full min-w-0">
      {/* Header */}
      <div className="px-8 py-5 border-b border-[#E4DECE] flex items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-[#2B2A28] capitalize">
            {formatFullDateReadable(selectedDate)}
          </h2>
          <p className="text-xs text-[#8A8478] mt-0.5">
            {dayEvents.length === 0
              ? 'No hay eventos programados'
              : `${dayEvents.length} ${
                  dayEvents.length === 1 ? 'evento programado' : 'eventos programados'
                }`}
          </p>
        </div>

        <button
          onClick={() => onOpenNewEvent(selectedDate)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#3F6E64] hover:bg-[#345b53] text-white text-xs font-medium transition-colors shadow-xs cursor-pointer shrink-0"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Nuevo evento</span>
        </button>
      </div>

      {/* Events List */}
      <div className="flex-1 overflow-y-auto p-8 space-y-4 max-w-3xl w-full">
        {dayEvents.length === 0 ? (
          <div className="h-72 border border-dashed border-[#E4DECE] rounded-2xl flex flex-col items-center justify-center p-8 text-center text-[#8A8478] space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-[#F7F4EE] border border-[#E4DECE] flex items-center justify-center text-[#8A8478]">
              <CalendarCheck2 className="w-6 h-6 opacity-40" />
            </div>
            <div>
              <p className="font-semibold text-sm text-[#2B2A28]">
                Sin eventos para este día
              </p>
              <p className="text-xs text-[#8A8478] mt-0.5">
                Crea recordatorios, reuniones o actividades para organizar tu jornada.
              </p>
            </div>
            <button
              onClick={() => onOpenNewEvent(selectedDate)}
              className="px-3.5 py-1.5 bg-[#FAF9F5] hover:bg-[#EFEBE2] border border-[#E4DECE] rounded-lg text-xs font-medium text-[#2B2A28] transition-colors cursor-pointer"
            >
              + Añadir primer evento
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {dayEvents.map((event) => {
              const isAllDay = !event.time || event.time.trim() === '';
              return (
                <div
                  key={event.id}
                  className="bg-[#FAF9F5] border border-[#E4DECE] rounded-xl p-4 transition-shadow hover:shadow-xs group"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1.5 min-w-0 flex-1">
                      {/* Badges de hora y repetición */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full ${
                            isAllDay
                              ? 'bg-[#3F6E64]/10 text-[#3F6E64]'
                              : 'bg-[#C98A3D]/10 text-[#C98A3D]'
                          }`}
                        >
                          {isAllDay ? (
                            <>
                              <CalendarIcon className="w-3 h-3" />
                              <span>Todo el día</span>
                            </>
                          ) : (
                            <>
                              <Clock className="w-3 h-3" />
                              <span>{event.time}</span>
                            </>
                          )}
                        </span>

                        {event.repeat && event.repeat !== 'none' && (
                          <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-[#E4DECE]/70 text-[#2B2A28]">
                            <RotateCcw className="w-2.5 h-2.5" />
                            <span>
                              {event.repeat === 'monthly' ? 'Cada mes' : 'Cada año'}
                            </span>
                          </span>
                        )}
                      </div>

                      {/* Título */}
                      <h4 className="text-base font-bold text-[#2B2A28] break-words">
                        {event.title}
                      </h4>

                      {/* Descripción (texto largo) */}
                      {event.description && event.description.trim() !== '' && (
                        <p className="text-xs text-[#6B655A] whitespace-pre-wrap bg-white/70 border border-[#E4DECE]/60 rounded-lg p-3 font-sans leading-relaxed mt-2">
                          {event.description}
                        </p>
                      )}
                    </div>

                    {/* Botones de acción */}
                    <div className="flex items-center gap-1 shrink-0 opacity-80 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => onEditEvent(event)}
                        className="p-1.5 rounded-lg text-[#8A8478] hover:text-[#2B2A28] hover:bg-white border border-transparent hover:border-[#E4DECE] transition-all cursor-pointer"
                        title="Editar evento"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteEvent(event)}
                        className="p-1.5 rounded-lg text-[#8A8478] hover:text-[#B4553F] hover:bg-white border border-transparent hover:border-[#E4DECE] transition-all cursor-pointer"
                        title="Eliminar evento"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
