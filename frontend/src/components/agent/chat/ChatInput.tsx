"use client"

import { useEffect, useState, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Paperclip, Send, X, FileSpreadsheet, ChevronDown, ChevronUp } from "lucide-react"
import { cn } from "@/lib/utils"
import TokenEstimator from "./TokenEstimator"

const ACCEPTED_TYPES = ".csv,.xlsx,.xls"
const MAX_FILE_SIZE = 10 * 1024 * 1024
const MOBILE_QUERY = "(max-width: 640px)"
const CONTEXT_MAX = 500
const CONTEXT_WARN = 400

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

interface ChatInputProps {
  onSend: (message: string, context?: string) => void
  onFileUpload: (file: File, context?: string) => void
  disabled?: boolean
  placeholder?: string
  helperText?: string
}

export function ChatInput({ onSend, onFileUpload, disabled, placeholder, helperText }: ChatInputProps) {
  const [input, setInput] = useState("")
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const [isMobile, setIsMobile] = useState(false)
  const [contextExpanded, setContextExpanded] = useState(false)
  const [contextText, setContextText] = useState("")
  const fileInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const contextRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const media = window.matchMedia(MOBILE_QUERY)
    const update = () => setIsMobile(media.matches)
    update()
    media.addEventListener("change", update)
    return () => media.removeEventListener("change", update)
  }, [])

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const ext = file.name.split(".").pop()?.toLowerCase()
    const allowedExts = ["csv", "xlsx", "xls"]
    if (!ext || !allowedExts.includes(ext)) {
      setFileError(`Unsupported file type "${ext ? `.${ext}` : "unknown"}". Accepted formats: CSV, XLSX, XLS`)
      if (fileInputRef.current) fileInputRef.current.value = ""
      return
    }
    if (file.size > MAX_FILE_SIZE) {
      setFileError(`File too large (${formatFileSize(file.size)}). Maximum size: 10 MB`)
      if (fileInputRef.current) fileInputRef.current.value = ""
      return
    }
    setFileError(null)
    setSelectedFile(file)
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  const handleRemoveFile = () => {
    setSelectedFile(null)
    setFileError(null)
  }

  const getContext = () => contextExpanded ? contextText.trim() || undefined : undefined

  const resetAfterSend = () => {
    setContextText("")
    setContextExpanded(false)
  }

  const handleSubmit = () => {
    if (disabled) return
    const ctx = getContext()

    if (selectedFile) {
      onFileUpload(selectedFile, ctx)
      setSelectedFile(null)
      setInput("")
      resetAfterSend()
      return
    }

    if (input.trim()) {
      onSend(input.trim(), ctx)
      setInput("")
      resetAfterSend()
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value)
    const ta = e.target
    ta.style.height = "auto"
    ta.style.height = `${Math.min(ta.scrollHeight, 120)}px`
  }

  const handleContextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value.slice(0, CONTEXT_MAX)
    setContextText(val)
    const ta = e.target
    ta.style.height = "auto"
    ta.style.height = `${Math.min(ta.scrollHeight, 72)}px`
  }

  const counterColor = contextText.length >= CONTEXT_MAX
    ? "text-red-500"
    : contextText.length >= CONTEXT_WARN
    ? "text-orange-400"
    : "text-muted-foreground"

  const canSubmit = !disabled && (input.trim() || selectedFile)
  const inputPlaceholder = isMobile ? "Ask..." : placeholder || "Ask about your data or upload a file..."

  return (
    <div className="border-t border-border bg-card/50 p-3 sm:p-4">
      {helperText && (
        <p className="mb-3 text-xs text-muted-foreground">{helperText}</p>
      )}

      {selectedFile && (
        <div className="mb-3 flex items-center gap-2">
          <div className="flex items-center gap-2 rounded-lg bg-muted border border-border px-3 py-1.5">
            <FileSpreadsheet className="h-4 w-4 text-primary" />
            <span className="text-sm text-foreground truncate max-w-[200px]">
              {selectedFile.name}
            </span>
            <span className="text-xs text-muted-foreground">
              ({formatFileSize(selectedFile.size)})
            </span>
            <button onClick={handleRemoveFile} className="ml-1 text-muted-foreground hover:text-foreground">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      {fileError && (
        <p className="mb-2 text-xs text-red-400">{fileError}</p>
      )}

      <div className="flex items-end gap-2">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-9 w-9 shrink-0"
          disabled={disabled}
          onClick={() => fileInputRef.current?.click()}
        >
          <Paperclip className="h-4 w-4" />
          <span className="sr-only">Attach file</span>
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_TYPES}
          className="hidden"
          onChange={handleFileSelect}
          title="Upload CSV, XLSX, or XLS file (max 10 MB)"
        />

        <textarea
          ref={textareaRef}
          aria-label="message"
          value={input}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder={inputPlaceholder}
          disabled={disabled}
          rows={1}
          className={cn(
            "min-w-0 flex-1 resize-none rounded-lg border border-border bg-background px-2.5 py-2 text-sm sm:px-3",
            "placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring",
            "disabled:cursor-not-allowed disabled:opacity-50"
          )}
        />

        <Button
          onClick={handleSubmit}
          disabled={!canSubmit}
          size="icon"
          className="h-9 w-9 shrink-0"
        >
          <Send className="h-4 w-4" />
          <span className="sr-only">Send</span>
        </Button>
      </div>

      <TokenEstimator message={input} />

      <div className="mt-2">
        <button
          type="button"
          aria-label={contextExpanded ? "Hide analysis context" : "Add analysis context"}
          onClick={() => setContextExpanded((v) => !v)}
          disabled={disabled}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
        >
          {contextExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          {contextExpanded ? "Analysis context" : "Add analysis context"}
        </button>
      </div>

      {contextExpanded && (
        <div className="mt-1">
          <textarea
            ref={contextRef}
            value={contextText}
            onChange={handleContextChange}
            placeholder="Add context, e.g. Focus on ROAS efficiency for EU region..."
            disabled={disabled}
            rows={2}
            style={{ overflowY: "auto" }}
            className={cn(
              "w-full resize-none rounded-lg border border-border bg-muted/50 px-2.5 py-2 text-xs",
              "placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring",
              "disabled:cursor-not-allowed disabled:opacity-50"
            )}
          />
          {contextText.length > 0 && (
            <p className={cn("mt-0.5 text-right text-xs", counterColor)}>
              {contextText.length} / {CONTEXT_MAX}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
