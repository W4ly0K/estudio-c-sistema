import { Reloj, RelojDelSistema } from './reloj';

describe('RelojDelSistema', () => {
  it('es un Reloj (sustituible por RelojFijo en las pruebas)', () => {
    expect(new RelojDelSistema()).toBeInstanceOf(Reloj);
  });

  it('devuelve el instante actual del sistema', () => {
    const reloj = new RelojDelSistema();
    const antes = Date.now();
    const ahora = reloj.ahora().getTime();
    const despues = Date.now();

    expect(ahora).toBeGreaterThanOrEqual(antes);
    expect(ahora).toBeLessThanOrEqual(despues);
  });

  it('devuelve un objeto nuevo en cada llamada (mutarlo no afecta al reloj)', () => {
    const reloj = new RelojDelSistema();
    const primero = reloj.ahora();
    primero.setFullYear(1999);

    expect(reloj.ahora().getFullYear()).not.toBe(1999);
  });
});
