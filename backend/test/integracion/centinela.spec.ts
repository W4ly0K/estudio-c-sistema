import { exigirCentinela, MENSAJE_SIN_CENTINELA, type ConsultasCentinela } from './centinela';

const consultas = (existe: boolean, marcas: number): ConsultasCentinela => ({
  existeTabla: async () => existe,
  contarMarcas: async () => {
    if (!existe) throw new Error('no debe contar una tabla que no existe');
    return marcas;
  },
});

describe('exigirCentinela (capa 3: el centinela dentro de la base)', () => {
  it('base con el centinela y una marca → continúa', async () => {
    await expect(exigirCentinela(consultas(true, 1))).resolves.toBeUndefined();
  });

  it('base SIN el centinela (p. ej. producción) → rechazo', async () => {
    await expect(exigirCentinela(consultas(false, 0))).rejects.toThrow(MENSAJE_SIN_CENTINELA);
  });

  it('centinela vacío (alguien borró la marca) → rechazo', async () => {
    await expect(exigirCentinela(consultas(true, 0))).rejects.toThrow(MENSAJE_SIN_CENTINELA);
  });
});
