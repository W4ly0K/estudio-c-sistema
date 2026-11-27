/**
 * Fase 9 · R9-3 · V1-A (ADR-010 §2.8): única fuente de los textos institucionales. Los confirmó
 * el responsable del proyecto el 2026-11-24. CIDU va solo como sigla: su denominación completa no
 * está verificada y no se escribe. Mientras las preguntas 14 y 15 sigan abiertas, la institución se
 * identifica con TEXTO: ningún componente dibuja ni simula el escudo.
 */
export const UNIVERSIDAD = 'Universidad CESMAG'
export const CENTRO = 'CIDU'
export const SISTEMA = 'Estudio C'

/** Jerarquía de pertenencia, de la institución a la unidad: Universidad CESMAG → CIDU → Estudio C. */
export const JERARQUIA_INSTITUCIONAL = [UNIVERSIDAD, CENTRO, SISTEMA] as const

/** «Universidad CESMAG · CIDU · Estudio C». */
export const TEXTO_IDENTIDAD = JERARQUIA_INSTITUCIONAL.join(' · ')

export const DESCRIPTOR_SISTEMA = 'Sistema de Solicitudes y Reservas'
/**
 * Lema institucional según el Manual de Identidad (págs. 15 y 16): «Hombres nuevos para tiempos
 * nuevos», de Fray Guillermo de Castellana, OFMCap. «Ciencia y Servicio» es la leyenda del escudo y
 * solo aparece dentro de su imagen original.
 */
export const LEMA = 'Hombres nuevos para tiempos nuevos'

/**
 * Escudo oficial (V2, ADR-010 §2.8 C-9): archivo a color publicado por la Universidad en su dominio,
 * usado sin recolorear, recortar, deformar ni aplicar efectos; solo se escala en proporción.
 */
export const ALT_ESCUDO = 'Escudo de la Universidad CESMAG'
