export const DEPARTMENTS = [
  { id: "marketing", name: "Marketing", color: "#e07a5f" },
  { id: "atencion_cliente", name: "Atención al cliente", color: "#3d8bfd" },
  { id: "soporte_tecnico", name: "Soporte técnico", color: "#8a9a1b" },
  { id: "logistica", name: "Logística", color: "#9b5de5" },
];

export const ABSENCE_TYPES = [
  { id: "vacaciones", name: "Vacaciones", consumesAllowance: true, color: "#1a7f5c" },
  { id: "ausencia", name: "Ausencia temporal", consumesAllowance: false, color: "#e0a030" },
  { id: "baja", name: "Baja por enfermedad", consumesAllowance: false, color: "#c0392b" },
  { id: "permiso", name: "Días de permiso", consumesAllowance: false, color: "#5b5fc7" },
];

export const DEFAULT_HOLIDAYS_2026 = [
  { date: "2026-01-01", name: "Año Nuevo" },
  { date: "2026-01-06", name: "Epifanía del Señor" },
  { date: "2026-04-02", name: "Jueves Santo" },
  { date: "2026-04-03", name: "Viernes Santo" },
  { date: "2026-05-01", name: "Fiesta del Trabajo" },
  { date: "2026-05-31", name: "Día de Castilla-La Mancha" },
  { date: "2026-08-15", name: "Asunción de la Virgen" },
  { date: "2026-09-08", name: "Feria de Albacete" },
  { date: "2026-09-09", name: "Feria de Albacete (2º día)" },
  { date: "2026-10-12", name: "Fiesta Nacional de España" },
  { date: "2026-11-02", name: "Todos los Santos (traslado)" },
  { date: "2026-12-07", name: "Puente de la Constitución (traslado)" },
  { date: "2026-12-08", name: "Inmaculada Concepción" },
  { date: "2026-12-25", name: "Natividad del Señor" },
];
