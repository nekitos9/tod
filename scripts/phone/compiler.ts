import type { PhoneRangeGroup } from '../../src/data/phone-data.ts'

export interface PhoneSource {
  readonly r: readonly (readonly string[])[]
  readonly c: Readonly<Record<string, readonly (readonly number[])[]>>
}

export type TimezoneSource = Readonly<Record<string, string | {
  readonly default: string
  readonly byDistrict: Readonly<Record<string, string>>
}>>

export function compilePhoneData(
  mobile: PhoneSource,
  regions: readonly { slug: string; name: string }[],
  timezones: TimezoneSource,
): { groups: PhoneRangeGroup[]; excludedBlocks: number } {
  const names = new Map(regions.map((region) => [region.slug, region.name]))
  const groups = new Map<number, { regions: string[]; timeZones: string[]; ranges: [number, number][] }>()
  const allRanges: [number, number][] = []
  let excludedBlocks = 0
  for (const [code, blocks] of Object.entries(mobile.c)) {
    if (!/^9\d{2}$/.test(code)) throw new Error(`Недопустимый мобильный код: ${code}`)
    for (const [index, block] of blocks.entries()) {
      const [start, end, , regionIndex] = block
      const location = `${code}, диапазон ${index + 1}`
      if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end > 9_999_999 || start > end) {
        throw new Error(`${location}: неверные границы диапазона`)
      }
      const slugs = mobile.r[regionIndex]
      if (!Number.isInteger(regionIndex) || !slugs?.length) throw new Error(`${location}: нет региона`)
      const range: [number, number] = [Number(code) * 10_000_000 + start, Number(code) * 10_000_000 + end]
      allRanges.push(range)
      // Nationwide allocations cannot establish the recipient's local time.
      if (slugs.includes('all-russia')) {
        excludedBlocks += 1
        continue
      }
      if (!groups.has(regionIndex)) {
        const zones = slugs.flatMap((slug) => {
          if (!names.has(slug) || !timezones[slug]) throw new Error(`${location}: неизвестный регион ${slug}`)
          const entry = timezones[slug]
          // A mobile allocation for all of Sakha does not establish a district.
          return typeof entry === 'string' ? [entry] : [entry.default, ...Object.values(entry.byDistrict)]
        })
        const uniqueZones = [...new Set(zones)].sort()
        for (const zone of uniqueZones) new Intl.DateTimeFormat('en', { timeZone: zone })
        groups.set(regionIndex, { regions: slugs.map((slug) => names.get(slug)!), timeZones: uniqueZones, ranges: [] })
      }
      groups.get(regionIndex)!.ranges.push(range)
    }
  }
  allRanges.sort((a, b) => a[0] - b[0])
  for (let i = 1; i < allRanges.length; i += 1) {
    if (allRanges[i][0] <= allRanges[i - 1][1]) throw new Error(`Пересечение телефонных диапазонов: ${allRanges[i][0]}`)
  }
  if (!groups.size) throw new Error('Нет мобильных диапазонов с известным часовым поясом')
  for (const group of groups.values()) {
    group.ranges.sort((a, b) => a[0] - b[0])
    const merged: [number, number][] = []
    for (const range of group.ranges) {
      const previous = merged.at(-1)
      if (previous && previous[1] + 1 === range[0]) previous[1] = range[1]
      else merged.push([...range])
    }
    group.ranges = merged
  }
  return { groups: [...groups.values()], excludedBlocks }
}
