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
    // Fase 9 · H0: los mismos controles codificados con % siguen siendo válidos.
    'https://ejemplo.com/a%1Cb',
    'https://ejemplo.com/video?x=a%C2%85b',
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
    // Fase 9 · H0: caracteres de control sin codificar. new URL() los codificaría en vez de rechazarlos.
    ['U+001C en la ruta', 'https://ejemplo.com/a\u001Cb'],
    ['U+001D en la consulta', 'https://ejemplo.com/video?x=a\u001Db'],
    ['U+001E en el fragmento', 'https://ejemplo.com/video#a\u001Eb'],
    ['U+001F en la ruta', 'https://ejemplo.com/a\u001Fb'],
    ['U+0085 en la ruta', 'https://ejemplo.com/a\u0085b'],
    ['U+007F en la ruta', 'https://ejemplo.com/a\u007Fb'],
    ['U+009F en la ruta', 'https://ejemplo.com/a\u009Fb'],
    ['U+FEFF en la ruta', 'https://ejemplo.com/a\uFEFFb'],
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
