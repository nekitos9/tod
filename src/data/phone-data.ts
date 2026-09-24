export interface PhoneRangeGroup {
  readonly regions: readonly string[]
  readonly timeZones: readonly string[]
  /** Ten national digits, without +7; both bounds are inclusive. */
  readonly ranges: readonly (readonly [number, number])[]
}
