import { afterEach, expect, it, vi } from 'vitest'
import { focusAndReveal } from './focus-utils'

afterEach(() => {
  vi.restoreAllMocks()
  document.body.replaceChildren()
})

it('reveals a TV control without the element scrollBy API', () => {
  vi.spyOn(document.documentElement, 'style', 'get').mockReturnValue({} as CSSStyleDeclaration)
  const container = document.createElement('div')
  container.className = 'setup-screen__scroll'
  Object.defineProperties(container, { scrollHeight: { value: 500 }, clientHeight: { value: 100 } })
  container.scrollTop = 100
  const button = document.createElement('button')
  container.append(button)
  document.body.append(container)
  vi.spyOn(button, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, -20, 100, 30))
  focusAndReveal(button)
  expect(document.activeElement).toBe(button)
  expect(container.scrollTop).toBe(64)
})

it('uses numeric window scrolling when scroll options are unsupported', () => {
  vi.spyOn(document.documentElement, 'style', 'get').mockReturnValue({} as CSSStyleDeclaration)
  const scroll = vi.spyOn(window, 'scrollBy').mockImplementation(() => {})
  const button = document.createElement('button')
  document.body.append(button)
  vi.spyOn(button, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, -20, 100, 30))
  focusAndReveal(button)
  expect(scroll).toHaveBeenCalledWith(0, -36)
})
