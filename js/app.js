'use strict';
(() => {
  // ---------- helpers ----------
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const view = $('#view');
  const MIN = 6e4, DAY = 864e5;
  // Spaced repetition: delay after reaching stage n. Stage 6 = mastered.
  const INTERVALS = [0, 10 * MIN, DAY, 3 * DAY, 7 * DAY, 21 * DAY, 60 * DAY];
  const MASTER = 6;
  const KEY = 'vocab.v1';
  const VERSION = '2026-11-25 14:06'; // replaced with the publish date by deploy.sh
  const DEFAULTS = { p: {}, xp: 0, dayXp: 0, day: '', streak: 0, goalDay: '', goal: 50, batch: 5, accent: 'en-GB', autoSpeak: true, custom: [], best: { speed: 0, match: 0 }, hideInstall: false, lessons: {} };
  const POS = { adj: 'īpašības vārds', verb: 'darbības vārds', noun: 'lietvārds', adv: 'apstākļa vārds' };
  const STATUS = { new: 'Jauns', learning: 'Mācos', mastered: 'Apgūts', known: 'Jau zinu' };

  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const shuffle = a => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const pick = a => a[Math.random() * a.length | 0];
  const dayKey = (t = Date.now()) => { const d = new Date(t); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };
  const plural = (n, one, many) => (n % 10 === 1 && n % 100 !== 11 ? one : many);
  const fmtTime = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  const buzz = p => navigator.vibrate?.(p);
  const relTime = ms => ms < 60 * MIN ? `${Math.max(1, Math.round(ms / MIN))} min` : ms < DAY ? `${Math.round(ms / 36e5)} h` : `${Math.round(ms / DAY)} d.`;

  const ic = d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const I = {
    home: ic('<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>'),
    cards: ic('<rect x="3" y="7" width="13" height="14" rx="2.5"/><path d="M8 3h10.5A2.5 2.5 0 0 1 21 5.5V16"/>'),
    bolt: ic('<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>'),
    book: ic('<path d="M4 4.5A1.5 1.5 0 0 1 5.5 3H20v15H5.5A1.5 1.5 0 0 0 4 19.5z"/><path d="M4 19.5A1.5 1.5 0 0 0 5.5 21H20"/>'),
    sliders: ic('<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>'),
    sound: ic('<path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/>'),
    close: ic('<path d="M6 6l12 12M18 6 6 18"/>'),
    arrow: ic('<path d="M5 12h14M13 6l6 6-6 6"/>'),
    plus: ic('<path d="M12 5v14M5 12h14"/>'),
    search: ic('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>'),
    check: ic('<path d="m5 12 5 5 9-10"/>'),
    back: ic('<path d="M15 18 9 12l6-6"/>'),
    cap: ic('<path d="M2 9.5 12 5l10 4.5L12 14z"/><path d="M6 11.5V16c0 1.4 2.7 3 6 3s6-1.6 6-3v-4.5M22 9.5V15"/>'),
  };

  // ---------- state ----------
  const load = () => { try { return Object.assign(structuredClone(DEFAULTS), JSON.parse(localStorage.getItem(KEY) || '{}')); } catch { return structuredClone(DEFAULTS); } };
  let S = load();
  const save = () => localStorage.setItem(KEY, JSON.stringify(S));

  let LIST, BY;
  const indexWords = () => { LIST = [...WORDS.map(w => ({ ...w, id: w.w, m: MEANINGS[w.w] })), ...S.custom]; BY = Object.fromEntries(LIST.map(w => [w.id, w])); };
  indexWords();

  const rec = id => S.p[id];
  const status = id => { const r = rec(id); if (!r) return 'new'; if (r.k) return 'known'; return r.s >= MASTER ? 'mastered' : 'learning'; };
  const ofStatus = st => LIST.filter(w => status(w.id) === st);
  const dueIds = () => LIST.filter(w => { const r = rec(w.id); return r && !r.k && r.d <= Date.now(); }).map(w => w.id);
  const gamePool = () => { const mine = LIST.filter(w => status(w.id) !== 'new'); return mine.length >= 10 ? mine : LIST; };

  function rollDay() {
    const today = dayKey();
    if (S.day === today) return;
    if (S.goalDay !== dayKey(Date.now() - DAY) && S.goalDay !== today) S.streak = 0;
    S.day = today; S.dayXp = 0; save();
  }
  function addXp(n) {
    rollDay();
    S.xp += n; S.dayXp += n;
    if (S.dayXp >= S.goal && S.goalDay !== S.day) {
      S.streak = S.goalDay === dayKey(Date.now() - DAY) ? S.streak + 1 : 1;
      S.goalDay = S.day;
      toast(`Dienas mērķis sasniegts · ${S.streak} 🔥`);
    }
    save();
  }
  function grade(id, ok) {
    const r = S.p[id];
    if (!r || r.k) return;
    r.s = ok ? Math.min(MASTER, r.s + 1) : 1;
    r.d = Date.now() + INTERVALS[r.s];
  }
  const startLearning = id => { S.p[id] = { s: 1, d: Date.now() }; };

  // ---------- speech ----------
  const canSpeak = 'speechSynthesis' in window;
  let voice = null;
  function pickVoice() {
    if (!canSpeak) return;
    const vs = speechSynthesis.getVoices().map(v => ({ v, lang: v.lang.replace('_', '-') }));
    const same = vs.filter(x => x.lang === S.accent);
    voice = (same.find(x => /premium|enhanced|natural|siri/i.test(x.v.name)) || same[0] || vs.find(x => x.lang.startsWith('en')))?.v || null;
  }
  if (canSpeak) { pickVoice(); speechSynthesis.onvoiceschanged = pickVoice; }
  function tts(text) {
    if (!canSpeak || !text) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = S.accent; u.rate = 0.95;
    if (voice) u.voice = voice;
    speechSynthesis.speak(u);
  }
  // Human recordings (audio/<word>-uk|us|any.mp3) for built-in words; device voice for everything else.
  // One shared <audio> element: once unlocked by a tap, iOS lets it play later without a tap.
  const player = new Audio();
  player.preload = 'auto';
  const recordingUrl = word => {
    const acc = typeof AUDIO !== 'undefined' && AUDIO[word];
    if (!acc) return '';
    const want = S.accent === 'en-GB' ? 'uk' : 'us';
    const a = acc.includes(want) ? want : acc.includes('any') ? 'any' : acc[0];
    return `audio/${encodeURIComponent(word)}-${a}.mp3`;
  };
  function speak(text) {
    if (!text) return;
    const url = recordingUrl(text.trim().toLowerCase());
    if (!url) return tts(text);
    if (canSpeak) speechSynthesis.cancel();
    player.pause();
    player.muted = false;
    player.src = url;
    player.currentTime = 0;
    player.play().catch(() => tts(text));
  }
  document.addEventListener('pointerdown', () => {
    if (player.src) return;
    const unlock = recordingUrl(WORDS[0].w);
    player.muted = true;
    player.src = unlock;
    const done = () => { if (player.src.endsWith(unlock)) { player.pause(); player.muted = false; } };
    player.play().then(done, done);
  }, { once: true });
  document.addEventListener('click', e => { const s = e.target.closest('[data-say]'); if (s) speak(s.dataset.say); });

  // ---------- ui primitives ----------
  let toastT;
  function toast(msg, action) {
    const t = $('#toast');
    clearTimeout(toastT);
    t.innerHTML = `<span>${esc(msg)}</span>${action ? `<button>${esc(action.label)}</button>` : ''}`;
    if (action) t.querySelector('button').onclick = () => { t.classList.remove('show'); action.fn(); };
    t.classList.add('show');
    toastT = setTimeout(() => t.classList.remove('show'), action ? 4000 : 2400);
  }

  const sheet = $('#sheet');
  let onSheetClose = null;
  function openSheet(html, bind, onClose) {
    const body = $('.sheet-body', sheet);
    body.innerHTML = html;
    body.onclick = body.onsubmit = null;
    onSheetClose = onClose || null;
    bind?.(body);
    sheet.showModal();
    sheet.scrollTop = 0;
  }
  const closeSheet = () => sheet.open && sheet.close();
  sheet.addEventListener('click', e => { if (e.target === sheet) closeSheet(); });
  sheet.addEventListener('close', () => { const f = onSheetClose; onSheetClose = null; f?.(); });

  let cleanups = [];
  const onCleanup = f => cleanups.push(f);
  function onKey(fn) { document.addEventListener('keydown', fn); onCleanup(() => document.removeEventListener('keydown', fn)); }

  const SCREENS = {};
  function show(route, render = SCREENS[route]) {
    cleanups.forEach(f => f()); cleanups = [];
    view.onclick = view.onsubmit = view.oninput = null;
    document.body.dataset.route = route;
    $$('.tabbar [data-tab]').forEach(b => b.setAttribute('aria-current', b.dataset.tab === route ? 'page' : 'false'));
    window.scrollTo(0, 0);
    render();
  }

  const speakBtn = w => `<button class="speak" data-say="${esc(w.w)}" aria-label="Izrunāt">${I.sound}<span>${esc(w.p || 'Izruna')}</span></button>`;
  const stemRe = w => new RegExp(`\\b${w.w.toLowerCase().replace(/[^a-z' -]/g, '').replace(/(e|y)$/, '')}[a-z]*`, 'i');
  const hasCloze = w => w.x && stemRe(w).test(w.x);
  const highlight = w => esc(w.x).replace(stemRe(w), m => `<mark>${m}</mark>`);
  // Association picture: user photo, built-in illustration, or emoji as fallback
  const BUILTIN = new Set(WORDS.map(w => w.w));
  const isCustom = id => !BUILTIN.has(id);
  const picSrc = w => w.img || (isCustom(w.id) ? '' : `img/${encodeURIComponent(w.w)}.png`);
  const pic = w => { const src = picSrc(w); const e = esc(w.e || '💡');
    return src ? `<img class="pic" src="${src}" alt="" loading="lazy" decoding="async" data-e="${e}" onerror="this.outerHTML='<span class=&quot;emoji&quot;>'+this.dataset.e+'</span>'">` : `<span class="emoji">${e}</span>`; };
  const assoc = (w, withPic = true) => `<div class="assoc">${withPic ? `<span class="assoc-pic" aria-hidden="true">${pic(w)}</span>` : ''}<p>${esc(w.a)}</p></div>`;
  const details = (w, withPic = true) => `
    <div class="details">
      <p class="lv">${esc(w.lv)}</p>
      ${w.a ? assoc(w, withPic) : ''}
      ${w.d ? `<p class="def">${esc(w.d)}</p>` : ''}
      ${w.x ? `<p class="ex">${highlight(w)}</p>` : ''}
      ${w.m?.length ? `
        <div class="meanings">
          <p class="mm-title">Citas nozīmes</p>
          ${w.m.map((m, i) => `
            <div class="mm">
              <span class="mm-n">${i + 2}</span>
              <div class="mm-body">
                <p class="mm-lv">${esc(m.lv)}${m.t && m.t !== w.t ? ` <span class="mm-pos">${esc(POS[m.t] || '')}</span>` : ''}</p>
                ${m.d ? `<p class="def">${esc(m.d)}</p>` : ''}
                ${m.x ? `<p class="ex">${esc(m.x)}</p>` : ''}
              </div>
            </div>`).join('')}
        </div>` : ''}
    </div>`;
  const dots = id => { const r = rec(id); const n = r && !r.k ? r.s - 1 : 0; return `<span class="dots" aria-label="Progress ${n} no 5">${[0, 1, 2, 3, 4].map(i => `<i class="${i < n ? 'on' : ''}"></i>`).join('')}</span>`; };
  const C = 2 * Math.PI * 19;
  const ring = pct => `<svg class="ring" viewBox="0 0 44 44" aria-hidden="true"><circle cx="22" cy="22" r="19" class="ring-bg"/><circle cx="22" cy="22" r="19" class="ring-fg" stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${(C * (1 - pct)).toFixed(1)}"/></svg>`;

  // ---------- home ----------
  SCREENS.home = function home() {
    rollDay();
    const due = dueIds().length, fresh = ofStatus('new').length;
    const counts = { learning: ofStatus('learning').length, mastered: ofStatus('mastered').length, known: ofStatus('known').length };
    const pct = Math.min(1, S.dayXp / S.goal);
    const h = new Date().getHours();
    const hello = h < 5 ? 'Labu nakti' : h < 12 ? 'Labrīt' : h < 18 ? 'Labdien' : 'Labvakar';
    const wod = WORDS[([...dayKey()].reduce((a, c) => a * 31 + c.charCodeAt(0) | 0, 7) >>> 0) % WORDS.length];
    const upcoming = LIST.map(w => rec(w.id)).filter(r => r && !r.k && r.d > Date.now()).map(r => r.d);
    const nextIn = upcoming.length ? Math.min(...upcoming) - Date.now() : 0;
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) && !navigator.standalone;

    view.innerHTML = `
      <header class="top">
        <div><p class="eyebrow">${hello}</p><h1>Vārdi</h1></div>
        <button class="icon-btn" data-act="settings" aria-label="Iestatījumi">${I.sliders}</button>
      </header>

      <section class="goal card" aria-label="Dienas mērķis">
        ${ring(pct)}
        <div class="goal-text"><strong>${S.dayXp} <span>/ ${S.goal} XP</span></strong><small>${pct >= 1 ? 'Šodienas mērķis sasniegts' : 'Dienas mērķis'}</small></div>
        <div class="streak ${S.goalDay === S.day ? 'on' : ''}" aria-label="Sērija ${S.streak} ${plural(S.streak, 'diena', 'dienas')}"><span aria-hidden="true">🔥</span><strong>${S.streak}</strong></div>
      </section>

      ${due
        ? `<button class="cta" data-act="review"><span><strong>Atkārtot vārdus</strong><small>${due} ${plural(due, 'vārds gaida', 'vārdi gaida')}</small></span>${I.arrow}</button>`
        : `<button class="cta" data-act="discover"><span><strong>Mācīties jaunus</strong><small>${fresh ? `${fresh} ${plural(fresh, 'vārds', 'vārdi')} vēl priekšā` : 'Pievieno savus vārdus'}</small></span>${I.arrow}</button>`}

      <div class="grid2">
        <button class="tile" data-act="discover"><span class="tile-ic">${I.cards}</span><strong>Jauni vārdi</strong><small>${fresh} atlikuši</small></button>
        <button class="tile" data-act="games"><span class="tile-ic">${I.bolt}</span><strong>Spēles</strong><small>4 režīmi</small></button>
      </div>
      <button class="tile wide-tile" data-act="lessons"><span class="tile-ic">${I.cap}</span><span class="g-text"><strong>Mācības</strong><small>${nextLesson() ? `Nākamā tēma: ${esc(nextLesson().title)}` : 'Visas tēmas izietas 🎉'}</small></span>${I.arrow}</button>

      <section class="stats card">
        <div><strong>${counts.learning}</strong><small>Mācos</small></div>
        <div><strong>${counts.mastered}</strong><small>Apgūti</small></div>
        <div><strong>${counts.known}</strong><small>Jau zinu</small></div>
      </section>
      ${!due && nextIn ? `<p class="note center">Nākamā atkārtošana pēc ${relTime(nextIn)}</p>` : ''}

      <button class="wod card" data-word="${esc(wod.w)}">
        <span class="eyebrow">Dienas vārds</span>
        <span class="wod-row"><span class="wod-word">${esc(wod.w)}</span><span class="wod-pic" aria-hidden="true">${pic({ ...wod, id: wod.w })}</span></span>
        <span class="wod-lv">${esc(wod.lv)}</span>
      </button>

      ${ios && !S.hideInstall ? `<div class="install card"><p><strong>Pievieno sākuma ekrānam</strong><br>Safari spied <b>Kopīgot</b> → <b>Pievienot sākuma ekrānam</b>, lai lietotu kā lietotni.</p><button class="icon-btn" data-act="hide-install" aria-label="Aizvērt">${I.close}</button></div>` : ''}`;

    view.onclick = e => {
      const b = e.target.closest('[data-act],[data-word]');
      if (!b) return;
      if (b.dataset.word) return openWord(b.dataset.word, () => show('home'));
      const a = b.dataset.act;
      if (a === 'review') show('play', () => runSession('review', shuffle(dueIds()).slice(0, 20)));
      else if (a === 'discover') show('discover');
      else if (a === 'games') show('games');
      else if (a === 'lessons') show('learn');
      else if (a === 'settings') openSettings();
      else if (a === 'hide-install') { S.hideInstall = true; save(); b.closest('.install').remove(); }
    };
  };

  // ---------- discover ----------
  SCREENS.discover = function discover() {
    const queue = shuffle(ofStatus('new').map(w => w.id));
    let learned = [], current = null, revealed = false;

    function next() { revealed = false; current = queue.shift() || null; render(); }
    function render() {
      if (!current) {
        view.innerHTML = `
          <header class="top"><div><p class="eyebrow">Jauni vārdi</p><h1>Viss apskatīts</h1></div></header>
          <div class="empty-state"><div class="big-emoji">🎉</div><p>Tu esi izgājis cauri visiem vārdiem. Pievieno savus vārdnīcā vai spēlē spēles, lai nostiprinātu.</p>
          ${learned.length ? `<button class="btn primary wide" data-act="practice">Nostiprināt ${learned.length} ${plural(learned.length, 'vārdu', 'vārdus')}</button>` : ''}
          <button class="btn ghost wide" data-act="words">Uz vārdnīcu</button></div>`;
        return;
      }
      const w = BY[current];
      view.innerHTML = `
        <header class="top slim"><div><p class="eyebrow">Jauni vārdi</p></div><span class="counter">${learned.length} / ${S.batch}</span></header>
        <div class="stage">
          <article class="wcard ${revealed ? 'open' : ''}" id="card" aria-live="polite">
            <span class="swipe-tag know">Zinu</span><span class="swipe-tag learn">Mācīties</span>
            <span class="card-pic" aria-hidden="true">${pic(w)}</span>
            <span class="pos">${esc(POS[w.t] || '')}${w.m?.length ? ` · ${w.m.length + 1} nozīmes` : ''}</span>
            <h2 class="word">${esc(w.w)}</h2>
            ${speakBtn(w)}
            ${revealed ? details(w, false) : `<p class="hint">Vai zini, ko tas nozīmē?</p>`}
          </article>
        </div>
        <footer class="actions">
          ${revealed
            ? `<button class="btn primary wide" data-act="next">Tālāk ${I.arrow}</button>`
            : `<button class="btn ghost" data-act="know">Jau zinu</button><button class="btn primary" data-act="learn">Mācīties</button>`}
        </footer>
        ${revealed ? '' : `<p class="note center swipe-note">Velc kartīti: pa kreisi — zinu, pa labi — mācīties</p>`}`;
      if (!revealed) { bindSwipe($('#card'), dir => (dir > 0 ? learn() : know(false))); if (S.autoSpeak) speak(w.w); }
    }
    function learn() { startLearning(current); save(); learned.push(current); revealed = true; render(); }
    function know(animate = true) {
      const id = current;
      const go = () => {
        S.p[id] = { k: 1 }; save();
        toast('Atzīmēts kā zināms', { label: 'Atsaukt', fn: () => { delete S.p[id]; save(); if (current) queue.unshift(current); current = id; revealed = false; if (document.body.dataset.route === 'discover') render(); } });
        next();
      };
      animate ? fly($('#card'), -1, go) : go();
    }
    function afterLearn() {
      if (learned.length < S.batch) return next();
      view.innerHTML = `
        <div class="empty-state">
          <div class="big-emoji">🎯</div>
          <h2>${learned.length} jauni vārdi</h2>
          <p>Nostiprini tos ar īsu spēli — tā tie paliks atmiņā daudz labāk.</p>
          <button class="btn primary wide" data-act="practice">Spēlēt</button>
          <button class="btn ghost wide" data-act="more">Vēl jaunus vārdus</button>
        </div>`;
    }
    view.onclick = e => {
      const a = e.target.closest('[data-act]')?.dataset.act;
      if (a === 'learn') { fly($('#card'), 1, () => learn()); }
      else if (a === 'know') know();
      else if (a === 'next') afterLearn();
      else if (a === 'practice') { const ids = learned; show('play', () => runSession('learn', ids)); }
      else if (a === 'more') { learned = []; next(); }
      else if (a === 'words') show('words');
    };
    onKey(e => {
      if (e.target.closest('input,textarea') || sheet.open) return;
      if (!revealed && current && e.key === 'ArrowRight') fly($('#card'), 1, () => learn());
      else if (!revealed && current && e.key === 'ArrowLeft') know();
      else if (revealed && (e.key === 'Enter' || e.key === 'ArrowRight')) afterLearn();
    });
    next();
  };

  function fly(el, dir, cb) {
    if (!el || matchMedia('(prefers-reduced-motion: reduce)').matches) return cb();
    el.style.transition = 'transform .22s cubic-bezier(.3,.7,.4,1), opacity .22s';
    el.style.transform = `translateX(${dir * 110}%) rotate(${dir * 10}deg)`;
    el.style.opacity = '0';
    setTimeout(cb, 200);
  }
  function bindSwipe(el, done) {
    let x0 = null, dx = 0;
    const reset = () => { el.style.transform = ''; el.style.setProperty('--know', 0); el.style.setProperty('--learn', 0); };
    el.addEventListener('pointerdown', e => {
      if (e.target.closest('button')) return;
      x0 = e.clientX; dx = 0; el.setPointerCapture(e.pointerId); el.style.transition = 'none';
    });
    el.addEventListener('pointermove', e => {
      if (x0 === null) return;
      dx = e.clientX - x0;
      el.style.transform = `translateX(${dx}px) rotate(${dx / 22}deg)`;
      el.style.setProperty('--know', Math.min(1, Math.max(0, -dx) / 90));
      el.style.setProperty('--learn', Math.min(1, Math.max(0, dx) / 90));
    });
    const end = () => {
      if (x0 === null) return;
      x0 = null; el.style.transition = '';
      if (Math.abs(dx) > 90) { const dir = dx > 0 ? 1 : -1; fly(el, dir, () => done(dir)); buzz(10); } else reset();
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }

  // ---------- quiz session (review, learn, quiz, spell) ----------
  function chooseType(w) {
    const s = rec(w.id)?.s || 0;
    const easy = ['mc_lv', 'mc_en'];
    if (canSpeak) easy.push('listen');
    const hard = ['spell'];
    if (w.d) hard.push('def');
    if (hasCloze(w)) hard.push('cloze');
    return pick(s >= 3 ? [...easy, ...hard, ...hard] : [...easy, ...hard.filter(t => t !== 'spell')]);
  }
  function buildQ(id, type) {
    const w = BY[id];
    type = type || chooseType(w);
    const q = { id, w, type };
    if (type === 'spell') return q;
    const pool = LIST.filter(o => o.id !== id && o.lv !== w.lv && o.w !== w.w);
    const same = shuffle(pool.filter(o => o.t === w.t)), other = shuffle(pool.filter(o => o.t !== w.t));
    q.opts = shuffle([w, ...[...same, ...other].slice(0, 3)]);
    return q;
  }
  function lev(a, b) {
    const m = Array.from({ length: a.length + 1 }, (_, i) => [i]);
    for (let j = 1; j <= b.length; j++) m[0][j] = j;
    for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
      m[i][j] = Math.min(m[i - 1][j] + 1, m[i][j - 1] + 1, m[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return m[a.length][b.length];
  }

  function runSession(mode, ids) {
    const srs = mode === 'review' || mode === 'learn';
    let queue = mode === 'learn'
      ? [...shuffle(ids).map(id => ({ id, type: 'mc_lv' })), ...shuffle(ids).map(id => ({ id }))]
      : ids.map(id => ({ id, type: mode === 'spell' ? 'spell' : null }));
    const clean = {}; // id -> answered without mistakes
    const requeued = new Set();
    let done = 0, combo = 0, bestCombo = 0, gained = 0, right = 0, answered = 0, q = null, locked = false, autoT;
    let prevPct = 0;
    onCleanup(() => clearTimeout(autoT));

    function next() {
      clearTimeout(autoT);
      if (!queue.length) return finish();
      const item = queue.shift();
      q = buildQ(item.id, item.type);
      locked = false;
      render();
    }
    function prompt() {
      const w = q.w;
      switch (q.type) {
        case 'mc_lv': return `<p class="q-label">Ko nozīmē šis vārds?</p><h2 class="word">${esc(w.w)}</h2>${speakBtn(w)}`;
        case 'mc_en': return `<p class="q-label">Kā to pateikt angliski?</p><h2 class="q-big">${esc(w.lv)}</h2>`;
        case 'listen': return `<p class="q-label">Klausies un izvēlies nozīmi</p><button class="listen-btn" data-say="${esc(w.w)}" aria-label="Atskaņot vēlreiz">${I.sound}</button>`;
        case 'def': return `<p class="q-label">Kurš vārds atbilst skaidrojumam?</p><p class="q-text">${esc(w.d)}</p>`;
        case 'cloze': return `<p class="q-label">Kurš vārds trūkst teikumā?</p><p class="q-text">${esc(w.x).replace(stemRe(w), '<span class="blank">_____</span>')}</p>`;
        case 'spell': return `<p class="q-label">Uzraksti angliski</p><h2 class="q-big">${esc(w.lv)}</h2>${w.d ? `<p class="q-sub">${esc(w.d)}</p>` : ''}`;
      }
    }
    function answers() {
      const w = q.w;
      if (q.type === 'spell') return `
        <form class="spell" autocomplete="off">
          <input id="spell" class="spell-input" autocapitalize="none" autocorrect="off" autocomplete="off" spellcheck="false" enterkeyhint="done"
            placeholder="${esc(w.w[0] + ' _'.repeat(w.w.length - 1))}" aria-label="Tava atbilde">
          <div class="row"><button type="button" class="btn ghost" data-act="giveup">Nezinu</button><button class="btn primary">Pārbaudīt</button></div>
        </form>`;
      const en = ['mc_en', 'def', 'cloze'].includes(q.type);
      return q.opts.map((o, i) => `<button class="opt" data-i="${i}"><span class="key" aria-hidden="true">${i + 1}</span><span>${esc(en ? o.w : o.lv)}</span></button>`).join('');
    }
    function render() {
      const pct = done / (done + queue.length + 1) * 100;
      view.innerHTML = `
        <header class="play-bar">
          <button class="icon-btn" data-act="quit" aria-label="Beigt">${I.close}</button>
          <div class="progress" role="progressbar" aria-valuenow="${Math.round(pct)}" aria-valuemin="0" aria-valuemax="100"><span style="width:${prevPct}%"></span></div>
          <span class="combo ${combo >= 3 ? 'on' : ''}" aria-label="Sērija ${combo}">🔥 ${combo}</span>
        </header>
        <section class="q">${prompt()}</section>
        <section class="answers ${q.type === 'spell' ? '' : 'opts'}">${answers()}</section>
        <div class="feedback" id="fb" hidden></div>`;
      requestAnimationFrame(() => { const bar = $('.progress span'); if (bar) bar.style.width = pct + '%'; });
      prevPct = pct;
      if (q.type === 'listen' || (q.type === 'mc_lv' && S.autoSpeak)) setTimeout(() => speak(q.w.w), 150);
      if (q.type === 'spell') $('#spell').focus();
    }
    function choose(i) {
      const ok = q.opts[i].id === q.id;
      $$('.opt').forEach((b, j) => { b.disabled = true; if (q.opts[j].id === q.id) b.classList.add('ok'); else if (j === i) b.classList.add('bad'); });
      resolve(ok);
    }
    function check(val) {
      const target = q.w.w.toLowerCase(), v = val.trim().toLowerCase();
      const near = v && v !== target && target.length >= 6 && lev(v, target) === 1;
      const ok = v === target || near;
      const input = $('#spell');
      input.disabled = true; input.classList.add(ok ? 'ok' : 'bad');
      $$('.spell button').forEach(b => (b.disabled = true));
      resolve(ok, near ? 'Gandrīz pareizi!' : '');
    }
    function resolve(ok, note) {
      locked = true; answered++; done++;
      clean[q.id] = (clean[q.id] ?? true) && ok;
      const w = q.w;
      let g = 0;
      if (ok) {
        right++; combo++; bestCombo = Math.max(bestCombo, combo);
        g = 10 + Math.min(combo - 1, 5) * 2; gained += g; addXp(g); buzz(12);
      } else {
        combo = 0; buzz([30, 40, 30]);
        if (!requeued.has(q.id)) { requeued.add(q.id); queue.push({ id: q.id, type: q.type === 'spell' ? 'spell' : 'mc_lv' }); }
      }
      if (q.type !== 'mc_lv' && S.autoSpeak) speak(w.w);
      const c = $('.combo'); if (c) { c.textContent = `🔥 ${combo}`; c.classList.toggle('on', combo >= 3); }
      const fb = $('#fb');
      fb.className = `feedback ${ok ? 'ok' : 'bad'}`;
      fb.innerHTML = `
        <div class="fb-row"><strong>${ok ? note || pick(['Pareizi!', 'Lieliski!', 'Tieši tā!']) : 'Ne gluži'}</strong>${ok ? `<span class="gain">+${g} XP</span>` : ''}</div>
        <p class="fb-word"><b>${esc(w.w)}</b> — ${esc(w.lv)}</p>
        ${w.a ? assoc(w) : ''}
        <button class="btn primary wide" data-act="continue">Turpināt</button>`;
      fb.hidden = false;
      fb.querySelector('button').focus({ preventScroll: true });
      if (ok && !note) autoT = setTimeout(next, 1300);
    }
    function finish() {
      const now = Date.now();
      for (const id in clean) {
        const r = S.p[id];
        if (mode === 'learn') { if (r && !r.k) { r.s = clean[id] ? 2 : 1; r.d = now + INTERVALS[r.s]; } }
        else if (srs) grade(id, clean[id]);
        else if (!clean[id] && r?.k) startLearning(id); // a "known" word was missed — learn it
      }
      save();
      const list = Object.keys(clean);
      const acc = answered ? Math.round(right / answered * 100) : 0;
      const [emoji, title] = acc >= 90 ? ['🏆', 'Izcili!'] : acc >= 70 ? ['💪', 'Labs darbs!'] : ['🌱', 'Turpini trenēties'];
      const again = mode === 'review' || mode === 'learn' ? null : { label: 'Vēlreiz', fn: () => show('play', () => runSession(mode, shuffle(gamePool()).slice(0, 10).map(w => w.id))) };
      result({
        emoji, title,
        stats: [[`+${gained}`, 'XP'], [`${acc}%`, 'precizitāte'], [bestCombo, 'labākā sērija']],
        words: list.map(id => [id, clean[id]]),
        primary: mode === 'learn' ? { label: 'Vēl jaunus vārdus', fn: () => show('discover') } : again || { label: 'Uz sākumu', fn: () => show('home') },
        secondary: mode === 'learn' || again ? { label: 'Uz sākumu', fn: () => show('home') } : null,
      });
    }

    view.onclick = e => {
      const b = e.target.closest('button');
      if (!b) return;
      const a = b.dataset.act;
      if (a === 'quit') return show(srs ? 'home' : 'games');
      if (a === 'continue') return next();
      if (a === 'giveup' && !locked) return check('');
      if (b.dataset.i != null && !locked) choose(+b.dataset.i);
    };
    view.onsubmit = e => { e.preventDefault(); if (!locked) check($('#spell').value); };
    onKey(e => {
      if (sheet.open) return;
      if (locked && e.key === 'Enter') { e.preventDefault(); next(); }
      else if (!locked && q?.opts && /^[1-4]$/.test(e.key)) choose(+e.key - 1);
    });
    next();
  }

  function result({ emoji, title, stats, words, primary, secondary }) {
    document.body.dataset.route = 'play';
    view.innerHTML = `
      <section class="result">
        <div class="result-emoji" aria-hidden="true">${emoji}</div>
        <h2>${title}</h2>
        <div class="result-stats">${stats.map(([v, l]) => `<div><strong>${v}</strong><small>${l}</small></div>`).join('')}</div>
        ${words?.length ? `<ul class="result-list">${words.map(([id, ok]) => `<li class="${ok ? 'ok' : 'bad'}"><span class="mark" aria-label="${ok ? 'Pareizi' : 'Kļūda'}">${ok ? '✓' : '✗'}</span><b>${esc(BY[id].w)}</b><small>${esc(BY[id].lv)}</small></li>`).join('')}</ul>` : ''}
        <div class="result-actions">
          ${secondary ? `<button class="btn ghost" data-act="sec">${secondary.label}</button>` : ''}
          <button class="btn primary" data-act="pri">${primary.label}</button>
        </div>
      </section>`;
    view.onclick = e => { const a = e.target.closest('[data-act]')?.dataset.act; if (a === 'pri') primary.fn(); else if (a === 'sec') secondary.fn(); };
    view.onsubmit = null;
    $('[data-act="pri"]').focus({ preventScroll: true });
  }

  // ---------- games ----------
  SCREENS.games = function games() {
    const small = LIST.filter(w => status(w.id) !== 'new').length < 10;
    view.innerHTML = `
      <header class="top"><div><p class="eyebrow">Trenējies spēlējot</p><h1>Spēles</h1></div></header>
      ${small ? `<p class="note">Kamēr tev ir mazāk nekā 10 apgūstamu vārdu, spēlēs tiek izmantota visa vārdnīca.</p>` : ''}
      <div class="game-list">
        <button class="game" data-game="quiz"><span class="g-ic" aria-hidden="true">🎯</span><span class="g-text"><strong>Ātrais tests</strong><small>10 dažādi jautājumi</small></span>${I.arrow}</button>
        <button class="game" data-game="match"><span class="g-ic" aria-hidden="true">🧩</span><span class="g-text"><strong>Pāri</strong><small>Savieno vārdus ar tulkojumiem${S.best.match ? ` · rekords ${fmtTime(S.best.match)}` : ''}</small></span>${I.arrow}</button>
        <button class="game" data-game="speed"><span class="g-ic" aria-hidden="true">⚡</span><span class="g-text"><strong>60 sekundes</strong><small>Pareizi vai nepareizi?${S.best.speed ? ` · rekords ${S.best.speed}` : ''}</small></span>${I.arrow}</button>
        <button class="game" data-game="spell"><span class="g-ic" aria-hidden="true">✍️</span><span class="g-text"><strong>Pareizrakstība</strong><small>Uzraksti vārdu pats</small></span>${I.arrow}</button>
      </div>`;
    view.onclick = e => {
      const g = e.target.closest('[data-game]')?.dataset.game;
      if (!g) return;
      const ids = () => shuffle(gamePool()).slice(0, 10).map(w => w.id);
      if (g === 'quiz') show('play', () => runSession('quiz', ids()));
      else if (g === 'spell') show('play', () => runSession('spell', ids()));
      else if (g === 'match') show('play', matchGame);
      else if (g === 'speed') show('play', speedGame);
    };
  };

  function matchGame() {
    const pool = shuffle(gamePool()).slice(0, 15);
    const rounds = [];
    for (let i = 0; i + 3 <= pool.length; i += 5) rounds.push(pool.slice(i, i + 5));
    const pairs = rounds.flat().length;
    let r = 0, matched = 0, mistakes = 0, sel = {};
    const t0 = Date.now();
    const tick = setInterval(() => { const el = $('#clock'); if (el) el.textContent = fmtTime((Date.now() - t0) / 1000); }, 250);
    onCleanup(() => clearInterval(tick));

    function render() {
      const set = rounds[r]; matched = 0; sel = {};
      view.innerHTML = `
        <header class="play-bar">
          <button class="icon-btn" data-act="quit" aria-label="Beigt">${I.close}</button>
          <div class="progress"><span style="width:${r / rounds.length * 100}%"></span></div>
          <span class="clock" id="clock">${fmtTime((Date.now() - t0) / 1000)}</span>
        </header>
        <p class="q-label center">Savieno vārdu ar tulkojumu</p>
        <div class="match">
          <div class="col">${shuffle(set).map(w => `<button class="mtile en" data-side="en" data-id="${esc(w.id)}">${esc(w.w)}</button>`).join('')}</div>
          <div class="col">${shuffle(set).map(w => `<button class="mtile" data-side="lv" data-id="${esc(w.id)}">${esc(w.lv)}</button>`).join('')}</div>
        </div>`;
    }
    function finish() {
      clearInterval(tick);
      const secs = Math.round((Date.now() - t0) / 1000);
      const record = !S.best.match || secs < S.best.match;
      if (record) S.best.match = secs;
      addXp(pairs * 4); save();
      result({
        emoji: record ? '🏆' : '🧩', title: record ? 'Jauns rekords!' : 'Visi pāri atrasti',
        stats: [[fmtTime(secs), 'laiks'], [mistakes, plural(mistakes, 'kļūda', 'kļūdas')], [`+${pairs * 4}`, 'XP']],
        primary: { label: 'Vēlreiz', fn: () => show('play', matchGame) },
        secondary: { label: 'Spēles', fn: () => show('games') },
      });
    }
    view.onclick = e => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.act === 'quit') return show('games');
      const side = b.dataset.side;
      if (!side || b.disabled) return;
      if (sel[side] === b) { b.classList.remove('sel'); delete sel[side]; return; }
      sel[side]?.classList.remove('sel');
      sel[side] = b; b.classList.add('sel');
      if (side === 'en' && S.autoSpeak) speak(BY[b.dataset.id].w);
      if (!(sel.en && sel.lv)) return;
      const [x, y] = [sel.en, sel.lv]; sel = {};
      if (x.dataset.id === y.dataset.id) {
        [x, y].forEach(t => { t.classList.remove('sel'); t.classList.add('done'); t.disabled = true; });
        buzz(10);
        if (++matched === rounds[r].length) { r++; setTimeout(() => (r < rounds.length ? render() : finish()), 350); }
      } else {
        mistakes++; buzz([30, 40, 30]);
        [x, y].forEach(t => { t.classList.remove('sel'); t.classList.add('shake'); setTimeout(() => t.classList.remove('shake'), 400); });
      }
    };
    render();
  }

  function speedGame() {
    const pool = gamePool(), DUR = 60;
    let score = 0, miss = 0, cur = null, over = false;
    view.innerHTML = `
      <header class="play-bar">
        <button class="icon-btn" data-act="quit" aria-label="Beigt">${I.close}</button>
        <div class="progress timer"><span style="animation-duration:${DUR}s"></span></div>
        <span class="clock" id="score" aria-live="polite">0</span>
      </header>
      <section class="speed">
        <div class="speed-card" id="sc"><h2 class="word" id="sw"></h2><span class="speed-eq">=</span><p class="q-big" id="sl"></p></div>
      </section>
      <div class="speed-actions">
        <button class="btn big no" data-v="0">${I.close}<span>Nepareizi</span></button>
        <button class="btn big yes" data-v="1">${I.check}<span>Pareizi</span></button>
      </div>
      <p class="note center kbd-note">Tastatūra: ← nepareizi · → pareizi</p>`;
    function nextPair() {
      const w = pick(pool), truth = Math.random() < 0.5;
      cur = { w, truth };
      $('#sw').textContent = w.w;
      $('#sl').textContent = truth ? w.lv : pick(LIST.filter(o => o.lv !== w.lv)).lv;
    }
    function choose(v) {
      if (over) return;
      const ok = v === cur.truth;
      ok ? score++ : miss++;
      $('#score').textContent = score;
      const c = $('#sc'); c.classList.remove('flash-ok', 'flash-bad'); void c.offsetWidth; c.classList.add(ok ? 'flash-ok' : 'flash-bad');
      buzz(ok ? 8 : [25, 30, 25]);
      nextPair();
    }
    function finish() {
      over = true;
      const record = score > S.best.speed;
      if (record) S.best.speed = score;
      if (score) addXp(score * 3);
      save();
      result({
        emoji: record ? '🏆' : '⚡', title: record ? 'Jauns rekords!' : 'Laiks beidzies',
        stats: [[score, 'pareizi'], [miss, plural(miss, 'kļūda', 'kļūdas')], [`+${score * 3}`, 'XP']],
        primary: { label: 'Vēlreiz', fn: () => show('play', speedGame) },
        secondary: { label: 'Spēles', fn: () => show('games') },
      });
    }
    view.onclick = e => { const b = e.target.closest('button'); if (!b) return; if (b.dataset.act === 'quit') return show('games'); if (b.dataset.v) choose(b.dataset.v === '1'); };
    onKey(e => { if (e.key === 'ArrowLeft') choose(false); else if (e.key === 'ArrowRight') choose(true); });
    const t = setTimeout(finish, DUR * 1000);
    onCleanup(() => { clearTimeout(t); over = true; });
    nextPair();
  }

  // ---------- lessons (grammar & phrases) ----------
  const lessonById = id => LESSONS.find(l => l.id === id);
  const nextLesson = () => LESSONS.find(l => !S.lessons[l.id]) || null;
  const lessonStars = id => { const b = S.lessons[id]?.best; return b == null ? 0 : b >= 95 ? 3 : b >= 80 ? 2 : 1; };
  const stars = n => `<span class="stars" aria-label="${n} no 3 zvaigznēm">${[1, 2, 3].map(i => `<i class="${i <= n ? 'on' : ''}">★</i>`).join('')}</span>`;
  // Fill ___ blanks with the answer ("a / The" fills two blanks, "—" means no word)
  const fillBlanks = (q, ans) => { const parts = ans.split(' / '); let k = 0; return esc(q).replace(/___/g, () => { const t = parts[Math.min(k++, parts.length - 1)]; return t === '—' ? '' : `<b>${esc(t)}</b>`; }).replace(/\s{2,}/g, ' '); };
  const sayable = x => x.replace(/\(.*?\)/g, '').split(' — ')[0].trim();

  SCREENS.learn = function learn() {
    const cats = [...new Set(LESSONS.map(l => l.cat))];
    const done = LESSONS.filter(l => S.lessons[l.id]).length;
    view.innerHTML = `
      <header class="top"><div><p class="eyebrow">${done} no ${LESSONS.length} tēmām izietas</p><h1>Mācības</h1></div></header>
      ${cats.map(c => `
        <section class="lesson-group">
          <h2 class="group-title">${esc(c)}</h2>
          <div class="game-list">${LESSONS.filter(l => l.cat === c).map(l => `
            <button class="game" data-lesson="${l.id}"><span class="g-ic" aria-hidden="true">${l.e}</span><span class="g-text"><strong>${esc(l.title)}</strong><small>${esc(l.sub)}</small></span>${S.lessons[l.id] ? stars(lessonStars(l.id)) : I.arrow}</button>`).join('')}
          </div>
        </section>`).join('')}`;
    view.onclick = e => { const id = e.target.closest('[data-lesson]')?.dataset.lesson; if (id) show('learn', () => lessonIntro(id)); };
  };

  function lessonIntro(id) {
    const l = lessonById(id);
    view.innerHTML = `
      <header class="top slim"><button class="icon-btn" data-act="back" aria-label="Atpakaļ uz tēmām">${I.back}</button>${S.lessons[id] ? stars(lessonStars(id)) : ''}</header>
      <div class="lesson-head">
        <span class="lesson-emoji" aria-hidden="true">${l.e}</span>
        <p class="eyebrow">${esc(l.cat)} · ${esc(l.sub)}</p>
        <h1 class="lesson-title">${esc(l.title)}</h1>
        <p class="lesson-intro">${esc(l.intro)}</p>
      </div>
      ${l.rules.map((r, i) => `
        <section class="rule card">
          <h3><span class="rule-n">${i + 1}</span>${esc(r.h)}</h3>
          <p>${esc(r.d)}</p>
          <ul class="rule-ex">${r.ex.map(x => `<li><button data-say="${esc(sayable(x))}">${I.sound}<span>${esc(x)}</span></button></li>`).join('')}</ul>
        </section>`).join('')}
      ${l.tip ? `<div class="tip"><span aria-hidden="true">💡</span><p>${esc(l.tip)}</p></div>` : ''}
      <button class="btn primary wide" data-act="start">Sākt vingrinājumus · ${l.qs.length}</button>`;
    view.onclick = e => {
      const a = e.target.closest('[data-act]')?.dataset.act;
      if (a === 'back') show('learn');
      else if (a === 'start') show('play', () => runLesson(id));
    };
  }

  function runLesson(id) {
    const l = lessonById(id);
    const queue = shuffle(l.qs.map((_, i) => i));
    const first = {}; // question index -> correct on first try
    const requeued = new Set();
    let done = 0, combo = 0, gained = 0, q = null, opts = null, locked = false, autoT, prevPct = 0;
    onCleanup(() => clearTimeout(autoT));
    const answer = () => q.o ? q.o[0] : q.a;

    function next() {
      clearTimeout(autoT);
      if (!queue.length) return finish();
      const i = queue.shift();
      q = { ...l.qs[i], i };
      opts = q.o ? shuffle(q.o.map((t, j) => ({ t, ok: j === 0 }))) : null;
      locked = false;
      render();
    }
    function render() {
      const pct = done / (done + queue.length + 1) * 100;
      view.innerHTML = `
        <header class="play-bar">
          <button class="icon-btn" data-act="quit" aria-label="Beigt">${I.close}</button>
          <div class="progress"><span style="width:${prevPct}%"></span></div>
          <span class="combo ${combo >= 3 ? 'on' : ''}">🔥 ${combo}</span>
        </header>
        <section class="q">
          <p class="q-label">${opts ? 'Izvēlies pareizo variantu' : 'Ieraksti trūkstošo'}</p>
          <p class="q-text">${esc(q.q).replace(/___/g, '<span class="blank">_____</span>')}</p>
        </section>
        <section class="answers ${opts ? 'opts' : ''}">${opts
          ? opts.map((o, i) => `<button class="opt" data-i="${i}"><span class="key" aria-hidden="true">${i + 1}</span><span>${esc(o.t)}</span></button>`).join('')
          : `<form class="spell" autocomplete="off">
              <input id="spell" class="spell-input" autocapitalize="none" autocorrect="off" autocomplete="off" spellcheck="false" enterkeyhint="done" placeholder="Tava atbilde" aria-label="Tava atbilde">
              <div class="row"><button type="button" class="btn ghost" data-act="giveup">Nezinu</button><button class="btn primary">Pārbaudīt</button></div>
            </form>`}</section>
        <div class="feedback" id="fb" hidden></div>`;
      requestAnimationFrame(() => { const bar = $('.progress span'); if (bar) bar.style.width = pct + '%'; });
      prevPct = pct;
      $('#spell')?.focus();
    }
    function resolve(ok) {
      locked = true; done++;
      if (!(q.i in first)) first[q.i] = ok;
      let g = 0;
      if (ok) { combo++; g = 10 + Math.min(combo - 1, 5) * 2; gained += g; addXp(g); buzz(12); }
      else {
        combo = 0; buzz([30, 40, 30]);
        if (!requeued.has(q.i)) { requeued.add(q.i); queue.push(q.i); }
      }
      const full = fillBlanks(q.q.replace(/\s*\([^)]*\)/g, ''), answer());
      if (S.autoSpeak) speak(full.replace(/<[^>]+>/g, ''));
      const c = $('.combo'); if (c) { c.textContent = `🔥 ${combo}`; c.classList.toggle('on', combo >= 3); }
      const fb = $('#fb');
      fb.className = `feedback ${ok ? 'ok' : 'bad'}`;
      fb.innerHTML = `
        <div class="fb-row"><strong>${ok ? pick(['Pareizi!', 'Lieliski!', 'Tieši tā!']) : 'Ne gluži'}</strong>${ok ? `<span class="gain">+${g} XP</span>` : ''}</div>
        <p class="fb-word">${full}</p>
        ${q.why ? `<p class="fb-why">${esc(q.why)}</p>` : ''}
        <button class="btn primary wide" data-act="continue">Turpināt</button>`;
      fb.hidden = false;
      fb.querySelector('button').focus({ preventScroll: true });
      if (ok) autoT = setTimeout(next, 1800);
    }
    function choose(i) {
      $$('.opt').forEach((b, j) => { b.disabled = true; if (opts[j].ok) b.classList.add('ok'); else if (j === i) b.classList.add('bad'); });
      resolve(opts[i].ok);
    }
    function check(val) {
      const norm = t => t.toLowerCase().replace(/[’']/g, "'").replace(/[.!?]+$/, '').replace(/\s+/g, ' ').trim();
      const ok = !!val.trim() && norm(val) === norm(q.a);
      const input = $('#spell');
      input.disabled = true; input.classList.add(ok ? 'ok' : 'bad');
      $$('.spell button').forEach(b => (b.disabled = true));
      resolve(ok);
    }
    function finish() {
      const score = Math.round(Object.values(first).filter(Boolean).length / l.qs.length * 100);
      const prev = S.lessons[id]?.best ?? -1;
      S.lessons[id] = { best: Math.max(prev, score) };
      save();
      const n = score >= 95 ? 3 : score >= 80 ? 2 : 1;
      const idx = LESSONS.indexOf(l), nextL = LESSONS[idx + 1];
      const passed = score >= 80;
      result({
        emoji: n === 3 ? '🏆' : passed ? '💪' : '🌱',
        title: n === 3 ? 'Perfekti!' : passed ? 'Tēma apgūta!' : 'Vēl mazliet jātrenējas',
        stats: [[`${score}%`, 'pareizi'], [stars(n), 'novērtējums'], [`+${gained}`, 'XP']],
        primary: passed && nextL ? { label: 'Nākamā tēma', fn: () => show('learn', () => lessonIntro(nextL.id)) } : { label: 'Mēģināt vēlreiz', fn: () => show('play', () => runLesson(id)) },
        secondary: { label: 'Uz tēmām', fn: () => show('learn') },
      });
    }

    view.onclick = e => {
      const b = e.target.closest('button');
      if (!b) return;
      const a = b.dataset.act;
      if (a === 'quit') return show('learn', () => lessonIntro(id));
      if (a === 'continue') return next();
      if (a === 'giveup' && !locked) return check('');
      if (b.dataset.i != null && !locked) choose(+b.dataset.i);
    };
    view.onsubmit = e => { e.preventDefault(); if (!locked) check($('#spell').value); };
    onKey(e => {
      if (sheet.open) return;
      if (locked && e.key === 'Enter') { e.preventDefault(); next(); }
      else if (!locked && opts && /^[1-4]$/.test(e.key) && +e.key <= opts.length) choose(+e.key - 1);
    });
    next();
  }

  // ---------- words ----------
  SCREENS.words = function words() {
    const FILTERS = [['all', 'Visi'], ['learning', 'Mācos'], ['mastered', 'Apgūti'], ['known', 'Zinu'], ['new', 'Jauni']];
    let filter = 'all', query = '';
    const count = k => (k === 'all' ? LIST.length : ofStatus(k).length);
    function paint() {
      view.innerHTML = `
        <header class="top">
          <div><p class="eyebrow">${LIST.length} vārdi</p><h1>Vārdnīca</h1></div>
          <button class="icon-btn" data-act="add" aria-label="Pievienot vārdu">${I.plus}</button>
        </header>
        <label class="search">${I.search}<input type="search" id="q" placeholder="Meklēt vārdu vai tulkojumu" autocomplete="off" value="${esc(query)}"></label>
        <div class="chips">${FILTERS.map(([k, l]) => `<button class="chip" data-f="${k}" aria-pressed="${k === filter}">${l}<span>${count(k)}</span></button>`).join('')}</div>
        <ul class="wlist" id="wl"></ul>`;
      list();
    }
    function list() {
      const qq = query.trim().toLowerCase();
      const items = LIST.filter(w => (filter === 'all' || status(w.id) === filter) && (!qq || w.w.toLowerCase().includes(qq) || w.lv.toLowerCase().includes(qq) || w.m?.some(m => m.lv.toLowerCase().includes(qq))))
        .sort((a, b) => a.w.localeCompare(b.w));
      $('#wl').innerHTML = items.length
        ? items.map(w => { const st = status(w.id); return `<li><button data-word="${esc(w.id)}"><span class="wl-pic" aria-hidden="true">${pic(w)}</span><span class="wl-main"><strong>${esc(w.w)}</strong><small>${esc(w.lv)}${w.m?.length ? ` <span class="mm-count">+${w.m.length}</span>` : ''}</small></span>${st === 'known' ? '<span class="tag">zinu</span>' : st === 'new' ? '' : dots(w.id)}</button></li>`; }).join('')
        : `<li class="empty">Nekas netika atrasts</li>`;
    }
    view.oninput = e => { if (e.target.id === 'q') { query = e.target.value; list(); } };
    view.onclick = e => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.f) { filter = b.dataset.f; $$('.chip').forEach(c => c.setAttribute('aria-pressed', c === b)); list(); }
      else if (b.dataset.word) openWord(b.dataset.word, paint);
      else if (b.dataset.act === 'add') openAdd(paint);
    };
    paint();
  };

  function openWord(id, after) {
    const w = BY[id];
    if (!w) return;
    const st = status(id), custom = isCustom(id);
    const acts = {
      new: `<button class="btn ghost" data-act="known">Jau zinu</button><button class="btn primary" data-act="learn">Mācīties</button>`,
      learning: `<button class="btn ghost" data-act="reset">Sākt no jauna</button>`,
      mastered: `<button class="btn ghost" data-act="reset">Sākt no jauna</button>`,
      known: `<button class="btn primary" data-act="learn">Tomēr mācīties</button>`,
    }[st];
    const r = rec(id);
    const due = r && !r.k ? (r.d <= Date.now() ? 'jāatkārto tagad' : `atkārtot pēc ${relTime(r.d - Date.now())}`) : '';
    openSheet(`
      <div class="detail">
        <span class="pos">${esc(POS[w.t] || '')}</span>
        <h2 class="word">${esc(w.w)}</h2>
        ${speakBtn(w)}
        ${details(w)}
        <p class="detail-status"><span>${STATUS[st]}${due ? ` · ${due}` : ''}</span>${st === 'learning' || st === 'mastered' ? dots(id) : ''}</p>
        <div class="sheet-actions">${acts}</div>
        ${custom ? `<button class="btn text danger wide" data-act="del">Dzēst vārdu</button>` : ''}
      </div>`, body => {
      body.onclick = e => {
        const a = e.target.closest('[data-act]')?.dataset.act;
        if (!a) return;
        if (a === 'learn') { startLearning(id); toast('Pievienots mācībām'); }
        else if (a === 'known') { S.p[id] = { k: 1 }; toast('Atzīmēts kā zināms'); }
        else if (a === 'reset') { startLearning(id); toast('Progress atiestatīts'); }
        else if (a === 'del') { S.custom = S.custom.filter(c => c.id !== id); delete S.p[id]; indexWords(); toast('Vārds dzēsts'); }
        save(); closeSheet(); after?.();
      };
    });
    if (S.autoSpeak) speak(w.w);
  }

  function openAdd(after) {
    openSheet(`
      <form class="form" novalidate>
        <h2 class="sheet-title">Jauns vārds</h2>
        <label>Vārds angliski<input name="w" required autocomplete="off" autocapitalize="none" spellcheck="false"></label>
        <label>Tulkojums latviski<input name="lv" required autocomplete="off"></label>
        <label>Asociācija <small>kas palīdzēs atcerēties</small><textarea name="a" rows="2" placeholder="Piem., skan kā…"></textarea></label>
        <div class="form-row">
          <label class="emoji-field">Ikona<input name="e" maxlength="8" placeholder="💡"></label>
          <label>Vārdšķira<select name="t"><option value="">—</option><option value="noun">lietvārds</option><option value="verb">darbības v.</option><option value="adj">īpašības v.</option></select></label>
        </div>
        <label class="photo-field">Bilde asociācijai <small>nav obligāti</small>
          <span class="photo-pick"><span class="photo-prev" id="photoPrev">${I.plus}</span><span>Izvēlēties vai nofotografēt</span></span>
          <input type="file" name="photo" accept="image/*" hidden>
        </label>
        <label>Skaidrojums angliski <small>nav obligāti</small><input name="d" autocomplete="off"></label>
        <label>Piemēra teikums <small>nav obligāti</small><input name="x" autocomplete="off"></label>
        <p class="form-error" role="alert"></p>
        <button class="btn primary wide">Pievienot</button>
      </form>`, body => {
      let photo = '';
      $('input[type=file]', body).onchange = async e => {
        const file = e.target.files[0];
        if (!file) return;
        photo = await shrinkImage(file);
        $('#photoPrev', body).innerHTML = `<img src="${photo}" alt="">`;
      };
      body.onsubmit = e => {
        e.preventDefault();
        const f = Object.fromEntries(new FormData(e.target));
        delete f.photo;
        Object.keys(f).forEach(k => (f[k] = f[k].trim()));
        const err = $('.form-error', body);
        if (!f.w || !f.lv) { err.textContent = 'Ievadi vārdu un tulkojumu.'; return; }
        if (LIST.some(w => w.w.toLowerCase() === f.w.toLowerCase())) { err.textContent = 'Šāds vārds jau ir vārdnīcā.'; return; }
        const id = 'c' + Date.now().toString(36);
        S.custom.push({ id, w: f.w, lv: f.lv, a: f.a, e: f.e || '💡', t: f.t, d: f.d, x: f.x, p: '', img: photo });
        startLearning(id); indexWords(); save();
        closeSheet(); toast(`«${f.w}» pievienots`); after?.();
      };
    });
    setTimeout(() => $('.sheet-body input')?.focus(), 50);
  }

  // Downscale a photo to a small square-ish JPEG data URL so it fits in localStorage
  function shrinkImage(file, max = 256) {
    return new Promise((ok, fail) => {
      const img = new Image();
      img.onload = () => {
        const k = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(img.src);
        ok(c.toDataURL('image/jpeg', 0.8));
      };
      img.onerror = fail;
      img.src = URL.createObjectURL(file);
    });
  }

  // Drop all cached app files (progress stays) and load the newest version from the server
  async function forceUpdate() {
    try {
      const regs = await navigator.serviceWorker?.getRegistrations() || [];
      await Promise.all(regs.map(r => r.unregister()));
      const keys = await caches?.keys() || [];
      await Promise.all(keys.filter(k => k !== 'vardi-img').map(k => caches.delete(k)));
    } catch {}
    location.replace(location.pathname + '?v=' + Date.now());
  }

  function openSettings() {
    const seg = (key, opts) => `<div class="seg" role="group">${opts.map(([v, l]) => `<button type="button" data-k="${key}" data-v="${v}" aria-pressed="${String(S[key]) === String(v)}">${l}</button>`).join('')}</div>`;
    openSheet(`
      <h2 class="sheet-title">Iestatījumi</h2>
      <div class="setting"><span>Dienas mērķis (XP)</span>${seg('goal', [[20, '20'], [50, '50'], [100, '100']])}</div>
      <div class="setting"><span>Jauni vārdi vienā reizē</span>${seg('batch', [[5, '5'], [10, '10']])}</div>
      <div class="setting"><span>Izruna</span>${seg('accent', [['en-GB', 'UK'], ['en-US', 'US']])}</div>
      <div class="setting"><span>Automātiski izrunāt</span>${seg('autoSpeak', [[true, 'Jā'], [false, 'Nē']])}</div>
      <p class="note">Kopā nopelnīti ${S.xp} XP. Progress glabājas tikai šajā ierīcē.</p>
      <p class="note">Vārdu izruna: īsti cilvēku ieraksti no Wiktionary / Wikimedia Commons (CC BY-SA). Teikumus lasa telefona balss — dabiskākai balsij iPhone iestatījumos ielādē «Ava (Premium)»: Pieejamība → Runātais saturs → Balsis → English.</p>
      <button class="btn ghost wide" data-act="update">Atjaunināt lietotni</button>
      <p class="note center">Versija ${VERSION}</p>
      <button class="btn text danger wide" data-act="reset">Dzēst visu progresu</button>`, body => {
      body.onclick = e => {
        const b = e.target.closest('button');
        if (!b) return;
        if (b.dataset.k) {
          const k = b.dataset.k, v = b.dataset.v;
          S[k] = k === 'accent' ? v : v === 'true' ? true : v === 'false' ? false : +v;
          save();
          $$(`[data-k="${k}"]`, body).forEach(x => x.setAttribute('aria-pressed', x === b));
          if (k === 'accent') { pickVoice(); speak('Hello'); }
        } else if (b.dataset.act === 'update') {
          b.textContent = 'Atjaunina…'; b.disabled = true;
          forceUpdate();
        } else if (b.dataset.act === 'reset') {
          if (!b.dataset.armed) { b.dataset.armed = '1'; b.textContent = 'Pieskaries vēlreiz, lai dzēstu'; return; }
          localStorage.removeItem(KEY); S = load(); indexWords(); closeSheet(); toast('Progress dzēsts');
        }
      };
    }, () => { if (document.body.dataset.route === 'home') show('home'); });
  }

  // ---------- boot ----------
  $$('[data-icon]').forEach(el => (el.outerHTML = I[el.dataset.icon]));
  $('.tabbar').addEventListener('click', e => { const t = e.target.closest('[data-tab]'); if (t) show(t.dataset.tab); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && document.body.dataset.route === 'home') show('home'); });
  show('home');
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').then(reg => reg.update()).catch(() => {});
    // A new version took over right after opening: reload once so it shows immediately
    const hadController = !!navigator.serviceWorker.controller, openedAt = Date.now();
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController && Date.now() - openedAt < 15000) location.reload(); });
    navigator.serviceWorker.ready.then(reg => reg.active?.postMessage({ type: 'precache', urls: [...WORDS.map(w => `img/${encodeURIComponent(w.w)}.png`), ...Object.keys(AUDIO).map(recordingUrl)] }));
  }
})();
