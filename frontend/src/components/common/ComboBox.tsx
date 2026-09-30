import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown } from 'lucide-react'

export type ComboOption = { value: string; label: string }
type ComboBoxProps = {
  options: ComboOption[]
  name?: string
  value?: string
  defaultValue?: string
  onValueChange?: (value: string) => void
  placeholder?: string
  disabled?: boolean
  inlineMenu?: boolean
}

export function ComboBox({ options, name, value, defaultValue, onValueChange, placeholder = '请选择', disabled = false, inlineMenu = false }: ComboBoxProps) {
  const id = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [internalValue, setInternalValue] = useState(defaultValue ?? options[0]?.value ?? '')
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const [position, setPosition] = useState<{ top: number; left: number; width: number; maxHeight: number } | null>(null)
  const selectedValue = value ?? internalValue
  const selectedOption = options.find(option => option.value === selectedValue)

  function choose(option: ComboOption) {
    if (value === undefined) setInternalValue(option.value)
    onValueChange?.(option.value)
    setOpen(false)
    triggerRef.current?.focus()
  }

  function updatePosition() {
    const rect = triggerRef.current?.getBoundingClientRect()
    if (!rect) return
    const below = window.innerHeight - rect.bottom - 8
    const above = rect.top - 8
    const estimatedHeight = Math.min(240, options.length * 38)
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
    if (!options.length) return
    const currentIndex = Math.max(0, options.findIndex(option => option.value === selectedValue))
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
    } else if (event.key === 'Escape' && open) {
      event.preventDefault(); setOpen(false)
    }
  }

  const menu = <div ref={menuRef} id={id + '-listbox'} className="combobox-menu" role="listbox" style={inlineMenu ? { position: 'absolute', top: '100%', left: 0, width: '100%', maxHeight: 200 } : position ? { top: position.top, left: position.left, width: position.width, maxHeight: position.maxHeight } : { visibility: 'hidden' }}>
    {options.map((option, index) => <div key={option.value} id={id + '-option-' + index} role="option" aria-selected={selectedValue === option.value} className={'combobox-option' + (index === activeIndex ? ' active' : '') + (selectedValue === option.value ? ' selected' : '')} onMouseMove={() => setActiveIndex(index)} onMouseDown={event => event.preventDefault()} onClick={() => choose(option)}>{option.label}{selectedValue === option.value && <Check size={14} />}</div>)}
  </div>
  return <div className="combobox" ref={rootRef} style={inlineMenu ? { position: 'relative' } : undefined}>
    {name && <input type="hidden" name={name} value={selectedValue} readOnly />}
    <button ref={triggerRef} type="button" className="combobox-trigger" aria-haspopup="listbox" aria-expanded={open} aria-controls={id + '-listbox'} aria-activedescendant={open ? id + '-option-' + activeIndex : undefined} disabled={disabled} onClick={() => { if (open) setOpen(false); else { setActiveIndex(Math.max(0, options.findIndex(option => option.value === selectedValue))); setOpen(true) } }} onKeyDown={handleKeyDown}>
      <span className={!selectedOption ? 'combobox-placeholder' : ''}>{selectedOption?.label ?? placeholder}</span><ChevronDown size={15} aria-hidden="true" />
    </button>
    {open && (inlineMenu ? menu : createPortal(menu, document.body))}
  </div>
}
