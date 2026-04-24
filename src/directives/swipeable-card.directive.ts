import { Directive, ElementRef, inject, input, output, signal, computed, OnInit, OnDestroy } from '@angular/core';

export interface SwipeRevealEvent {
  direction: 'left' | 'right';
}

export interface SwipeProgressEvent {
  offset: number;    // Current X offset in pixels (negative = left)
  progress: number;  // 0–1, where 1 = fully revealed
}

/**
 * Swipe-to-reveal directive for mobile cards.
 *
 * Uses imperative addEventListener with { passive: false } for touchmove so
 * e.preventDefault() actually works (stops vertical scroll stealing). Angular's
 * @HostListener registers passive by default in zoneless mode, which silently
 * ignores preventDefault and breaks horizontal swipe detection.
 *
 * The host element is translated on the X axis; an absolutely-positioned sibling
 * panel behind it becomes visible when the card slides away.
 */
@Directive({
  selector: '[appSwipeableCard]',
  standalone: true,
  host: {
    '[style.transform]':  'translateStyle()',
    '[style.transition]': 'transitionStyle()',
    '[style.willChange]': '"transform"',
    '[style.userSelect]': '"none"',
  },
})
export class SwipeableCardDirective implements OnInit, OnDestroy {
  /** Width (px) of the revealed action panel. */
  revealWidth = input<number>(72);
  /** Fraction of revealWidth that must be crossed to commit open. */
  threshold   = input<number>(0.35);

  swipeReveal   = output<SwipeRevealEvent>();
  swipeReset    = output<void>();
  swipeProgress = output<SwipeProgressEvent>();

  readonly isRevealed = signal(false);

  private _offsetX    = signal(0);
  private _isDragging = signal(false);

  private _startX     = 0;
  private _startY     = 0;
  private _isHoriz    = false;  // confirmed horizontal gesture
  private _isScroll   = false;  // confirmed vertical scroll, bail out

  private el = inject(ElementRef<HTMLElement>);

  translateStyle  = computed(() => `translateX(${this._offsetX()}px)`);
  // Use _isDragging() — calling the signal — so computed re-evaluates reactively
  transitionStyle = computed(() =>
    this._isDragging() ? 'none' : 'transform 0.22s cubic-bezier(0.25, 1, 0.5, 1)'
  );

  // Bound handlers kept as arrow functions so removeEventListener can match them
  private _onTouchStart = (e: TouchEvent) => this._handleTouchStart(e);
  private _onTouchMove  = (e: TouchEvent) => this._handleTouchMove(e);
  private _onTouchEnd   = (e: TouchEvent) => this._handleTouchEnd(e);

  ngOnInit() {
    const el = this.el.nativeElement;
    el.addEventListener('touchstart', this._onTouchStart, { passive: true });
    // passive: false required so we can call preventDefault() and stop scroll
    el.addEventListener('touchmove',  this._onTouchMove,  { passive: false });
    el.addEventListener('touchend',   this._onTouchEnd,   { passive: true });
    el.addEventListener('touchcancel',this._onTouchEnd,   { passive: true });
  }

  ngOnDestroy() {
    const el = this.el.nativeElement;
    el.removeEventListener('touchstart',  this._onTouchStart);
    el.removeEventListener('touchmove',   this._onTouchMove);
    el.removeEventListener('touchend',    this._onTouchEnd);
    el.removeEventListener('touchcancel', this._onTouchEnd);
  }

  /** Called externally when the popup opens to snap the card back. */
  reset() {
    this._isDragging.set(false);
    this._isHoriz  = false;
    this._isScroll = false;
    this._offsetX.set(0);
    this.isRevealed.set(false);
  }

  // ── Touch handlers ──────────────────────────────────────────────────────────

  private _handleTouchStart(e: TouchEvent) {
    if (e.touches.length !== 1) return;
    const touch = e.touches[0];
    this._startX   = touch.clientX;
    this._startY   = touch.clientY;
    this._isDragging.set(true);
    this._isHoriz  = false;
    this._isScroll = false;

    // Start from the open offset if already revealed
    if (this.isRevealed()) {
      this._offsetX.set(-this.revealWidth());
    }
  }

  private _handleTouchMove(e: TouchEvent) {
    if (!this._isDragging() || e.touches.length !== 1) return;

    const touch = e.touches[0];
    const dx = touch.clientX - this._startX;
    const dy = touch.clientY - this._startY;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);

    // Wait for 5px of movement before deciding direction
    if (!this._isHoriz && !this._isScroll) {
      if (absDx > 5 && absDx > absDy) {
        this._isHoriz = true;
      } else if (absDy > 5 && absDy >= absDx) {
        this._isScroll = true;
        this._isDragging.set(false);
        this._offsetX.set(0);
        return;
      } else {
        return;  // Not enough movement yet
      }
    }

    if (!this._isHoriz) return;

    // Stop page scroll during horizontal swipe
    e.preventDefault();

    const rw      = this.revealWidth();
    const base    = this.isRevealed() ? -rw : 0;
    const raw     = base + dx;

    // Clamp: full range left, only slight over-drag right (rubber-band feel)
    const clamped = Math.max(-rw * 1.2, Math.min(rw * 0.15, raw));
    this._offsetX.set(clamped);

    const progress = Math.min(Math.abs(clamped) / rw, 1);
    this.swipeProgress.emit({ offset: clamped, progress });
  }

  private _handleTouchEnd(e: TouchEvent) {
    if (!this._isDragging()) return;
    this._isDragging.set(false);

    const dx      = (e.changedTouches[0]?.clientX ?? this._startX) - this._startX;
    const rw      = this.revealWidth();
    const thresh  = rw * this.threshold();
    const wasOpen = this.isRevealed();

    if (!wasOpen && dx < -thresh) {
      this._offsetX.set(-rw);
      this.isRevealed.set(true);
      this.swipeProgress.emit({ offset: -rw, progress: 1 });
      this.swipeReveal.emit({ direction: 'left' });
    } else if (!wasOpen && dx > thresh) {
      this._offsetX.set(rw);
      this.isRevealed.set(true);
      this.swipeProgress.emit({ offset: rw, progress: 1 });
      this.swipeReveal.emit({ direction: 'right' });
    } else if (wasOpen && dx > thresh * 0.5) {
      // Swipe right to close when already open
      this._offsetX.set(0);
      this.isRevealed.set(false);
      this.swipeProgress.emit({ offset: 0, progress: 0 });
      this.swipeReset.emit();
    } else {
      // Snap back to whatever stable position we were at
      const stableOffset = wasOpen ? -rw : 0;
      this._offsetX.set(stableOffset);
      if (!wasOpen) {
        this.swipeProgress.emit({ offset: 0, progress: 0 });
        this.swipeReset.emit();
      }
    }
  }
}
