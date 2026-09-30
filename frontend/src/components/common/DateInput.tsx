import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '../ui/dialog'
import { calendarDate, inputDateText, isoDay, parseDateInput, todayInLab } from '../../lib/date'
import './date-input.css'

type Props = { name: string; type?: 'date' | 'datetime-local'; required?: boolean; disabled?: boolean; defaultValue?: string; 'aria-label'?: string }

export function DateInput({ name, type = 'date', required, disabled, defaultValue = '', 'aria-label': label = '日期' }: Props) {
  const withTime = type === 'datetime-local'
  const id = useId()
  const input = useRef<HTMLInputElement>(null)
  const calendar = useRef<HTMLDivElement>(null)
  const [text, setText] = useState(() => inputDateText(defaultValue))
  const [invalid, setInvalid] = useState(false)
  const [open, setOpen] = useState(false)
  const [day, setDay] = useState('')
  const [view, setView] = useState(() => todayInLab().slice(0, 7))
  const [focusDay, setFocusDay] = useState('')
  const [hour, setHour] = useState('09')
  const [minute, setMinute] = useState('00')
  const value = parseDateInput(text, withTime)
  const error = withTime ? '请输入有效日期和时间，例如 2026年09月30日 14:30' : '请输入有效日期，例如 2026年09月30日'

  useEffect(() => {
    const form = input.current?.form
    const reset = () => { setText(inputDateText(defaultValue)); setInvalid(false); setOpen(false); input.current?.setCustomValidity('') }
    form?.addEventListener('reset', reset)
    return () => form?.removeEventListener('reset', reset)
  }, [defaultValue])
  useEffect(() => { input.current?.setCustomValidity(text && !value ? error : '') }, [text, value, error])
  useEffect(() => { if (open && focusDay) calendar.current?.querySelector<HTMLButtonElement>(`[data-day="${focusDay}"]`)?.focus() }, [open, focusDay, view])

  function openPicker(next: boolean) {
    if (next) {
      const current = value?.slice(0, 10) ?? todayInLab()
      setDay(value?.slice(0, 10) ?? ''); setView(current.slice(0, 7)); setFocusDay(current)
      setHour(value?.slice(11, 13) || '09'); setMinute(value?.slice(14, 16) || '00')
    }
    setOpen(next)
  }
  function select(next: string) {
    setText(inputDateText(next)); setInvalid(false); input.current?.setCustomValidity(''); setOpen(false)
  }
  const [year, month] = view.split('-').map(Number)
  const count = calendarDate(year, month + 1, 0).getUTCDate()
  const offset = (calendarDate(year, month, 1).getUTCDay() + 6) % 7
  const cells = Array.from({ length: Math.ceil((offset + count) / 7) * 7 }, (_, index) => index - offset + 1)
  const chosen = parseDateInput(`${day}T${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`, true)

  function moveMonth(delta: number) {
    const date = calendarDate(year, month + delta, 1)
    if (date.getUTCFullYear() < 1 || date.getUTCFullYear() > 9999) return
    setView(isoDay(date).slice(0, 7)); setFocusDay(isoDay(date))
  }
  function moveDay(event: KeyboardEvent<HTMLButtonElement>, current: string) {
    const date = calendarDate(year, month, Number(current.slice(8)))
    const shifts: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7, Home: -((date.getUTCDay() + 6) % 7), End: 6 - ((date.getUTCDay() + 6) % 7) }
    if (event.key === 'PageUp' || event.key === 'PageDown') { event.preventDefault(); moveMonth(event.key === 'PageUp' ? -1 : 1); return }
    if (!(event.key in shifts)) return
    event.preventDefault(); date.setUTCDate(date.getUTCDate() + shifts[event.key])
    if (date.getUTCFullYear() < 1 || date.getUTCFullYear() > 9999) return
    const next = isoDay(date); setView(next.slice(0, 7)); setFocusDay(next)
  }

  return <div className="date-input">
    <input type="hidden" name={name} value={value ?? ''} disabled={disabled} />
    <input ref={input} className="text-input" type="text" aria-label={label} aria-invalid={invalid || undefined} aria-describedby={invalid ? `${id}-error` : undefined} placeholder={withTime ? '年/月/日 时:分' : '年/月/日'} value={text} required={required} disabled={disabled} autoComplete="off" maxLength={24}
      onChange={event => { setText(event.target.value); setInvalid(false); event.currentTarget.setCustomValidity(event.target.value && !parseDateInput(event.target.value, withTime) ? error : '') }}
      onBlur={() => { if (value) setText(inputDateText(value)) }}
      onInvalid={event => { event.preventDefault(); setInvalid(true); input.current?.focus() }} />
    <Dialog open={open} onOpenChange={openPicker}>
      <DialogTrigger asChild><button type="button" className="date-picker-trigger" aria-label="打开日历" title={`${label}，选择日期`} disabled={disabled}><CalendarDays size={16} aria-hidden="true" /></button></DialogTrigger>
      <DialogContent className="date-picker" overlayClassName="date-picker-overlay" onOpenAutoFocus={event => { event.preventDefault(); calendar.current?.querySelector<HTMLButtonElement>(`[data-day="${focusDay}"]`)?.focus() }}>
        <DialogTitle>选择{withTime ? '日期与时间' : '日期'}</DialogTitle><DialogDescription className="sr-only">{label}。可用方向键选择日期，使用北京时间。</DialogDescription>
        <div className="date-calendar-heading"><button type="button" aria-label="上个月" onClick={() => moveMonth(-1)} disabled={year === 1 && month === 1}><ChevronLeft size={16} /></button><strong id={`${id}-month`} aria-live="polite">{year}年{month}月</strong><button type="button" aria-label="下个月" onClick={() => moveMonth(1)} disabled={year === 9999 && month === 12}><ChevronRight size={16} /></button></div>
        <div ref={calendar} role="grid" aria-labelledby={`${id}-month`} className="date-calendar">
          <div role="row">{['一', '二', '三', '四', '五', '六', '日'].map(week => <span key={week} role="columnheader">{week}</span>)}</div>
          {Array.from({ length: cells.length / 7 }, (_, week) => <div role="row" key={week}>{cells.slice(week * 7, week * 7 + 7).map(number => {
            if (number < 1 || number > count) return <span role="gridcell" key={number} />
            const next = `${view}-${String(number).padStart(2, '0')}`
            return <span role="gridcell" aria-selected={day === next} key={number}><button type="button" data-day={next} tabIndex={focusDay === next ? 0 : -1} aria-label={inputDateText(next)} aria-current={next === todayInLab() ? 'date' : undefined} onFocus={() => setFocusDay(next)} onKeyDown={event => moveDay(event, next)} onClick={() => { if (withTime) setDay(next); else select(next) }}>{number}</button></span>
          })}</div>)}
        </div>
        {withTime && <div className="date-picker-time"><span>时间</span><input type="text" aria-label="小时" inputMode="numeric" maxLength={2} value={hour} onChange={event => setHour(event.target.value.replace(/\D/g, ''))} /><span>时</span><input type="text" aria-label="分钟" inputMode="numeric" maxLength={2} value={minute} onChange={event => setMinute(event.target.value.replace(/\D/g, ''))} /><span>分</span></div>}
        <div className="date-picker-footer"><button type="button" onClick={() => { const today = todayInLab(); setView(today.slice(0, 7)); setFocusDay(today); if (withTime) setDay(today); else select(today) }}>今天</button><button type="button" onClick={() => select('')}>清空</button>{withTime && <button type="button" className="date-picker-confirm" disabled={!chosen || !hour || !minute} onClick={() => { if (chosen) select(chosen) }}>确定</button>}</div>
      </DialogContent>
    </Dialog>
    {invalid && <small className="date-input-error" id={`${id}-error`} role="alert">{text ? error : '请填写日期'}</small>}
  </div>
}
