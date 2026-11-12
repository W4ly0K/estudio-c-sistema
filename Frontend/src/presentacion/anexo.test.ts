import { describe, expect, it } from 'vitest'
import type { Categoria } from '../api/esquemas'
import { anexoParaEnviar, anexoSegunCategoria, TEXTO_ANEXO_INVALIDO } from './anexo'

describe('anexoParaEnviar (Fase 9 · R9-1)', () => {
  it.each(['', '   '])('"%s" → sin anexo: la clave no viaja', (texto) => {
    expect(anexoParaEnviar(texto)).toEqual({ ok: true })
  })

  it('recorta los espacios de los extremos que deja el copiar y pegar (D4)', () => {
    expect(anexoParaEnviar('  https://drive.google.com/file/d/xyz/view  ')).toEqual({
      ok: true,
      enlace: 'https://drive.google.com/file/d/xyz/view',
    })
  })

  it.each([
    ['http (sin cifrar)', 'http://drive.google.com/file/d/xyz/view'],
    ['HTTPS en mayúsculas', 'HTTPS://drive.google.com/file/d/xyz/view'],
    ['javascript:', 'javascript:alert(1)'],
    ['data:', 'data:text/html,<script>alert(1)</script>'],
    ['con usuario y contraseña', 'https://usuario:clave@ejemplo.com/guion'],
    ['con un espacio interno', 'https://drive.google.com/file/d/xyz /view'],
  ])('rechaza %s con el mensaje del anexo', (_caso, texto) => {
    expect(anexoParaEnviar(texto)).toEqual({ ok: false, error: TEXTO_ANEXO_INVALIDO })
  })
})

describe('anexoSegunCategoria (Fase 9 · AN2b · K2)', () => {
  const ANEXO = 'https://drive.google.com/file/d/xyz/view'
  const TEXTOS = ['', '   ', `  ${ANEXO}  `, 'http://drive.google.com/file/d/xyz/view', 'javascript:alert(1)']

  it.each(
    (['PODCAST', 'VIDEO', 'STREAMING'] as const).flatMap((categoria) => TEXTOS.map((texto) => [categoria, texto] as const)),
  )('%s con «%s»: exactamente la regla de anexoParaEnviar', (categoria, texto) => {
    expect(anexoSegunCategoria(categoria, texto)).toStrictEqual(anexoParaEnviar(texto))
  })

  it.each(
    (['ESPACIOS', 'ASESORIAS'] as const satisfies readonly Categoria[]).flatMap((categoria) =>
      TEXTOS.map((texto) => [categoria, texto] as const),
    ),
  )('%s con «%s» residual: sin anexo y sin error (ni se valida ni viaja)', (categoria, texto) => {
    expect(anexoSegunCategoria(categoria, texto)).toStrictEqual({ ok: true })
  })
})
