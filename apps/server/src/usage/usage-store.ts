export type UsageRecord = {
  userId: string;
  sessionId: string;
  audioSeconds: number;
  startedAt: Date;
  endedAt?: Date;
  targetLanguage: string;
  platform: string;
};

/** In-memory usage store — swap for Postgres later. */
export class UsageStore {
  private readonly records = new Map<string, UsageRecord>();
  private readonly dailySeconds = new Map<string, number>();

  start(record: Omit<UsageRecord, 'audioSeconds' | 'endedAt'>): void {
    this.records.set(record.sessionId, { ...record, audioSeconds: 0 });
  }

  addAudioSeconds(sessionId: string, seconds: number): UsageRecord | undefined {
    const record = this.records.get(sessionId);
    if (!record) return undefined;
    record.audioSeconds += seconds;
    const dayKey = `${record.userId}:${new Date().toISOString().slice(0, 10)}`;
    this.dailySeconds.set(dayKey, (this.dailySeconds.get(dayKey) ?? 0) + seconds);
    return record;
  }

  end(sessionId: string): UsageRecord | undefined {
    const record = this.records.get(sessionId);
    if (!record) return undefined;
    record.endedAt = new Date();
    return record;
  }

  getTodaySeconds(userId: string): number {
    const dayKey = `${userId}:${new Date().toISOString().slice(0, 10)}`;
    return this.dailySeconds.get(dayKey) ?? 0;
  }

  get(sessionId: string): UsageRecord | undefined {
    return this.records.get(sessionId);
  }
}
