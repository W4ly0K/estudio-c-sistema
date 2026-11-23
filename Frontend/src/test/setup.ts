// Matchers de DOM (toBeInTheDocument, toHaveTextContent...) para expect de Vitest.
import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// Sin globals de Vitest, Testing Library no desmonta solo: cada prueba empieza con
// el DOM vacío.
afterEach(() => {
  cleanup()
})

// jsdom no implementa la API modal de <dialog> (solo refleja el atributo `open`).
// Este polyfill vive SOLO en la preparación de pruebas: el código de la app usa la API
// nativa sin ramas para jsdom. Imita las reglas del navegador que nos importan:
// `showModal()` sobre un diálogo abierto lanza InvalidStateError, y `close()` dispara
// el evento `close` (el mismo que produce Escape en un navegador real).
if (typeof HTMLDialogElement.prototype.showModal !== 'function') {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement): void {
    if (this.open) throw new DOMException('El diálogo ya está abierto.', 'InvalidStateError')
    this.open = true
  }
}
if (typeof HTMLDialogElement.prototype.close !== 'function') {
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement): void {
    if (!this.open) return
    this.open = false
    this.dispatchEvent(new Event('close'))
  }
}
