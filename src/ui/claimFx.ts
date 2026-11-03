/** The claim animation: a "+N XP" chip that pops off the Claim button and flies into the level bar. */

export function reducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

const wait = (ms: number) => new Promise<void>((done) => setTimeout(done, ms));

/** Plays the flight and resolves once the chip lands; resolves at once when there is nothing to animate. */
export async function flyXp(from: HTMLElement, to: HTMLElement | null, xp: number): Promise<void> {
  if (!to || typeof document.body.animate !== 'function') return;

  // bring the bar into view first, so the fill that follows the landing is seen
  const view = to.getBoundingClientRect();
  if (view.top < 0 || view.bottom > window.innerHeight) {
    to.scrollIntoView({ block: 'center', behavior: 'smooth' });
    await wait(450);
  }

  const a = from.getBoundingClientRect();
  const b = to.getBoundingClientRect();
  const chip = document.createElement('div');
  chip.className = 'xp-fly pixel';
  chip.setAttribute('aria-hidden', 'true');
  chip.textContent = `+${xp} XP`;
  document.body.append(chip);

  const w = chip.offsetWidth;
  const h = chip.offsetHeight;
  const x0 = a.left + a.width / 2 - w / 2;
  const y0 = a.top + a.height / 2 - h / 2;
  const dx = b.left + b.width / 2 - w / 2 - x0;
  const dy = b.top + b.height / 2 - h / 2 - y0;
  chip.style.left = `${x0}px`;
  chip.style.top = `${y0}px`;

  // pop up off the button, hang for a beat, then arc into the bar and shrink into it
  const flight = chip.animate(
    [
      { transform: 'translate(0, 0) scale(0.4)', opacity: 0 },
      { transform: 'translate(0, -28px) scale(1.25)', opacity: 1, offset: 0.2 },
      { transform: 'translate(0, -34px) scale(1)', opacity: 1, offset: 0.38 },
      {
        transform: `translate(${dx * 0.55}px, ${dy * 0.5 - 60}px) scale(0.9)`,
        opacity: 1,
        offset: 0.7,
      },
      { transform: `translate(${dx}px, ${dy}px) scale(0.45)`, opacity: 0.2 },
    ],
    { duration: 900, easing: 'cubic-bezier(0.45, 0, 0.55, 1)', fill: 'forwards' },
  );
  try {
    await flight.finished;
  } catch {
    // cancelled (the page was left); the claim still goes through
  } finally {
    chip.remove();
  }
}
