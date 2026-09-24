import { describe, expect, it } from 'vitest'
import { compilePhoneData, type PhoneSource } from './compiler'

const regions = [{ slug: 'moscow', name: 'Москва' }, { slug: 'sakha', name: 'Якутия' }]
const zones = {
  moscow: 'Europe/Moscow',
  sakha: { default: 'Asia/Yakutsk', byDistrict: { east: 'Asia/Srednekolymsk', middle: 'Asia/Ust-Nera' } },
}
const source: PhoneSource = {
  r: [['moscow'], ['sakha'], ['all-russia']],
  c: { '900': [[0, 99, 0, 0], [100, 199, 1, 0], [300, 399, 0, 1], [500, 599, 0, 2]] },
}

describe('phone dataset compilation', () => {
  it('merges adjacent allocations without filling gaps or losing regional timezones', () => {
    const result = compilePhoneData(source, regions, zones)
    expect(result.excludedBlocks).toBe(1)
    expect(result.groups).toEqual([
      { regions: ['Москва'], timeZones: ['Europe/Moscow'], ranges: [[9000000000, 9000000199]] },
      { regions: ['Якутия'], timeZones: ['Asia/Srednekolymsk', 'Asia/Ust-Nera', 'Asia/Yakutsk'], ranges: [[9000000300, 9000000399]] },
    ])
  })

  it('does not guess timezones for unrecognized regions', () => {
    expect(() => compilePhoneData({ r: [['unknown']], c: { '900': [[0, 99, 0, 0]] } }, regions, zones)).toThrow('неизвестный регион')
  })

  it.each([[100, 99, 0, 0], [-1, 99, 0, 0], [0, 10_000_000, 0, 0], [0.5, 99, 0, 0]])('rejects invalid bounds %j', (...block) => {
    expect(() => compilePhoneData({ ...source, c: { '900': [block] } }, regions, zones)).toThrow('границы диапазона')
  })

  it('rejects overlaps across regions instead of double-counting numbers', () => {
    expect(() => compilePhoneData({ ...source, c: { '900': [[0, 99, 0, 0], [99, 199, 0, 1]] } }, regions, zones)).toThrow('Пересечение')
  })
})
