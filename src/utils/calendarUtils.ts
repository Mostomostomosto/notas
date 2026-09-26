import type { AppEvent } from '../db/db';

const MONTH_NAMES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];

const WEEKDAY_NAMES = [
  'Domingo',
  'Lunes',
  'Martes',
  'Miércoles',
  'Jueves',
  'Viernes',
  'Sábado',
];

/**
 * Formatea una fecha local a formato ISO YYYY-MM-DD
 */
export function formatDateISO(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Parsea una cadena YYYY-MM-DD a objeto Date local
 */
export function parseDateISO(str: string): Date {
  const [yearStr, monthStr, dayStr] = str.split('-');
  return new Date(Number(yearStr), Number(monthStr) - 1, Number(dayStr));
}

/**
 * Devuelve el día de hoy en formato YYYY-MM-DD
 */
export function getTodayISO(): string {
  return formatDateISO(new Date());
}

/**
 * Comprueba si un evento ocurre en una fecha determinada, considerando su recurrencia
 */
export function isEventOnDate(event: AppEvent, targetDateStr: string): boolean {
  if (event.deleted) return false;
  if (!event.date) return false;

  // Si la fecha objetivo es anterior a la fecha original del evento, no se muestra
  if (targetDateStr < event.date) {
    return false;
  }

  if (event.repeat === 'none' || !event.repeat) {
    return event.date === targetDateStr;
  }

  const [, eM, eD] = event.date.split('-').map(Number);
  const [tY, tM, tD] = targetDateStr.split('-').map(Number);

  if (event.repeat === 'monthly') {
    // Caso especial: si el día del evento original es 29, 30 o 31,
    // y el mes objetivo no tiene tantos días, se muestra en el último día de ese mes
    const daysInTargetMonth = new Date(tY, tM, 0).getDate();
    const expectedDay = Math.min(eD, daysInTargetMonth);
    return tD === expectedDay;
  }

  if (event.repeat === 'yearly') {
    // Debe coincidir el mismo mes
    if (tM !== eM) return false;
    // Si era 29 de febrero y el año no es bisiesto, se muestra el 28
    const daysInTargetMonth = new Date(tY, tM, 0).getDate();
    const expectedDay = Math.min(eD, daysInTargetMonth);
    return tD === expectedDay;
  }

  return false;
}

/**
 * Ordena eventos de un día: los de 'todo el día' primero, luego ordenados por 'time'
 */
export function sortEvents(events: AppEvent[]): AppEvent[] {
  return [...events].sort((a, b) => {
    const aAllDay = !a.time || a.time.trim() === '';
    const bAllDay = !b.time || b.time.trim() === '';

    if (aAllDay && !bAllDay) return -1;
    if (!aAllDay && bAllDay) return 1;
    if (aAllDay && bAllDay) return a.title.localeCompare(b.title);
    return a.time!.localeCompare(b.time!);
  });
}

/**
 * Formato de cabecera para la vista semanal: "Lunes 10/08/2026"
 */
export function formatWeekDayHeader(date: Date): string {
  const dayName = WEEKDAY_NAMES[date.getDay()];
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = date.getFullYear();
  return `${dayName} ${dd}/${mm}/${yyyy}`;
}

/**
 * Formato de mes y año para navegación: "Octubre 2026"
 */
export function formatMonthYear(year: number, monthIndex: number): string {
  return `${MONTH_NAMES[monthIndex]} ${year}`;
}

/**
 * Formato completo legible para la columna de detalle: "Jueves, 15 de octubre de 2026"
 */
export function formatFullDateReadable(dateStr: string): string {
  const d = parseDateISO(dateStr);
  const dayName = WEEKDAY_NAMES[d.getDay()];
  const dayNum = d.getDate();
  const monthName = MONTH_NAMES[d.getMonth()].toLowerCase();
  const year = d.getFullYear();
  return `${dayName}, ${dayNum} de ${monthName} de ${year}`;
}

export interface CalendarDayCell {
  date: Date;
  dateStr: string;
  dayNumber: number;
  isCurrentMonth: boolean;
  isToday: boolean;
}

/**
 * Genera la cuadrícula de días para un mes dado, comenzando en Lunes
 */
export function getMonthDaysGrid(year: number, monthIndex: number): CalendarDayCell[] {
  const todayISO = getTodayISO();
  const firstDayOfMonth = new Date(year, monthIndex, 1);
  const lastDayOfMonth = new Date(year, monthIndex + 1, 0);

  // Obtener el día de la semana del primer día (0: Domingo, 1: Lunes, ..., 6: Sábado)
  // Convertimos a lunes = 0, ..., domingo = 6
  let firstDayWeekday = firstDayOfMonth.getDay() - 1;
  if (firstDayWeekday === -1) firstDayWeekday = 6;

  const cells: CalendarDayCell[] = [];

  // Días del mes anterior para rellenar la primera fila
  const prevMonthLastDay = new Date(year, monthIndex, 0).getDate();
  for (let i = firstDayWeekday - 1; i >= 0; i--) {
    const day = prevMonthLastDay - i;
    const date = new Date(year, monthIndex - 1, day);
    const dateStr = formatDateISO(date);
    cells.push({
      date,
      dateStr,
      dayNumber: day,
      isCurrentMonth: false,
      isToday: dateStr === todayISO,
    });
  }

  // Días del mes actual
  for (let day = 1; day <= lastDayOfMonth.getDate(); day++) {
    const date = new Date(year, monthIndex, day);
    const dateStr = formatDateISO(date);
    cells.push({
      date,
      dateStr,
      dayNumber: day,
      isCurrentMonth: true,
      isToday: dateStr === todayISO,
    });
  }

  // Días del mes siguiente para completar la cuadrícula (hasta múltiplos de 7)
  const remainingCells = 7 - (cells.length % 7);
  if (remainingCells < 7) {
    for (let day = 1; day <= remainingCells; day++) {
      const date = new Date(year, monthIndex + 1, day);
      const dateStr = formatDateISO(date);
      cells.push({
        date,
        dateStr,
        dayNumber: day,
        isCurrentMonth: false,
        isToday: dateStr === todayISO,
      });
    }
  }

  return cells;
}

/**
 * Obtiene los 7 días (Lunes a Domingo) de la semana que contiene a baseDate
 */
export function getWeekDays(baseDate: Date): Date[] {
  const d = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate());
  let dayOfWeek = d.getDay() - 1; // 0 = Lunes, 6 = Domingo
  if (dayOfWeek === -1) dayOfWeek = 6;

  // Retroceder hasta el lunes
  d.setDate(d.getDate() - dayOfWeek);

  const days: Date[] = [];
  for (let i = 0; i < 7; i++) {
    days.push(new Date(d.getFullYear(), d.getMonth(), d.getDate() + i));
  }
  return days;
}

/**
 * Formatea el rango de una semana para navegación: "10 - 16 de agosto de 2026"
 */
export function formatWeekRange(monday: Date): string {
  const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6);
  const mDay = monday.getDate();
  const sDay = sunday.getDate();
  const mMonth = MONTH_NAMES[monday.getMonth()].toLowerCase();
  const sMonth = MONTH_NAMES[sunday.getMonth()].toLowerCase();
  const year = sunday.getFullYear();

  if (monday.getMonth() === sunday.getMonth()) {
    return `${mDay} - ${sDay} de ${mMonth} de ${year}`;
  }
  return `${mDay} de ${mMonth} - ${sDay} de ${sMonth} de ${year}`;
}
