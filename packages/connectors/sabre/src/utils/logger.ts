/**
 * Structured logging utility for the Sabre connector.
 * Outputs JSON-formatted log entries for easy ingestion by CloudWatch / Datadog / etc.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: string;
  correlationId?: string;
  data?: Record<string, unknown>;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

let currentLevel: LogLevel = (process.env.LOG_LEVEL as LogLevel) ?? 'info';

export function setLogLevel(level: LogLevel): void {
  currentLevel = level;
}

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[currentLevel];
}

function formatEntry(level: LogLevel, message: string, context?: string, data?: Record<string, unknown>, error?: Error): LogEntry {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    context,
    data,
  };

  if (error) {
    entry.error = {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  return entry;
}

function emit(entry: LogEntry): void {
  const output = JSON.stringify(entry);
  switch (entry.level) {
    case 'error':
      console.error(output);
      break;
    case 'warn':
      console.warn(output);
      break;
    default:
      console.log(output);
  }
}

/**
 * Creates a logger instance scoped to a specific context (e.g., module name).
 */
export function createLogger(context: string) {
  return {
    debug(message: string, data?: Record<string, unknown>): void {
      if (shouldLog('debug')) {
        emit(formatEntry('debug', message, context, data));
      }
    },

    info(message: string, data?: Record<string, unknown>): void {
      if (shouldLog('info')) {
        emit(formatEntry('info', message, context, data));
      }
    },

    warn(message: string, data?: Record<string, unknown>): void {
      if (shouldLog('warn')) {
        emit(formatEntry('warn', message, context, data));
      }
    },

    error(message: string, error?: Error, data?: Record<string, unknown>): void {
      if (shouldLog('error')) {
        emit(formatEntry('error', message, context, data, error));
      }
    },
  };
}
