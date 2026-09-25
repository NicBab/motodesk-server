export interface RateLimitRecord {
  count: number;
  resetAt: number;
}

export interface RateLimitStore {
  increment(key: string, windowMilliseconds: number): RateLimitRecord;

  reset(key: string): void;

  clear(): void;
}

//************************************************************** */

export class InMemoryRateLimitStore implements RateLimitStore {
  private readonly records = new Map<string, RateLimitRecord>();

  increment(key: string, windowMilliseconds: number): RateLimitRecord {
    const now = Date.now();

    const existingRecord = this.records.get(key);

    if (!existingRecord || existingRecord.resetAt <= now) {
      const record: RateLimitRecord = {
        count: 1,

        resetAt: now + windowMilliseconds,
      };

      this.records.set(key, record);

      return {
        ...record,
      };
    }

    existingRecord.count += 1;

    return {
      ...existingRecord,
    };
  }

  reset(key: string): void {
    this.records.delete(key);
  }

  clear(): void {
    this.records.clear();
  }
}

//************************************************************** */
