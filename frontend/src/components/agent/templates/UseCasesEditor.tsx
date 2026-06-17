"use client"

import { useState, KeyboardEvent } from "react"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"

interface UseCasesEditorProps {
  value: string[]
  onChange: (next: string[]) => void
  placeholder?: string
  className?: string
}

export function UseCasesEditor({
  value,
  onChange,
  placeholder = "Type an example phrase and press Enter",
  className,
}: UseCasesEditorProps) {
  const [draft, setDraft] = useState("")

  const addPhrase = (raw: string) => {
    const phrase = raw.trim()
    if (!phrase) return
    if (value.some((v) => v.toLowerCase() === phrase.toLowerCase())) return
    onChange([...value, phrase])
    setDraft("")
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault()
      addPhrase(draft)
    }
  }

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex flex-wrap gap-1.5 min-h-[28px]">
        {value.map((phrase) => (
          <span
            key={phrase}
            className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-1 text-xs text-indigo-800"
          >
            {phrase}
            <button
              type="button"
              onClick={() => onChange(value.filter((p) => p !== phrase))}
              className="rounded-full p-0.5 hover:bg-indigo-100"
              aria-label={`Remove ${phrase}`}
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
      </div>
      <input
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={() => addPhrase(draft)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700 placeholder:text-gray-300 outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
      />
    </div>
  )
}
