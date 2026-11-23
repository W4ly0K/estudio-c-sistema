// Variables de entorno del frontend (DT3).
//
// strictImportMetaEnv quita de vite/client el índice [key: string]: any, así que
// leer una variable no declarada aquí no compila. Se declaran como opcionales
// porque pueden faltar en tiempo de ejecución: src/config/entorno.ts las valida.
interface ViteTypeOptions {
  strictImportMetaEnv: unknown
}

interface ImportMetaEnv {
  readonly VITE_API_URL?: string
  readonly VITE_GOOGLE_CLIENT_ID?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
