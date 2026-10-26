import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ESTADOS_QUE_LIBERAN_FRANJA, ocupaFranja } from './estados';

// Fase 7 · 7A.3: la restricción vigente es la de los sub-espacios (la de la Fase 4 se borró).
const MIGRACION_CA06 = join(
  __dirname,
  '../../../prisma/migrations/20261023120000_ca06_subespacios/migration.sql',
);

describe('Estados y ocupación de la franja (CA-06)', () => {
  it.each(['Rechazado', 'Cancelado por el Usuario', 'No atendida'])('%s libera la franja', (estado) => {
    expect(ocupaFranja(estado)).toBe(false);
  });

  it.each(['Recibido', 'Validado', 'En Producción', 'Entregado', 'Pendiente de Reprogramación'])(
    '%s ocupa la franja',
    (estado) => {
      expect(ocupaFranja(estado)).toBe(true);
    },
  );

  it('un estado desconocido OCUPA la franja (fail-closed, como el motor)', () => {
    expect(ocupaFranja('Estado inventado')).toBe(true);
    expect(ocupaFranja('rechazado')).toBe(true); // otra capitalización no libera nada
  });

  it('la lista coincide EXACTAMENTE con el NOT IN de CADA restricción de la migración', () => {
    // Sin comentarios: la cabecera documenta una reversión que no se ejecuta.
    const sql = readFileSync(MIGRACION_CA06, 'utf8').replace(/--.*$/gm, '');
    const listas = [...sql.matchAll(/estado NOT IN \(([^)]*)\)/g)].map((coincidencia) =>
      [...coincidencia[1].matchAll(/'([^']*)'/g)].map((m) => m[1]).sort(),
    );

    // Una por sub-espacio físico: si el formato cambia y no se lee ninguna, falla aquí.
    expect(listas).toHaveLength(2);
    for (const enLaMigracion of listas) {
      expect([...ESTADOS_QUE_LIBERAN_FRANJA].sort()).toEqual(enLaMigracion);
    }
  });
});
