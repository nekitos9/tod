import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  ExcelJS,
  importGameData,
  importGameDataFromWorkbook,
  XlsxValidationError,
} from './importer.ts'

function createValidWorkbook(): InstanceType<typeof ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook()

  const questions = workbook.addWorksheet('Вопросы')
  questions.addRow([
    'id',
    'Вопрос',
    'ПД',
    'Пак',
    'Грань',
    'Отношения',
    'Другие игроки',
  ])
  questions.addRow([1, 'Расскажи правду.', 'Правда', 'Обычный', 'Целочка', 'Да', 0])

  const packs = workbook.addWorksheet('Паки')
  packs.addRow(['Паки', 'Суть'])
  packs.addRow(['Обычный', 'Базовый пак'])

  const boundaries = workbook.addWorksheet('Грани')
  boundaries.addRow(['Грани', 'Ур', 'Описание'])
  boundaries.addRow(['Целочка', 0, 'Базовая грань'])
  boundaries.addRow(['Обычный', 1, 'Средняя грань'])
  boundaries.addRow(['Полный раж', 2, 'Полная грань'])

  const cardTypes = workbook.addWorksheet('Действия')
  cardTypes.addRow(['Действие', 'Описание'])
  cardTypes.addRow(['Правда', 'Обычная правда'])
  cardTypes.addRow(['Действие', 'Обычное действие'])

  return workbook
}

function validationMessage(workbook: InstanceType<typeof ExcelJS.Workbook>): string {
  try {
    importGameDataFromWorkbook(workbook)
  } catch (error) {
    expect(error).toBeInstanceOf(XlsxValidationError)
    return (error as XlsxValidationError).message
  }
  throw new Error('Expected XLSX validation to fail')
}

describe('XLSX importer', () => {
  it('imports the real workbook', async () => {
    const result = await importGameData(resolve('docs/Паки и вопросы.xlsx'))

    expect(result.summary).toEqual({
      cardCount: 200,
      packCount: 8,
      boundaryCount: 3,
      cardTypeCount: 2,
    })
    expect(result.packs.find((pack) => pack.name === 'Обычный')).toMatchObject({
      id: 'pack-2',
      cardCount: 92,
      availableTypes: ['truth', 'dare'],
    })
  })

  it('derives stable pack ids from source row numbers and links cards to them', () => {
    const workbook = createValidWorkbook()
    const result = importGameDataFromWorkbook(workbook)

    expect(result.packs[0].id).toBe('pack-2')
    expect(result.cards[0].packId).toBe('pack-2')
  })

  it('reports a missing sheet', () => {
    const workbook = createValidWorkbook()
    workbook.removeWorksheet(workbook.getWorksheet('Паки')!.id)

    expect(validationMessage(workbook)).toContain('отсутствует обязательный лист «Паки»')
  })

  it('reports a missing required column', () => {
    const workbook = createValidWorkbook()
    workbook.getWorksheet('Вопросы')!.getCell('G1').value = null

    expect(validationMessage(workbook)).toContain('отсутствует обязательная колонка «Другие игроки»')
  })

  it.each([
    ['duplicate id', 'A3', 1, 'id «1» указан повторно'],
    ['empty text', 'B2', '   ', 'значение не может быть пустым'],
    ['invalid card type', 'C2', 'Выбор', 'недопустимый тип карточки «Выбор»'],
    ['missing pack', 'D2', 'Нет такого', 'пак «Нет такого» не существует'],
    ['missing boundary', 'E2', 'Нет такой', 'грань «Нет такой» не существует'],
    ['invalid relationship', 'F2', 'Иногда', 'ожидалось «Да» или «Нет»'],
    ['negative players', 'G2', -1, 'целым неотрицательным числом'],
    ['fractional players', 'G2', 1.5, 'целым неотрицательным числом'],
    ['empty players', 'G2', '', 'целым неотрицательным числом'],
  ])('reports %s with a cell and card id', (_name, address, value, expectedReason) => {
    const workbook = createValidWorkbook()
    const questions = workbook.getWorksheet('Вопросы')!
    if (address === 'A3') {
      questions.addRow([1, 'Ещё вопрос.', 'Правда', 'Обычный', 'Целочка', 'Да', 0])
    } else {
      questions.getCell(address).value = value
    }

    const message = validationMessage(workbook)
    expect(message).toContain(`Вопросы!${address}`)
    expect(message).toContain('id=1')
    expect(message).toContain(expectedReason)
  })

  it('requires a complete sequential set of player tokens', () => {
    const workbook = createValidWorkbook()
    const questions = workbook.getWorksheet('Вопросы')!
    questions.getCell('B2').value = '*PLAYER* и *PLAYER3* отвечают.'
    questions.getCell('G2').value = 2

    const message = validationMessage(workbook)
    expect(message).toContain('ожидались 1, 2, найдены 1, 3')
  })

  it('allows repeated references to the same player and PHONE_NUM', () => {
    const workbook = createValidWorkbook()
    const questions = workbook.getWorksheet('Вопросы')!
    questions.getCell('B2').value = '*PLAYER* звонит *PLAYER* на *PHONE_NUM*.'
    questions.getCell('G2').value = 1

    const result = importGameDataFromWorkbook(workbook)
    expect(result.cards).toHaveLength(1)
  })

  it('rejects unknown tokens', () => {
    const workbook = createValidWorkbook()
    workbook.getWorksheet('Вопросы')!.getCell('B2').value = 'Позвони на *SOME_NUMBER*.'

    expect(validationMessage(workbook)).toContain('неизвестный токен «*SOME_NUMBER*»')
  })

  it('rejects malformed player tokens', () => {
    const workbook = createValidWorkbook()
    workbook.getWorksheet('Вопросы')!.getCell('B2').value = 'Ответь вместе с *PLAYER 2*.'

    expect(validationMessage(workbook)).toContain('неизвестный токен «*PLAYER 2*»')
  })

  it.each(['*PLAYER', 'PLAYER*', '*PHONE_NUM', '**PLAYER**', '*PLAYER**'])('rejects unmatched token delimiters in %s', (text) => {
    const workbook = createValidWorkbook()
    workbook.getWorksheet('Вопросы')!.getCell('B2').value = `Ответь ${text}.`
    expect(validationMessage(workbook)).toContain('некорректная конструкция токена')
  })

  it('allows ordinary asterisks that are not token-like', () => {
    const workbook = createValidWorkbook()
    workbook.getWorksheet('Вопросы')!.getCell('B2').value = 'Оцени 2 * 2 и слово *важно*.'
    expect(importGameDataFromWorkbook(workbook).cards).toHaveLength(1)
  })

  it('rejects a renamed required boundary with its cell', () => {
    const workbook = createValidWorkbook()
    workbook.getWorksheet('Грани')!.getCell('A2').value = 'Другая грань'
    const message = validationMessage(workbook)
    expect(message).toContain('Грани!A2')
    expect(message).toContain('неподдерживаемая грань')
  })

  it('rejects a wrong required boundary level with its cell', () => {
    const workbook = createValidWorkbook()
    workbook.getWorksheet('Грани')!.getCell('B3').value = 7
    const message = validationMessage(workbook)
    expect(message).toContain('Грани!B3')
    expect(message).toContain('ожидается уровень 1, получен 7')
  })

  it('rejects a missing required boundary', () => {
    const workbook = createValidWorkbook()
    workbook.getWorksheet('Грани')!.spliceRows(4, 1)
    expect(validationMessage(workbook)).toContain('отсутствует обязательная грань «Полный раж»')
  })

  it('rejects an extra incompatible boundary', () => {
    const workbook = createValidWorkbook()
    workbook.getWorksheet('Грани')!.addRow(['Лишняя', 3, 'Не поддерживается'])
    expect(validationMessage(workbook)).toContain('неподдерживаемая грань «Лишняя»')
  })

  it('resolves direct formula references without using cached results', () => {
    const workbook = createValidWorkbook()
    workbook.getWorksheet('Вопросы')!.getCell('D2').value = {
      formula: "'Паки'!$A$2",
      result: 'Неверное cached value',
    }

    const result = importGameDataFromWorkbook(workbook)
    expect(result.cards[0].pack).toBe('Обычный')
  })

  it('rejects unsupported formulas with an exact location', () => {
    const workbook = createValidWorkbook()
    workbook.getWorksheet('Вопросы')!.getCell('G2').value = {
      formula: 'SUM(0, 1)',
      result: 1,
    }

    const message = validationMessage(workbook)
    expect(message).toContain('Вопросы!G2')
    expect(message).toContain('формула «SUM(0, 1)» не поддерживается')
  })
})
