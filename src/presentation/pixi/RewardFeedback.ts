import { Action } from "pixijs-actions";
import { Container, Text, TextStyle } from "pixi.js";

type FeedbackTone = "reward" | "milestone";

interface PooledMessage {
  node: Text;
  tone: FeedbackTone;
}

/** How long a message stays pooled (and invisible) before it may be reused. */
const RELEASE_DELAY_MS = 800;

/** Hard cap on pooled nodes so a burst of taps cannot grow the pool without bound. */
const MAX_POOLED = 8;

/**
 * Floating "+5 credits" style feedback above the heroine.
 *
 * Each toast used to create a fresh `Text` and destroy the previous one after the
 * animation, which added a GPU texture per message and leaked past a few dozen taps.
 * Toasts are now pooled per tone and replayed, so the texture count stays flat.
 */
export class RewardFeedback {
  private readonly parent: Container;
  private readonly pool: PooledMessage[] = [];
  private readonly activeLanes = new Map<PooledMessage, number>();
  private readonly styleCache = new Map<FeedbackTone, TextStyle>();
  private readonly releaseTimers = new Set<ReturnType<typeof setTimeout>>();

  constructor(parent: Container) {
    this.parent = parent;
  }

  show(
    text: string,
    x: number,
    y: number,
    tone: FeedbackTone = "reward",
  ): void {
    const message = this.take(tone);
    // Two reward messages from one tap used to land on the same baseline when
    // a second tap reused a lane.  Assign the first free vertical lane to each
    // live toast, so credits and affection never overlap each other.
    const occupied = new Set(this.activeLanes.values());
    let lane = 0;
    while (occupied.has(lane)) lane += 1;
    this.activeLanes.set(message, lane);
    message.node.text = text;
    message.node.position.set(x, y + lane * 28);
    // A pooled node was faded out by the previous toast; reset it before replaying.
    message.node.removeAllActions();
    message.node.alpha = 0;
    message.node.visible = true;
    if (message.node.parent !== this.parent) this.parent.addChild(message.node);

    message.node.run(
      Action.sequence([
        Action.group([
          Action.fadeIn(0.14).easeOut(),
          Action.moveByY(-12, 0.14).easeOut(),
        ]),
        Action.waitForDuration(0.35),
        Action.group([
          Action.fadeOut(0.28).easeIn(),
          Action.moveByY(-8, 0.28).easeIn(),
        ]),
        Action.run(() => this.release(message)),
      ]),
    );
  }

  /** Number of pooled nodes; exposed so tests can assert the pool stays bounded. */
  get pooledCount(): number {
    return this.pool.length;
  }

  /** Stops the release timers so a disposed scene does not keep callbacks alive. */
  destroy(): void {
    for (const timer of this.releaseTimers) clearTimeout(timer);
    this.releaseTimers.clear();
    this.activeLanes.clear();
    for (const message of this.pool) message.node.destroy();
    this.pool.length = 0;
    this.styleCache.clear();
  }

  private take(tone: FeedbackTone): PooledMessage {
    const index = this.pool.findIndex((entry) => entry.tone === tone);
    const reused = index >= 0 ? this.pool.splice(index, 1)[0] : undefined;
    if (reused) return reused;
    return { node: this.createNode(tone), tone };
  }

  private createNode(tone: FeedbackTone): Text {
    const node = new Text({ text: "", style: this.styleFor(tone) });
    node.anchor.set(0.5);
    node.roundPixels = true;
    node.eventMode = "none";
    node.visible = false;
    return node;
  }

  private styleFor(tone: FeedbackTone): TextStyle {
    const cached = this.styleCache.get(tone);
    if (cached) return cached;
    const style = new TextStyle({
      fontFamily: "Arial",
      fontSize: tone === "milestone" ? 18 : 16,
      fontWeight: "700",
      fill: tone === "milestone" ? "#ffd7fa" : "#ffffff",
      // A dark 4px outline drawn directly on the light hair/skin was read as
      // "black dots and lines" on tap. A soft light halo keeps the toast
      // legible on the dark page background without painting dark pixels onto
      // the approved artwork.
      stroke: { color: "#efe3ff", width: 2, alpha: 0.55 },
    });
    this.styleCache.set(tone, style);
    return style;
  }

  /**
   * Returns a finished toast to the pool.
   *
   * The node is hidden rather than destroyed, and any action still attached to it is
   * cleared, otherwise the next toast would inherit a half-finished sequence.
   */
  private release(message: PooledMessage): void {
    this.activeLanes.delete(message);
    message.node.alpha = 0;
    message.node.visible = false;
    message.node.position.set(0, 0);
    message.node.removeAllActions();
    if (this.pool.length >= MAX_POOLED) {
      message.node.destroy();
      return;
    }
    const timer = setTimeout(() => {
      this.releaseTimers.delete(timer);
    }, RELEASE_DELAY_MS);
    this.releaseTimers.add(timer);
    this.pool.push(message);
  }
}
