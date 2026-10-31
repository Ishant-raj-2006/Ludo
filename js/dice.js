/* dice.js - animated six-sided dice drawn with CSS (9 pip positions). */
const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
const reduce = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

export function createDice(el) {
  el.innerHTML = '';
  el.classList.add('dice');
  el.setAttribute('role', 'img');
  const cells = Array.from({ length: 9 }, () => el.appendChild(document.createElement('span')));

  function set(n) {
    cells.forEach((c, i) => c.classList.toggle('on', !!(PIPS[n] && PIPS[n].includes(i))));
    el.dataset.value = n;
    el.setAttribute('aria-label', n ? 'Dice shows ' + n : 'Dice');
  }
  /** Shake with random faces, then settle on `value`. Resolves when finished. */
  function roll(value, ms = 650) {
    return new Promise(resolve => {
      if (reduce()) { set(value); return resolve(); }
      el.classList.add('rolling');
      const timer = setInterval(() => set(1 + Math.floor(Math.random() * 6)), 80);
      setTimeout(() => { clearInterval(timer); el.classList.remove('rolling'); set(value); resolve(); }, ms);
    });
  }
  function setColor(name) { el.dataset.color = name || ''; }
  set(0);
  return { set, roll, setColor };
}
