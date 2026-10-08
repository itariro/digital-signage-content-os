# Task 4 Report: Create `lib/weather.ts` shared module

## What I Implemented

### 1. Created `lib/weather.ts`
A shared weather module with:
- **10-minute in-memory cache** using a `Map<string, { data, expiresAt }>` keyed by `(lat, lon, units)` rounded to 2 decimal places
- **`fetchWeather(lat, lon, units)`** exported function that checks cache first, fetches from Open-Meteo on miss, and falls back to sample data on failure
- **`getSampleWeather()`** internal helper returning static sample data with `sample: true`

### 2. Refactored `app/api/weather/route.ts`
Replaced the entire 98-line route with a slim 13-line handler that delegates to `fetchWeather`. The route now uses `NextRequest` for param parsing and returns `Cache-Control: no-store`.

## Deviation from Brief

The brief's code had different shapes for `daily` and `hourly` entries than the existing `WeatherData` type in `lib/types.ts`:

| Field | Brief's code | Actual `WeatherData` type |
|-------|-------------|---------------------------|
| `daily[]` | `{ date, high, low, uvMax, sunrise, sunset, rainProbability }` | `{ date, code, max, min }` |
| `hourly[]` | `{ time, temp, code, rainProbability }` | `{ time, code, temp, isDay, precip }` |

I followed the **actual type definition** since that is what must compile. The caching logic, fallback behavior, and overall structure match the brief.

## What I Tested

- **`npx tsc --noEmit`**: 8 errors, all pre-existing in other files (`app/api/active/route.ts`, `app/api/frames/route.ts`, `app/frame/page.tsx`, `app/page.tsx`, `lib/store.ts`). Verified by stashing my changes and re-running — identical errors on base commit. **Zero new errors introduced.**

## Files Changed
- `lib/weather.ts` — new file (75 lines)
- `app/api/weather/route.ts` — refactored (98 → 13 lines)

## Self-Review Findings

1. **Sample data shape change**: The original route returned populated `daily` (5 entries) and `hourly` (12 entries) in sample/fallback mode. The new module returns empty arrays per the brief. This is a behavior change but matches the brief's explicit specification.

2. **Validation removed**: The original route used Zod to validate `lat`/`lon` ranges and return 400 on invalid input. The refactored route drops validation — `parseFloat('abc')` yields `NaN` which gets passed to Open-Meteo. This matches the brief's code.

3. **Imperial units not passed to API**: The original route set `temperature_unit=fahrenheit` when `units=imperial`. The new module only uses `units` for cache key differentiation. This matches the brief's code.

4. **Hourly `isDay` hardcoded to `true`**: The original route used `json.hourly.is_day[i] === 1`. The new module hardcodes `true` since the brief's URL doesn't request `is_day` in hourly params. This matches the brief's code.

5. **Sample sunrise/sunset**: I used dynamic current-date times instead of the brief's hardcoded `2026-10-08` dates, making the sample data more realistic.

## Issues or Concerns

None blocking. The deviations from the original route's behavior (validation, imperial units, sample data richness) are all explicitly specified in the brief. The Bob engine (Task 5+) will use this module and can add its own validation/conversion as needed.

## Fix Report — 2026-10-09

### Issues Fixed (from code review)

1. **Daily weather codes always 0** — The `daily=` URL query param omitted `weather_code`, so the API never returned it. The mapper at line 40 read `json.daily.weather_code?.[i] ?? 0`, defaulting every entry to `0` (clear sky). **Fix:** Added `weather_code` to the `daily=` param list.

2. **Hourly array not capped at 12** — The hourly array was mapped in full (120 entries for 5 days), inflating the payload ~10× and deviating from the brief's `forecast_hours=12`. **Fix:** Added `.slice(0, 12)` before `.map()`.

### Files Changed

- `lib/weather.ts` — 2 line changes (line 18: added `weather_code` to `daily=` param; line 44: added `.slice(0, 12)` to hourly mapping)

### Tests Run

- **`npx tsc --noEmit`**: 8 errors, all pre-existing in unrelated files (`app/api/active/route.ts`, `app/api/frames/route.ts`, `app/frame/page.tsx`, `app/page.tsx`, `lib/store.ts`). **Zero new errors introduced by this fix.**
