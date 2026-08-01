type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

export function createLogger(level: LogLevel = 'info') {
  function write(entryLevel: LogLevel, message: string, fields?: Record<string, unknown>) {
    if (LEVEL_ORDER[entryLevel] < LEVEL_ORDER[level]) return;
    const line = JSON.stringify({
      level: entryLevel,
      msg: message,
      time: new Date().toISOString(),
      ...sanitize(fields),
    });
    if (entryLevel === 'error') console.error(line);
    else if (entryLevel === 'warn') console.warn(line);
    else console.info(line);
  }

  return {
    debug: (message: string, fields?: Record<string, unknown>) => write('debug', message, fields),
    info: (message: string, fields?: Record<string, unknown>) => write('info', message, fields),
    warn: (message: string, fields?: Record<string, unknown>) => write('warn', message, fields),
    error: (message: string, fields?: Record<string, unknown>) => write('error', message, fields),
  };
}

function sanitize(fields?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!fields) return undefined;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    const lower = key.toLowerCase();
    if (lower.includes('token') || lower.includes('authorization') || lower.includes('secret')) {
      out[key] = '[redacted]';
    } else if (lower.includes('audio') && typeof value !== 'number') {
      out[key] = '[omitted]';
    } else {
      out[key] = value;
    }
  }
  return out;
}

export type Logger = ReturnType<typeof createLogger>;
