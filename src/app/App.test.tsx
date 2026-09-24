import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { gameData } from '../generated/game-data'
import { getSkipNotice } from '../game/skip-notice'
import { GAME_SESSION_KEY, loadGameSession } from '../persistence/game-session'
import { App } from './App'

describe('App', () => {
  it('formats both skip warnings and removal notices independently', () => {
    const player = {
      absenceSkips: 1,
      activityPoints: 0,
      answeredTruths: 0,
      boundary: 'full' as const,
      completedDares: 0,
      colorId: 0,
      id: 'player',
      inRelationship: false,
      name: 'Катя',
      refusalSkips: 1,
      refusedDares: 0,
      refusedTruths: 0,
      replacementPenaltyTurns: 0,
      truthCount: 0 as const,
    }
    expect(getSkipNotice(player, 'absence', true, 2)).toBe('Если игрока не будет за столом ещё раз — он выйдет из игры.')
    expect(getSkipNotice(player, 'refusal', true, 2)).toBe('Если игрок снова откажется — он больше не будет играть.')
    expect(getSkipNotice(player, 'absence', true, 3)).toContain('слишком долго отсутствует за столом')
    expect(getSkipNotice(player, 'refusal', true, 3)).toContain('ничего не хочет делать')
    expect(getSkipNotice(player, 'absence', false, 3)).toBeNull()
  })
  it('moves from Welcome to Rules and back', () => {
    render(<App />)

    expect(screen.getByRole('heading', { name: 'Правда или Действие' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Начать' }))
    expect(screen.getByRole('heading', { name: 'Правила игры' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Назад' }))
    expect(screen.getByRole('heading', { name: 'Правда или Действие' })).toBeInTheDocument()
  })

  it('keeps all independent rule settings off by default and preserves them between screens', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Начать' }))

    const refusal = screen.getByRole('checkbox', { name: /От заданий нельзя отказываться/ })
    const absence = screen.getByRole('checkbox', { name: /У пользователя есть право пропустить/ })
    const unlimitedReplacement = screen.getByRole('checkbox', { name: /Безлимитная «Перезадать»/ })
    const replacementPenalty = screen.getByRole('checkbox', { name: /Штраф на «Перезадать»/ })
    expect(refusal).not.toBeChecked()
    expect(absence).not.toBeChecked()
    expect(unlimitedReplacement).not.toBeChecked()
    expect(replacementPenalty).not.toBeChecked()
    expect(replacementPenalty).toBeDisabled()
    fireEvent.click(refusal)
    expect(refusal).toBeChecked()
    expect(absence).not.toBeChecked()
    fireEvent.click(absence)
    expect(refusal).toBeChecked()
    expect(absence).toBeChecked()
    fireEvent.click(unlimitedReplacement)
    expect(replacementPenalty).toBeEnabled()
    fireEvent.click(replacementPenalty)
    expect(unlimitedReplacement).toBeChecked()
    expect(replacementPenalty).toBeChecked()
    fireEvent.click(unlimitedReplacement)
    expect(unlimitedReplacement).not.toBeChecked()
    expect(replacementPenalty).not.toBeChecked()
    expect(replacementPenalty).toBeDisabled()
    fireEvent.click(unlimitedReplacement)
    fireEvent.click(replacementPenalty)

    fireEvent.click(screen.getByRole('button', { name: 'Назад' }))
    fireEvent.click(screen.getByRole('button', { name: 'Начать' }))
    expect(screen.getByRole('checkbox', { name: /От заданий нельзя отказываться/ })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: /У пользователя есть право пропустить/ })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: /Безлимитная «Перезадать»/ })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: /Штраф на «Перезадать»/ })).toBeChecked()
  })

  it('starts Players with two empty independent players and automatic mode', () => {
    render(<App />)
    openPlayers()

    const names = screen.getAllByRole('textbox', { name: 'Имя игрока' })
    expect(names).toHaveLength(2)
    expect(names[0]).toHaveValue('')
    expect(names[1]).toHaveValue('')
    expect(screen.getAllByRole('combobox', { name: 'Грань игрока' })).toHaveLength(2)
    for (const boundary of screen.getAllByRole('combobox', { name: 'Грань игрока' })) {
      expect(boundary).toHaveValue('')
    }
    for (const relationship of screen.getAllByRole('checkbox', { name: 'Отношения' })) {
      expect(relationship).not.toBeChecked()
    }
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('button', { name: 'Удалить последнего игрока' })).toBeDisabled()
  })

  it('adds multiple players and never removes below two', () => {
    render(<App />)
    openPlayers()
    const add = screen.getByRole('button', { name: 'Добавить игрока' })
    const remove = screen.getByRole('button', { name: 'Удалить последнего игрока' })

    fireEvent.click(remove)
    expect(screen.getAllByRole('textbox', { name: 'Имя игрока' })).toHaveLength(2)
    fireEvent.click(add)
    fireEvent.click(add)
    expect(screen.getAllByRole('textbox', { name: 'Имя игрока' })).toHaveLength(4)
    fireEvent.click(remove)
    fireEvent.click(remove)
    expect(screen.getAllByRole('textbox', { name: 'Имя игрока' })).toHaveLength(2)
    expect(remove).toBeDisabled()
  })

  it('allows duplicate names and validates names before boundaries', () => {
    render(<App />)
    openPlayers()
    const names = screen.getAllByRole('textbox', { name: 'Имя игрока' })
    const next = screen.getByRole('button', { name: 'Далее' })
    expect(next).toBeDisabled()

    fireEvent.change(names[0], { target: { value: 'Никита' } })
    fireEvent.change(names[1], { target: { value: '   ' } })
    expect(next).toBeDisabled()
    fireEvent.change(names[1], { target: { value: 'Никита' } })
    expect(next).toBeEnabled()
    fireEvent.click(next)
    for (const boundary of screen.getAllByRole('combobox', { name: 'Грань игрока' })) {
      expect(boundary).toHaveAttribute('aria-invalid', 'true')
    }

    const boundaries = screen.getAllByRole('combobox', { name: 'Грань игрока' })
    fireEvent.change(boundaries[0], { target: { value: 'regular' } })
    fireEvent.change(boundaries[1], { target: { value: 'full' } })
    expect(boundaries[0]).toHaveAttribute('aria-invalid', 'false')
    expect(boundaries[1]).toHaveAttribute('aria-invalid', 'false')
  })

  it('opens and closes the player setup help', async () => {
    render(<App />)
    openPlayers()

    fireEvent.click(screen.getByRole('button', { name: 'Открыть справку о настройках игроков' }))
    expect(screen.getByRole('dialog', { name: 'Грани и «Отношения»' })).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Ясно' }))
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Грани и «Отношения»' })).not.toBeInTheDocument()
    })
  })

  it('updates each player independently and preserves state through Rules', () => {
    render(<App />)
    openPlayers()
    const names = screen.getAllByRole('textbox', { name: 'Имя игрока' })
    const boundaries = screen.getAllByRole('combobox', { name: 'Грань игрока' })
    const relationships = screen.getAllByRole('checkbox', { name: 'Отношения' })
    fireEvent.change(names[0], { target: { value: 'Одинаково' } })
    fireEvent.change(names[1], { target: { value: 'Одинаково' } })
    fireEvent.change(boundaries[0], { target: { value: 'full' } })
    fireEvent.change(boundaries[1], { target: { value: 'virgin' } })
    fireEvent.click(relationships[1])
    fireEvent.click(screen.getByRole('switch'))

    fireEvent.click(screen.getByRole('button', { name: 'Назад' }))
    fireEvent.click(screen.getByRole('button', { name: 'Далее' }))
    expect(screen.getAllByRole('textbox', { name: 'Имя игрока' })[0]).toHaveValue('Одинаково')
    expect(screen.getAllByRole('textbox', { name: 'Имя игрока' })[1]).toHaveValue('Одинаково')
    expect(screen.getAllByRole('combobox', { name: 'Грань игрока' })[0]).toHaveValue('full')
    expect(screen.getAllByRole('combobox', { name: 'Грань игрока' })[1]).toHaveValue('virgin')
    expect(screen.getAllByRole('checkbox', { name: 'Отношения' })[0]).not.toBeChecked()
    expect(screen.getAllByRole('checkbox', { name: 'Отношения' })[1]).toBeChecked()
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'false')
  })

  it('keeps focus logical after adding and removing by stable id', () => {
    render(<App />)
    openPlayers()
    fireEvent.change(screen.getAllByRole('textbox', { name: 'Имя игрока' })[1], { target: { value: 'Второй' } })
    fireEvent.click(screen.getByRole('button', { name: 'Добавить игрока' }))
    const third = screen.getAllByRole('textbox', { name: 'Имя игрока' })[2]
    expect(third).toHaveFocus()
    expect(third.closest('[data-player-id]')).toHaveAttribute('data-player-id', 'player-3')
    fireEvent.click(screen.getByRole('button', { name: 'Удалить последнего игрока' }))
    expect(screen.getAllByRole('textbox', { name: 'Имя игрока' })[1]).toHaveFocus()
    expect(screen.queryByText('player-3')).not.toBeInTheDocument()
  })

  it('renders all generated packs with their real counts and available types', () => {
    render(<App />)
    openPacks()

    expect(screen.getAllByRole('checkbox', { name: /.+/ })).toHaveLength(8)
    for (const pack of gameData.packs) {
      const card = document.querySelector(`[data-pack-id="${pack.id}"]`)
      expect(card).not.toBeNull()
      expect(within(card as HTMLElement).getByText(pack.description)).toBeInTheDocument()
      expect(within(card as HTMLElement).getByText(`${pack.cardCount} карт`)).toBeInTheDocument()
      const availableTypes: readonly string[] = pack.availableTypes
      if (availableTypes.includes('truth')) expect(within(card as HTMLElement).getByTitle('Правда')).toBeInTheDocument()
      else expect(within(card as HTMLElement).queryByTitle('Правда')).not.toBeInTheDocument()
      if (availableTypes.includes('dare')) expect(within(card as HTMLElement).getByTitle('Действие')).toBeInTheDocument()
      else expect(within(card as HTMLElement).queryByTitle('Действие')).not.toBeInTheDocument()
    }
  })

  it('supports multiple pack selection and blocks Next without a selection', () => {
    render(<App />)
    openPacks()
    const ordinary = screen.getByRole('checkbox', { name: 'Обычный' })
    const spicy = screen.getByRole('checkbox', { name: 'Спайси' })
    const next = screen.getByRole('button', { name: 'Далее' })
    expect(next).toBeDisabled()

    fireEvent.click(ordinary)
    fireEvent.click(spicy)
    expect(ordinary).toBeChecked()
    expect(spicy).toBeChecked()
    expect(next).toBeEnabled()
    fireEvent.click(ordinary)
    expect(next).toBeEnabled()
    fireEvent.click(spicy)
    expect(next).toBeDisabled()
  })

  it('keeps active selections when navigating Packs to Players and back', () => {
    render(<App />)
    openPacks()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Обычный' }))
    fireEvent.click(screen.getByRole('button', { name: 'Назад' }))
    fireEvent.click(screen.getByRole('button', { name: 'Далее' }))
    expect(screen.getByRole('checkbox', { name: 'Обычный' })).toBeChecked()
  })

  it('disables incompatible packs and clears a stale selection after player changes', () => {
    render(<App />)
    openPacks()
    const hot = screen.getByRole('checkbox', { name: 'Горячий' })
    fireEvent.click(hot)
    expect(hot).toBeChecked()
    fireEvent.click(screen.getByRole('button', { name: 'Назад' }))

    for (const boundary of screen.getAllByRole('combobox', { name: 'Грань игрока' })) {
      fireEvent.change(boundary, { target: { value: 'virgin' } })
    }
    for (const relationship of screen.getAllByRole('checkbox', { name: 'Отношения' })) {
      fireEvent.click(relationship)
    }
    fireEvent.click(screen.getByRole('button', { name: 'Далее' }))

    const normalizedHot = screen.getByRole('checkbox', { name: 'Горячий' })
    expect(normalizedHot).toBeDisabled()
    expect(normalizedHot).not.toBeChecked()
    expect(screen.getByRole('button', { name: 'Далее' })).toBeDisabled()
  })

  it('explains an inactive pack attempt and hides the notice after four seconds', () => {
    vi.useFakeTimers()
    try {
      render(<App />)
      openPacks()
      fireEvent.click(screen.getByRole('button', { name: 'Назад' }))
      for (const boundary of screen.getAllByRole('combobox', { name: 'Грань игрока' })) {
        fireEvent.change(boundary, { target: { value: 'virgin' } })
      }
      for (const relationship of screen.getAllByRole('checkbox', { name: 'Отношения' })) {
        fireEvent.click(relationship)
      }
      fireEvent.click(screen.getByRole('button', { name: 'Далее' }))

      const hot = screen.getByRole('checkbox', { name: 'Горячий' })
      expect(hot).toBeDisabled()
      fireEvent.click(hot.closest('.pack-card')!)
      expect(screen.getByRole('status')).toHaveTextContent('Нет 2 пользователей, которые бы на такое согласились. Поменяйте грани')
      act(() => vi.advanceTimersByTime(3840))
      expect(screen.getByRole('status')).toHaveAttribute('data-state', 'closing')
      act(() => vi.advanceTimersByTime(159))
      expect(screen.getByRole('status')).toBeInTheDocument()
      act(() => vi.advanceTimersByTime(1))
      expect(screen.queryByRole('status')).not.toBeInTheDocument()
      expect(hot).not.toBeChecked()
    } finally {
      vi.useRealTimers()
    }
  })

  it('starts an automatic game from Packs and completes a generated turn', async () => {
    render(<App />)
    startGame()
    expect(screen.getByRole('heading', { name: 'Игрок 1' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Действие' }))
    expect(document.querySelector('.game-card__type--dare')).toHaveTextContent('Действие')
    fireEvent.click(screen.getByRole('button', { name: 'Готово' }))
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Игрок 2' })).toBeInTheDocument())
  })

  it('crossfades the initial choice into the generated question', () => {
    render(<App />)
    startGame()
    fireEvent.click(screen.getByRole('button', { name: 'Действие' }))
    const stage = document.querySelector('.game-card-stage')
    expect(stage?.querySelector('.game-card--reveal')).not.toBeNull()
    expect(stage?.querySelector('.game-card--choice-exit')).toHaveAttribute('aria-hidden', 'true')
  })

  it('opens the skip reason dialog and advances after a voluntary refusal', async () => {
    render(<App />)
    startGame()
    fireEvent.click(screen.getByRole('button', { name: 'Действие' }))
    fireEvent.click(screen.getByRole('button', { name: 'Пропуск' }))
    const dialog = screen.getByRole('dialog', { name: 'Пропуск?' })
    expect(within(dialog).getByText('Почему игрок пропускает ход?')).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Он так захотел' }))
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Игрок 2' })).toBeInTheDocument())
  }, 15_000)

  it('warns before the next counted refusal and reports player removal', () => {
    vi.useFakeTimers()
    try {
      render(<App />)
      startGame({ removeAfterRefusal: true })
      skipDare('Он так захотел')
      completeDare()
      skipDare('Он так захотел')
      expect(screen.getByRole('status')).toHaveTextContent('Если игрок снова откажется — он больше не будет играть.')
      completeDare()
      skipDare('Он так захотел')
      expect(screen.getByRole('status')).toHaveTextContent('Игрок «Игрок 1» удалён из игры, потому что ничего не хочет делать.')
      expect(screen.getByText('Кажется, у тебя кончились друзья. Начнем заново?')).toBeInTheDocument()
      expect(loadGameSession(localStorage, gameData)?.game.eliminatedPlayers.map((player) => player.id)).toEqual(['player-1'])
      fireEvent.click(screen.getByRole('button', { name: 'Начать заново' }))
      expect(screen.getByRole('heading', { name: 'Результаты' })).toBeInTheDocument()
      expect(screen.getAllByText('Игрок 1')).toHaveLength(1)
      expect(screen.getAllByText('Игрок 2')).toHaveLength(1)
    } finally {
      vi.useRealTimers()
    }
  }, 15_000)

  it('enables replacement for both replaceable generated packs and keeps it disabled for an ordinary pack', () => {
    const first = render(<App />)
    startGame({ pack: 'Обычный' })
    fireEvent.click(screen.getByRole('button', { name: 'Действие' }))
    expect(screen.getByRole('button', { name: 'Перезадать' })).toBeDisabled()
    first.unmount()

    const second = render(<App />)
    startGame({ pack: 'Другие люди' })
    fireEvent.click(screen.getByRole('button', { name: 'Действие' }))
    expect(screen.getByRole('button', { name: 'Перезадать' })).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: 'Перезадать' }))
    expect(screen.getByRole('dialog', { name: 'Замена' })).toBeVisible()

    second.unmount()
    render(<App />)
    startGame({ pack: 'Безграничная улица' })
    fireEvent.click(screen.getByRole('button', { name: 'Действие' }))
    expect(screen.getByRole('button', { name: 'Перезадать' })).toBeEnabled()
  }, 15_000)

  it('enables unlimited replacement for an ordinary pack and applies a stacked penalty turn', () => {
    render(<App />)
    startGame({ pack: 'Обычный', penalizeReplacement: true, unlimitedReplacement: true })
    fireEvent.click(screen.getByRole('button', { name: 'Действие' }))
    fireEvent.click(screen.getByRole('button', { name: 'Перезадать' }))
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Замена' })).getByRole('button', { name: 'Да' }))

    expect(loadGameSession(localStorage, gameData)?.game.players[0].replacementPenaltyTurns).toBe(1)
    fireEvent.click(screen.getByRole('button', { name: 'Готово' }))
    expect(screen.getByRole('heading', { name: 'Игрок 1' })).toBeInTheDocument()
    expect(loadGameSession(localStorage, gameData)?.game.players[0].replacementPenaltyTurns).toBe(0)
  }, 15_000)

  it('completes a table-generated manual turn and can request a pack card', async () => {
    render(<App />)
    startGame({ manual: true })
    fireEvent.click(screen.getByRole('button', { name: 'Правда' }))
    expect(screen.getByText(/Стол задает/)).toBeInTheDocument()
    expect(screen.getByText('Стол')).toBeInTheDocument()
    expect(screen.getByText(/выбрал грань «Полный раж»/)).toBeInTheDocument()
    expect(screen.queryByText(/не в отношениях/)).not.toBeInTheDocument()
    expect(screen.queryByText(/«full»/)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Готово' }))
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Игрок 2' })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Действие' }))
    fireEvent.click(screen.getByRole('button', { name: 'Выдать' }))
    const stage = document.querySelector('.game-card-stage')
    const dealtCard = stage?.querySelector('.game-card--deal')
    const tableCard = screen.getByText(/Стол задает/).closest('.game-card')
    expect(stage?.children).toHaveLength(2)
    expect(tableCard).toHaveAttribute('aria-hidden', 'true')
    expect(dealtCard).not.toBeNull()
    expect(dealtCard).not.toBe(tableCard)
    expect(screen.getByRole('button', { name: 'Готово' })).toBeEnabled()
  }, 15_000)

  it('renders the next turn below a completed card while it leaves', () => {
    render(<App />)
    startGame()
    fireEvent.click(screen.getByRole('button', { name: 'Действие' }))
    fireEvent.click(screen.getByRole('button', { name: 'Готово' }))
    const stage = document.querySelector('.game-card-stage')
    const leavingCard = stage?.querySelector('.game-card--leave-dare')
    expect(stage?.children).toHaveLength(2)
    expect(leavingCard).toHaveAttribute('aria-hidden', 'true')
    expect(screen.getByRole('heading', { name: 'Игрок 2' })).toBeInTheDocument()
  })

  it('renders resolved PLAYER names inline with the card sentence', () => {
    const random = vi.spyOn(Math, 'random').mockReturnValue(0)
    try {
      render(<App />)
      startGame({ pack: 'Спайси' })
      fireEvent.click(screen.getByRole('button', { name: 'Действие' }))
      const copy = document.querySelector('.game-card__copy')
      const playerName = copy?.querySelector('mark')
      expect(copy).not.toBeNull()
      expect(playerName).not.toBeNull()
      expect(playerName?.parentElement).toBe(copy)
      expect(playerName).toHaveTextContent('Игрок 2')
    } finally {
      random.mockRestore()
    }
  })

  it('disables Truth for a player after two consecutive manual Truth turns', () => {
    vi.useFakeTimers()
    try {
      render(<App />)
      startGame({ manual: true })
      completeManualTurn('Правда')
      completeManualTurn('Действие')
      completeManualTurn('Правда')
      completeManualTurn('Действие')
      expect(screen.getByRole('heading', { name: 'Игрок 1' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Правда' })).toBeDisabled()
      expect(screen.getByText('Ты уже выбирал две правды.')).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  }, 15_000)

  it('keeps a generated phone number stable across rerenders', () => {
    const random = vi.spyOn(Math, 'random').mockReturnValue(0)
    try {
      render(<App />)
      startGame({ pack: 'Другие люди' })
      fireEvent.click(screen.getByRole('button', { name: 'Действие' }))
      const phonePattern = /\+7 \(9\d{2}\) \d{3}-\d{2}-\d{2}/
      const number = screen.getByText(phonePattern).textContent
      fireEvent.click(screen.getByRole('button', { name: 'Выход' }))
      fireEvent.click(screen.getByRole('button', { name: 'Нет' }))
      expect(screen.getByText(phonePattern)).toHaveTextContent(number ?? '')
    } finally {
      random.mockRestore()
    }
  })

  it('uses two confirmations and keeps the game snapshot for Results', async () => {
    render(<App />)
    startGame()
    fireEvent.click(screen.getByRole('button', { name: 'Действие' }))
    fireEvent.click(screen.getByRole('button', { name: 'Выход' }))
    expect(screen.getByRole('dialog', { name: 'Конец?' })).toBeVisible()
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Конец?' })).getByRole('button', { name: 'Да' }))
    expect(screen.getByRole('dialog', { name: 'Точно конец?' })).toBeVisible()
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Точно конец?' })).getByRole('button', { name: 'Да' }))
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Результаты' })).toBeInTheDocument())
    expect(screen.getAllByText(/выполнил 0 действий и ответил 0 правд/)).toHaveLength(2)
  })

  it('ends a manual game at Results and routes both restart choices correctly', async () => {
    const view = render(<App />)
    startGame({ manual: true })
    finishGameFromDialog()
    expect(await screen.findByRole('heading', { name: 'Результаты' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'С теми же игроками' }))
    expect(screen.getByRole('heading', { name: 'Игроки' })).toBeInTheDocument()
    expect(screen.getAllByRole('textbox', { name: 'Имя игрока' })[0]).toHaveValue('Игрок 1')

    view.unmount()
    render(<App />)
    startGame()
    finishGameFromDialog()
    fireEvent.click(await screen.findByRole('button', { name: 'С нуля' }))
    expect(screen.getByRole('heading', { name: 'Правда или Действие' })).toBeInTheDocument()
  }, 15_000)

  it('persists meaningful game changes and resumes the exact resolved card after a remount', () => {
    const random = vi.spyOn(Math, 'random').mockReturnValue(0)
    try {
      const view = render(<App />)
      startGame({ pack: 'Другие люди' })
      fireEvent.click(screen.getByRole('button', { name: 'Действие' }))
      const beforeReload = loadGameSession(localStorage, gameData)
      expect(beforeReload?.game.currentTurn).not.toBeNull()

      view.unmount()
      render(<App />)
      expect(screen.getByRole('dialog', { name: 'Вижу незаконченную игру' })).toBeVisible()
      fireEvent.click(screen.getByRole('button', { name: 'Продолжить' }))

      expect(screen.getByRole('heading', { name: 'Игрок 1' })).toBeInTheDocument()
      expect(document.querySelector('.game-card__copy')).toHaveTextContent(beforeReload?.game.currentTurn?.resolvedText ?? '')
      expect(loadGameSession(localStorage, gameData)).toEqual(beforeReload)
    } finally {
      random.mockRestore()
    }
  })

  it('deletes an unfinished session before starting another game', () => {
    const view = render(<App />)
    startGame()
    expect(localStorage.getItem(GAME_SESSION_KEY)).not.toBeNull()
    view.unmount()

    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Начать другую' }))
    expect(localStorage.getItem(GAME_SESSION_KEY)).toBeNull()
    expect(screen.getByRole('heading', { name: 'Правда или Действие' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Вижу незаконченную игру' })).not.toBeInTheDocument()
  })

  it('does not keep a completed game as resumable after opening Results', async () => {
    render(<App />)
    startGame()
    expect(localStorage.getItem(GAME_SESSION_KEY)).not.toBeNull()
    finishGameFromDialog()
    expect(await screen.findByRole('heading', { name: 'Результаты' })).toBeInTheDocument()
    expect(localStorage.getItem(GAME_SESSION_KEY)).toBeNull()
  })
})

function openPlayers() {
  fireEvent.click(screen.getByRole('button', { name: 'Начать' }))
  fireEvent.click(screen.getByRole('button', { name: 'Далее' }))
}

function openPacks() {
  openPlayers()
  const names = screen.getAllByRole('textbox', { name: 'Имя игрока' })
  const boundaries = screen.getAllByRole('combobox', { name: 'Грань игрока' })
  names.forEach((name, index) => fireEvent.change(name, { target: { value: `Игрок ${index + 1}` } }))
  boundaries.forEach((boundary) => fireEvent.change(boundary, { target: { value: 'full' } }))
  fireEvent.click(screen.getByRole('button', { name: 'Далее' }))
}

function startGame({
  manual = false,
  pack = 'Обычный',
  penalizeReplacement = false,
  removeAfterRefusal = false,
  unlimitedReplacement = false,
} = {}) {
  fireEvent.click(screen.getByRole('button', { name: 'Начать' }))
  if (removeAfterRefusal) fireEvent.click(screen.getByRole('checkbox', { name: /От заданий нельзя отказываться/ }))
  if (unlimitedReplacement) fireEvent.click(screen.getByRole('checkbox', { name: /Безлимитная «Перезадать»/ }))
  if (penalizeReplacement) fireEvent.click(screen.getByRole('checkbox', { name: /Штраф на «Перезадать»/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Далее' }))
  const names = screen.getAllByRole('textbox', { name: 'Имя игрока' })
  const boundaries = screen.getAllByRole('combobox', { name: 'Грань игрока' })
  names.forEach((name, index) => fireEvent.change(name, { target: { value: `Игрок ${index + 1}` } }))
  boundaries.forEach((boundary) => fireEvent.change(boundary, { target: { value: 'full' } }))
  if (manual) fireEvent.click(screen.getByRole('switch'))
  fireEvent.click(screen.getByRole('button', { name: 'Далее' }))
  fireEvent.click(screen.getByRole('checkbox', { name: pack }))
  fireEvent.click(screen.getByRole('button', { name: 'Далее' }))
}

function skipDare(reason: 'Он так захотел' | 'Нет за столом') {
  fireEvent.click(screen.getByRole('button', { name: 'Действие' }))
  fireEvent.click(screen.getByRole('button', { name: 'Пропуск' }))
  fireEvent.click(within(screen.getByRole('dialog', { name: 'Пропуск?' })).getByRole('button', { name: reason }))
  act(() => vi.advanceTimersByTime(320))
}

function completeDare() {
  fireEvent.click(screen.getByRole('button', { name: 'Действие' }))
  fireEvent.click(screen.getByRole('button', { name: 'Готово' }))
  act(() => vi.advanceTimersByTime(320))
}

function completeManualTurn(type: 'Правда' | 'Действие') {
  fireEvent.click(screen.getByRole('button', { name: type }))
  fireEvent.click(screen.getByRole('button', { name: 'Готово' }))
  act(() => vi.advanceTimersByTime(320))
}

function finishGameFromDialog() {
  fireEvent.click(screen.getByRole('button', { name: 'Выход' }))
  fireEvent.click(within(screen.getByRole('dialog', { name: 'Конец?' })).getByRole('button', { name: 'Да' }))
  fireEvent.click(within(screen.getByRole('dialog', { name: 'Точно конец?' })).getByRole('button', { name: 'Да' }))
}
