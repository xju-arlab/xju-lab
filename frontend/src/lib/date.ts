export const LAB_TIME_ZONE = 'Asia/Shanghai'
const pad = (value: number | string) => String(value).padStart(2, '0')

/** Calendar dates stay calendar dates; instants are displayed in the lab timezone. */
export function dateText(value?: string | null, fallback = '—') {
  if (!value) return fallback
  const day = /^(\d{4})[-/](\d{2})[-/](\d{2})$/.exec(value)
  if (day) return `${day[1]}年${day[2]}月${day[3]}日`
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return fallback
  const parts = Object.fromEntries(new Intl.DateTimeFormat('zh-CN', {
    timeZone: LAB_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date).map(part => [part.type, part.value]))
  return `${parts.year}年${parts.month}月${parts.day}日 ${parts.hour}:${parts.minute}`
}

export function calendarDate(year: number, month: number, day: number) {
  const date = new Date(0)
  date.setUTCFullYear(year, month - 1, day)
  date.setUTCHours(0, 0, 0, 0)
  return date
}

export function isoDay(date: Date) {
  return `${String(date.getUTCFullYear()).padStart(4, '0')}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`
}

/** Accept Chinese text and ISO clipboard values without interpreting the browser timezone. */
export function parseDateInput(value: string, withTime = false) {
  const match = /^(\d{4})(?:年|[-/])(\d{1,2})(?:月|[-/])(\d{1,2})日?(?:[T\s]+(\d{1,2}):(\d{2}))?$/.exec(value.trim())
  if (!match || (withTime ? !match[4] : Boolean(match[4]))) return null
  const [, y, m, d, h, min] = match
  const year = Number(y), month = Number(m), day = Number(d)
  const date = calendarDate(year, month, day)
  if (year < 1 || year > 9999 || date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day) return null
  if (withTime && (Number(h) > 23 || Number(min) > 59)) return null
  return `${y}-${pad(m)}-${pad(d)}${withTime ? `T${pad(h)}:${min}` : ''}`
}

export function inputDateText(value: string) {
  return value.replace(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}:\d{2}))?$/, (_, year, month, day, time) => `${year}年${month}月${day}日${time ? ` ${time}` : ''}`)
}

export function todayInLab() {
  return new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10)
}
