import { describe, expect, it } from 'vitest'
import hojaDeEstilos from './index.css?raw'

/**
 * Fase 8 · requisito 6: el contraste del token de urgencia se MIDE (WCAG 2.x) contra los fondos
 * donde se pinta, en lugar de suponerlo. Lee el tema real (index.css) como texto.
 */
function color(nombre: string): string {
  const coincidencia = new RegExp(`--color-${nombre}:\\s*(#[0-9a-fA-F]{6});`).exec(hojaDeEstilos)
  const valor = coincidencia?.[1]
  if (valor === undefined) throw new Error(`Falta --color-${nombre} en index.css`)
  return valor
}

const PESOS = [0.2126, 0.7152, 0.0722] as const

/** Luminancia relativa de un color #rrggbb (WCAG 2.x). */
function luminancia(hex: string): number {
  return PESOS.reduce((suma, peso, i) => {
    const canal = Number.parseInt(hex.slice(1 + 2 * i, 3 + 2 * i), 16) / 255
    const lineal = canal <= 0.04045 ? canal / 12.92 : ((canal + 0.055) / 1.055) ** 2.4
    return suma + peso * lineal
  }, 0)
}

function contraste(a: string, b: string): number {
  const la = luminancia(a)
  const lb = luminancia(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

describe('Tema · urgencia (Fase 8 · requisito 6)', () => {
  it('es el rojo institucional cesmag-rojo-1', () => {
    expect(color('urgencia').toUpperCase()).toBe(color('cesmag-rojo-1').toUpperCase())
  })

  it.each(['surface', 'background'])('alcanza el contraste AA para texto (≥ 4,5:1) sobre %s', (fondo) => {
    expect(contraste(color('urgencia'), color(fondo))).toBeGreaterThanOrEqual(4.5)
  })
})

/**
 * Fase 9 · R9-3 (ADR-010, D-R3-2): los tokens semánticos referencian los colores del manual, y
 * cada par de primer plano y fondo que usa la interfaz se mide contra su umbral WCAG 2.x:
 * texto 4,5:1 (1.4.3); bordes de controles y foco 3:1 (1.4.11).
 */
describe('Tema · invariantes de marca (R9-3)', () => {
  it.each([
    ['primary', 'cesmag-azul-2'],
    ['primary-hover', 'cesmag-azul-1'],
    ['accent', 'cesmag-rojo-2'],
    ['borde-error', 'cesmag-rojo-2'],
    ['urgencia', 'cesmag-rojo-1'],
    ['surface', 'cesmag-blanco'],
    ['foco', 'cesmag-azul-1'],
  ])('%s es %s', (token, marca) => {
    expect(color(token).toUpperCase()).toBe(color(marca).toUpperCase())
  })

  it.each(['texto-principal', 'texto-secundario', 'borde-error', 'texto-terciario', 'borde-control', 'borde-suave', 'superficie-suave', 'foco'])(
    'declara --color-%s en hex',
    (token) => {
      expect(color(token)).toMatch(/^#[0-9a-fA-F]{6}$/)
    },
  )
})

/** Fondos sobre los que se pinta texto y controles (D-R3-2). */
const FONDOS = ['surface', 'background', 'superficie-suave'] as const

type Par = [primerPlano: string, fondo: string, minimo: number]

const PARES: Par[] = [
  ...FONDOS.flatMap((fondo): Par[] => [
    ['texto-principal', fondo, 4.5],
    ['texto-secundario', fondo, 4.5],
    ['texto-terciario', fondo, 4.5],
    ['borde-control', fondo, 3],
  ]),
  // D-R3-6: el anillo siempre queda junto a su desplazamiento blanco, sobre cualquier fondo.
  ['foco', 'surface', 3],
  // 9.3.4 · D-R3-4: acción principal en Azul 2 y su hover en Azul 1, con texto blanco.
  ['surface', 'primary-hover', 4.5],
  // D-R3-3: las cajas de error pasan a bg-surface con text-accent.
  ['accent', 'surface', 4.5],
  ['borde-error', 'surface', 3],
  // 9.3.3: texto blanco (text-surface) sobre los botones institucionales.
  ['surface', 'primary', 4.5],
  ['surface', 'accent', 4.5],
  // Pregunta 16: insignias sólidas de los estados en curso (texto blanco sobre el neutro).
  ['surface', 'texto-principal', 4.5],
  ['surface', 'texto-secundario', 4.5],
]

describe('Tema · contraste medido (R9-3)', () => {
  it.each(PARES)('%s sobre %s alcanza %s:1', (primerPlano, fondo, minimo) => {
    expect(contraste(color(primerPlano), color(fondo))).toBeGreaterThanOrEqual(minimo)
  })
})

/** 9.3.4 · D-R3-6: la regla de foco visible del tema, leída como texto. */
describe('Tema · foco visible (R9-3, D-R3-6)', () => {
  const regla = /:focus-visible\s*\{([^}]*)\}/.exec(hojaDeEstilos)?.[1] ?? ''

  it('declara un anillo de 2 px en el token foco, separado 2 px del control', () => {
    expect(regla).toMatch(/outline:\s*2px solid var\(--color-foco\);/)
    expect(regla).toMatch(/outline-offset:\s*2px;/)
  })

  it('rellena la separación con blanco (surface), contra el que se mide el anillo', () => {
    expect(regla).toMatch(/box-shadow:\s*0 0 0 2px var\(--color-surface\);/)
  })
})

/**
 * Fase 9 · R9-3 (ADR-010, D-R3-7): guardia contra la paleta por defecto de Tailwind. Lee como texto
 * los componentes .tsx de src/ (sin pruebas) y falla si aparece una utilidad de color de esa paleta
 * (OKLCH, que tema.test.ts no puede medir) o el token retirado outline.
 */
const componentes = import.meta.glob<string>(['./**/*.tsx', '!./**/*.test.tsx'], {
  query: '?raw',
  import: 'default',
  eager: true,
})

const PALETA =
  'slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose'
const UTILIDADES =
  'text|bg|border|ring|outline|divide|placeholder|fill|stroke|from|via|to|shadow|accent|caret|decoration'
/** Utilidad de color de la paleta por defecto, con variantes (hover:, md:, backdrop:…) y opacidad. */
const PATRON_PALETA = new RegExp(
  `(?<![\\w-])(?:[\\w-]+:)*(?:${UTILIDADES})(?:-[trblxyse])?-(?:(?:${PALETA})-\\d{2,3}|black|white)(?:/\\d{1,3})?(?![\\w-])`,
  'g',
)
/** outline (#c6c6cd, 1,70:1) se retiró del tema en 9.3.3: una clase que lo use ya no pinta nada. */
const PATRON_RETIRADO = new RegExp(`(?<![\\w-])(?:[\\w-]+:)*(?:${UTILIDADES})(?:-[trblxyse])?-outline(?![\\w-])`, 'g')

function usosDePaleta(fuente: string): string[] {
  return fuente.match(PATRON_PALETA) ?? []
}

/** Excepciones explícitas (ADR-010 §2.5): el fondo translúcido de los modales nativos. */
const EXCEPCIONES: ReadonlySet<string> = new Set(['backdrop:bg-black/50'])

/**
 * Trinquete de D-R3-7: inventario exacto de usos pendientes por archivo y clase. Quedó vacío al
 * cerrar 9.3.3; un uso nuevo de la paleta por defecto hace fallar la prueba.
 */
const PENDIENTES: Record<string, Record<string, number>> = {}

function contar(usos: string[]): Record<string, number> {
  const cuenta: Record<string, number> = {}
  for (const uso of [...usos].sort()) cuenta[uso] = (cuenta[uso] ?? 0) + 1
  return cuenta
}

describe('Tema · guardia de la paleta por defecto (R9-3, D-R3-7)', () => {
  it.each([
    ['text-gray-500', 'text-gray-500'],
    ['hover:bg-gray-50 px-4', 'hover:bg-gray-50'],
    ['p-3 bg-red-50 border border-red-200', 'bg-red-50'],
    ['md:border-l-slate-300', 'md:border-l-slate-300'],
    ['backdrop:bg-black/50', 'backdrop:bg-black/50'],
    ['bg-primary text-white', 'text-white'],
    ['focus-visible:ring-blue-600', 'focus-visible:ring-blue-600'],
  ])('detecta la paleta por defecto en "%s"', (fuente, esperado) => {
    expect(usosDePaleta(fuente)).toContain(esperado)
  })

  it.each([
    'text-texto-secundario bg-superficie-suave border-borde-control',
    'bg-primary hover:bg-primary-hover text-urgencia',
    'outline-none font-bold grayscale',
    'border-l-2 border-borde-suave text-accent bg-surface',
  ])('no confunde tokens propios ni otras utilidades: "%s"', (fuente) => {
    expect(usosDePaleta(fuente)).toEqual([])
  })

  it('lee los 32 componentes de src/ sin las pruebas (29 + CajaError, PantallaConSesion y PieInstitucional)', () => {
    const rutas = Object.keys(componentes)
    expect(rutas).toHaveLength(32)
    expect(rutas.some((ruta) => ruta.endsWith('.test.tsx'))).toBe(false)
  })

  it('ningún componente usa la paleta por defecto fuera de las excepciones y los pendientes', () => {
    const usos: Record<string, Record<string, number>> = {}
    for (const [ruta, fuente] of Object.entries(componentes)) {
      const propios = usosDePaleta(fuente).filter((uso) => !EXCEPCIONES.has(uso))
      if (propios.length > 0) usos[ruta] = contar(propios)
    }
    expect(usos).toEqual(PENDIENTES)
  })

  it('ningún componente usa el token retirado outline', () => {
    const restos = Object.entries(componentes).flatMap(([ruta, fuente]) =>
      (fuente.match(PATRON_RETIRADO) ?? []).map((uso) => `${ruta}: ${uso}`),
    )
    expect(restos).toEqual([])
  })

  it('9.3.6: ninguna acción principal (bg-primary) usa el hover por opacidad; usa primary-hover', () => {
    const restos = Object.entries(componentes).flatMap(([ruta, fuente]) =>
      (fuente.match(/["'`][^"'`]*\bbg-primary\b[^"'`]*\bhover:opacity-\d+[^"'`]*["'`]/g) ?? []).map((clases) => `${ruta}: ${clases}`),
    )
    expect(restos).toEqual([])
  })

  it('el tema ya no declara --color-outline', () => {
    expect(hojaDeEstilos).not.toMatch(/--color-outline:/)
  })
})
