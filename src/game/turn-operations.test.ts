import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BoundaryDefinition, GameCard, GameData } from '../data/game-data'
import type { SetupState } from '../setup/setup-state'
import {
  completePackCard,
  completeTableTurn,
  createGame,
  drawCard,
  getCurrentPlayer,
  isCardPlayableForTurn,
  recordTypeChoice,
  type ActiveGameState,
} from './game-state'
import { selectSecondaryParticipants } from './participants'
import type { RandomSource } from './random'
import { generatePhoneNumber, resolveCardTokens } from './token-resolver'

const boundaries: BoundaryDefinition[] = [
  { description: '', level: 0, name: 'Целочка' },
  { description: '', level: 1, name: 'Обычный' },
  { description: '', level: 2, name: 'Полный раж' },
]

describe('secondary participants', () => {
  it('excludes the actor and assigns distinct players to every position', () => {
    const game = makeGame()
    const selected = selectSecondaryParticipants(makeCard({ otherPlayers: 3 }), game, boundaries, fixedRandom(0))!
    expect(selected.map((player) => player.id)).toEqual(['p2', 'p3', 'p4'])
    expect(new Set(selected.map((player) => player.id)).size).toBe(3)
    expect(selected.map((player) => player.id)).not.toContain(getCurrentPlayer(game).id)
  })

  it('distinguishes players by id when their names are equal', () => {
    const game = withPlayers(makeGame(), [{}, { name: 'Same' }, { name: 'Same' }, {}])
    const selected = selectSecondaryParticipants(makeCard({ otherPlayers: 2 }), game, boundaries, fixedRandom(0))!
    expect(selected.map((player) => player.name)).toEqual(['Same', 'Same'])
    expect(selected.map((player) => player.id)).toEqual(['p2', 'p3'])
  })

  it('rejects cards with too few eligible players by boundary or relationship', () => {
    const base = makeGame()
    const highBoundary = makeCard({ boundary: 'Полный раж', otherPlayers: 2 })
    const restricted = withPlayers(base, [
      {},
      { boundary: 'full' },
      { boundary: 'regular' },
      { boundary: 'virgin' },
    ])
    expect(isCardPlayableForTurn(highBoundary, restricted, boundaries)).toBe(false)
    expect(selectSecondaryParticipants(highBoundary, restricted, boundaries, fixedRandom(0))).toBeNull()

    const noRelationships = makeCard({ otherPlayers: 2, relationshipAllowed: false })
    const coupled = withPlayers(base, [{}, {}, { inRelationship: true }, { inRelationship: true }])
    expect(isCardPlayableForTurn(noRelationships, coupled, boundaries)).toBe(false)
    expect(selectSecondaryParticipants(noRelationships, coupled, boundaries, fixedRandom(0))).toBeNull()
  })

  it('prioritizes minimum activity for Dare and reproducibly breaks ties', () => {
    const game = withActivity(makeGame(), [9, 2, 2, 8])
    const card = makeCard({ otherPlayers: 1, type: 'dare' })
    expect(selectSecondaryParticipants(card, game, boundaries, fixedRandom(0))?.[0].id).toBe('p2')
    expect(selectSecondaryParticipants(card, game, boundaries, fixedRandom(0.99))?.[0].id).toBe('p3')
  })

  it('recomputes the minimum after each Dare participant is removed', () => {
    const game = withActivity(makeGame(), [9, 0, 1, 1])
    const selected = selectSecondaryParticipants(
      makeCard({ otherPlayers: 2, type: 'dare' }),
      game,
      boundaries,
      fixedRandom(0.99),
    )!
    expect(selected.map((player) => player.id)).toEqual(['p2', 'p4'])
  })

  it('selects Truth participants randomly without considering activity points', () => {
    const game = withActivity(makeGame(), [0, 100, 0, 50])
    const card = makeCard({ otherPlayers: 1, type: 'truth' })
    expect(selectSecondaryParticipants(card, game, boundaries, fixedRandom(0))?.[0].id).toBe('p2')
    expect(selectSecondaryParticipants(card, game, boundaries, fixedRandom(0.99))?.[0].id).toBe('p4')
  })
})

describe('token resolver', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-23T09:00:00Z'))
  })
  afterEach(() => vi.useRealTimers())

  it('keeps repeated PLAYER stable and maps PLAYER2/3 to their positions', () => {
    const players = makeGame().players.slice(1)
    const resolved = resolveCardTokens(
      '*PLAYER* и снова *PLAYER*, затем *PLAYER2* и *PLAYER3*',
      players,
      fixedRandom(0),
    )
    expect(resolved.text).toBe('Two и снова Two, затем Three и Four')
  })

  it('generates PHONE_NUM in the required reproducible format', () => {
    const first = generatePhoneNumber(sequenceRandom([0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8]))
    const second = generatePhoneNumber(sequenceRandom([0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8]))
    expect(first).toBe(second)
    expect(first).toMatch(/^\+7 \(9\d{2}\) \d{3}-\d{2}-\d{2}$/)
  })

  it('uses one generated number for repeated PHONE_NUM tokens', () => {
    const resolved = resolveCardTokens(
      '*PHONE_NUM* и снова *PHONE_NUM*',
      [],
      sequenceRandom([0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8]),
    )
    expect(resolved.phoneNumber).toMatch(/^\+7 \(9\d{2}\) \d{3}-\d{2}-\d{2}$/)
    expect(resolved.text).toBe(`${resolved.phoneNumber} и снова ${resolved.phoneNumber}`)
  })

  it('throws instead of leaving an unresolved PLAYER token', () => {
    expect(() => resolveCardTokens('*PLAYER2*', makeGame().players.slice(1, 2), fixedRandom(0)))
      .toThrow('Не найден участник для токена *PLAYER2*')
  })

  it('stores resolved random values in the current turn', () => {
    const card = makeCard({ otherPlayers: 1, text: '*PLAYER* звонит на *PHONE_NUM*' })
    const game = makeGame([card])
    const drawn = drawCard(recordTypeChoice(game, 'dare'), 'dare', gameData([card]), fixedRandom(0))
    const snapshot = JSON.stringify(drawn.state.currentTurn)
    expect(drawn.state.currentTurn).toMatchObject({
      phoneNumber: '+7 (900) 000-00-00',
      resolvedText: 'Two звонит на +7 (900) 000-00-00',
      secondaryPlayerIds: ['p2'],
    })
    expect(JSON.stringify(drawn.state.currentTurn)).toBe(snapshot)
  })
})

describe('turn completion', () => {
  it('updates Dare statistics, activity points and advances the turn', () => {
    const card = makeCard({ otherPlayers: 2, type: 'dare' })
    const game = recordTypeChoice(makeGame([card]), 'dare')
    const drawn = drawCard(game, 'dare', gameData([card]), fixedRandom(0)).state
    const completed = completePackCard(drawn)
    expect(completed.players[0].completedDares).toBe(1)
    expect(completed.players[1].activityPoints).toBe(1)
    expect(completed.players[2].activityPoints).toBe(1)
    expect(completed.players[0].activityPoints).toBe(0)
    expect(completed.usedCardIds).toEqual([card.id])
    expect(completed.currentTurn).toBeNull()
    expect(getCurrentPlayer(completed).id).toBe('p2')
  })

  it('updates Truth statistics without awarding activity points', () => {
    const card = makeCard({ otherPlayers: 1, type: 'truth' })
    const game = recordTypeChoice(makeGame([card]), 'truth')
    const completed = completePackCard(drawCard(game, 'truth', gameData([card]), fixedRandom(0)).state)
    expect(completed.players[0].answeredTruths).toBe(1)
    expect(completed.players.every((player) => player.activityPoints === 0)).toBe(true)
    expect(completed.players[0].truthCount).toBe(1)
  })

  it('completes a table turn without mutating deck, used cards, activity or pack statistics', () => {
    const game = { ...withActivity(makeGame(), [1, 2, 3, 4]), mode: 'manual' as const }
    const queue = game.queue
    const completed = completeTableTurn(game, 'truth')
    expect(completed.queue).toBe(queue)
    expect(completed.usedCardIds).toEqual([])
    expect(completed.players.map((player) => player.activityPoints)).toEqual([1, 2, 3, 4])
    expect(completed.players.map((player) => [player.answeredTruths, player.completedDares])).toEqual([
      [0, 0], [0, 0], [0, 0], [0, 0],
    ])
    expect(completed.players[0].truthCount).toBe(1)
    expect(getCurrentPlayer(completed).id).toBe('p2')
  })

  it('rejects a third manual Truth without changing state or advancing', () => {
    const game = {
      ...withPlayers(makeGame(), [{ truthCount: 2 }, {}, {}, {}]),
      mode: 'manual' as const,
    }
    const snapshot = JSON.stringify(game)
    expect(() => completeTableTurn(game, 'truth')).toThrow('третью Правду')
    expect(JSON.stringify(game)).toBe(snapshot)
    expect(getCurrentPlayer(game).id).toBe('p1')
  })
})

function makeGame(cards: readonly GameCard[] = [makeCard()]): ActiveGameState {
  return createGame(setup(), gameData(cards), fixedRandom(0))
}

function gameData(cards: readonly GameCard[]): GameData {
  return {
    boundaries,
    cards,
    cardTypes: [],
    packs: [{ availableTypes: ['truth', 'dare'], cardCount: cards.length, description: '', id: 'pack-a', name: 'A' }],
    source: 'fixture',
    summary: { boundaryCount: 3, cardCount: cards.length, cardTypeCount: 2, packCount: 1 },
  }
}

function setup(): SetupState {
  return {
    mode: 'automatic',
    nextPlayerId: 5,
    players: [
      { boundary: 'full', id: 'p1', inRelationship: false, name: 'One' },
      { boundary: 'full', id: 'p2', inRelationship: false, name: 'Two' },
      { boundary: 'full', id: 'p3', inRelationship: false, name: 'Three' },
      { boundary: 'full', id: 'p4', inRelationship: false, name: 'Four' },
    ],
    removeAfterAbsence: false,
    removeAfterRefusal: false,
    penalizeReplacement: false,
    unlimitedReplacement: false,
    selectedPackIds: ['pack-a'],
  }
}

function makeCard(overrides: Partial<GameCard> = {}): GameCard {
  return {
    boundary: 'Целочка',
    id: 'card-1',
    otherPlayers: 0,
    pack: 'A',
    packId: 'pack-a',
    relationshipAllowed: true,
    text: 'Card',
    type: 'dare',
    ...overrides,
  }
}

function withActivity(state: ActiveGameState, points: readonly number[]): ActiveGameState {
  return { ...state, players: state.players.map((player, index) => ({ ...player, activityPoints: points[index] })) }
}

function withPlayers(
  state: ActiveGameState,
  changes: readonly Partial<ActiveGameState['players'][number]>[],
): ActiveGameState {
  return { ...state, players: state.players.map((player, index) => ({ ...player, ...changes[index] })) }
}

function fixedRandom(value: number): RandomSource {
  return { next: () => value }
}

function sequenceRandom(values: readonly number[]): RandomSource {
  let index = 0
  return { next: () => values[index++ % values.length] }
}
