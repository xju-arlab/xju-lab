import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown } from 'lucide-react'

export type ComboOption = { value: string; label: string }
type ComboBoxProps = {
  options: ComboOption[]
  name?: string
  placeholder?: string
  disabled?: boolean
  inlineMenu?: boolean
  required?: boolean
} & ({ multiple?: false; value?: string; defaultValue?: string; onValueChange?: (value: string) => void }
  | { multiple: true; value?: string[]; defaultValue?: string[]; onValueChange?: (value: string[]) => void })

export function ComboBox(props: ComboBoxProps) {
  const { options, name, value, defaultValue, placeholder = '请选择', disabled = false, inlineMenu = false, required = false } = props
  const asValues = (input: string | string[] | undefined) => input === undefined ? [] : Array.isArray(input) ? input : [input]
  const initialValues = () => asValues(defaultValue ?? (props.multiple ? [] : options[0]?.value ?? ''))
  const id = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [internalValues, setInternalValues] = useState(initialValues)
  const [invalid, setInvalid] = useState(false)
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const [position, setPosition] = useState<{ top: number; left: number; width: number; maxHeight: number } | null>(null)
  const selectedValues = (value === undefined ? internalValues : asValues(value)).filter(item => options.some(option => option.value === item))
  const selectedOptions = options.filter(option => selectedValues.includes(option.value))

  useEffect(() => {
    const form = triggerRef.current?.form
    const reset = () => { setInternalValues(initialValues()); setInvalid(false); setOpen(false) }
    form?.addEventListener('reset', reset)
    return () => form?.removeEventListener('reset', reset)
  }, [JSON.stringify(defaultValue), options[0]?.value, props.multiple])

  useEffect(() => {
    if (open) menuRef.current?.querySelectorAll('[role="option"]')[activeIndex]?.scrollIntoView({ block: 'nearest' })
  }, [open, activeIndex])

  function choose(option: ComboOption) {
    const next = props.multiple ? selectedValues.includes(option.value) ? selectedValues.filter(item => item !== option.value) : [...selectedValues, option.value] : [option.value]
    if (value === undefined) setInternalValues(next)
    if (props.multiple) props.onValueChange?.(next)
    else props.onValueChange?.(option.value)
    setInvalid(false)
    if (!props.multiple) setOpen(false)
    triggerRef.current?.focus()
  }

  function updatePosition() {
    const rect = triggerRef.current?.getBoundingClientRect()
    if (!rect) return
    const below = window.innerHeight - rect.bottom - 8
    const above = rect.top - 8
    const estimatedHeight = Math.min(240, Math.max(1, options.length) * 38 + 8)
    const placeAbove = below < Math.min(estimatedHeight, 150) && above > below
    const maxHeight = Math.max(72, Math.min(240, (placeAbove ? above : below) - 8))
    const height = Math.min(estimatedHeight, maxHeight)
    setPosition({ top: placeAbove ? Math.max(8, rect.top - height - 6) : rect.bottom + 6, left: Math.max(8, Math.min(rect.left, window.innerWidth - rect.width - 8)), width: rect.width, maxHeight })
  }

  useEffect(() => {
    if (!open) return
    updatePosition()
    const closeOutside = (event: PointerEvent) => {
      const target = event.target as Node
      if (!rootRef.current?.contains(target) && !menuRef.current?.contains(target)) setOpen(false)
    }
    document.addEventListener('pointerdown', closeOutside)
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    return () => {
      document.removeEventListener('pointerdown', closeOutside)
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [open, options.length])

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === 'Escape' && open) { event.preventDefault(); setOpen(false); return }
    if (event.key === 'Tab') { setOpen(false); return }
    if (!options.length) return
    const currentIndex = Math.max(0, options.findIndex(option => selectedValues.includes(option.value)))
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (!open) { setActiveIndex(currentIndex); setOpen(true); return }
      setActiveIndex(index => (index + (event.key === 'ArrowDown' ? 1 : options.length - 1)) % options.length)
    } else if (event.key === 'Home' && open) {
      event.preventDefault(); setActiveIndex(0)
    } else if (event.key === 'End' && open) {
      event.preventDefault(); setActiveIndex(options.length - 1)
    } else if ((event.key === 'Enter' || event.key === ' ') && open) {
      event.preventDefault(); if (options[activeIndex]) choose(options[activeIndex])
    }
  }

  const menu = <div ref={menuRef} id={id + '-listbox'} className="combobox-menu" role="listbox" aria-multiselectable={props.multiple || undefined} style={inlineMenu ? { position: 'absolute', top: '100%', left: 0, width: '100%', maxHeight: 200 } : position ? { top: position.top, left: position.left, width: position.width, maxHeight: position.maxHeight } : { visibility: 'hidden' }}>
    {options.map((option, index) => <div key={option.value} id={id + '-option-' + index} role="option" aria-selected={selectedValues.includes(option.value)} className={'combobox-option' + (index === activeIndex ? ' active' : '') + (selectedValues.includes(option.value) ? ' selected' : '')} onMouseMove={() => setActiveIndex(index)} onMouseDown={event => event.preventDefault()} onClick={() => choose(option)}>{option.label}{selectedValues.includes(option.value) && <Check size={14} />}</div>)}
    {!options.length && <div className="combobox-empty">暂无可选项</div>}
  </div>
  return <div className="combobox" ref={rootRef} style={inlineMenu ? { position: 'relative' } : undefined}>
    {name && selectedValues.map(item => <input key={item} type="hidden" name={name} value={item} disabled={disabled} />)}
    <button ref={triggerRef} type="button" className="combobox-trigger" aria-haspopup="listbox" aria-expanded={open} aria-invalid={invalid || undefined} aria-describedby={invalid ? id + '-error' : undefined} aria-controls={id + '-listbox'} aria-activedescendant={open && options.length ? id + '-option-' + activeIndex : undefined} disabled={disabled} onClick={() => { if (open) setOpen(false); else { setActiveIndex(Math.max(0, options.findIndex(option => selectedValues.includes(option.value)))); setOpen(true) } }} onKeyDown={handleKeyDown}>
      <span className={!selectedOptions.length ? 'combobox-placeholder' : ''}>{selectedOptions.length ? selectedOptions.map(option => option.label).join('、') : placeholder}</span><ChevronDown size={15} aria-hidden="true" />
    </button>
    {required && <input className="combobox-validation" tabIndex={-1} aria-hidden="true" required disabled={disabled} value={selectedValues.filter(Boolean).join(',')} onChange={() => {}} onInvalid={event => { event.preventDefault(); setInvalid(true); triggerRef.current?.focus() }} />}
    {invalid && <small id={id + '-error'} className="combobox-error" role="alert">请选择一项</small>}
    {open && (inlineMenu ? menu : createPortal(menu, document.body))}
  </div>
}
