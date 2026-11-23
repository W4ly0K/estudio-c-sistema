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
    ['urgencia', 'cesmag-rojo-1'],
    ['surface', 'cesmag-blanco'],
    ['foco', 'cesmag-azul-1'],
  ])('%s es %s', (token, marca) => {
    expect(color(token).toUpperCase()).toBe(color(marca).toUpperCase())
  })

  it.each(['texto-secundario', 'texto-terciario', 'borde-control', 'borde-suave', 'superficie-suave', 'foco'])(
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
    ['texto-secundario', fondo, 4.5],
    ['texto-terciario', fondo, 4.5],
    ['borde-control', fondo, 3],
  ]),
  // D-R3-6: el anillo siempre queda junto a su desplazamiento blanco, sobre cualquier fondo.
  ['foco', 'surface', 3],
  // D-R3-3: las cajas de error pasan a bg-surface con text-accent.
  ['accent', 'surface', 4.5],
]

describe('Tema · contraste medido (R9-3)', () => {
  it.each(PARES)('%s sobre %s alcanza %s:1', (primerPlano, fondo, minimo) => {
    expect(contraste(color(primerPlano), color(fondo))).toBeGreaterThanOrEqual(minimo)
  })
})
