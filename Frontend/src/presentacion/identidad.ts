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
export const LEMA = 'Ciencia y Servicio'
