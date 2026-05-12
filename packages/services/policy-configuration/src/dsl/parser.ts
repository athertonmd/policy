/**
 * TypeScript wrapper for the Peggy-generated parser.
 * Provides a clean API with detailed error reporting.
 *
 * Validates: Requirements 22.1, 22.2, 22.5, 22.6
 */

import * as peggy from 'peggy';
import { GRAMMAR_SOURCE } from './grammar-source.js';
import type { PolicyDocument, ParseError } from './ast.js';

let cachedParser: peggy.Parser | null = null;

/**
 * Get or create the Peggy parser instance.
 * The parser is generated at runtime from the embedded grammar source.
 */
function getParser(): peggy.Parser {
  if (cachedParser) {
    return cachedParser;
  }

  cachedParser = peggy.generate(GRAMMAR_SOURCE, {
    output: 'parser',
    allowedStartRules: ['PolicyDocument'],
  });

  return cachedParser;
}

/**
 * Parse a DSL source string into an AST.
 *
 * @param dslSource - The DSL source code to parse
 * @returns The parsed PolicyDocument AST
 * @throws {DSLParseError} If the source contains syntax errors
 */
export function parse(dslSource: string): PolicyDocument {
  const parser = getParser();

  try {
    const result = parser.parse(dslSource);
    return result as PolicyDocument;
  } catch (error: unknown) {
    if (isPeggyError(error)) {
      const parseError: ParseError = {
        message: error.message,
        line: error.location?.start?.line ?? 0,
        column: error.location?.start?.column ?? 0,
        offset: error.location?.start?.offset ?? 0,
        expected: error.expected
          ? error.expected.map((e: PeggyExpectation) => formatExpectation(e))
          : [],
        found: error.found ?? null,
      };
      throw new DSLParseError(parseError);
    }
    throw error;
  }
}

/**
 * Custom error class for DSL parse errors with detailed location info.
 */
export class DSLParseError extends Error {
  public readonly line: number;
  public readonly column: number;
  public readonly offset: number;
  public readonly expected: string[];
  public readonly found: string | null;

  constructor(parseError: ParseError) {
    const locationInfo = `line ${parseError.line}, column ${parseError.column}`;
    const expectedInfo =
      parseError.expected.length > 0
        ? `, expected: ${parseError.expected.join(', ')}`
        : '';
    const foundInfo =
      parseError.found !== null ? `, found: ${JSON.stringify(parseError.found)}` : '';

    super(`Parse error at ${locationInfo}${expectedInfo}${foundInfo}`);
    this.name = 'DSLParseError';
    this.line = parseError.line;
    this.column = parseError.column;
    this.offset = parseError.offset;
    this.expected = parseError.expected;
    this.found = parseError.found;
  }

  toJSON(): ParseError {
    return {
      message: this.message,
      line: this.line,
      column: this.column,
      offset: this.offset,
      expected: this.expected,
      found: this.found,
    };
  }
}

/**
 * Reset the cached parser (useful for testing).
 */
export function resetParser(): void {
  cachedParser = null;
}

// --- Internal helpers ---

interface PeggyExpectation {
  type: string;
  text?: string;
  description?: string;
}

interface PeggyError {
  message: string;
  location?: {
    start: { line: number; column: number; offset: number };
    end: { line: number; column: number; offset: number };
  };
  expected?: PeggyExpectation[];
  found?: string | null;
}

function isPeggyError(error: unknown): error is PeggyError {
  return (
    error !== null &&
    typeof error === 'object' &&
    'message' in error &&
    ('location' in error || 'expected' in error)
  );
}

function formatExpectation(exp: PeggyExpectation): string {
  if (exp.description) {
    return exp.description;
  }
  if (exp.text) {
    return JSON.stringify(exp.text);
  }
  switch (exp.type) {
    case 'end':
      return 'end of input';
    case 'other':
      return exp.description || 'unknown';
    case 'literal':
      return JSON.stringify(exp.text);
    case 'class':
      return exp.description || 'character class';
    default:
      return exp.type;
  }
}
