import { leerOrigenesCors, opcionesCors } from './configurar-cors';

describe('CORS con lista blanca (Fase 6.2 · DS2)', () => {
  describe('leerOrigenesCors', () => {
    it('acepta un origen exacto', () => {
      expect(leerOrigenesCors('http://localhost:5173')).toEqual(['http://localhost:5173']);
    });

    it('acepta varios orígenes con espacios y elimina duplicados', () => {
      expect(leerOrigenesCors(' http://localhost:5173 , https://estudioc.unicesmag.edu.co,http://localhost:5173')).toEqual([
        'http://localhost:5173',
        'https://estudioc.unicesmag.edu.co',
      ]);
    });

    it.each([
      ['ausente', undefined],
      ['vacía', ''],
      ['solo comas y espacios', ' , , '],
    ])('falla si la variable está %s (fail-fast)', (_caso, valor) => {
      expect(() => leerOrigenesCors(valor)).toThrow(/CORS_ORIGENES no está configurado/);
    });

    it('rechaza el comodín "*"', () => {
      expect(() => leerOrigenesCors('http://localhost:5173,*')).toThrow(/no admite "\*"/);
    });

    it.each([
      ['con ruta', 'http://localhost:5173/app', 'http://localhost:5173'],
      ['con barra final', 'http://localhost:5173/', 'http://localhost:5173'],
      ['en mayúsculas', 'HTTP://LOCALHOST:5173', 'http://localhost:5173'],
      ['con el puerto por defecto', 'https://estudioc.unicesmag.edu.co:443', 'https://estudioc.unicesmag.edu.co'],
    ])('rechaza un origen %s y sugiere la forma exacta', (_caso, origen, sugerido) => {
      expect(() => leerOrigenesCors(origen)).toThrow(`Use "${sugerido}"`);
    });

    it.each(['localhost:5173', 'no es una url'])('rechaza "%s": no es una URL válida', (origen) => {
      expect(() => leerOrigenesCors(origen)).toThrow(/no es una URL válida|debe usar http o https/);
    });

    it('rechaza un esquema distinto de http o https', () => {
      expect(() => leerOrigenesCors('ftp://localhost:5173')).toThrow(/debe usar http o https/);
    });
  });

  it('opcionesCors: solo los métodos y encabezados del frontend, sin credenciales', () => {
    expect(opcionesCors(['http://localhost:5173'])).toEqual({
      origin: ['http://localhost:5173'],
      methods: ['GET', 'POST', 'PATCH', 'DELETE'],
      allowedHeaders: ['Authorization', 'Content-Type', 'Accept'],
      credentials: false,
      maxAge: 600,
    });
  });
});
