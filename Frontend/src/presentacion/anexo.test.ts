import { describe, expect, it } from 'vitest'
import { CATEGORIAS, type Categoria } from '../api/esquemas'
import { ESTADOS, ROLES } from '../api/maquina-estados'
import {
  anexoParaEnviar,
  anexoSegunCategoria,
  cuerpoDeEdicion,
  cuerpoDeRetiro,
  edicionDelAnexoDisponible,
  textosEdicionAnexo,
  TEXTO_ANEXO_INVALIDO,
  TEXTO_AYUDA_ANEXO,
  TEXTO_COMO_COMPARTIR_ANEXO,
  TEXTO_RAZON_ANEXO_IGUAL,
  TEXTO_RAZON_ANEXO_VACIO,
} from './anexo'

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

describe('edición del anexo por el dueño (Fase 9 · K3)', () => {
  const VIEJO = 'https://drive.google.com/file/d/AbC_1/view?usp=sharing#Guion'
  const NUEVO = 'https://docs.google.com/document/d/ZyX_2/edit'

  it('edicionDelAnexoDisponible: solo SOLICITANTE, en «Recibido» y en PODCAST, VIDEO o STREAMING (90 combinaciones)', () => {
    const disponibles = ROLES.flatMap((rol) =>
      ESTADOS.flatMap((estado) =>
        CATEGORIAS.filter((categoria) => edicionDelAnexoDisponible(rol, estado, categoria)).map((c) => `${rol}/${estado}/${c}`),
      ),
    )
    expect(ROLES.length * ESTADOS.length * CATEGORIAS.length).toBe(90)
    expect([...disponibles].sort()).toEqual(
      ['SOLICITANTE/Recibido/PODCAST', 'SOLICITANTE/Recibido/STREAMING', 'SOLICITANTE/Recibido/VIDEO'],
    )
  })

  // El anterior es la foto del detalle: ni siquiera un valor con espacios en los extremos se toca.
  it.each([null, VIEJO, ` ${VIEJO} `])('cuerpoDeEdicion: el anterior («%s») viaja EXACTO y el nuevo, recortado (D4)', (anterior) => {
    expect(cuerpoDeEdicion(anterior, `  ${NUEVO}  `)).toStrictEqual({
      ok: true,
      cuerpo: { enlace_anexo_anterior: anterior, enlace_anexo: NUEVO },
    })
  })

  it.each(['', '   '])('cuerpoDeEdicion con «%s»: no retira; explica que se use «Retirar anexo» (DK3-2)', (texto) => {
    expect(cuerpoDeEdicion(VIEJO, texto)).toStrictEqual({ ok: false, error: TEXTO_RAZON_ANEXO_VACIO })
  })

  it('cuerpoDeEdicion con el mismo enlace (aun con espacios en los extremos): no se envía (DK3-3)', () => {
    expect(cuerpoDeEdicion(VIEJO, ` ${VIEJO} `)).toStrictEqual({ ok: false, error: TEXTO_RAZON_ANEXO_IGUAL })
  })

  it.each(['http://drive.google.com/x', 'javascript:alert(1)', 'https://usuario:clave@ejemplo.com/g'])(
    'cuerpoDeEdicion con «%s»: la regla de anexoParaEnviar',
    (texto) => {
      expect(cuerpoDeEdicion(null, texto)).toStrictEqual({ ok: false, error: TEXTO_ANEXO_INVALIDO })
    },
  )

  it('cuerpoDeRetiro: null EXPLÍCITO como nuevo y el anterior exacto (sin recortar)', () => {
    expect(cuerpoDeRetiro(` ${VIEJO} `)).toStrictEqual({ enlace_anexo_anterior: ` ${VIEJO} `, enlace_anexo: null })
    const cuerpo = cuerpoDeRetiro(VIEJO)
    expect(cuerpo).toStrictEqual({ enlace_anexo_anterior: VIEJO, enlace_anexo: null })
    expect(JSON.stringify(cuerpo)).toBe(`{"enlace_anexo_anterior":"${VIEJO}","enlace_anexo":null}`)
  })

  it('textos (DK3-5): ninguno es irreversible, todos dicen que queda registrado y nombran el radicado', () => {
    for (const modo of ['AGREGAR', 'CAMBIAR', 'RETIRAR'] as const) {
      const textos = textosEdicionAnexo(modo, 'EC-1')
      expect(textos.irreversible).toBe(false)
      expect(textos.descripcion).toContain('EC-1')
      expect(textos.descripcion).toContain('registrado para el Estudio C')
      expect(textos.descripcion).not.toMatch(/historial|verific/i)
    }
  })

  it('la ayuda de radicación sigue siendo la de K2: «Opcional.» más cómo compartir', () => {
    expect(TEXTO_AYUDA_ANEXO).toBe(`Opcional. ${TEXTO_COMO_COMPARTIR_ANEXO}`)
  })
})
