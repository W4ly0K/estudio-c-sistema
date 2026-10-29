import { describe, expect, it } from 'vitest'
import {
  ENLACE_MAXIMO,
  TEXTO_RAZON_ENLACE_INVALIDO,
  TEXTO_RAZON_ENLACE_VACIO,
  enlaceParaEnviar,
  esEnlaceSeguro,
  razonBloqueoDelEnlace,
} from './enlace'

describe('esEnlaceSeguro (Fase 8 · requisito 4)', () => {
  it.each([
    'https://youtu.be/abc123',
    'https://drive.google.com/file/d/xyz/view?usp=sharing',
    'https://repositorio.unicesmag.edu.co/handle/123/456#descarga',
  ])('acepta %s', (enlace) => {
    expect(esEnlaceSeguro(enlace)).toBe(true)
  })

  it.each([
    ['javascript:', 'javascript:alert(1)'],
    ['javascript: disfrazado (mayúsculas y espacio inicial)', ' JaVaScRiPt:alert(1)'],
    ['data:', 'data:text/html,<script>alert(1)</script>'],
    ['http (sin cifrar)', 'http://youtu.be/abc123'],
    ['HTTPS en mayúsculas (el servidor lo rechaza)', 'HTTPS://youtu.be/abc123'],
    ['protocolo relativo', '//youtu.be/abc123'],
    ['https:// sin destino', 'https://'],
    ['con espacios', 'https://youtu.be/abc 123'],
    ['con usuario y contraseña', 'https://usuario:clave@ejemplo.com/video'],
    ['vacío', ''],
  ])('rechaza %s', (_caso, enlace) => {
    expect(esEnlaceSeguro(enlace)).toBe(false)
  })

  it(`rechaza más de ${ENLACE_MAXIMO} caracteres`, () => {
    expect(esEnlaceSeguro(`https://ejemplo.com/${'a'.repeat(ENLACE_MAXIMO)}`)).toBe(false)
  })
})

describe('razonBloqueoDelEnlace', () => {
  it('vacío o solo espacios: pide el enlace', () => {
    expect(razonBloqueoDelEnlace('')).toBe(TEXTO_RAZON_ENLACE_VACIO)
    expect(razonBloqueoDelEnlace('   ')).toBe(TEXTO_RAZON_ENLACE_VACIO)
  })

  it('con texto que no sirve: explica la regla', () => {
    expect(razonBloqueoDelEnlace('javascript:alert(1)')).toBe(TEXTO_RAZON_ENLACE_INVALIDO)
    expect(razonBloqueoDelEnlace('http://youtu.be/abc123')).toBe(TEXTO_RAZON_ENLACE_INVALIDO)
  })

  it('un enlace válido con espacios en los extremos (copiar y pegar) no bloquea y viaja recortado', () => {
    expect(razonBloqueoDelEnlace('  https://youtu.be/abc123  ')).toBeUndefined()
    expect(enlaceParaEnviar('  https://youtu.be/abc123  ')).toBe('https://youtu.be/abc123')
  })
})
