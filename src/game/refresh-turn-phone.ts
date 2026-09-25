import type { ActiveGameState } from './game-state'
import { refreshPhoneNumber } from './phone-number'
import { mathRandomSource, type RandomSource } from './random'

export function refreshTurnPhone(game: ActiveGameState, now = new Date(), random: RandomSource = mathRandomSource): ActiveGameState {
  const turn = game.currentTurn
  if (!turn?.phoneNumber) return game
  const phone = refreshPhoneNumber(turn.phoneNumber, random, now)
  if (phone === turn.phoneNumber) return game
  const replace = (text: string) => text.split(turn.phoneNumber!).join(phone)
  return {
    ...game,
    currentTurn: {
      ...turn,
      phoneNumber: phone,
      resolvedText: replace(turn.resolvedText),
      renderSegments: turn.renderSegments.map((segment) => segment.kind === 'text'
        ? { ...segment, text: replace(segment.text) } : segment),
    },
  }
}
