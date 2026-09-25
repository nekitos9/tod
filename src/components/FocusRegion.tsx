import { useEffect, useRef, type KeyboardEvent, type PropsWithChildren } from 'react'
import { focusAndReveal } from './focus-utils'

const FOCUSABLE_SELECTOR = [
  'button:not(:disabled)',
  'a[href]',
  'input:not(:disabled)',
  'select:not(:disabled)',
  'textarea:not(:disabled)',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

type Direction = 'up' | 'down' | 'left' | 'right'

export function FocusRegion({ children }: PropsWithChildren) {
  const regionRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function activateFromArrow(event: globalThis.KeyboardEvent) {
      if (!directionFromKey(event.key)) return

      const region = regionRef.current
      const activeElement = document.activeElement
      if (!region || (activeElement instanceof HTMLElement && region.contains(activeElement))) return

      const first = getFocusableElements(region)[0]
      if (!first) return

      event.preventDefault()
      focusAndReveal(first)
    }

    document.addEventListener('keydown', activateFromArrow)
    return () => document.removeEventListener('keydown', activateFromArrow)
  }, [])

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.defaultPrevented) return
    if (event.key === 'Enter' && event.target instanceof HTMLInputElement &&
      event.target.type === 'text' && document.documentElement.classList.contains('old-tv')) {
      // Re-enter native editing from a remote's OK key, within the user gesture.
      // Focusing an already focused field alone does not reopen some TV IMEs.
      event.target.blur()
      event.target.focus()
      event.target.click()
      return
    }
    if (
      event.key === 'Enter' &&
      event.target instanceof HTMLInputElement &&
      event.target.type === 'checkbox'
    ) {
      event.preventDefault()
      event.target.click()
      event.target.focus()
      return
    }

    const direction = directionFromKey(event.key)
    if (!direction || !(event.target instanceof HTMLElement)) return
    if (preservesArrow(event.target, direction)) return

    const explicitTarget = findExplicitTarget(event.target, direction, event.currentTarget)
    if (explicitTarget) {
      event.preventDefault()
      focusAndReveal(explicitTarget)
      return
    }

    const navigationTarget = findBottomNavigationTarget(event.target, direction, event.currentTarget)
    if (navigationTarget) {
      event.preventDefault()
      focusAndReveal(navigationTarget)
      return
    }

    const localTarget = findPlayerCardTarget(event.target, direction)
    if (localTarget) {
      event.preventDefault()
      focusAndReveal(localTarget)
      return
    }

    const focusables = getFocusableElements(event.currentTarget)
    const currentIndex = focusables.indexOf(event.target)
    if (currentIndex < 0) {
      const first = focusables[0]
      if (!first) return
      event.preventDefault()
      focusAndReveal(first)
      return
    }

    const next = findDirectionalTarget(focusables, currentIndex, direction)
    if (!next) return

    event.preventDefault()
    focusAndReveal(next)
  }

  return <div ref={regionRef} onKeyDown={handleKeyDown}>{children}</div>
}

function findExplicitTarget(
  element: HTMLElement,
  direction: Direction,
  region: HTMLElement,
): HTMLElement | undefined {
  const attribute = `data-focus-${direction}`
  const selector = element.getAttribute(attribute)
  return selector ? region.querySelector<HTMLElement>(selector) ?? undefined : undefined
}

function findPlayerCardTarget(element: HTMLElement, direction: Direction): HTMLElement | undefined {
  const card = element.closest<HTMLElement>('[data-player-id]')
  if (!card) return undefined

  const name = card.querySelector<HTMLElement>('.player-card__name')
  const boundary = card.querySelector<HTMLElement>('.player-card__boundary')
  const relationship = card.querySelector<HTMLElement>('.relationship-toggle input')

  if (element === name && direction === 'down') return boundary ?? relationship ?? undefined
  if (element === boundary && direction === 'right') return relationship ?? undefined
  if (element === relationship && direction === 'left') return boundary ?? undefined
  if (element === relationship && direction === 'right') {
    const cards = card.parentElement?.querySelectorAll<HTMLElement>('[data-player-id]')
    const index = cards ? [...cards].indexOf(card) : -1
    return index >= 0 ? cards?.[index + 1]?.querySelector<HTMLElement>('.player-card__boundary') ?? undefined : undefined
  }
  if ((element === boundary || element === relationship) && direction === 'up') return name ?? undefined
  return undefined
}

function findBottomNavigationTarget(
  element: HTMLElement,
  direction: Direction,
  region: HTMLElement,
): HTMLElement | undefined {
  const navigation = element.closest<HTMLElement>('.bottom-navigation')
  if (!navigation) return undefined
  const buttons = getFocusableElements(navigation)
  const index = buttons.indexOf(element)
  if (direction === 'left') return buttons[index - 1]
  if (direction === 'right') return buttons[index + 1]
  if (direction !== 'up') return undefined
  const content = getFocusableElements(region).filter((candidate) => !candidate.closest('.bottom-navigation'))
  return content.at(-1)
}

function getFocusableElements(region: HTMLElement): HTMLElement[] {
  const scope = region.querySelector<HTMLElement>('dialog[open]') ?? region
  return [...scope.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)]
    .filter((element) => element.tabIndex >= 0 && !element.closest('[inert], dialog:not([open])'))
}

function directionFromKey(key: string): Direction | undefined {
  if (key === 'ArrowUp') return 'up'
  if (key === 'ArrowDown') return 'down'
  if (key === 'ArrowLeft') return 'left'
  if (key === 'ArrowRight') return 'right'
  return undefined
}

function preservesArrow(element: HTMLElement, direction: Direction): boolean {
  const isTextControl =
    element.matches(
      'textarea, input:not([type]), input[type="text"], input[type="search"], input[type="email"], input[type="url"], input[type="tel"], input[type="password"], input[type="number"], [contenteditable="true"]',
    ) || Boolean(element.closest('[role="textbox"]'))
  return isTextControl && (direction === 'left' || direction === 'right')
}

function findDirectionalTarget(
  elements: readonly HTMLElement[],
  currentIndex: number,
  direction: Direction,
): HTMLElement | undefined {
  const current = elements[currentIndex]
  const currentRect = current.getBoundingClientRect()
  const currentCenter = centerOf(currentRect)
  let best: { element: HTMLElement; score: number } | undefined

  for (const candidate of elements) {
    if (candidate === current) continue
    const candidateCenter = centerOf(candidate.getBoundingClientRect())
    const dx = candidateCenter.x - currentCenter.x
    const dy = candidateCenter.y - currentCenter.y
    const primary = primaryDistance(direction, dx, dy)
    if (primary <= 1) continue

    const secondary = direction === 'left' || direction === 'right' ? Math.abs(dy) : Math.abs(dx)
    const score = primary * 1000 + secondary * 10 + Math.hypot(dx, dy)
    if (!best || score < best.score) best = { element: candidate, score }
  }

  if (best) return best.element

  if (direction === 'left' || direction === 'up') return elements[currentIndex - 1]
  return elements[currentIndex + 1]
}

function centerOf(rect: DOMRect): { x: number; y: number } {
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
}

function primaryDistance(direction: Direction, dx: number, dy: number): number {
  if (direction === 'left') return -dx
  if (direction === 'right') return dx
  if (direction === 'up') return -dy
  return dy
}
