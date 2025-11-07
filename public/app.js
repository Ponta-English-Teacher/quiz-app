/* Quiz App — app.js (v2 + category header + correct ding) */

const $ = (s) => document.querySelector(s);

let level = 'A1';
let lang = 'en';
let dataCache = {};     // { 'A1': [...], 'A2': [...] }
let pool = [];          // current level’s items
let idx = 0;            // current index
let current = null;     // current item

/* ----------------------- Audio: TTS & Correct Ding ----------------------- */

async function speakAzure(text, lang, voice) {
  const payload = { text, lang, voice };
  const res = await fetch('/api/tts', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('TTS request failed');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  await audio.play();
}

function playCorrectSound() {
  // Put a small mp3 at: public/sounds/correct.mp3
  const ding = new Audio('sounds/correct.mp3');
  ding.play().catch(() => {
    // If file missing / autoplay blocked, fail silently
    console.warn('Correct sound could not be played (missing file or autoplay policy).');
  });
}

/* ----------------------------- Data Loading ------------------------------ */

async function loadLevel(lvl) {
  if (dataCache[lvl]) return dataCache[lvl];
  const url = `./data/quizData_${lvl}.json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status}`);
  const json = await res.json();
  dataCache[lvl] = Array.isArray(json) ? json : [];
  return dataCache[lvl];
}

function pickPool() {
  pool = dataCache[level] || [];
  idx = 0;
  current = pool.length ? pool[0] : null;
}

/* ------------------------------- Rendering ------------------------------- */

function renderPos() {
  $('#pos').textContent = pool.length ? `${idx + 1} / ${pool.length}` : '– / –';
}

function renderMeta() {
  if (!current) {
    $('#meta').textContent = '';
    return;
  }
  const cat = current.category || '-';
  const lvl = current.level || level;
  $('#meta').innerHTML = `<b>Category:</b> ${cat} &nbsp; <span class="chip">Level: ${lvl}</span>`;
}

function renderQuestion() {
  if (!current) {
    $('#question').textContent = 'No items.';
    return;
  }
  $('#question').textContent = current.question || '';
}

function clearStatus() {
  const st = $('#status');
  if (st) st.remove();
}

function showStatus(text, kind) {
  clearStatus();
  const el = document.createElement('div');
  el.id = 'status';
  el.className = `status ${kind || ''}`;
  el.textContent = text;
  $('#quiz').appendChild(el);
}

function renderChoices() {
  const box = $('#choices');
  box.innerHTML = '';
  if (!current || !Array.isArray(current.choices)) return;

  // Shuffle a shallow copy so original order in data remains intact
  const choices = [...current.choices]
    .map(c => ({ c, r: Math.random() }))
    .sort((a,b) => a.r - b.r)
    .map(x => x.c);

  choices.forEach(choiceText => {
    const btn = document.createElement('button');
    btn.className = 'choice';
    btn.textContent = choiceText;

    btn.onclick = () => {
      // Disable all choices after first click
      [...box.querySelectorAll('.choice')].forEach(b => b.disabled = true);

      const correct = String(current.correctAnswer || '').trim();
      const isCorrect = String(choiceText || '').trim() === correct;

      if (isCorrect) {
        btn.classList.add('ok');
        playCorrectSound();
        showStatus('✅ Correct!', 'ok');
      } else {
        btn.classList.add('ko');
        showStatus('❌ Wrong!', 'ko');
      }
    };

    box.appendChild(btn);
  });
}

function renderHints() {
  // Only (re)compute content; visibility is toggled by button
  const hWrap = $('#hints');
  if (!current) {
    hWrap.style.display = 'none';
    hWrap.innerHTML = '';
    return;
  }

  const en = Array.isArray(current.hint_en) ? current.hint_en : [];
  const ja = Array.isArray(current.hint_ja) ? current.hint_ja : [];

  // Pair English + Japanese lines
  const lines = [];
  const max = Math.max(en.length, ja.length);
  for (let i = 0; i < max; i++) {
    const left = en[i] ?? '';
    const right = ja[i] ?? '';
    if (lang === 'ja') {
      lines.push(right || left); // prefer ja, fallback en
    } else {
      lines.push(left || right); // prefer en, fallback ja
    }
  }

  hWrap.innerHTML = lines.map(t => `<div>• ${escapeHTML(t)}</div>`).join('');
}

function renderExplain() {
  const ex = $('#explain');
  if (!current) {
    ex.style.display = 'none';
    ex.textContent = '';
    return;
  }
  const t = String(current.translation || '').trim();
  if (!t) {
    ex.textContent = lang === 'ja' ? '日本語訳はまだありません。' : 'No translation yet.';
  } else {
    ex.textContent = t;
  }
}

function render() {
  renderPos();
  renderMeta();
  renderQuestion();
  renderChoices();
  renderHints();
  clearStatus(); // reset status on render
}

/* --------------------------------- Utils -------------------------------- */

function escapeHTML(s) {
  return String(s)
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'",'&#39;');
}

/* ------------------------------ Event Wiring ----------------------------- */

async function main() {
  // Initial load for default level
  level = $('#level')?.value || 'A1';
  lang = $('#lang')?.value || 'en';

  await loadLevel(level);
  pickPool();
  render();

  // Level change
  $('#level').onchange = async () => {
    level = $('#level').value;
    await loadLevel(level);
    pickPool();
    render();
  };

  // Language change (just re-render hints & explain)
  $('#lang').onchange = () => {
    lang = $('#lang').value;
    renderHints();
    renderExplain();
  };

  // Navigation
  $('#prevBtn').onclick = () => {
    if (!pool.length) return;
    idx = Math.max(0, idx - 1);
    current = pool[idx];
    render();
  };

  $('#nextBtn').onclick = () => {
    if (!pool.length) return;
    idx = Math.min(pool.length - 1, idx + 1);
    current = pool[idx];
    render();
  };

  // Play question TTS
  $('#playQuestion').onclick = async () => {
    if (!current) return;
    const voice = $('#voice')?.value || 'en-GB-LibbyNeural';
    const txt = current.question || '';
    try {
      await speakAzure(txt, lang, voice);
    } catch (e) {
      console.error(e);
      alert('Audio error (TTS).');
    }
  };

  // Toggle hints
  $('#showHints').onclick = () => {
    const h = $('#hints');
    if (!current) return;
    renderHints();
    h.style.display = (h.style.display === 'none' || !h.style.display) ? 'block' : 'none';
  };

  // Show explanation (translation)
  $('#showExplain').onclick = () => {
    const ex = $('#explain');
    renderExplain();
    ex.style.display = 'block';
  };
}

main().catch(err => {
  console.error(err);
  document.body.insertAdjacentHTML(
    'beforeend',
    `<pre class="card" style="white-space:pre-wrap;color:#b00000;border-color:#ffc0c0;background:#fff5f5">Error: ${escapeHTML(String(err))}</pre>`
  );
});
