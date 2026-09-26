import React, { useState, useEffect } from 'react';
import { AppEvent, EventRepeat, db } from '../db/db';
import { scheduleSync } from '../services/syncEngine';
import { X, Calendar as CalendarIcon, Clock, RotateCcw, Trash2, AlignLeft } from 'lucide-react';

interface EventModalProps {
  isOpen: boolean;
  onClose: () => void;
  eventToEdit?: AppEvent | null;
  defaultDate?: string;
  token: string | null;
}

export const EventModal: React.FC<EventModalProps> = ({
  isOpen,
  onClose,
  eventToEdit,
  defaultDate,
  token,
}) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [repeat, setRepeat] = useState<EventRepeat>('none');
  const [isAllDay, setIsAllDay] = useState(true);

  useEffect(() => {
    if (isOpen) {
      if (eventToEdit) {
        setTitle(eventToEdit.title || '');
        setDescription(eventToEdit.description || '');
        setDate(eventToEdit.date || defaultDate || '');
        if (eventToEdit.time && eventToEdit.time.trim() !== '') {
          setTime(eventToEdit.time);
          setIsAllDay(false);
        } else {
          setTime('');
          setIsAllDay(true);
        }
        setRepeat(eventToEdit.repeat || 'none');
      } else {
        setTitle('');
        setDescription('');
        setDate(defaultDate || new Date().toISOString().split('T')[0]);
        setTime('');
        setIsAllDay(true);
        setRepeat('none');
      }
    }
  }, [isOpen, eventToEdit, defaultDate]);

  if (!isOpen) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !date) return;

    const now = new Date().toISOString();
    const cleanTime = isAllDay ? undefined : time.trim() || undefined;

    if (eventToEdit) {
      const updated: AppEvent = {
        ...eventToEdit,
        title: title.trim(),
        description: description.trim() || undefined,
        date,
        time: cleanTime,
        repeat,
        updatedAt: now,
        syncStatus: 'pending',
      };
      await db.events.put(updated);
    } else {
      const newEvent: AppEvent = {
        id: `event_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        title: title.trim(),
        description: description.trim() || undefined,
        date,
        time: cleanTime,
        repeat,
        createdAt: now,
        updatedAt: now,
        syncStatus: 'pending',
        deleted: false,
      };
      await db.events.add(newEvent);
    }

    scheduleSync(token);
    onClose();
  };

  const handleDelete = async () => {
    if (!eventToEdit) return;
    if (window.confirm('¿Seguro que deseas eliminar este evento?')) {
      const now = new Date().toISOString();
      await db.events.update(eventToEdit.id, {
        deleted: true,
        updatedAt: now,
        syncStatus: 'pending',
      });
      scheduleSync(token);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl border border-[#E4DECE] shadow-2xl max-w-md w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-[#E4DECE]/70 pb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[#3F6E64]/10 text-[#3F6E64] flex items-center justify-center">
              <CalendarIcon className="w-4 h-4" />
            </div>
            <h3 className="font-semibold text-base text-[#2B2A28]">
              {eventToEdit ? 'Editar evento' : 'Nuevo evento'}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-[#8A8478] hover:text-[#2B2A28] p-1 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSave} className="space-y-4">
          {/* Título */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-[#2B2A28]">
              Título del evento <span className="text-[#B4553F]">*</span>
            </label>
            <input
              type="text"
              autoFocus
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ej. Cena con Marta, Dentista, Pagar seguro..."
              className="w-full bg-[#FAF9F5] border border-[#E4DECE] rounded-lg px-3 py-2 text-xs text-[#2B2A28] outline-none focus:border-[#2B2A28] focus:bg-white transition-all font-medium"
            />
          </div>

          {/* Fecha y Hora */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-[#2B2A28] flex items-center gap-1">
                <CalendarIcon className="w-3.5 h-3.5 text-[#8A8478]" />
                <span>Fecha</span> <span className="text-[#B4553F]">*</span>
              </label>
              <input
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full bg-[#FAF9F5] border border-[#E4DECE] rounded-lg px-3 py-2 text-xs text-[#2B2A28] outline-none focus:border-[#2B2A28] focus:bg-white transition-all cursor-pointer"
              />
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-[#2B2A28] flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-[#8A8478]" />
                  <span>Hora</span>
                </label>
                <button
                  type="button"
                  onClick={() => setIsAllDay(!isAllDay)}
                  className="text-[11px] text-[#3F6E64] hover:underline cursor-pointer"
                >
                  {isAllDay ? 'Añadir hora' : 'Todo el día'}
                </button>
              </div>
              {isAllDay ? (
                <div className="w-full bg-[#FAF9F5]/60 border border-[#E4DECE] rounded-lg px-3 py-2 text-xs text-[#8A8478] italic">
                  Todo el día
                </div>
              ) : (
                <input
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  className="w-full bg-[#FAF9F5] border border-[#E4DECE] rounded-lg px-3 py-2 text-xs text-[#2B2A28] outline-none focus:border-[#2B2A28] focus:bg-white transition-all cursor-pointer"
                />
              )}
            </div>
          </div>

          {/* Repetición */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-[#2B2A28] flex items-center gap-1">
              <RotateCcw className="w-3.5 h-3.5 text-[#8A8478]" />
              <span>Repetición</span>
            </label>
            <select
              value={repeat}
              onChange={(e) => setRepeat(e.target.value as EventRepeat)}
              className="w-full bg-[#FAF9F5] border border-[#E4DECE] rounded-lg px-3 py-2 text-xs text-[#2B2A28] outline-none focus:border-[#2B2A28] focus:bg-white transition-all cursor-pointer"
            >
              <option value="none">No se repite</option>
              <option value="monthly">Cada mes</option>
              <option value="yearly">Cada año</option>
            </select>
          </div>

          {/* Descripción (texto largo) */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-[#2B2A28] flex items-center gap-1">
              <AlignLeft className="w-3.5 h-3.5 text-[#8A8478]" />
              <span>Descripción (opcional)</span>
            </label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Detalles adicionales, recordatorio de cosas que llevar, dirección..."
              className="w-full bg-[#FAF9F5] border border-[#E4DECE] rounded-lg px-3 py-2 text-xs text-[#2B2A28] outline-none focus:border-[#2B2A28] focus:bg-white transition-all resize-y font-sans placeholder-[#8A8478]/50"
            />
          </div>

          {/* Botones de acción */}
          <div className="flex items-center justify-between pt-3 border-t border-[#E4DECE]/70">
            {eventToEdit ? (
              <button
                type="button"
                onClick={handleDelete}
                className="flex items-center gap-1 text-xs text-[#B4553F] hover:text-[#8B3524] px-2 py-1.5 rounded-lg hover:bg-[#B4553F]/10 transition-colors cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Eliminar</span>
              </button>
            ) : (
              <div />
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3.5 py-2 text-xs font-medium text-[#8A8478] hover:text-[#2B2A28] transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={!title.trim() || !date}
                className="px-4 py-2 bg-[#2B2A28] hover:bg-[#403E3B] text-white text-xs font-medium rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shadow-xs"
              >
                {eventToEdit ? 'Guardar cambios' : 'Crear evento'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
