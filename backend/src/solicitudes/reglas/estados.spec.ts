import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ESTADOS_QUE_LIBERAN_FRANJA, ocupaFranja } from './estados';

const MIGRACION_CA06 = join(
  __dirname,
  '../../../prisma/migrations/20261002200000_ca06_sin_traslape/migration.sql',
);

describe('Estados y ocupación de la franja (CA-06)', () => {
  it.each(['Rechazado', 'Cancelado por el Usuario'])('%s libera la franja', (estado) => {
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

  it('la lista coincide EXACTAMENTE con el NOT IN de la migración aplicada', () => {
    const sql = readFileSync(MIGRACION_CA06, 'utf8');
    const coincidencia = sql.match(/estado NOT IN \(([^)]*)\)/);
    expect(coincidencia).not.toBeNull();
    const enLaMigracion = [...(coincidencia?.[1] ?? '').matchAll(/'([^']*)'/g)].map((m) => m[1]);

    expect([...ESTADOS_QUE_LIBERAN_FRANJA].sort()).toEqual(enLaMigracion.sort());
  });
});
