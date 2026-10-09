import { FechaConZonaHoraria } from '../../common/validadores/fecha-con-zona-horaria.decorator';

/**
 * Fase 5.4 · CA-10 · K1: cuerpo de POST /solicitudes/:radicado/reprogramacion.
 * Solo la franja PROPUESTA: con el whitelist del pipe, cualquier otro campo
 * (estado, id_usuario, categoria…) se rechaza con 400. Mismo formato que al crear (D-W).
 */
export class ProponerReprogramacionDto {
  @FechaConZonaHoraria()
  fecha_inicio: Date;

  @FechaConZonaHoraria()
  fecha_fin: Date;
}
