import { describe, expect, it } from 'vitest'
import { leerEntorno } from './entorno'

const CLIENT_ID = 'client-id.apps.googleusercontent.com'

describe('leerEntorno (DT3: configuración con fail-fast)', () => {
  it('devuelve la configuración normalizada: sin espacios ni barras finales', () => {
    expect(
      leerEntorno({ VITE_API_URL: ' http://localhost:3000// ', VITE_GOOGLE_CLIENT_ID: ` ${CLIENT_ID} ` }),
    ).toEqual({ apiUrl: 'http://localhost:3000', googleClientId: CLIENT_ID })
  })

  it('acepta https', () => {
    expect(leerEntorno({ VITE_API_URL: 'https://api.ejemplo.edu.co', VITE_GOOGLE_CLIENT_ID: CLIENT_ID }).apiUrl).toBe(
      'https://api.ejemplo.edu.co',
    )
  })

  it('falla y nombra la variable cuando falta VITE_API_URL', () => {
    expect(() => leerEntorno({ VITE_API_URL: undefined, VITE_GOOGLE_CLIENT_ID: CLIENT_ID })).toThrow(
      /Configuración incompleta: falta VITE_API_URL\./,
    )
  })

  it('lista todas las variables faltantes en un solo error', () => {
    expect(() => leerEntorno({ VITE_API_URL: undefined, VITE_GOOGLE_CLIENT_ID: undefined })).toThrow(
      'falta VITE_API_URL, VITE_GOOGLE_CLIENT_ID',
    )
  })

  it('trata un valor vacío o de solo espacios como faltante', () => {
    expect(() => leerEntorno({ VITE_API_URL: 'http://localhost:3000', VITE_GOOGLE_CLIENT_ID: '   ' })).toThrow(
      /falta VITE_GOOGLE_CLIENT_ID/,
    )
  })

  it.each(['localhost:3000', 'ftp://localhost:3000', 'no es una url'])(
    'rechaza "%s" porque no es una URL http(s)',
    (valor) => {
      expect(() => leerEntorno({ VITE_API_URL: valor, VITE_GOOGLE_CLIENT_ID: CLIENT_ID })).toThrow(
        /VITE_API_URL no es una URL http\(s\) válida/,
      )
    },
  )

  it('el mensaje de error indica cómo corregirlo', () => {
    expect(() => leerEntorno({ VITE_API_URL: undefined, VITE_GOOGLE_CLIENT_ID: undefined })).toThrow(
      /\.env\.example/,
    )
  })
})
