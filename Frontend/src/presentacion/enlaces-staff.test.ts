import { describe, expect, it } from 'vitest'
import { CATEGORIAS, type Categoria, type EventoEnlace } from '../api/esquemas'
import { ESTADOS } from '../api/maquina-estados'
import { TEXTO_RAZON_ENLACE_INVALIDO } from './enlace'
import {
  AUTOR_NO_IDENTIFICADO,
  AUTOR_SOLICITANTE,
  AUTOR_STAFF,
  TEXTO_ADVERTENCIA_DATOS_PERSONALES,
  TEXTO_AYUDA_MOTIVO_CORRECCION,
  TEXTO_RAZON_CORRECCION_IGUAL,
  TEXTO_RAZON_CORRECCION_VACIA,
  autorDelEvento,
  correccionDisponible,
  cuerpoDeCorreccion,
  descripcionDelEvento,
  entregaSinEnlacePrevio,
  historialAplica,
  textosCorreccion,
} from './enlaces-staff'

const VIEJO = 'https://youtu.be/AbC_1?t=10#inicio'
const NUEVO = 'https://drive.google.com/file/d/ZyX_2/view'
const DUENO = 'uuid-solicitante'
const STAFF = 'uuid-staff'
const base = { id_log: 'uuid-log', fecha_modificacion: '2026-10-20T15:00:00.000Z' }
const anexo = (anterior: string | null, nuevo: string | null, autor = DUENO): EventoEnlace => ({
  ...base,
  enlace_campo: 'ANEXO',
  enlace_anterior: anterior,
  enlace_nuevo: nuevo,
  motivo_correccion: null,
  modificado_por: autor,
})
const entrega = (autor = STAFF, motivo: string | null = null): EventoEnlace => ({
  ...base,
  enlace_campo: 'ENTREGA',
  enlace_anterior: VIEJO,
  enlace_nuevo: NUEVO,
  motivo_correccion: motivo,
  modificado_por: autor,
})

describe('historial de enlaces (Fase 9 · K4)', () => {
  it.each<[Categoria, boolean]>([
    ['PODCAST', true],
    ['VIDEO', true],
    ['STREAMING', true],
    ['ESPACIOS', false],
    ['ASESORIAS', false],
  ])('historialAplica(%s) = %s (DK4-1: solo donde puede haber eventos)', (categoria, aplica) => {
    expect(historialAplica(categoria)).toBe(aplica)
  })

  it.each<[EventoEnlace, string]>([
    [anexo(null, NUEVO), 'Anexo agregado'],
    [anexo(VIEJO, NUEVO), 'Anexo cambiado'],
    [anexo(VIEJO, null), 'Anexo retirado'],
    [entrega(), 'Enlace del producto final corregido'],
  ])('descripcionDelEvento → «%s»', (evento, texto) => {
    expect(descripcionDelEvento(evento)).toBe(texto)
  })

  it.each<[string, EventoEnlace, string]>([
    ['ANEXO del dueño', anexo(null, NUEVO, DUENO), AUTOR_SOLICITANTE],
    ['ENTREGA de otra cuenta', entrega(STAFF), AUTOR_STAFF],
    ['ANEXO de otra cuenta (no lo escribe el backend)', anexo(null, NUEVO, STAFF), AUTOR_NO_IDENTIFICADO],
    ['ENTREGA del propio dueño (un Staff que radicó)', entrega(DUENO), AUTOR_NO_IDENTIFICADO],
  ])('autorDelEvento · %s → «%s»; nunca el identificador', (_caso, evento, autor) => {
    const etiqueta = autorDelEvento(evento, DUENO)
    expect(etiqueta).toBe(autor)
    expect(etiqueta).not.toContain('uuid')
  })
})

describe('corrección del enlace de entrega (Fase 9 · K4 · EN6 a EN12)', () => {
  it('correccionDisponible: solo «Entregado», categoría con enlace y enlace previo (EN8)', () => {
    const disponibles = ESTADOS.flatMap((estado) =>
      CATEGORIAS.flatMap((categoria) =>
        [VIEJO, null].filter((enlace) => correccionDisponible(estado, categoria, enlace)).map(() => `${estado}/${categoria}`),
      ),
    )
    expect(disponibles.sort()).toEqual(['Entregado/PODCAST', 'Entregado/STREAMING', 'Entregado/VIDEO'])
  })

  it('entregaSinEnlacePrevio: la nota de EN8 solo en «Entregado» de una categoría con enlace y sin enlace', () => {
    expect(entregaSinEnlacePrevio('Entregado', 'PODCAST', null)).toBe(true)
    expect(entregaSinEnlacePrevio('Entregado', 'PODCAST', VIEJO)).toBe(false)
    expect(entregaSinEnlacePrevio('Entregado', 'ESPACIOS', null)).toBe(false)
    expect(entregaSinEnlacePrevio('En Producción', 'VIDEO', null)).toBe(false)
  })

  it.each([VIEJO, ` ${VIEJO} `])('el anterior («%s») viaja EXACTO; el nuevo, recortado; sin motivo, la clave no viaja', (anterior) => {
    const resultado = cuerpoDeCorreccion(anterior, `  ${NUEVO}  `, '   ')
    expect(resultado).toStrictEqual({ ok: true, cuerpo: { enlace_entrega_anterior: anterior, enlace_entrega: NUEVO } })
    expect(resultado.ok && resultado.cuerpo).not.toHaveProperty('motivo_correccion')
  })

  it('con motivo válido viaja recortado (10 a 500 caracteres reales)', () => {
    expect(cuerpoDeCorreccion(VIEJO, NUEVO, '  Se registró otra grabación.  ')).toStrictEqual({
      ok: true,
      cuerpo: { enlace_entrega_anterior: VIEJO, enlace_entrega: NUEVO, motivo_correccion: 'Se registró otra grabación.' },
    })
    expect(cuerpoDeCorreccion(VIEJO, NUEVO, '🎬'.repeat(10)).ok).toBe(true)
  })

  it.each([
    ['vacío', '   ', TEXTO_RAZON_CORRECCION_VACIA],
    ['inseguro', 'http://youtu.be/x', TEXTO_RAZON_ENLACE_INVALIDO],
    ['javascript:', 'javascript:alert(1)', TEXTO_RAZON_ENLACE_INVALIDO],
    ['idéntico (aun con espacios)', ` ${VIEJO} `, TEXTO_RAZON_CORRECCION_IGUAL],
  ])('enlace %s: no se envía', (_caso, texto, error) => {
    expect(cuerpoDeCorreccion(VIEJO, texto, '')).toStrictEqual({ ok: false, error })
  })

  it.each([
    ['corto', 'Muy corto'],
    ['largo', 'x'.repeat(501)],
  ])('motivo %s: no se envía y se explica', (_caso, motivo) => {
    const resultado = cuerpoDeCorreccion(VIEJO, NUEVO, motivo)
    expect(resultado.ok).toBe(false)
    expect(!resultado.ok && resultado.error).toMatch(/motivo/)
  })

  it('DK4-7: la ayuda del motivo empieza por la advertencia aprobada', () => {
    expect(TEXTO_ADVERTENCIA_DATOS_PERSONALES).toBe(
      'El motivo queda en el registro de auditoría del Estudio C. No escribas datos personales, contraseñas, tokens ni otra información sensible. El solicitante verá el nuevo enlace en su solicitud.',
    )
    expect(TEXTO_AYUDA_MOTIVO_CORRECCION.startsWith(TEXTO_ADVERTENCIA_DATOS_PERSONALES)).toBe(true)
  })

  it('textos: no es irreversible, nombra el radicado y dice que el estado no cambia', () => {
    const textos = textosCorreccion('EC-1')
    expect(textos.irreversible).toBe(false)
    expect(textos.descripcion).toContain('EC-1')
    expect(textos.descripcion).toContain('sigue en "Entregado"')
  })
})
