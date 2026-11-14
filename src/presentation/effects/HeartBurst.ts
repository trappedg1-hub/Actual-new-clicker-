import { Assets, Container, Sprite, Texture } from "pixi.js";
import heartUrl from "../../assets/effects/heart.png?url";

/** One floating heart of a tap burst. */
interface HeartParticle {
  sprite: Sprite;
  ageMs: number;
  lifeMs: number;
  vx: number;
  vy: number;
  spin: number;
  baseScale: number;
  wobblePhase: number;
  wobbleHz: number;
}

/** Soft cap so a tap storm cannot flood the stage. */
const MAX_HEARTS = 48;

/**
 * Tap feedback hearts: a small burst of glossy hearts floats up from the
 * touch point, wobbling sideways and fading out. Purely cosmetic — sits in
 * one container above the heroine, `eventMode` none, never blocks taps.
 */
export class HeartBurst extends Container {
  private texture: Texture = Texture.EMPTY;
  private readonly particles: HeartParticle[] = [];
  private loaded = false;

  constructor() {
    super();
    this.label = "tap heart particles";
    this.eventMode = "none";
  }

  async load(): Promise<void> {
    this.texture = await Assets.load<Texture>(heartUrl);
    this.loaded = true;
  }

  /** Spawns a burst of hearts at stage coordinates (screen CSS px). */
  burst(x: number, y: number, strength = 1, extra = 0): void {
    if (!this.loaded) return;
    const count = Math.min(3 + extra + Math.floor(Math.random() * 3), 9);
    for (let i = 0; i < count; i += 1) {
      if (this.particles.length >= MAX_HEARTS) {
        const oldest = this.particles.shift();
        oldest?.sprite.destroy();
      }
      const sprite = new Sprite(this.texture);
      sprite.anchor.set(0.5);
      const baseScale = (0.14 + Math.random() * 0.14) * strength;
      sprite.scale.set(baseScale * 0.4);
      sprite.position.set(
        x + (Math.random() - 0.5) * 36,
        y + (Math.random() - 0.5) * 20,
      );
      sprite.rotation = (Math.random() - 0.5) * 0.6;
      sprite.alpha = 0;
      this.addChild(sprite);
      this.particles.push({
        sprite,
        ageMs: 0,
        lifeMs: 750 + Math.random() * 450,
        vx: (Math.random() - 0.5) * 26,
        vy: -(52 + Math.random() * 44),
        spin: (Math.random() - 0.5) * 1.6,
        baseScale,
        wobblePhase: Math.random() * Math.PI * 2,
        wobbleHz: 1.6 + Math.random() * 1.2,
      });
    }
  }

  update(elapsedMs: number): void {
    if (this.particles.length === 0) return;
    const dt = elapsedMs / 1000;
    for (let i = this.particles.length - 1; i >= 0; i -= 1) {
      const p = this.particles[i]!;
      p.ageMs += elapsedMs;
      const t = p.ageMs / p.lifeMs;
      if (t >= 1) {
        p.sprite.destroy();
        this.particles.splice(i, 1);
        continue;
      }
      const wobble =
        Math.sin(p.wobblePhase + (p.ageMs / 1000) * p.wobbleHz * Math.PI * 2) *
        14;
      p.sprite.x += (p.vx + wobble) * dt;
      p.sprite.y += p.vy * dt;
      p.sprite.rotation += p.spin * dt;
      // pop in (first 15%), float, fade out (last 40%)
      const popIn = Math.min(1, t / 0.15);
      const fadeOut = t > 0.6 ? 1 - (t - 0.6) / 0.4 : 1;
      p.sprite.alpha = popIn * fadeOut;
      p.sprite.scale.set(p.baseScale * (0.4 + 0.6 * popIn));
    }
  }
}

/** Short tap haptic on devices that support it (Android Chrome etc.). */
export function tapHaptic(): void {
  try {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate(12);
    }
  } catch {
    // Haptics are best-effort; never break a tap over them.
  }
}
