import {
  etiquetaDe,
  evaluarGuardia,
  identidadDe,
  mismaIdentidad,
  urlsDeConexionEnEnv,
  type IdentidadBd,
} from './guardia-bd';

// Referencias FICTICIAS de 20 caracteres (el formato real de Supabase).
const REF_PROD = 'produccionproduccion';
const REF_DESECHABLE = 'desechabledesechable';
const CLAVE = 'S3creta%40Clave';

const pooler = (ref: string, usuario = `postgres.${ref}`) =>
  `postgresql://${usuario}:${CLAVE}@aws-0-us-east-2.pooler.supabase.com:5432/postgres`;
const directa = (ref: string) => `postgresql://postgres:${CLAVE}@db.${ref}.supabase.co:5432/postgres`;

const supabase = (ref: string): IdentidadBd => ({ tipo: 'supabase', ref });

describe('identidadDe (capa 1: identidad del recurso, no sintaxis de la URL)', () => {
  it.each<[string, string, IdentidadBd | null]>([
    ['pooler: la referencia viene del usuario', pooler(REF_DESECHABLE), supabase(REF_DESECHABLE)],
    ['conexión directa: la referencia viene del host', directa(REF_DESECHABLE), supabase(REF_DESECHABLE)],
    ['host en mayúsculas', directa(REF_DESECHABLE).replace('db.', 'DB.'), supabase(REF_DESECHABLE)],
    ['esquema postgres:// también vale', directa(REF_DESECHABLE).replace('postgresql:', 'postgres:'), supabase(REF_DESECHABLE)],
    ['pooler con usuario "postgres" a secas → no identificable', pooler(REF_PROD, 'postgres'), null],
    [
      'usuario y host con referencias distintas → no se adivina',
      `postgresql://postgres.${REF_PROD}:${CLAVE}@db.${REF_DESECHABLE}.supabase.co:5432/postgres`,
      null,
    ],
    ['referencia con formato inválido', directa('corta'), null],
    [
      'PostgreSQL local: host:puerto/base',
      'postgresql://ana:clave@localhost:5433/estudio_pruebas',
      { tipo: 'servidor', destino: 'localhost:5433/estudio_pruebas' },
    ],
    [
      'puerto por omisión 5432',
      'postgresql://ana:clave@127.0.0.1/estudio_pruebas',
      { tipo: 'servidor', destino: '127.0.0.1:5432/estudio_pruebas' },
    ],
    ['servidor sin nombre de base', 'postgresql://ana:clave@localhost:5432/', null],
    ['protocolo que no es PostgreSQL', 'https://db.example.com/estudio', null],
    ['texto que no es una URL', 'no-es-una-url', null],
  ])('%s', (_caso, url, esperada) => {
    expect(identidadDe(url)).toEqual(esperada);
  });

  it('INCIDENTE 4.2: la conexión directa y el pooler del MISMO proyecto son la misma identidad', () => {
    const viaDirecta = identidadDe(directa(REF_PROD));
    const viaPooler = identidadDe(pooler(REF_PROD));

    expect(viaDirecta).not.toBeNull();
    expect(viaPooler).not.toBeNull();
    expect(mismaIdentidad(viaDirecta as IdentidadBd, viaPooler as IdentidadBd)).toBe(true);
  });

  it('una identidad de Supabase y una de servidor nunca coinciden', () => {
    expect(mismaIdentidad(supabase(REF_PROD), { tipo: 'servidor', destino: REF_PROD })).toBe(false);
    expect(etiquetaDe({ tipo: 'servidor', destino: 'localhost:5432/x' })).toBe('localhost:5432/x');
  });
});

describe('urlsDeConexionEnEnv', () => {
  it('recoge TODAS las URLs de conexión: comillas, CRLF, export, duplicados y comentadas', () => {
    const env = [
      `DIRECT_URL="${pooler(REF_PROD)}"`,
      `DATABASE_URL='${directa(REF_PROD)}'`,
      `export DIRECT_URL=${directa(REF_PROD)}`,
      `# DATABASE_URL="${pooler('antiguaantiguaantigu')}"`,
      'JWT_SECRET="no-es-una-url-de-conexion"',
      'DATABASE_URL=',
      '',
    ].join('\r\n');

    expect(urlsDeConexionEnEnv(env)).toEqual([
      pooler(REF_PROD),
      directa(REF_PROD),
      directa(REF_PROD),
      pooler('antiguaantiguaantigu'),
    ]);
  });
});

describe('evaluarGuardia (capas 1 y 2)', () => {
  const base = {
    urlsPrueba: [directa(REF_DESECHABLE), pooler(REF_DESECHABLE)],
    urlsProduccion: [pooler(REF_PROD), directa(REF_PROD)],
    confirmacion: REF_DESECHABLE,
  };

  const motivoDe = (veredicto: ReturnType<typeof evaluarGuardia>): string =>
    veredicto.permitido ? '' : veredicto.motivo;

  it('G1 · base desechable, confirmada y distinta de producción → permitido', () => {
    expect(evaluarGuardia(base)).toEqual({ permitido: true, identidad: supabase(REF_DESECHABLE) });
  });

  it('G2 · INCIDENTE 4.2: conexión directa de producción contra el pooler de producción → rechazo', () => {
    const veredicto = evaluarGuardia({
      ...base,
      urlsPrueba: [directa(REF_PROD)],
      urlsProduccion: [pooler(REF_PROD)],
      confirmacion: REF_PROD,
    });

    expect(veredicto.permitido).toBe(false);
    expect(motivoDe(veredicto)).toContain('MISMA que una de producción');
  });

  it('G3 · DATABASE y DIRECT de pruebas apuntan a bases distintas → rechazo', () => {
    expect(evaluarGuardia({ ...base, urlsPrueba: [directa(REF_DESECHABLE), directa('otraotraotraotraotra')] }).permitido).toBe(false);
  });

  it('G4 · una URL de pruebas no identificable → rechazo', () => {
    expect(evaluarGuardia({ ...base, urlsPrueba: [directa(REF_DESECHABLE), pooler(REF_DESECHABLE, 'postgres')] }).permitido).toBe(false);
  });

  it('G5 · una URL de producción no identificable → rechazo (no hay con qué comparar)', () => {
    expect(evaluarGuardia({ ...base, urlsProduccion: [pooler(REF_PROD, 'postgres')] }).permitido).toBe(false);
  });

  it.each([
    ['sin confirmación', undefined],
    ['confirmando otro proyecto', REF_PROD],
    ['confirmación vacía', '  '],
  ])('G6 · %s → rechazo, y el motivo dice qué escribir', (_caso, confirmacion) => {
    const veredicto = evaluarGuardia({ ...base, confirmacion });

    expect(veredicto.permitido).toBe(false);
    expect(motivoDe(veredicto)).toContain(`INTEGRACION_CONFIRMO_DESECHABLE=${REF_DESECHABLE}`);
  });

  it('G7 · sin .env de producción (CI) y PostgreSQL local confirmado → permitido', () => {
    const local = 'postgresql://ci:ci@localhost:5432/estudio_ci';

    expect(
      evaluarGuardia({ urlsPrueba: [local], urlsProduccion: [], confirmacion: 'localhost:5432/estudio_ci' }),
    ).toEqual({ permitido: true, identidad: { tipo: 'servidor', destino: 'localhost:5432/estudio_ci' } });
  });

  it('G8 · basta UNA coincidencia entre las URLs de producción (duplicadas o comentadas) → rechazo', () => {
    const veredicto = evaluarGuardia({
      ...base,
      urlsProduccion: [pooler(REF_PROD), pooler(REF_PROD), directa(REF_DESECHABLE)],
    });

    expect(veredicto.permitido).toBe(false);
  });

  it('G9 · sin URLs de pruebas → rechazo', () => {
    expect(evaluarGuardia({ ...base, urlsPrueba: [] }).permitido).toBe(false);
  });

  it('G10 · ningún motivo de rechazo expone la contraseña', () => {
    const veredictos = [
      evaluarGuardia({ ...base, urlsPrueba: [directa(REF_PROD)], confirmacion: REF_PROD }),
      evaluarGuardia({ ...base, urlsPrueba: [directa(REF_DESECHABLE), pooler(REF_DESECHABLE, 'postgres')] }),
      evaluarGuardia({ ...base, confirmacion: undefined }),
    ];

    for (const veredicto of veredictos) {
      expect(motivoDe(veredicto)).not.toBe('');
      expect(motivoDe(veredicto)).not.toContain('S3creta');
    }
  });
});
