import { FechaConZonaHoraria } from '../../common/validadores/fecha-con-zona-horaria.decorator';
import { TextoConLongitudReal } from '../../common/validadores/texto-con-longitud-real.decorator';

/**
 * Límites del motivo (Fase 6.1b · DB2). La migración 20261009200000_motivo_reprogramacion
 * los repite en Log_Auditoria_motivo_reprogramacion_longitud_check; la prueba de
 * integración I-20 deriva la definición esperada de estas constantes.
 */
export const MOTIVO_REPROGRAMACION_MINIMO = 10;
export const MOTIVO_REPROGRAMACION_MAXIMO = 500;
export const MENSAJE_MOTIVO_REPROGRAMACION =
  `El motivo de la reprogramación es obligatorio y debe tener entre ${MOTIVO_REPROGRAMACION_MINIMO} ` +
  `y ${MOTIVO_REPROGRAMACION_MAXIMO} caracteres (sin contar los espacios de los extremos).`;

/**
 * Fase 5.4 · CA-10 · K1: cuerpo de POST /solicitudes/:radicado/reprogramacion.
 * La franja PROPUESTA y, desde la Fase 6.1b (K7), el motivo: con el whitelist del pipe,
 * cualquier otro campo (estado, id_usuario, categoria…) se rechaza con 400. Mismo
 * formato de fechas que al crear (D-W).
 */
export class ProponerReprogramacionDto {
  @FechaConZonaHoraria()
  fecha_inicio: Date;

  @FechaConZonaHoraria()
  fecha_fin: Date;

  /** DB1/DB3: se registra en el log de T5 (Log_Auditoria.motivo_reprogramacion). */
  @TextoConLongitudReal(MOTIVO_REPROGRAMACION_MINIMO, MOTIVO_REPROGRAMACION_MAXIMO, MENSAJE_MOTIVO_REPROGRAMACION)
  motivo: string;
}
