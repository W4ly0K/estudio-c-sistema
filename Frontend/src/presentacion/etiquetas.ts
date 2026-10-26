import type { Categoria, SubEspacio } from '../api/esquemas'

/**
 * Nombres legibles de las categorías (wireframe B2). `Record<Categoria, …>`: si el
 * backend agrega una categoría, la prueba de deriva la detecta y esto no compila
 * hasta darle su nombre.
 */
export const ETIQUETAS_CATEGORIA: Readonly<Record<Categoria, string>> = {
  PODCAST: 'Podcast / Vodcast',
  VIDEO: 'Producción y dirección audiovisual',
  ESPACIOS: 'Solicitud de espacio físico',
  STREAMING: 'Streaming y eventos híbridos',
  ASESORIAS: 'Asesoría narrativa y formación',
}

/**
 * Fase 7 · PRD v2.2 §5.1: los nombres OFICIALES de los sub-espacios (Q-A1), tal como los
 * ven los usuarios. `Record<SubEspacio, …>`: un sub-espacio nuevo no compila sin su nombre.
 */
export const ETIQUETAS_SUB_ESPACIO: Readonly<Record<SubEspacio, string>> = {
  CABINA_AUDIO: 'Espacio de grabación de audio, cabina insonorizada',
  ESTUDIO_GRABACION: 'Estudio de grabación, video y fotografía',
  ESTUDIO_COMPLETO: 'Estudio C completo',
}

/** Versión corta para las insignias de las tarjetas, donde el espacio es poco. */
export const ETIQUETAS_CORTAS_SUB_ESPACIO: Readonly<Record<SubEspacio, string>> = {
  CABINA_AUDIO: 'Cabina de audio',
  ESTUDIO_GRABACION: 'Estudio de video y foto',
  ESTUDIO_COMPLETO: 'Estudio C completo',
}

/** Qué implica cada opción al elegirla (PRD v2.2 §5.1): lo que bloquea a los demás. */
export const AYUDAS_SUB_ESPACIO: Readonly<Record<SubEspacio, string>> = {
  CABINA_AUDIO: 'El estudio de video y fotografía queda libre para otra reserva en la misma franja.',
  ESTUDIO_GRABACION: 'La cabina de audio queda libre para otra reserva en la misma franja.',
  ESTUDIO_COMPLETO: 'Ocupa los dos sub-espacios: nadie más puede reservar en esa franja.',
}
