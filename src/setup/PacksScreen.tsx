import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { BottomNavigation } from '../components/BottomNavigation'
import { Button } from '../components/Button'
import { FocusRegion } from '../components/FocusRegion'
import { focusAndReveal } from '../components/focus-utils'
import { PackCard } from './PackCard'
import { getPackAvailability } from './pack-selection'
import type { SetupState } from './setup-state'
import { DecorativeCircles } from './WelcomeScreen'
import './packs.css'

interface PacksScreenProps {
  readonly animateTransition: boolean
  readonly onBack: () => void
  readonly onSetupChange: (setup: SetupState) => void
  readonly onStart: () => void
  readonly setup: SetupState
}

export function PacksScreen({ animateTransition, onBack, onSetupChange, onStart, setup }: PacksScreenProps) {
  const [inactiveNoticeState, setInactiveNoticeState] = useState<'hidden' | 'visible' | 'closing'>('hidden')
  const [leavingForGame, setLeavingForGame] = useState(false)
  const noticeClosingTimeout = useRef<number | undefined>(undefined)
  const noticeRemovalTimeout = useRef<number | undefined>(undefined)
  const startGameTimeout = useRef<number | undefined>(undefined)
  const availability = getPackAvailability(setup)
  const selectedIds = new Set(setup.selectedPackIds)

  useEffect(() => () => {
    window.clearTimeout(noticeClosingTimeout.current)
    window.clearTimeout(noticeRemovalTimeout.current)
    window.clearTimeout(startGameTimeout.current)
  }, [])

  function beginGame() {
    if (leavingForGame) return
    if (typeof window.matchMedia !== 'function' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      onStart()
      return
    }
    setLeavingForGame(true)
    startGameTimeout.current = window.setTimeout(onStart, 420)
  }

  function showInactiveNotice() {
    window.clearTimeout(noticeClosingTimeout.current)
    window.clearTimeout(noticeRemovalTimeout.current)
    setInactiveNoticeState('visible')
    noticeClosingTimeout.current = window.setTimeout(() => setInactiveNoticeState('closing'), 3840)
    noticeRemovalTimeout.current = window.setTimeout(() => setInactiveNoticeState('hidden'), 4000)
  }

  function togglePack(id: string, selected: boolean) {
    const selectedPackIds = selected
      ? [...setup.selectedPackIds, id]
      : setup.selectedPackIds.filter((selectedId) => selectedId !== id)
    onSetupChange({ ...setup, selectedPackIds })
  }

  function handleGridKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!event.key.startsWith('Arrow') || !(event.target instanceof HTMLInputElement)) return
    const inputs = [...event.currentTarget.querySelectorAll<HTMLInputElement>('.pack-card input')]
    const currentIndex = inputs.indexOf(event.target)
    if (currentIndex < 0) return
    // Count the rendered row: old webOS uses flex, not CSS Grid.
    const cards = [...event.currentTarget.querySelectorAll<HTMLElement>('.pack-card')]
    const firstTop = cards[0]?.getBoundingClientRect().top
    const columns = Math.max(1, cards.filter((card) => Math.abs(card.getBoundingClientRect().top - firstTop!) < 2).length)
    const step = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : event.key === 'ArrowUp' ? -columns : columns
    const currentColumn = currentIndex % columns
    let nextIndex = currentIndex + step

    while (nextIndex >= 0 && nextIndex < inputs.length) {
      if (event.key === 'ArrowLeft' && nextIndex % columns >= currentColumn) break
      if (event.key === 'ArrowRight' && nextIndex % columns <= currentColumn) break
      if (!inputs[nextIndex].disabled) {
        event.preventDefault()
        focusAndReveal(inputs[nextIndex])
        return
      }
      nextIndex += step
    }
    // A horizontal row edge must not fall through to page-level navigation.
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') event.preventDefault()
  }

  return (
    <FocusRegion>
      <main className={`setup-screen setup-screen--packs${animateTransition ? ' setup-screen--transition' : ''}${leavingForGame ? ' setup-screen--leaving-game' : ''}`}>
        <DecorativeCircles />
        <div className="setup-screen__scroll">
          <div className="packs">
            <header>
              <h1>Паки вопросов</h1>
              <p>Чем больше - тем лучше</p>
            </header>
            <div className="packs__grid" onKeyDown={handleGridKeyDown}>
              {availability.map(({ active, pack }) => (
                <PackCard
                  active={active}
                  key={pack.id}
                  onChange={(selected) => togglePack(pack.id, selected)}
                  onInactiveAttempt={showInactiveNotice}
                  pack={pack}
                  selected={selectedIds.has(pack.id)}
                />
              ))}
            </div>
          </div>
        </div>
        <BottomNavigation>
          <Button onClick={onBack}>Назад</Button>
          <Button disabled={setup.selectedPackIds.length === 0 || leavingForGame} onClick={beginGame}>Далее</Button>
        </BottomNavigation>
        {inactiveNoticeState !== 'hidden' && (
          <div className="packs__notice" data-state={inactiveNoticeState} role="status">
            Нет 2 пользователей, которые бы на такое согласились. Поменяйте грани
          </div>
        )}
      </main>
    </FocusRegion>
  )
}
