import {expect, it} from 'vitest'
import {buildFastResultBundleDraftFromPlanetSport, buildNextOffBundleDraftFromPlanetSport} from '@/app/lib/planetSportToRacingBundles'
import {
  extractPlanetSportRaceIdFromUrl,
  planetSportPayloadFromRacing365Html,
  validateRacecardUrl,
} from '@/app/lib/parseRacecardUrl'

const AINTREE = 'https://racing365.com/en-gb/race/2026-11-07/aintree/william-hill-epic-boosts-ebf-national-hunt-novices-hurdle-qualifier-gbb-race-7039-56437'

const html = String.raw`liveRaceCard\":{\"raceId\":56437,\"meetingName\":\"AINTREE\",\"utcDate\":\"2026-11-07\",\"race\":{\"time\":\"12:40\",\"raceName\":\"William Hill Epic Boosts Ebf Novices Hurdle\",\"distance\":\"20F\",\"going\":\"Good to soft\",\"raceDateIso\":\"2026-11-07\",\"raceRunners\":[{\"number\":1,\"name\":\"BLACK EDDY\",\"bestOdds\":\"3/1\",\"silksUrl\":\"https://resource3.s3-ap-southeast-2.amazonaws.com/jockey/silks/2026/11/07/476191/1.png\",\"jockey\":\"HARRY COBDEN\",\"trainer\":\"MICKEY BOWEN\"},{\"number\":4,\"name\":\"STICK TO THE BOARD\",\"bestOdds\":\"4/5\",\"silksUrl\":\"https://resource3.s3-ap-southeast-2.amazonaws.com/jockey/silks/2026/11/07/476191/4.png\",\"jockey\":\"SAM TWISTON-DAVIES\",\"trainer\":\"NIGEL TWISTON-DAVIES\"}]}}`

it('reads the race id from a dated Racing365 card URL', () => {
  expect(extractPlanetSportRaceIdFromUrl(validateRacecardUrl(AINTREE))).toBe(56437)
})

it('builds Next Off tips from the embedded card, shortest price first', () => {
  const api = planetSportPayloadFromRacing365Html(html)
  expect(api?.RaceID).toBe(56437)
  const draft = buildNextOffBundleDraftFromPlanetSport(api!, AINTREE)
  expect(draft.race.course).toBe('AINTREE')
  expect(draft.race.raceTime).toBe('12:40')
  expect(draft.race.distance).toBe('20F')
  expect(draft.race.going).toBe('Good to soft')
  expect(draft.race.raceDate).toBe('2026-11-07')
  expect(draft.tips.map(tip => [tip.horse, tip.odds])).toEqual([
    ['STICK TO THE BOARD', '4/5'],
    ['BLACK EDDY', '3/1'],
  ])
  expect(draft.tips[0]?.silks?.imageUrl).toContain('/jockey/silks/')
})

const RESULT = 'https://racing365.com/en-gb/results/aintree/1240/56216'
const resultHtml = String.raw`liveResult\":{\"raceId\":56216,\"courseName\":\"AINTREE\",\"displayTime\":\"12:40\",\"raceName\":\"Bet 10 To Get 40 Betmgm Novices' Hurdle\",\"distance\":\"16F\",\"going\":\"Good to soft\",\"utcDate\":\"2026-11-06\",\"rows\":[{\"posSort\":1,\"cardNumber\":4,\"horse\":\"RISKY OBSESSION\",\"sp\":\"1/1\",\"silksUrl\":\"https://resource3.s3-ap-southeast-2.amazonaws.com/jockey/silks/2026/11/06/476041/1.png\"},{\"posSort\":2,\"cardNumber\":2,\"horse\":\"AQUA BLEU\",\"sp\":\"7/2\",\"silksUrl\":\"https://resource3.s3-ap-southeast-2.amazonaws.com/jockey/silks/2026/11/06/476041/2.png\"},{\"posSort\":3,\"cardNumber\":1,\"horse\":\"WATERY BORREN\",\"sp\":\"9/4\"},{\"posSort\":4,\"cardNumber\":3,\"horse\":\"AVIDE\",\"sp\":\"18/1\"}]}`

it('reads the result id from a course, time and result URL', () => {
  expect(extractPlanetSportRaceIdFromUrl(validateRacecardUrl(RESULT))).toBe(56216)
})

it('builds Fast Results from the embedded finishing order', () => {
  const api = planetSportPayloadFromRacing365Html(resultHtml)
  const draft = buildFastResultBundleDraftFromPlanetSport(api!, RESULT)
  expect(draft.result.race.course).toBe('AINTREE')
  expect(draft.result.race.raceTime).toBe('12:40')
  expect(draft.result.race.raceDate).toBe('2026-11-06')
  expect(draft.result.winner).toBe('RISKY OBSESSION')
  expect(draft.result.sp).toBe('1/1')
  expect(draft.result.placings.map(row => [row.position, row.horse, row.sp])).toEqual([
    [1, 'RISKY OBSESSION', '1/1'],
    [2, 'AQUA BLEU', '7/2'],
    [3, 'WATERY BORREN', '9/4'],
    [4, 'AVIDE', '18/1'],
  ])
})
