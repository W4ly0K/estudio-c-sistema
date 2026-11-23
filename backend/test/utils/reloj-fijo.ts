import { Reloj } from '../../src/common/reloj/reloj';

/**
 * Reloj controlable SOLO para pruebas (test/ no llega a dist/).
 * Devuelve una copia en cada llamada: el código bajo prueba no puede alterar
 * el instante fijado mutando el Date recibido.
 */
export class RelojFijo extends Reloj {
  constructor(private instante: Date) {
    super();
  }

  ahora(): Date {
    return new Date(this.instante.getTime());
  }

  fijar(instante: Date): void {
    this.instante = instante;
  }
}
