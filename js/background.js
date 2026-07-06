// The flowing score — Toucan's signature background.
// Three depth layers of rippling staff lines + drifting note-shaped blobs.
// Slow ambient drift via CSS; scroll and pointer add a mild parallax here.
// Fully disabled for prefers-reduced-motion.

(function () {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const host = document.createElement("div");
  host.className = "score-bg";
  host.setAttribute("aria-hidden", "true");

  // depth: parallax multiplier (farther layers move less)
  const layers = [
    { depth: 0.15, cls: "score-layer far" },
    { depth: 0.35, cls: "score-layer mid" },
    { depth: 0.6, cls: "score-layer near" },
  ];

  const wave = (amp, phase) => {
    // A wide rippling 5-line staff as one SVG path group.
    let lines = "";
    for (let i = 0; i < 5; i++) {
      const y = 40 + i * 26;
      lines += `<path d="M -100 ${y}
        C 200 ${y - amp + phase * 8}, 500 ${y + amp}, 800 ${y}
        S 1400 ${y - amp}, 1700 ${y}
        S 2300 ${y + amp - phase * 6}, 2600 ${y}" />`;
    }
    return `<svg viewBox="0 0 2400 220" preserveAspectRatio="none">${lines}</svg>`;
  };

  const notes = `
    <span class="note n1"></span><span class="note n2"></span>
    <span class="note n3"></span><span class="note n4"></span>
    <span class="note n5"></span>`;

  layers.forEach((l, i) => {
    const el = document.createElement("div");
    el.className = l.cls + (reduce ? " still" : "");
    el.dataset.depth = l.depth;
    el.innerHTML = wave(18 + i * 12, i) + (i === 1 ? notes : "");
    host.appendChild(el);
  });

  document.body.prepend(host);
  if (reduce) return;

  let px = 0, py = 0, targetX = 0, targetY = 0, raf = null;

  function apply() {
    raf = null;
    px += (targetX - px) * 0.06;
    py += (targetY - py) * 0.06;
    const scroll = window.scrollY;
    host.querySelectorAll(".score-layer").forEach((el) => {
      const d = parseFloat(el.dataset.depth);
      el.style.transform = `translate3d(${px * 24 * d}px, ${py * 14 * d - scroll * d * 0.12}px, 0)`;
    });
    if (Math.abs(targetX - px) > 0.001 || Math.abs(targetY - py) > 0.001) queue();
  }
  function queue() {
    if (!raf) raf = requestAnimationFrame(apply);
  }

  window.addEventListener("pointermove", (e) => {
    targetX = e.clientX / window.innerWidth - 0.5;
    targetY = e.clientY / window.innerHeight - 0.5;
    queue();
  }, { passive: true });
  window.addEventListener("scroll", queue, { passive: true });
})();
