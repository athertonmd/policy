'use client';

import { useState, useCallback } from 'react';
import { AlertCircle, Copy, Check } from 'lucide-react';

interface DSLEditorProps {
  value: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
  errors?: DSLError[];
}

export interface DSLError {
  line: number;
  column: number;
  message: string;
}

/**
 * DSL Editor with syntax highlighting (textarea-based).
 * In production, this would integrate Monaco or CodeMirror for full syntax highlighting.
 * This implementation provides a functional editor with error display.
 */
export function DSLEditor({ value, onChange, readOnly = false, errors = [] }: DSLEditorProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [value]);

  const lineCount = value.split('\n').length;

  return (
    <div className="rounded-lg border border-gray-200 overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50 px-3 py-2">
        <span className="text-xs font-medium text-gray-500">Policy DSL</span>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">{lineCount} lines</span>
          <button
            type="button"
            onClick={handleCopy}
            className="rounded p-1 text-gray-400 hover:bg-gray-200 hover:text-gray-600"
            aria-label="Copy to clipboard"
          >
            {copied ? (
              <Check className="h-4 w-4 text-green-600" aria-hidden="true" />
            ) : (
              <Copy className="h-4 w-4" aria-hidden="true" />
            )}
          </button>
        </div>
      </div>

      {/* Editor area */}
      <div className="relative">
        {/* Line numbers */}
        <div className="absolute left-0 top-0 bottom-0 w-10 bg-gray-50 border-r border-gray-200 overflow-hidden pointer-events-none">
          <div className="px-2 py-3 text-right">
            {Array.from({ length: lineCount }, (_, i) => (
              <div
                key={i + 1}
                className={`text-xs leading-6 ${
                  errors.some((e) => e.line === i + 1)
                    ? 'text-red-500 font-medium'
                    : 'text-gray-400'
                }`}
              >
                {i + 1}
              </div>
            ))}
          </div>
        </div>

        {/* Textarea */}
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          readOnly={readOnly}
          className="w-full min-h-[300px] resize-y pl-12 pr-4 py-3 font-mono text-sm leading-6 text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-inset focus:ring-brand-500"
          spellCheck={false}
          aria-label="Policy DSL editor"
          aria-describedby={errors.length > 0 ? 'dsl-errors' : undefined}
        />
      </div>

      {/* Error display */}
      {errors.length > 0 && (
        <div
          id="dsl-errors"
          className="border-t border-red-200 bg-red-50 p-3"
          role="alert"
          aria-live="polite"
        >
          <div className="flex items-center gap-2 mb-2">
            <AlertCircle className="h-4 w-4 text-red-600" aria-hidden="true" />
            <span className="text-xs font-medium text-red-800">
              {errors.length} error{errors.length > 1 ? 's' : ''} found
            </span>
          </div>
          <ul className="space-y-1">
            {errors.map((error, idx) => (
              <li key={idx} className="text-xs text-red-700">
                Line {error.line}, Col {error.column}: {error.message}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
