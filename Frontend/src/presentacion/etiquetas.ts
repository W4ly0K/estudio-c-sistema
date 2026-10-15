import type { Categoria } from '../api/esquemas'

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
