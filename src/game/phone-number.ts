import type { PhoneRangeGroup } from '../data/phone-data'
import { phoneRangeGroups } from '../generated/phone-data'
import { nextRandom, type RandomSource } from './random'

const formatters = new Map<string, Intl.DateTimeFormat>()

export function isPhoneDaytime(timeZones: readonly string[], now: Date): boolean {
  if (!timeZones.length || !Number.isFinite(now.getTime())) return false
  return timeZones.every((timeZone) => {
    try {
      let formatter = formatters.get(timeZone)
      if (!formatter) {
        formatter = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', hour12: false })
        formatters.set(timeZone, formatter)
      }
      // formatToParts is missing on webOS 3.x. Formatting only the hour also
      // works there; some Intl versions represent midnight as 24.
      const hour = Number(formatter.format(now)) % 24
      return hour >= 9 && hour < 21
    } catch {
      // Older browsers may lack a timezone; do not treat it as the user's zone.
      return false
    }
  })
}

export function generatePhoneNumber(
  random: RandomSource,
  now = new Date(),
  groups: readonly PhoneRangeGroup[] = phoneRangeGroups,
): string {
  const daytime = groups.filter((group) => isPhoneDaytime(group.timeZones, now))
  // User-approved fallback: still supply a number when every known region is asleep.
  const pool = daytime.length ? daytime : groups
  const capacity = pool.reduce((sum, group) =>
    sum + group.ranges.reduce((total, [start, end]) => total + end - start + 1, 0), 0)
  if (!capacity) throw new Error('База телефонных диапазонов пуста')
  // Weight by number capacity, not by how many blocks an operator split it into.
  let offset = Math.floor(nextRandom(random) * capacity)
  for (const group of pool) {
    for (const [start, end] of group.ranges) {
      const size = end - start + 1
      if (offset < size) {
        const digits = String(start + offset)
        return `+7 (${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 8)}-${digits.slice(8, 10)}`
      }
      offset -= size
    }
  }
  throw new Error('Не удалось выбрать номер из диапазона')
}

/** Keep a displayed number unless its region is now asleep and a daytime alternative exists. */
export function refreshPhoneNumber(phone: string, random: RandomSource, now = new Date()): string {
  const number = Number(phone.replace(/\D/g, '').slice(1))
  const current = phoneRangeGroups.find((group) => group.ranges.some(([start, end]) => number >= start && number <= end))
  if (current && isPhoneDaytime(current.timeZones, now)) return phone
  const daytime = phoneRangeGroups.filter((group) => isPhoneDaytime(group.timeZones, now))
  // Preserve the approved random fallback rather than changing it every minute.
  return daytime.length ? generatePhoneNumber(random, now, daytime) : phone
}
