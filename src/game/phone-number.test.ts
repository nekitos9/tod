import { describe, expect, it } from 'vitest'
import type { PhoneRangeGroup } from '../data/phone-data'
import { phoneRangeGroups } from '../generated/phone-data'
import { generatePhoneNumber, isPhoneDaytime, refreshPhoneNumber } from './phone-number'

const groups: readonly PhoneRangeGroup[] = [
  { regions: ['Москва'], timeZones: ['Europe/Moscow'], ranges: [[9000100000, 9000100002]] },
  { regions: ['Камчатка'], timeZones: ['Asia/Kamchatka'], ranges: [[9000200000, 9000200006]] },
]
const random = (value: number) => ({ next: () => value })
const nationalNumber = (phone: string) => Number(phone.replace(/\D/g, '').slice(1))

describe('displayed phone freshness', () => {
  const kamchatka = '+7 (962) 216-49-82'
  it('identifies the reported number by its full range and keeps it at 01:05 Moscow', () => {
    const group = phoneRangeGroups.find((item) => item.ranges.some(([a, b]) => 9622164982 >= a && 9622164982 <= b))!
    expect(group.regions).toEqual(['Камчатский край'])
    expect(refreshPhoneNumber(kamchatka, random(0), new Date('2026-09-26T01:05:00+03:00'))).toBe(kamchatka)
  })
  it('replaces a saved number when its destination has entered the night', () => {
    const now = new Date('2026-09-26T12:00:00+03:00') // Kamchatka 21:00
    const updated = refreshPhoneNumber(kamchatka, random(0), now)
    expect(updated).not.toBe(kamchatka)
    const group = phoneRangeGroups.find((item) => item.ranges.some(([a, b]) => nationalNumber(updated) >= a && nationalNumber(updated) <= b))!
    expect(isPhoneDaytime(group.timeZones, now)).toBe(true)
    expect(refreshPhoneNumber(updated, random(0.9), now)).toBe(updated)
  })
})

describe('phone time window', () => {
  it.each([
    ['2026-09-23T05:59:59.999Z', false], // Moscow 08:59
    ['2026-09-23T06:00:00.000Z', true],
    ['2026-09-23T17:59:59.999Z', true],
    ['2026-09-23T18:00:00.000Z', false],
  ])('uses 09:00 inclusive and 21:00 exclusive at %s', (instant, expected) => {
    expect(isPhoneDaytime(['Europe/Moscow'], new Date(instant))).toBe(expected)
  })

  it('handles midnight and the next calendar day in the destination region', () => {
    expect(isPhoneDaytime(['Asia/Kamchatka'], new Date('2026-09-23T12:00:00Z'))).toBe(false)
    expect(isPhoneDaytime(['Asia/Kamchatka'], new Date('2026-09-23T21:00:00Z'))).toBe(true)
  })

  it('checks every possible zone rather than assuming the regional capital', () => {
    const yakutia = ['Asia/Yakutsk', 'Asia/Vladivostok', 'Asia/Srednekolymsk']
    expect(isPhoneDaytime(yakutia, new Date('2026-09-23T00:00:00Z'))).toBe(true)
    expect(isPhoneDaytime(yakutia, new Date('2026-09-23T10:00:00Z'))).toBe(false)
  })

  it('does not silently use the local timezone when time data is unknown', () => {
    expect(isPhoneDaytime([], new Date())).toBe(false)
    expect(isPhoneDaytime(['Unknown/Zone'], new Date())).toBe(false)
    expect(isPhoneDaytime(['Europe/Moscow'], new Date(NaN))).toBe(false)
  })
})

describe('regional phone generation', () => {
  it('distinguishes regions within the same DEF code and avoids the nighttime range', () => {
    expect(generatePhoneNumber(random(0), new Date('2026-09-23T02:00:00Z'), groups)).toBe('+7 (900) 020-00-00')
    expect(generatePhoneNumber(random(0.999999), new Date('2026-09-23T12:00:00Z'), groups)).toBe('+7 (900) 010-00-02')
  })

  it('uses the same instant regardless of the caller timezone representation', () => {
    expect(generatePhoneNumber(random(0.5), new Date('2026-09-23T05:00:00+03:00'), groups))
      .toBe(generatePhoneNumber(random(0.5), new Date('2026-09-22T22:00:00-04:00'), groups))
  })

  it('falls back to known ranges when all regions are outside the time window', () => {
    const night = new Date('2026-09-23T18:00:00Z')
    expect(groups.every((group) => !isPhoneDaytime(group.timeZones, night))).toBe(true)
    expect(generatePhoneNumber(random(0), night, groups)).toBe('+7 (900) 010-00-00')
    expect(generatePhoneNumber(random(0.999999), night, groups)).toBe('+7 (900) 020-00-06')
  })

  it('weights ranges by capacity and includes both endpoints', () => {
    const bothAwake = new Date('2026-09-23T06:00:00Z')
    expect(generatePhoneNumber(random(0.2), bothAwake, groups)).toBe('+7 (900) 010-00-02')
    expect(generatePhoneNumber(random(0.3), bothAwake, groups)).toBe('+7 (900) 020-00-00')
    expect(generatePhoneNumber(random(0.999999), bothAwake, groups)).toBe('+7 (900) 020-00-06')
  })

  it.each([-0.1, 1, NaN])('rejects invalid random output %s', (value) => {
    expect(() => generatePhoneNumber(random(value), new Date(), groups)).toThrow(RangeError)
  })

  it('generates allocated, daytime numbers from the bundled snapshot throughout a day', () => {
    for (let hour = 0; hour < 24; hour += 1) {
      const now = new Date(Date.UTC(2026, 8, 23, hour))
      const eligible = phoneRangeGroups.filter((group) => isPhoneDaytime(group.timeZones, now))
      const pool = eligible.length ? eligible : phoneRangeGroups
      for (const value of [0, 0.25, 0.5, 0.75, 0.999999999]) {
        const phone = generatePhoneNumber(random(value), now)
        expect(phone).toMatch(/^\+7 \(9\d{2}\) \d{3}-\d{2}-\d{2}$/)
        const number = nationalNumber(phone)
        expect(pool.some((group) => group.ranges.some(([start, end]) => number >= start && number <= end))).toBe(true)
      }
    }
  })
})
