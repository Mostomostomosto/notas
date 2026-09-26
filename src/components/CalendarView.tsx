import React, { useState } from 'react';
import { AppEvent } from '../db/db';
import {
  formatDateISO,
  parseDateISO,
  formatMonthYear,
  formatWeekDayHeader,
  formatWeekRange,
  getMonthDaysGrid,
  getWeekDays,
  isEventOnDate,
  sortEvents,
  getTodayISO,
} from '../utils/calendarUtils';
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  RotateCcw,
} from 'lucide-react';

interface CalendarViewProps {
  selectedDate: string;
  onSelectDate: (dateStr: string) => void;
  events: AppEvent[];
  onOpenNewEvent: (dateStr?: string) => void;
  onEditEvent: (event: AppEvent) => void;
}

export const CalendarView: React.FC<CalendarViewProps> = ({
  selectedDate,
  onSelectDate,
  events,
  onOpenNewEvent,
  onEditEvent,
}) => {
  const [viewMode, setViewMode] = useState<'month' | 'week'>('month');

  // Estado para la vista de mes (año y mes 0-indexed)
  const initialDate = parseDateISO(selectedDate || getTodayISO());
  const [currentYear, setCurrentYear] = useState(initialDate.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(initialDate.getMonth());

  // Estado para la vista de semana (fecha base para calcular el lunes)
  const [currentWeekBase, setCurrentWeekBase] = useState<Date>(
    new Date(initialDate.getFullYear(), initialDate.getMonth(), initialDate.getDate())
  );

  // Navegación en vista de mes
  const handlePrevMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear(currentYear - 1);
    } else {
      setCurrentMonth(currentMonth - 1);
    }
  };

  const handleNextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear(currentYear + 1);
    } else {
      setCurrentMonth(currentMonth + 1);
    }
  };

  // Navegación en vista de semana
  const handlePrevWeek = () => {
    const next = new Date(currentWeekBase);
    next.setDate(next.getDate() - 7);
    setCurrentWeekBase(next);
  };

  const handleNextWeek = () => {
    const next = new Date(currentWeekBase);
    next.setDate(next.getDate() + 7);
    setCurrentWeekBase(next);
  };

  // Botón "Hoy"
  const handleGoToday = () => {
    const now = new Date();
    setCurrentYear(now.getFullYear());
    setCurrentMonth(now.getMonth());
    setCurrentWeekBase(new Date(now.getFullYear(), now.getMonth(), now.getDate()));
    const todayStr = getTodayISO();
    onSelectDate(todayStr);
  };

  // Cuadrícula del mes
  const monthCells = getMonthDaysGrid(currentYear, currentMonth);

  // 7 días de la semana
  const weekDays = getWeekDays(currentWeekBase);
  const weekMonday = weekDays[0];

  // Eventos del día seleccionado (usado en la vista móvil de mes)
  const selectedDayEvents = sortEvents(
    events.filter((e) => isEventOnDate(e, selectedDate))
  );

  return (
    <div className="flex flex-col h-full bg-[#FAF9F5] select-none min-w-0">
      {/* 1. Barra superior: Selector de vista (Mes / Semana) y Navegación */}
      <div className="p-3 border-b border-[#E4DECE] bg-[#EDEAE2]/70 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          {/* Selector de modo Mes / Semana */}
          <div className="flex items-center bg-[#E4DECE]/70 p-0.5 rounded-lg">
            <button
              type="button"
              onClick={() => setViewMode('month')}
              className={`px-3 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                viewMode === 'month'
                  ? 'bg-white text-[#2B2A28] shadow-xs'
                  : 'text-[#8A8478] hover:text-[#2B2A28]'
              }`}
            >
              Mes
            </button>
            <button
              type="button"
              onClick={() => setViewMode('week')}
              className={`px-3 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                viewMode === 'week'
                  ? 'bg-white text-[#2B2A28] shadow-xs'
                  : 'text-[#8A8478] hover:text-[#2B2A28]'
              }`}
            >
              Semana
            </button>
          </div>

          {/* Botón "Hoy" */}
          <button
            type="button"
            onClick={handleGoToday}
            className="px-2.5 py-1 bg-white hover:bg-[#F7F4EE] border border-[#E4DECE] text-[#2B2A28] text-xs font-semibold rounded-lg transition-colors shadow-xs cursor-pointer"
          >
            Hoy
          </button>
        </div>

        {/* Título de fecha y flechas de navegación */}
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-sm text-[#2B2A28] capitalize">
            {viewMode === 'month'
              ? formatMonthYear(currentYear, currentMonth)
              : formatWeekRange(weekMonday)}
          </h3>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={viewMode === 'month' ? handlePrevMonth : handlePrevWeek}
              className="p-1 rounded-lg bg-white hover:bg-[#F7F4EE] border border-[#E4DECE] text-[#2B2A28] transition-colors cursor-pointer shadow-xs"
              title={viewMode === 'month' ? 'Mes anterior' : 'Semana anterior'}
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={viewMode === 'month' ? handleNextMonth : handleNextWeek}
              className="p-1 rounded-lg bg-white hover:bg-[#F7F4EE] border border-[#E4DECE] text-[#2B2A28] transition-colors cursor-pointer shadow-xs"
              title={viewMode === 'month' ? 'Mes siguiente' : 'Semana siguiente'}
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* 2. Contenido según el modo */}
      <div className="flex-1 overflow-y-auto">
        {viewMode === 'month' ? (
          <div>
            {/* VISTA ESCRITORIO DE MES (md:block) */}
            <div className="hidden md:flex flex-col p-3">
              {/* Cabecera de días de la semana */}
              <div className="grid grid-cols-7 gap-1 text-center mb-1">
                {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map((d) => (
                  <div
                    key={d}
                    className="text-[11px] font-bold text-[#8A8478] uppercase py-1"
                  >
                    {d}
                  </div>
                ))}
              </div>

              {/* Rejilla de celdas */}
              <div className="grid grid-cols-7 gap-1">
                {monthCells.map((cell) => {
                  const dayEvents = sortEvents(
                    events.filter((e) => isEventOnDate(e, cell.dateStr))
                  );
                  const isSelected = cell.dateStr === selectedDate;

                  // Lógica de títulos: hasta 2-3 líneas, o "+N más" si hay más de 3
                  const visibleEvents =
                    dayEvents.length <= 3
                      ? dayEvents
                      : dayEvents.slice(0, 2);
                  const extraCount =
                    dayEvents.length > 3 ? dayEvents.length - 2 : 0;

                  return (
                    <div
                      key={cell.dateStr}
                      onClick={() => onSelectDate(cell.dateStr)}
                      className={`min-h-[76px] p-1.5 rounded-xl border transition-all cursor-pointer flex flex-col justify-between ${
                        isSelected
                          ? 'border-[#3F6E64] bg-[#3F6E64]/5 ring-2 ring-[#3F6E64]/20'
                          : cell.isCurrentMonth
                          ? 'border-[#E4DECE]/70 bg-white hover:border-[#8A8478]'
                          : 'border-transparent bg-[#F7F4EE]/40 opacity-40 hover:opacity-75'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span
                          className={`text-xs font-semibold inline-flex items-center justify-center w-5 h-5 rounded-full ${
                            cell.isToday
                              ? 'bg-[#3F6E64] text-white'
                              : isSelected
                              ? 'text-[#3F6E64] font-bold'
                              : 'text-[#2B2A28]'
                          }`}
                        >
                          {cell.dayNumber}
                        </span>
                        {dayEvents.length > 0 && (
                          <span className="text-[10px] text-[#8A8478] font-medium">
                            {dayEvents.length}
                          </span>
                        )}
                      </div>

                      {/* Lista de hasta 2-3 líneas cortas con títulos */}
                      <div className="space-y-0.5 mt-1 overflow-hidden">
                        {visibleEvents.map((evt) => (
                          <div
                            key={evt.id}
                            title={`${evt.time ? evt.time + ' ' : ''}${evt.title}`}
                            className="text-[10.5px] leading-tight truncate px-1 py-0.5 rounded bg-[#FAF9F5] border border-[#E4DECE]/60 text-[#2B2A28] font-medium"
                          >
                            {evt.time && (
                              <span className="text-[#3F6E64] font-semibold mr-1">
                                {evt.time}
                              </span>
                            )}
                            <span>{evt.title}</span>
                          </div>
                        ))}
                        {extraCount > 0 && (
                          <div className="text-[10px] text-[#3F6E64] font-bold px-1">
                            +{extraCount} más
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* VISTA MÓVIL DE MES (md:hidden) */}
            <div className="md:hidden flex flex-col p-3 space-y-4">
              {/* Rejilla de mes reducida: número + punto de color */}
              <div>
                <div className="grid grid-cols-7 gap-1 text-center mb-1">
                  {['L', 'M', 'X', 'J', 'V', 'S', 'D'].map((d, i) => (
                    <div
                      key={i}
                      className="text-[10px] font-bold text-[#8A8478] py-1"
                    >
                      {d}
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-7 gap-1">
                  {monthCells.map((cell) => {
                    const dayEvents = events.filter((e) =>
                      isEventOnDate(e, cell.dateStr)
                    );
                    const isSelected = cell.dateStr === selectedDate;
                    const hasEvents = dayEvents.length > 0;

                    return (
                      <button
                        key={cell.dateStr}
                        type="button"
                        onClick={() => onSelectDate(cell.dateStr)}
                        className={`h-11 rounded-xl flex flex-col items-center justify-center transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-[#3F6E64] text-white font-bold shadow-xs'
                            : cell.isCurrentMonth
                            ? 'bg-white border border-[#E4DECE]/70 text-[#2B2A28]'
                            : 'bg-transparent text-[#8A8478]/40'
                        }`}
                      >
                        <span
                          className={`text-xs ${
                            cell.isToday && !isSelected
                              ? 'text-[#3F6E64] font-bold underline'
                              : ''
                          }`}
                        >
                          {cell.dayNumber}
                        </span>
                        {/* Pequeño punto si tiene eventos */}
                        {hasEvents && (
                          <span
                            className={`w-1.5 h-1.5 rounded-full mt-0.5 ${
                              isSelected ? 'bg-white' : 'bg-[#3F6E64]'
                            }`}
                          />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Debajo: Lista de eventos del día seleccionado con botón + Nuevo evento */}
              <div className="bg-white rounded-2xl border border-[#E4DECE] p-4 space-y-3 shadow-xs">
                <div className="flex items-center justify-between border-b border-[#E4DECE]/60 pb-2">
                  <h4 className="text-xs font-bold text-[#2B2A28]">
                    Eventos de {selectedDate}
                  </h4>
                  <span className="text-[11px] text-[#8A8478]">
                    {selectedDayEvents.length}{' '}
                    {selectedDayEvents.length === 1 ? 'evento' : 'eventos'}
                  </span>
                </div>

                <div className="space-y-2">
                  {selectedDayEvents.map((evt) => (
                    <div
                      key={evt.id}
                      onClick={() => onEditEvent(evt)}
                      className="p-2.5 rounded-xl bg-[#FAF9F5] border border-[#E4DECE] cursor-pointer hover:border-[#2B2A28] transition-colors"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-[#2B2A28]">
                          {evt.title}
                        </span>
                        <span className="text-[11px] text-[#3F6E64] font-semibold shrink-0">
                          {evt.time || 'Todo el día'}
                        </span>
                      </div>
                      {evt.description && (
                        <p className="text-[11px] text-[#8A8478] line-clamp-2 mt-1">
                          {evt.description}
                        </p>
                      )}
                    </div>
                  ))}

                  {selectedDayEvents.length === 0 && (
                    <div className="text-center text-xs text-[#8A8478]/70 italic py-3">
                      No hay eventos programados para este día.
                    </div>
                  )}
                </div>

                {/* Botón + Nuevo evento al final de la lista móvil */}
                <button
                  type="button"
                  onClick={() => onOpenNewEvent(selectedDate)}
                  className="w-full flex items-center justify-center gap-1.5 py-2 px-3 bg-[#3F6E64] hover:bg-[#345b53] text-white text-xs font-semibold rounded-xl transition-colors cursor-pointer shadow-xs"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>+ Nuevo evento</span>
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* VISTA SEMANAL (7 días apilados verticalmente, idéntica en escritorio y móvil) */
          <div className="p-3 sm:p-4 space-y-3">
            {weekDays.map((dayDate) => {
              const dayDateStr = formatDateISO(dayDate);
              const dayEvents = sortEvents(
                events.filter((e) => isEventOnDate(e, dayDateStr))
              );
              const isToday = dayDateStr === getTodayISO();
              const isSelected = dayDateStr === selectedDate;

              return (
                <div
                  key={dayDateStr}
                  onClick={() => onSelectDate(dayDateStr)}
                  className={`bg-white rounded-xl border p-3.5 transition-all cursor-pointer ${
                    isSelected
                      ? 'border-[#3F6E64] shadow-xs ring-1 ring-[#3F6E64]/30'
                      : isToday
                      ? 'border-[#C98A3D] shadow-xs'
                      : 'border-[#E4DECE] hover:border-[#8A8478]'
                  }`}
                >
                  {/* Cabecera del día en negrita con formato "Lunes 10/08/2026" */}
                  <div className="flex items-center justify-between pb-2 border-b border-[#E4DECE]/50 mb-2">
                    <span
                      className={`text-xs font-bold ${
                        isToday ? 'text-[#C98A3D]' : 'text-[#2B2A28]'
                      }`}
                    >
                      {formatWeekDayHeader(dayDate)}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenNewEvent(dayDateStr);
                      }}
                      className="p-1 rounded text-[#8A8478] hover:text-[#3F6E64] hover:bg-[#F7F4EE] transition-colors"
                      title="Añadir evento a este día"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Lista de eventos del día */}
                  {dayEvents.length > 0 ? (
                    <div className="space-y-1.5">
                      {dayEvents.map((evt) => {
                        const isAllDay = !evt.time || evt.time.trim() === '';
                        return (
                          <div
                            key={evt.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              onEditEvent(evt);
                            }}
                            className="flex items-center justify-between gap-2 p-2 rounded-lg bg-[#FAF9F5] hover:bg-[#F7F4EE] border border-[#E4DECE]/60 text-xs transition-colors group cursor-pointer"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="font-semibold text-[#3F6E64] shrink-0 min-w-[55px]">
                                {isAllDay ? 'Todo el día' : evt.time}
                              </span>
                              <span className="text-[#8A8478]">—</span>
                              <span className="font-medium text-[#2B2A28] truncate">
                                {evt.title}
                              </span>
                            </div>

                            {evt.repeat && evt.repeat !== 'none' && (
                              <RotateCcw className="w-3 h-3 text-[#8A8478] shrink-0" />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-xs text-[#8A8478]/50 italic pl-1 py-1">
                      Sin eventos
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
