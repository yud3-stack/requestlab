import type { RequestLabEvent, RequestLabStats } from "./types.js";

export type EventSender = (event: RequestLabEvent) => Promise<void>;

export class EventQueue {
  private readonly events: RequestLabEvent[] = [];
  private drainPromise: Promise<void> | undefined;
  private stats: RequestLabStats = { queued: 0, dropped: 0, sent: 0, failed: 0 };

  constructor(
    private readonly maxSize: number,
    private readonly sender: EventSender,
    private readonly debug: (message: string) => void = () => undefined
  ) {}

  enqueue(event: RequestLabEvent): boolean {
    if (this.events.length >= this.maxSize) {
      this.stats.dropped += 1;
      this.debug("Event queue is full; event dropped");
      return false;
    }
    this.events.push(event);
    this.stats.queued += 1;
    this.startDrain();
    return true;
  }

  async flush(): Promise<void> {
    while (this.drainPromise) await this.drainPromise;
  }

  getStats(): RequestLabStats {
    return { ...this.stats, queued: this.events.length };
  }

  private startDrain(): void {
    if (this.drainPromise) return;
    this.drainPromise = this.drain().finally(() => {
      this.drainPromise = undefined;
      if (this.events.length > 0) this.startDrain();
    });
  }

  private async drain(): Promise<void> {
    while (this.events.length > 0) {
      const event = this.events.shift();
      if (!event) continue;
      try {
        await this.sender(event);
        this.stats.sent += 1;
      } catch (error) {
        this.stats.failed += 1;
        this.debug(
          error instanceof Error
            ? `Event delivery failed: ${error.message}`
            : "Event delivery failed"
        );
      }
    }
  }
}
