import { Injectable } from '@nestjs/common';

/**
 * Fuente del "ahora" del sistema (Decisión D-U, Fase 3).
 *
 * Es una clase abstracta y no una interface: las interfaces desaparecen al
 * compilar, mientras que una clase existe en tiempo de ejecución y NestJS
 * puede usarla como token de inyección (`constructor(reloj: Reloj)`), sin
 * `@Inject('RELOJ')` ni cadenas mágicas, y con el tipado completo.
 *
 * Regla de uso: cada operación pide `ahora()` UNA sola vez y reutiliza ese
 * instante, para que todas sus decisiones correspondan al mismo momento.
 */
export abstract class Reloj {
  abstract ahora(): Date;
}

@Injectable()
export class RelojDelSistema extends Reloj {
  ahora(): Date {
    return new Date();
  }
}
