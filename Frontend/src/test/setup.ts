// Matchers de DOM (toBeInTheDocument, toHaveTextContent...) para expect de Vitest.
import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// Sin globals de Vitest, Testing Library no desmonta solo: cada prueba empieza con
// el DOM vacío.
afterEach(() => {
  cleanup()
})
