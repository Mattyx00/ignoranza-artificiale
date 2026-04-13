'use client'

import { useState, useCallback, type KeyboardEvent } from 'react'
import { cn } from '@/lib/utils'
import Button from '@/components/ui/Button'
import { Send } from 'lucide-react'

export interface ChatInputBarProps {
  onSend: (text: string) => void
  disabled: boolean
}

export default function ChatInputBar({ onSend, disabled }: ChatInputBarProps) {
  const [value, setValue] = useState('')

  const handleSend = useCallback(() => {
    const trimmed = value.trim()
    if (!trimmed || disabled) return
    onSend(trimmed)
    setValue('')
  }, [value, disabled, onSend])

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
        e.preventDefault()
        handleSend()
      }
    },
    [handleSend],
  )

  return (
    <div className="border-t border-[--border] bg-[--background] px-3 sm:px-4 pt-3 pb-safe">
      <div className="flex gap-2 sm:gap-3 items-end">
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          rows={2}
          placeholder="Inserisca la sua richiesta. Verrà gestita con la massima incompetenza."
          aria-label="Messaggio"
          className={cn(
            'flex-1 resize-none bg-[--surface] border border-[--border]',
            'text-[--text-primary] font-body text-sm placeholder:text-[--text-muted]',
            'px-3 py-2 rounded-sm',
            'focus:outline-none focus:border-[--text-muted]',
            'transition-colors duration-150',
            'disabled:opacity-40 disabled:cursor-not-allowed',
            /* Prevent iOS auto-zoom: font-size must be >= 16px on mobile */
            'text-base sm:text-sm',
          )}
        />
        <Button
          variant="primary"
          size="md"
          onClick={handleSend}
          disabled={disabled || !value.trim()}
          aria-label="Invia messaggio"
          className="shrink-0 gap-1.5 self-stretch min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0"
        >
          <Send size={14} />
          <span className="hidden sm:inline">Invia</span>
        </Button>
      </div>
      <p className="text-[10px] font-mono text-[--text-muted] mt-1.5 ml-0.5 hidden sm:block">
        Shift+Enter per andare a capo
      </p>
    </div>
  )
}
