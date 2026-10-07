(() => {
  const d = document.documentElement, b = document.body;
  const scrollers = [...document.querySelectorAll('*')].filter(e => {
    const s = getComputedStyle(e); const ox = /(auto|scroll)/.test(s.overflowX), oy = /(auto|scroll)/.test(s.overflowY);
    return (ox && e.scrollWidth > e.clientWidth + 1) || (oy && e.scrollHeight > e.clientHeight + 1);
  }).map(e => ({ tag: e.tagName.toLowerCase(), cls: (e.className||'').toString().slice(0,60), cw: e.clientWidth, sw: e.scrollWidth, ch: e.clientHeight, sh: e.scrollHeight, top: Math.round(e.getBoundingClientRect().top), bottom: Math.round(e.getBoundingClientRect().bottom) }));
  return JSON.stringify({ vw: innerWidth, vh: innerHeight, docSW: d.scrollWidth, docCW: d.clientWidth, docSH: d.scrollHeight, bodySH: b.scrollHeight, pageHScroll: d.scrollWidth > d.clientWidth, scrollY: Math.round(scrollY), scrollers });
})()
