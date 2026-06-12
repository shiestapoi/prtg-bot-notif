import { Injectable, Logger } from '@nestjs/common';

/**
 * Structured metric output from parsing a PRTG historicdata.json response.
 * Fields are null when the raw response contains fewer value_raw entries than expected.
 */
export interface NormalizedMetric {
  timestamp: Date;
  totalTrafficBytes: number | null;
  totalTrafficBitrate: number | null;
  inboundBytes: number | null;
  inboundBitrate: number | null;
  outboundBytes: number | null;
  outboundBitrate: number | null;
  errorPercent: number | null;
  coveragePercent: number | null;
}

/**
 * Custom error thrown when the metric parser encounters malformed input.
 * Contains the config identifier and a descriptive reason.
 */
export class MetricParseError extends Error {
  constructor(
    public readonly configId: string | number,
    public readonly reason: string,
  ) {
    super(`MetricParseError [config=${configId}]: ${reason}`);
    this.name = 'MetricParseError';
  }
}

/**
 * Converts an OLE Automation Date (days since 1899-12-30) to a JavaScript Date.
 * OLE dates are used by PRTG in the datetime_raw field.
 */
export function oleToDate(oleDate: number): Date {
  const msPerDay = 86400000;
  const oleEpoch = new Date(Date.UTC(1899, 11, 30)).getTime();
  return new Date(oleEpoch + oleDate * msPerDay);
}

/**
 * Parses a PRTG datetime string like "09/05/2026 09:00:02" into a Date.
 * Format: DD/MM/YYYY HH:mm:ss
 */
function parsePrtgDatetime(value: string): Date | null {
  // Format: DD/MM/YYYY HH:mm:ss
  const match = value.match(
    /(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})/,
  );
  if (!match) return null;
  const [, day, month, year, hours, minutes, seconds] = match;
  return new Date(
    parseInt(year),
    parseInt(month) - 1,
    parseInt(day),
    parseInt(hours),
    parseInt(minutes),
    parseInt(seconds),
  );
}

/**
 * Named key patterns for matching PRTG channel names (case-insensitive).
 * PRTG returns named keys like "Traffic Total (volume)", "Traffic In (speed)", etc.
 */
const NAMED_KEY_PATTERNS = {
  totalTrafficBytes: /traffic\s*total.*(?:volume|byte)/i,
  totalTrafficBitrate: /traffic\s*total.*(?:speed|bit)/i,
  inboundBytes: /traffic\s*in.*(?:volume|byte)/i,
  inboundBitrate: /traffic\s*in.*(?:speed|bit)/i,
  outboundBytes: /traffic\s*out.*(?:volume|byte)/i,
  outboundBitrate: /traffic\s*out.*(?:speed|bit)/i,
};

const EXPECTED_VALUE_RAW_COUNT = 7;

@Injectable()
export class MetricParserService {
  private readonly logger = new Logger(MetricParserService.name);

  /**
   * Normalizes a raw PRTG historicdata.json response into a structured metric.
   *
   * Supports two PRTG response formats:
   * 1. Named keys format (avg=0, no graphid): {"Traffic Total (volume)": 123, "Traffic Total (speed)": 456, ...}
   * 2. Positional value_raw format (graphid=1, columns=value_): {"value_raw": 123, "value_raw": 456, ...}
   *
   * @param rawResponseText - The raw HTTP response body text from PRTG historicdata.json
   * @param configId - The PrtgConfig identifier (for error reporting)
   * @returns NormalizedMetric with the most recent entry's data
   * @throws MetricParseError if the input is malformed
   */
  normalize(
    rawResponseText: string,
    configId: string | number = 'unknown',
  ): NormalizedMetric {
    // Try to parse as JSON first (named keys format)
    try {
      const parsed = JSON.parse(rawResponseText);
      const dataArray = parsed.histdata ?? parsed.values;

      if (Array.isArray(dataArray) && dataArray.length > 0) {
        // Take the LAST entry (most recent) — PRTG returns data in ascending order
        return this.parseNamedKeysEntry(
          dataArray[dataArray.length - 1],
          configId,
        );
      }
    } catch {
      // JSON parse failed — fall through to regex-based parsing for duplicate-key format
    }

    // Fallback: regex-based parsing for duplicate "value_raw" keys format
    return this.parseValueRawFormat(rawResponseText, configId);
  }

  /**
   * Normalizes a raw PRTG historicdata.json response into an array of structured metrics.
   *
   * @param rawResponseText - The raw HTTP response body text from PRTG historicdata.json
   * @param configId - The PrtgConfig identifier (for error reporting)
   * @returns Array of NormalizedMetric containing all data points
   * @throws MetricParseError if the input is malformed
   */
  normalizeAll(
    rawResponseText: string,
    configId: string | number = 'unknown',
  ): NormalizedMetric[] {
    // Try to parse as JSON first (named keys format)
    try {
      const parsed = JSON.parse(rawResponseText);
      const dataArray = parsed.histdata ?? parsed.values;

      if (Array.isArray(dataArray) && dataArray.length > 0) {
        return dataArray.map((entry) =>
          this.parseNamedKeysEntry(entry, configId),
        );
      }
    } catch {
      // JSON parse failed
    }

    // Fallback: regex-based parsing for duplicate "value_raw" keys format
    const entries = this.extractEntries(rawResponseText, configId);
    if (entries.length === 0) {
      throw new MetricParseError(configId, 'The data array is empty');
    }

    return entries.map((entry) =>
      this.parseValueRawFormatEntry(entry, configId),
    );
  }

  /**
   * Parses a PRTG entry with named keys (e.g., "Traffic Total (volume)": 123).
   * This is the format returned when using avg=0 without graphid/columns filters.
   */
  private parseNamedKeysEntry(
    entry: Record<string, unknown>,
    configId: string | number,
  ): NormalizedMetric {
    // Extract timestamp
    let timestamp: Date;
    if (typeof entry.datetime_raw === 'number') {
      timestamp = oleToDate(entry.datetime_raw);
    } else if (typeof entry.datetime === 'string') {
      const parsed = parsePrtgDatetime(entry.datetime);
      if (!parsed) {
        throw new MetricParseError(
          configId,
          `Cannot parse datetime: "${entry.datetime}"`,
        );
      }
      timestamp = parsed;
    } else {
      throw new MetricParseError(
        configId,
        'Entry has no datetime or datetime_raw field',
      );
    }

    // Match named keys to metric fields
    let totalTrafficBytes: number | null = null;
    let totalTrafficBitrate: number | null = null;
    let inboundBytes: number | null = null;
    let inboundBitrate: number | null = null;
    let outboundBytes: number | null = null;
    let outboundBitrate: number | null = null;
    let errorPercent: number | null = null;
    let coveragePercent: number | null = null;

    for (const [key, value] of Object.entries(entry)) {
      if (key === 'datetime' || key === 'datetime_raw' || key === 'coverage')
        continue;

      const numValue = typeof value === 'number' ? value : null;
      if (numValue === null) continue;

      if (NAMED_KEY_PATTERNS.totalTrafficBytes.test(key)) {
        totalTrafficBytes = numValue;
      } else if (NAMED_KEY_PATTERNS.totalTrafficBitrate.test(key)) {
        // PRTG returns speed in Bytes/s — convert to bits/s (* 8)
        totalTrafficBitrate = numValue * 8;
      } else if (NAMED_KEY_PATTERNS.inboundBytes.test(key)) {
        inboundBytes = numValue;
      } else if (NAMED_KEY_PATTERNS.inboundBitrate.test(key)) {
        // PRTG returns speed in Bytes/s — convert to bits/s (* 8)
        inboundBitrate = numValue * 8;
      } else if (NAMED_KEY_PATTERNS.outboundBytes.test(key)) {
        outboundBytes = numValue;
      } else if (NAMED_KEY_PATTERNS.outboundBitrate.test(key)) {
        // PRTG returns speed in Bytes/s — convert to bits/s (* 8)
        outboundBitrate = numValue * 8;
      } else if (/error|downtime/i.test(key)) {
        errorPercent = numValue;
      }
    }

    // Extract coverage
    if (typeof entry.coverage === 'string') {
      const coverageMatch = entry.coverage.match(/(\d+)/);
      if (coverageMatch) {
        coveragePercent = parseFloat(coverageMatch[1]);
      }
    } else if (typeof entry.coverage_raw === 'number') {
      coveragePercent = entry.coverage_raw;
    }

    // Validate we got at least some traffic data
    if (
      totalTrafficBitrate === null &&
      inboundBitrate === null &&
      outboundBitrate === null
    ) {
      this.logger.warn(
        `Config ${configId}: Named keys format but no traffic metrics found. Keys: ${Object.keys(entry).join(', ')}`,
      );
    }

    return {
      timestamp,
      totalTrafficBytes,
      totalTrafficBitrate,
      inboundBytes,
      inboundBitrate,
      outboundBytes,
      outboundBitrate,
      errorPercent,
      coveragePercent,
    };
  }

  /**
   * Parses the legacy format with duplicate "value_raw" keys using regex.
   * This format is returned when using graphid=1 and columns=datetime,value_,coverage.
   */
  private parseValueRawFormat(
    rawResponseText: string,
    configId: string | number,
  ): NormalizedMetric {
    // Validate that the response contains a data array
    const valuesArrayMatch = rawResponseText.match(/"histdata"\s*:\s*\[/);
    if (!valuesArrayMatch) {
      const altMatch = rawResponseText.match(/"values"\s*:\s*\[/);
      if (!altMatch) {
        throw new MetricParseError(
          configId,
          'Response does not contain a "histdata" or "values" array',
        );
      }
    }

    const entries = this.extractEntries(rawResponseText, configId);
    if (entries.length === 0) {
      throw new MetricParseError(configId, 'The data array is empty');
    }

    return this.parseValueRawFormatEntry(entries[0], configId);
  }

  /**
   * Parses a single entry string in the legacy duplicate "value_raw" keys format.
   */
  private parseValueRawFormatEntry(
    entryStr: string,
    configId: string | number,
  ): NormalizedMetric {
    // Extract datetime_raw
    const datetimeRawMatch = entryStr.match(
      /"datetime_raw"\s*:\s*"?([0-9.]+)"?/,
    );
    if (!datetimeRawMatch) {
      throw new MetricParseError(
        configId,
        'Entry does not contain a valid datetime_raw field',
      );
    }

    const oleDate = parseFloat(datetimeRawMatch[1]);
    if (isNaN(oleDate)) {
      throw new MetricParseError(
        configId,
        'datetime_raw is not a valid number',
      );
    }

    const timestamp = oleToDate(oleDate);

    const valueRawPattern = /"value_raw"\s*:\s*"?(-?[0-9.]+(?:e[+-]?\d+)?)"?/gi;
    const valueRaws: number[] = [];
    let match: RegExpExecArray | null;

    while ((match = valueRawPattern.exec(entryStr)) !== null) {
      valueRaws.push(parseFloat(match[1]));
    }

    if (valueRaws.length === 0) {
      throw new MetricParseError(
        configId,
        'No value_raw fields found in the first entry',
      );
    }

    if (valueRaws.length < EXPECTED_VALUE_RAW_COUNT) {
      this.logger.warn(
        `Config ${configId}: Expected ${EXPECTED_VALUE_RAW_COUNT} value_raw fields but found ${valueRaws.length}. Missing fields will be set to null.`,
      );
    }

    // Extract coverage
    const coverageMatch = entryStr.match(
      /"coverage_raw"\s*:\s*"?(-?[0-9.]+(?:e[+-]?\d+)?)"?/i,
    );
    const coveragePercent = coverageMatch ? parseFloat(coverageMatch[1]) : null;

    return {
      timestamp,
      totalTrafficBytes: valueRaws.length > 0 ? valueRaws[0] : null,
      totalTrafficBitrate: valueRaws.length > 1 ? valueRaws[1] * 8 : null,
      inboundBytes: valueRaws.length > 2 ? valueRaws[2] : null,
      inboundBitrate: valueRaws.length > 3 ? valueRaws[3] * 8 : null,
      outboundBytes: valueRaws.length > 4 ? valueRaws[4] : null,
      outboundBitrate: valueRaws.length > 5 ? valueRaws[5] * 8 : null,
      errorPercent: valueRaws.length > 6 ? valueRaws[6] : null,
      coveragePercent,
    };
  }

  /**
   * Extracts individual entry objects from the histdata/values array in the raw text.
   * Uses brace-counting to handle nested structures.
   */
  private extractEntries(rawText: string, configId: string | number): string[] {
    const arrayStartMatch = rawText.match(/"(?:histdata|values)"\s*:\s*\[/);
    if (!arrayStartMatch || arrayStartMatch.index === undefined) {
      throw new MetricParseError(
        configId,
        'Could not locate the data array in response',
      );
    }

    const arrayStart = arrayStartMatch.index + arrayStartMatch[0].length;
    const entries: string[] = [];
    let depth = 0;
    let entryStart = -1;

    for (let i = arrayStart; i < rawText.length; i++) {
      const char = rawText[i];

      if (char === '{') {
        if (depth === 0) entryStart = i;
        depth++;
      } else if (char === '}') {
        depth--;
        if (depth === 0 && entryStart !== -1) {
          entries.push(rawText.substring(entryStart, i + 1));
          entryStart = -1;
        }
      } else if (char === ']' && depth === 0) {
        break;
      }
    }

    return entries;
  }
}
