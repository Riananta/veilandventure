/* ============================================================
   VEIL & VENTURE — Game Engine (Bahasa Indonesia)
   ============================================================ */

// ────────────────────────────────────────────────────────────
// KONSTANTA
// ────────────────────────────────────────────────────────────
const SUITS = {
  spade:   { symbol: '♠', name: 'Spade',   color: 'black' },
  club:    { symbol: '♣', name: 'Club',    color: 'black' },
  heart:   { symbol: '♥', name: 'Heart',   color: 'red'   },
  diamond: { symbol: '♦', name: 'Diamond', color: 'red'   },
};

const RANKS = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];

const RANK_VALUES = {
  'A':1,'2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,'10':10,'J':11,'Q':12,'K':13
};

const DICE_FACES = ['⚀','⚁','⚂','⚃','⚄','⚅'];

const CARD_TOTAL = 40;

// Poin berdasarkan peringkat selesai
const RANK_POINTS = [3, 2, 1, 0];

const SAVE_KEY_PREFIX = 'veilventure_save_';
const SAVE_LIST_KEY   = 'veilventure_savelist';

// ────────────────────────────────────────────────────────────
// STATUS PERMAINAN
// ────────────────────────────────────────────────────────────
let G = {
  players: [],
  cards: [],
  currentTurn: 0,
  gameCount: 1,
  difficulty: 'easy',
  sessionName: '',
  totalScores: [],
  finishedPlayers: [],
  phase: 'roll',        // 'roll' | 'move' | 'effect' | 'coupon-pick' | 'card-action' | 'done'
  diceResults: [0, 0],
  useDoubleDice: false,
  pendingExtraRoll: false,
  pendingAntiRed: false,
  pendingReroll: false,
  gameStarted: false,
  // State untuk aksi kartu
  pendingCardAction: null, // { player, card, slotIdx }
};

// ────────────────────────────────────────────────────────────
// DEFAULT PEMAIN
// ────────────────────────────────────────────────────────────
const DEFAULT_COLORS = ['#c0392b','#2980b9','#27ae60','#e67e22'];
const DEFAULT_NAMES  = ['Player 1','Player 2','Player 3','Player 4'];

// ────────────────────────────────────────────────────────────
// SISTEM AUDIO
// Ambil file dari folder ./audio/
// Backsound: audio/backsound.mp3 (loop)
// SFX      : audio/dice_roll.mp3, audio/card_flip.mp3,
//            audio/footstep.mp3, audio/special.mp3
// ────────────────────────────────────────────────────────────
const Audio_ = (() => {
  let bgm = null;
  let bgmMuted = false;
  let sfxMuted = false;
  const cache = {};

  function _load(src) {
    if (!cache[src]) {
      const a = new window.Audio(src);
      a.preload = 'auto';
      cache[src] = a;
    }
    return cache[src];
  }

  function playSFX(name) {
    if (sfxMuted) return;
    const paths = {
      dice:    'audio/dice_roll.mp3',
      card:    'audio/card_flip.mp3',
      walk:    'audio/footstep.mp3',
      walkfail:    'audio/footstep_fail.mp3',
      special: 'audio/special.mp3',
      modal:   'audio/modal_open.mp3',
      btn:     'audio/btn_click.mp3',
      finish:  'audio/finish.mp3',
      fail:    'audio/fail.mp3',
    };
    const vols = {
      dice:0.70, card:0.75, walk:0.55, special:0.80,
      modal:0.45, btn:0.50, finish:0.90,
    };
    const src = paths[name];
    if (!src) return;
    try {
      // Clone agar bisa overlap
      const clone = _load(src).cloneNode();
      clone.volume = vols[name] ?? 0.7;
      clone.play().catch(() => {});
    } catch(e) {}
  }

  function startBGM() {
    if (bgm) return;
    bgm = new window.Audio('audio/backsound.mp3');
    bgm.loop = true;
    bgm.volume = bgmMuted ? 0 : 0.35;
    bgm.play().catch(() => {
      // Autoplay blocked — try on first user interaction
      document.addEventListener('pointerdown', () => bgm.play().catch(()=>{}), { once: true });
    });
  }

  function stopBGM() {
    if (bgm) { bgm.pause(); bgm.currentTime = 0; bgm = null; }
  }

  function toggleBGM() {
    bgmMuted = !bgmMuted;
    if (bgm) bgm.volume = bgmMuted ? 0 : 0.35;
    return bgmMuted;
  }

  function toggleSFX() {
    sfxMuted = !sfxMuted;
    return sfxMuted;
  }

  function isBGMMuted() { return bgmMuted; }
  function isSFXMuted() { return sfxMuted; }

  return { playSFX, startBGM, stopBGM, toggleBGM, toggleSFX, isBGMMuted, isSFXMuted };
})();

// ────────────────────────────────────────────────────────────
// UTILITAS
// ────────────────────────────────────────────────────────────
function randInt(a, b) { return Math.floor(Math.random() * (b - a + 1)) + a; }

function acak(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function lemparSatuDadu() { return randInt(1, 6); }

function tidur(ms) { return new Promise(r => setTimeout(r, ms)); }

// ────────────────────────────────────────────────────────────
// BUAT DECK KARTU
// ────────────────────────────────────────────────────────────
function buatDeck(difficulty) {
  const deck = [];

  // 4 joker
  for (let i = 0; i < 4; i++) {
    deck.push({ type: 'joker', suit: null, rank: null, id: `joker-${i}` });
  }

  // Ace of Spades khusus
  deck.push({ type: 'spade-ace', suit: 'spade', rank: 'A', id: 'spade-ace' });

  const blackRanks = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
  const redRanks   = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];

  let blackPool = [];
  let redPool   = [];

  const blackSuits = ['spade','club'];
  const redSuits   = ['heart','diamond'];

  for (const suit of redSuits) for (const rank of redRanks) {
    redPool.push({ type: 'red', suit, rank, id: `${suit}-${rank}` });
  }

  for (const suit of blackSuits) for (const rank of blackRanks) {
    if (suit === 'spade' && rank === 'A') continue;
    blackPool.push({ type: 'black', suit, rank, id: `${suit}-${rank}` });
  }

  acak(redPool); acak(blackPool);

  let blackCount, redCount;
  if (difficulty === 'easy')        { blackCount = 25; redCount = 10; }
  else if (difficulty === 'medium') { blackCount = 18; redCount = 17; }
  else                               { blackCount = 10; redCount = 25; }

  if (difficulty === 'hard') {
    const highRed = ['10','J','Q','K'];
    redPool.sort((a, b) => {
      return (highRed.includes(a.rank) ? 0 : 1) - (highRed.includes(b.rank) ? 0 : 1);
    });
  }
  if (difficulty === 'easy') {
    const lowRed = ['A','2','3','4','5'];
    redPool.sort((a, b) => {
      return (lowRed.includes(a.rank) ? 0 : 1) - (lowRed.includes(b.rank) ? 0 : 1);
    });
  }

  for (let i = 0; i < blackCount; i++) {
    deck.push({ ...blackPool[i % blackPool.length], id: `black-${i}` });
  }
  for (let i = 0; i < redCount; i++) {
    const card = { ...redPool[i % redPool.length], id: `red-${i}` };
    card.type = 'red';
    deck.push(card);
  }

  acak(deck);
  return deck.map((c, idx) => ({ ...c, pos: idx, revealed: false }));
}

// ────────────────────────────────────────────────────────────
// MENU UI
// ────────────────────────────────────────────────────────────
let selectedDifficulty = 'easy';

function tampilkanModalPermainanBaru() {
  Audio_.playSFX('btn');
  document.getElementById('new-game-modal').classList.remove('hidden');
  Audio_.playSFX('modal');
  perbaruiPengaturanPemain();
  Audio_.startBGM();
}

function tutupModal(id) {
  Audio_.playSFX('btn');
  document.getElementById(id).classList.add('hidden');
}

function pilihKesulitan(diff) {
  Audio_.playSFX('btn');
  selectedDifficulty = diff;
  document.querySelectorAll('.difficulty-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.diff === diff);
  });
}

function perbaruiPengaturanPemain() {
  const count = parseInt(document.getElementById('player-count').value);
  const list = document.getElementById('player-setup-list');
  list.innerHTML = '';
  for (let i = 0; i < count; i++) {
    const row = document.createElement('div');
    row.className = 'player-setup-row';
    row.innerHTML = `
      <span class="player-num-badge">${i+1}</span>
      <input class="form-input" type="text" id="pname-${i}"
             placeholder="${DEFAULT_NAMES[i]}" value="" maxlength="16">
      <input type="color" id="pcolor-${i}" value="${DEFAULT_COLORS[i]}">
    `;
    list.appendChild(row);
  }
}

// ────────────────────────────────────────────────────────────
// MULAI PERMAINAN BARU
// ────────────────────────────────────────────────────────────
function mulaiPermainanBaru() {
  Audio_.playSFX('btn');
  const count = parseInt(document.getElementById('player-count').value);
  const sessionName = document.getElementById('game-session-name').value.trim() || `Sesi ${new Date().toLocaleDateString('id-ID')}`;
  const players = [];

  for (let i = 0; i < count; i++) {
    const name = document.getElementById(`pname-${i}`).value.trim() || DEFAULT_NAMES[i];
    const color = document.getElementById(`pcolor-${i}`).value;
    players.push({
      id: i,
      name,
      color,
      position: 0,
      coupon: null,
      finished: false,
      finishRank: null,
      initials: name.substring(0, 2).toUpperCase(),
    });
  }

  // totalScores harus array paralel dengan players, index = player.id
  const totalScores = players.map(() => 0);

  G = {
    players,
    cards: buatDeck(selectedDifficulty),
    currentTurn: 0,
    gameCount: 1,
    difficulty: selectedDifficulty,
    sessionName,
    totalScores,
    finishedPlayers: [],
    phase: 'roll',
    diceResults: [0, 0],
    useDoubleDice: false,
    pendingExtraRoll: false,
    pendingAntiRed: false,
    pendingReroll: false,
    gameStarted: true,
    pendingCardAction: null,
  };

  tutupModal('new-game-modal');
  document.getElementById('menu-screen').classList.add('hidden');
  document.getElementById('game-screen').classList.remove('hidden');

  renderPermainan();
  notifikasi(`✦ ${sessionName} dimulai!`, 'special');
}

// ────────────────────────────────────────────────────────────
// SNAKE ORDER MAPPING
// ────────────────────────────────────────────────────────────
// Papan 10 kolom x 4 baris (40 kartu).
// Baris 0 (bawah visual / row terakhir DOM): kartu 1–10, kiri→kanan
// Baris 1: kartu 11–20, kanan→kiri
// Baris 2: kartu 21–30, kiri→kanan
// Baris 3 (atas): kartu 31–40, kanan→kiri
//
// DOM dirender baris atas ke bawah (baris 3 → 0), sehingga
// slotIndex DOM = index dalam array yang dirender baris per baris dari atas.
// Fungsi ini mengembalikan slotIndex DOM untuk posisi permainan (1-based).
const COLS = 10;
const ROWS = 4; // 40 / 10

function posisiKeSlotDOM(pos1based) {
  // pos1based: 1..40
  const idx0 = pos1based - 1; // 0-based index logis (kiri-kanan selalu)
  const row  = Math.floor(idx0 / COLS);         // baris logis 0 = bawah papan
  const col  = idx0 % COLS;

  // Baris ganjil (1,3,...) arahnya kanan→kiri
  const colVisual = (row % 2 === 1) ? (COLS - 1 - col) : col;

  // DOM dirender dari baris teratas (row logis tertinggi) ke bawah
  const domRow = (ROWS - 1) - row;
  return domRow * COLS + colVisual;
}

// ────────────────────────────────────────────────────────────
// RENDER UTAMA
// ────────────────────────────────────────────────────────────
function renderPermainan() {
  renderHeader();
  renderPapan();
  renderSidebar();
  renderToken();
}

function renderHeader() {
  document.getElementById('header-game-num').textContent = `${G.sessionName || 'Game'} #${G.gameCount}`;
}

function renderPapan() {
  const board = document.getElementById('card-board');
  board.innerHTML = '';

  // Buat array slot DOM (40 posisi) diisi null dulu
  const domSlots = new Array(CARD_TOTAL).fill(null);

  G.cards.forEach((card, idx) => {
    // idx = posisi logis 0-based (kartu ke-idx+1)
    const domIdx = posisiKeSlotDOM(idx + 1);

    const slot = document.createElement('div');
    slot.className = 'card-slot';
    // ID slot tetap berdasarkan posisi logis agar gerakPemain bisa menemukannya
    slot.id = `slot-${idx}`;
    slot.dataset.domIdx = domIdx;

    const gameCard = document.createElement('div');
    gameCard.className = 'game-card' + (card.revealed ? ' flipped' : '');

    const back = document.createElement('div');
    back.className = 'card-face card-back';
    gameCard.appendChild(back);

    const front = document.createElement('div');
    front.className = 'card-face card-front ' + getKelasFront(card);
    front.innerHTML = buatHTMLFrontKartu(card);
    gameCard.appendChild(front);

    slot.appendChild(gameCard);

    // Label posisi kecil di pojok untuk orientasi pemain
    const posLabel = document.createElement('div');
    posLabel.className = 'slot-pos-label';
    posLabel.textContent = idx + 1;
    slot.appendChild(posLabel);

    domSlots[domIdx] = slot;
  });

  // Tambahkan ke board dalam urutan DOM (atas-kiri ke bawah-kanan)
  domSlots.forEach(slot => { if (slot) board.appendChild(slot); });
}

function getKelasFront(card) {
  if (card.type === 'joker') return 'joker-card';
  if (card.type === 'spade-ace') return 'spade-ace-card';
  if (card.type === 'red') return 'red-card';
  return 'black-card';
}

function buatHTMLFrontKartu(card) {
  if (card.type === 'joker') {
    return `
      <div class="card-corner top-left"><span style="font-size:0.85rem">🃏</span></div>
      <div class="card-center joker-star">★</div>
      <div class="card-corner bottom-right"><span style="font-size:0.85rem">🃏</span></div>
    `;
  }
  const suit = SUITS[card.suit];
  const isSpecial = card.type === 'spade-ace';
  return `
    ${isSpecial ? '<div class="spade-ace-star">✦</div>' : ''}
    <div class="card-corner top-left">
      <span class="card-value-small">${card.rank}</span>
      <span class="card-suit-small">${suit.symbol}</span>
    </div>
    <div class="card-center">${suit.symbol}</div>
    <div class="card-corner bottom-right">
      <span class="card-value-small">${card.rank}</span>
      <span class="card-suit-small">${suit.symbol}</span>
    </div>
  `;
}

// ────────────────────────────────────────────────────────────
// RENDER SIDEBAR
// ────────────────────────────────────────────────────────────
function renderSidebar() {
  renderKlasemen();
  renderUrutanGiliran();
  renderKuponSidebar();
  renderKontrolDadu();
}

function renderKlasemen() {
  const sb = document.getElementById('scoreboard');
  const sorted = [...G.players].sort((a, b) =>
    (G.totalScores[b.id] || 0) - (G.totalScores[a.id] || 0)
  );
  sb.innerHTML = sorted.map(p => `
    <div class="score-item ${p.id === G.players[G.currentTurn].id ? 'active-player' : ''}">
      <div class="score-avatar" style="background:${p.color}">${p.initials}</div>
      <div class="score-name">${p.name}</div>
      <div class="score-pts">${G.totalScores[p.id] || 0}pt</div>
    </div>
  `).join('');
}

function renderUrutanGiliran() {
  const to = document.getElementById('turn-order');
  to.innerHTML = G.players.map((p, i) => {
    const isCurrent = i === G.currentTurn;
    return `
      <div class="turn-item ${isCurrent ? 'current' : ''}">
        <div class="turn-dot" style="background:${p.color}"></div>
        <div class="turn-name">${p.name}${p.finished ? ' ✓' : ''}</div>
        ${isCurrent ? '<div class="turn-arrow blink">▶</div>' : ''}
      </div>
    `;
  }).join('');
}

function renderKuponSidebar() {
  const area = document.getElementById('sidebar-coupons');
  const coupons = G.players.map(p => {
    if (!p.coupon) return null;
    return { name: p.name, coupon: p.coupon, color: p.color };
  }).filter(Boolean);

  if (coupons.length === 0) {
    area.innerHTML = '<span style="font-size:0.75rem; color:var(--text-dim); font-style:italic;">Tidak ada</span>';
    return;
  }

  const icons = { 'anti-red': '🛡️', 'reroll': '🔁', 'double-dice': '🎲' };
  const names = { 'anti-red': 'Anti Merah', 'reroll': 'Lempar Ulang', 'double-dice': 'x2 Dadu' };
  area.innerHTML = coupons.map(c => `
    <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">
      <div style="width:14px;height:14px;border-radius:50%;background:${c.color};flex-shrink:0;"></div>
      <span style="font-size:0.7rem;color:var(--text-muted);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${c.name}</span>
      <span class="coupon-badge ${c.coupon}" style="margin:0;">${icons[c.coupon]} ${names[c.coupon]}</span>
    </div>
  `).join('');
}

function renderKontrolDadu() {
  const cp = G.players[G.currentTurn];
  const avatar = document.getElementById('sb-cp-avatar');
  avatar.style.background = cp.color;
  avatar.textContent = cp.initials;
  document.getElementById('sb-cp-name').textContent = cp.name;

  const d1 = document.getElementById('dice-1');
  const d2 = document.getElementById('dice-2');
  d1.textContent = G.diceResults[0] > 0 ? DICE_FACES[G.diceResults[0]-1] : '🎲';
  d2.textContent = G.diceResults[1] > 0 ? DICE_FACES[G.diceResults[1]-1] : '🎲';
  d2.classList.toggle('inactive', !G.useDoubleDice);

  const total = G.useDoubleDice
    ? (G.diceResults[0] || 0) + (G.diceResults[1] || 0)
    : G.diceResults[0] || 0;
  document.getElementById('dice-total').textContent = total > 0 ? total : '—';

  const rollBtn = document.getElementById('roll-btn');
  rollBtn.disabled = G.phase !== 'roll' || cp.finished;

  // Tombol pakai kupon sebelum roll: hanya double-dice
  // (anti-red → otomatis ditawarkan saat mendarat merah; reroll → ditawarkan setelah roll)
  const area = document.getElementById('coupon-use-area');
  area.innerHTML = '';
  if (cp.coupon === 'double-dice' && G.phase === 'roll') {
    const btn = document.createElement('button');
    btn.className = 'btn btn-secondary btn-xs coupon-badge double-dice';
    btn.style.margin = '0';
    btn.textContent = '🎲 Pakai x2 Dadu';
    btn.onclick = () => aktivasiKupon('double-dice');
    area.appendChild(btn);
  } else if (cp.coupon === 'reroll' && G.phase === 'roll') {
    const info = document.createElement('div');
    info.style.cssText = 'font-size:0.65rem;color:var(--text-dim);font-style:italic;text-align:center;padding:4px 0;';
    info.textContent = '🔁 Akan ditawarkan setelah roll';
    area.appendChild(info);
  } else if (cp.coupon === 'anti-red' && G.phase === 'roll') {
    const info = document.createElement('div');
    info.style.cssText = 'font-size:0.65rem;color:var(--text-dim);font-style:italic;text-align:center;padding:4px 0;';
    info.textContent = '🛡️ Ditawarkan saat kena kartu merah';
    area.appendChild(info);
  }
}

// ────────────────────────────────────────────────────────────
// TOKEN PEMAIN
// ────────────────────────────────────────────────────────────
function renderToken() {
  document.querySelectorAll('.player-token').forEach(t => t.remove());

  const board = document.getElementById('card-board');
  const boardParentEl = board.parentElement;

  // Kelompokkan pemain per posisi
  const byPos = {};
  G.players.forEach(p => {
    if (!byPos[p.position]) byPos[p.position] = [];
    byPos[p.position].push(p);
  });

  // Posisi 0 (start)
  const startTokens = document.getElementById('start-tokens');
  startTokens.innerHTML = '';
  if (byPos[0]) {
    byPos[0].forEach(p => {
      const t = document.createElement('div');
      t.style.cssText = `
        width:26px;height:26px;border-radius:50%;
        background:${p.color};
        border:2px solid rgba(255,255,255,0.7);
        display:flex;align-items:center;justify-content:center;
        font-size:0.6rem;font-weight:700;color:white;
        font-family:var(--font-serif);
      `;
      t.textContent = p.initials;
      startTokens.appendChild(t);
    });
  }

  // Posisi 1–40
  for (const [posStr, players] of Object.entries(byPos)) {
    const pos = parseInt(posStr);
    if (pos === 0) continue;

    const slotIdx = pos - 1;
    const slot = document.getElementById(`slot-${slotIdx}`);
    if (!slot) continue;

    const slotRect = slot.getBoundingClientRect();
    const parentRect = boardParentEl.getBoundingClientRect();

    const slotCenterX = slotRect.left + slotRect.width / 2 - parentRect.left;
    const slotCenterY = slotRect.top + slotRect.height / 2 - parentRect.top;

    players.forEach((p, i) => {
      const offset = players.length > 1 ? (i - (players.length - 1) / 2) * 13 : 0;
      const token = document.createElement('div');
      token.className = 'player-token' + (p.id === G.players[G.currentTurn].id ? ' active-token' : '');
      token.style.cssText = `
        position:absolute;
        left:${slotCenterX + offset}px;
        top:${slotCenterY}px;
        background:${p.color};
        z-index:${5 + i};
        pointer-events:none;
      `;
      token.textContent = p.initials;
      boardParentEl.appendChild(token);
    });
  }
}

// ────────────────────────────────────────────────────────────
// AKTIVASI KUPON
// ────────────────────────────────────────────────────────────
function aktivasiKupon(type) {
  const cp = G.players[G.currentTurn];
  if (!cp.coupon || cp.coupon !== type) return;

  if (type === 'anti-red') {
    G.pendingAntiRed = true;
    cp.coupon = null;
    notifikasi('🛡️ Anti Merah aktif giliran ini!', 'success');
  } else if (type === 'reroll') {
    G.pendingReroll = true;
    cp.coupon = null;
    notifikasi('🔁 Kupon Lempar Ulang siap — lempar dadu!', 'success');
  } else if (type === 'double-dice') {
    G.useDoubleDice = true;
    cp.coupon = null;
    document.getElementById('dice-2').classList.remove('inactive');
    notifikasi('🎲 Dua Dadu aktif!', 'success');
  }
  renderKuponSidebar();
  renderKontrolDadu();
}

// ────────────────────────────────────────────────────────────
// ANIMASI DADU 3D DILEMPAR
// ────────────────────────────────────────────────────────────
function animasiLemparDadu(doubleDice) {
  return new Promise(resolve => {
    let overlay = document.getElementById('dice-throw-overlay');
    if (overlay) overlay.remove();

    overlay = document.createElement('div');
    overlay.id = 'dice-throw-overlay';

    const d1 = `
      <div class="dice-3d dice-fly-1">
        <div class="dface df-front"></div>
        <div class="dface df-back"></div>
        <div class="dface df-right"></div>
        <div class="dface df-left"></div>
        <div class="dface df-top"></div>
        <div class="dface df-bottom"></div>
      </div>`;
    const d2 = doubleDice ? `
      <div class="dice-3d dice-fly-2">
        <div class="dface df-front"></div>
        <div class="dface df-back"></div>
        <div class="dface df-right"></div>
        <div class="dface df-left"></div>
        <div class="dface df-top"></div>
        <div class="dface df-bottom"></div>
      </div>` : '';

    overlay.innerHTML = `<div class="dice-throw-stage">${d1}${d2}</div>`;
    document.body.appendChild(overlay);

    setTimeout(() => {
      overlay.classList.add('dice-throw-fade');
      setTimeout(() => { overlay.remove(); resolve(); }, 350);
    }, 950);
  });
}

// ────────────────────────────────────────────────────────────
// LEMPAR DADU
// ────────────────────────────────────────────────────────────
async function lemparDadu() {
  if (G.phase !== 'roll') return;

  const cp = G.players[G.currentTurn];
  if (cp.finished) { gilirBerikutnya(); return; }

  G.phase = 'move';
  document.getElementById('roll-btn').disabled = true;

  // SFX dadu & animasi 3D
  Audio_.playSFX('dice');
  // await animasiLemparDadu(G.useDoubleDice);

  const d1 = document.getElementById('dice-1');
  const d2 = document.getElementById('dice-2');
  d1.classList.add('rolling');
  if (G.useDoubleDice) d2.classList.add('rolling');

  await tidur(300);

  const r1 = lemparSatuDadu();
  const r2 = G.useDoubleDice ? lemparSatuDadu() : 0;

  G.diceResults = [r1, r2];
  d1.textContent = DICE_FACES[r1 - 1];
  d1.classList.remove('rolling');
  if (G.useDoubleDice) {
    d2.textContent = DICE_FACES[r2 - 1];
    d2.classList.remove('rolling');
  }

  const total = G.useDoubleDice ? r1 + r2 : r1;
  document.getElementById('dice-total').textContent = total;

  // notifikasi(`🎲 ${cp.name} melempar ${G.useDoubleDice ? `${r1}+${r2}=` : ''}${total}`, 'info');

  // Jika sedang dalam mode reroll: langsung gerak
  if (G.pendingReroll) {
    G.pendingReroll = false;
    G.useDoubleDice = false;
    await tidur(600);
    await gerakkanPemain(cp, total);
    return;
  }

  G.useDoubleDice = false;

  // Jika pemain punya kupon reroll, tanya dulu sebelum bergerak
  if (cp.coupon === 'reroll') {
    await tidur(500);
    tampilkanModalReroll(cp, total);
    return;
  }

  await tidur(800);
  await gerakkanPemain(cp, total);
}

// Modal konfirmasi penggunaan kupon reroll
function tampilkanModalReroll(player, total) {
  G.phase = 'reroll-confirm';
  G._pendingRerollPlayer = player;
  G._pendingRerollTotal  = total;

  // Buat overlay konfirmasi sederhana
  let overlay = document.getElementById('reroll-confirm-modal');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'reroll-confirm-modal';
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal" style="max-width:360px;text-align:center;">
        <div class="modal-title">🔁 Gunakan Kupon Lempar Ulang?</div>
        <p id="reroll-confirm-desc" style="font-size:0.88rem;color:var(--text-muted);margin-bottom:24px;line-height:1.6;"></p>
        <div style="display:flex;gap:10px;">
          <button class="btn btn-primary" style="flex:1" onclick="konfirmasiReroll(true)">🔁 Ya, Lempar Ulang!</button>
          <button class="btn btn-secondary" style="flex:1" onclick="konfirmasiReroll(false)">✓ Tidak, Lanjutkan</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
  }

  const desc = document.getElementById('reroll-confirm-desc');
  desc.innerHTML = `Hasil dadu kamu: <strong style="color:var(--gold);font-size:1.1rem;">${total}</strong><br><br>
    Apakah kamu ingin menggunakan <strong style="color:#5dade2;">Kupon Lempar Ulang</strong> untuk melempar dadu lagi?<br>
    <span style="font-size:0.75rem;color:var(--text-dim);margin-top:6px;display:block;">Kupon akan habis terpakai.</span>`;

  overlay.classList.remove('hidden');
  Audio_.playSFX('modal');
}

async function konfirmasiReroll(pakai) {
  Audio_.playSFX('btn');
  const overlay = document.getElementById('reroll-confirm-modal');
  if (overlay) overlay.classList.add('hidden');

  const player = G._pendingRerollPlayer;
  const total  = G._pendingRerollTotal;
  G._pendingRerollPlayer = null;
  G._pendingRerollTotal  = null;

  if (pakai) {
    // Pakai kupon: buang kupon, aktifkan pendingReroll, kembali ke fase roll
    player.coupon = null;
    G.pendingReroll = true;
    G.phase = 'roll';
    const rollBtn = document.getElementById('roll-btn');
    rollBtn.disabled = false;
    rollBtn.textContent = '🔁 Lempar Ulang!';
    renderKuponSidebar();
    renderKontrolDadu();
    notifikasi('🔁 Kupon dipakai! Lempar lagi.', 'success');
  } else {
    // Tidak pakai: lanjut bergerak dengan hasil sebelumnya
    G.phase = 'move';
    await tidur(400);
    await gerakkanPemain(player, total);
  }
}

// ────────────────────────────────────────────────────────────
// GERAK PEMAIN
// ────────────────────────────────────────────────────────────
async function gerakkanPemain(player, steps) {
  const oldPos = player.position;
  // Tidak di-clamp — biarkan melebihi CARD_TOTAL agar finish terdeteksi
  const newPos = player.position + steps;

  // Gerak animasi hanya sampai CARD_TOTAL max
  const moveUntil = Math.min(newPos, CARD_TOTAL);
  for (let p = oldPos + 1; p <= moveUntil; p++) {
    player.position = p;
    Audio_.playSFX('walk');
    renderToken();
    const slotEl = document.getElementById(`slot-${p - 1}`);
    if (slotEl) slotEl.classList.add('highlight');
    await tidur(400);
    if (slotEl) slotEl.classList.remove('highlight');
    await tidur(80);
  }

  // FINISH: hanya jika langkah MELEWATI kartu terakhir (bukan berhenti di atasnya)
  if (newPos > CARD_TOTAL) {
    player.position = CARD_TOTAL + 1; // posisi "di luar papan"
    player.finished = true;
    const rank = G.finishedPlayers.length;
    G.finishedPlayers.push(player.id);
    player.finishRank = rank;

    const pts = RANK_POINTS[Math.min(rank, RANK_POINTS.length - 1)];
    G.totalScores[player.id] = (G.totalScores[player.id] || 0) + pts;

    notifikasi(`🏁 ${player.name} selesai! (+${pts} poin)`, 'success');
    Audio_.playSFX('finish');
    renderSidebar();
    renderToken();

    await periksaSelesai();
    return;
  }

  // Berhenti tepat di kartu (termasuk kartu ke-40) — harus buka kartu
  const card = G.cards[newPos - 1];
  const slotIdx = newPos - 1;

  if (!card.revealed) {
    G.pendingCardAction = { player, card, slotIdx };
    G.phase = 'card-action';
    tampilkanAksiKartu(card, false);
  } else {
    await terapkanEfekKartu(player, card, slotIdx);
  }
}

// ────────────────────────────────────────────────────────────
// MODAL AKSI KARTU
// ────────────────────────────────────────────────────────────
function tampilkanAksiKartu(card, sudahTerbuka) {
  const modal = document.getElementById('card-action-modal');
  const title = document.getElementById('card-action-title');
  const body  = document.getElementById('card-action-body');
  const btn   = document.getElementById('card-action-btn');

  if (!sudahTerbuka) {
    // Kartu tertutup
    title.textContent = '🂠 Kartu Ditemukan!';
    body.innerHTML = `Kamu berhenti di kartu ini. Klik tombol di bawah untuk membuka dan melihat isinya.`;
    btn.textContent = 'Buka Kartu';
    // modal.classList.remove('hidden');
    aksiKartu();
  } else {
    // Kartu sudah terbuka
    const desc = deskripsiKartu(card);
    title.textContent = '👁 Kartu Sudah Terbuka';
    body.innerHTML = `Kartu ini sudah pernah dibuka sebelumnya:<br><br><strong style="color:var(--gold)">${desc}</strong><br><br>Efek kartu akan diterapkan.`;
    btn.textContent = 'Terapkan Efek';
    aksiKartu();
  }

}

function deskripsiKartu(card) {
  if (card.type === 'joker') return '🃏 JOKER — Lempar dadu bonus!';
  if (card.type === 'spade-ace') return '♠ Ace of Spades — Pilih kupon!';
  if (card.type === 'black') {
    const suit = SUITS[card.suit];
    return `${suit.symbol} ${card.rank} ${suit.name} — Aman, berhenti di sini.`;
  }
  if (card.type === 'red') {
    const suit = SUITS[card.suit];
    const val = RANK_VALUES[card.rank];
    return `${suit.symbol} ${card.rank} ${suit.name} — Mundur ${val} langkah!`;
  }
  return 'Kartu tidak dikenal';
}

// Dipanggil saat tombol di modal ditekan
async function aksiKartu() {
  document.getElementById('card-action-modal').classList.add('hidden');

  if (!G.pendingCardAction) return;
  const { player, card, slotIdx } = G.pendingCardAction;
  G.pendingCardAction = null;

  // Buka kartu jika belum terbuka
  if (!card.revealed) {
    card.revealed = true;
    const gameCard = document.querySelector(`#slot-${slotIdx} .game-card`);
    if (gameCard) gameCard.classList.add('flipped');
    Audio_.playSFX('card');
    await tidur(700);
  }

  // Terapkan efek kartu
  await terapkanEfekKartu(player, card, slotIdx);
}

// ────────────────────────────────────────────────────────────
// EFEK KARTU
// ────────────────────────────────────────────────────────────
async function terapkanEfekKartu(player, card, slotIdx) {
  if (card.type === 'black') {
    const suit = SUITS[card.suit];
    // notifikasi(`${suit.symbol} ${player.name} aman di ${suit.name}!`, 'info');
    await tidur(600);
    gilirBerikutnya();

  } else if (card.type === 'red') {
    Audio_.playSFX('fail');
    const suit = SUITS[card.suit];
    const val = RANK_VALUES[card.rank];

    // Jika pemain punya kupon anti-red, tawarkan dulu
    if (player.coupon === 'anti-red') {
      await tidur(300);
      tampilkanModalAntiRed(player, card, slotIdx, suit, val);
      return;
    }

    // Jika kupon sudah diaktifkan (pendingAntiRed dari alur lama — fallback)
    if (G.pendingAntiRed) {
      G.pendingAntiRed = false;
      notifikasi(`🛡️ Anti Merah memblokir ${suit.symbol} ${card.rank}! Selamat!`, 'success');
      await tidur(700);
      gilirBerikutnya();
      return;
    }

    notifikasi(`${suit.symbol} ${player.name} kena Merah ${card.rank}! Mundur ${val} langkah!`, 'danger');
    await tidur(500);
    await prosesUndurMerah(player, val);

  } else if (card.type === 'joker') {
    Audio_.playSFX('special');
    notifikasi(`🃏 ${player.name} dapat JOKER — lempar bonus!`, 'special');
    await tidur(700);
    G.pendingExtraRoll = true;
    G.phase = 'roll';
    const rollBtn = document.getElementById('roll-btn');
    rollBtn.disabled = false;
    rollBtn.textContent = '🃏 Lempar Bonus!';
    renderKontrolDadu();

  } else if (card.type === 'spade-ace') {
    if (player.coupon) {
      notifikasi(`♠ Ace of Spades — ${player.name} sudah punya kupon!`, 'info');
      await tidur(700);
      gilirBerikutnya();
    } else {
      Audio_.playSFX('special');
      notifikasi(`♠ ${player.name} menemukan Ace of Spades! Pilih kupon!`, 'special');
      await tidur(400);
      tampilkanModalKupon(player);
    }
  }
}

// ────────────────────────────────────────────────────────────
// MODAL ANTI-RED (ditawarkan saat mendarat di kartu merah)
// ────────────────────────────────────────────────────────────
function tampilkanModalAntiRed(player, card, slotIdx, suit, val) {
  G.phase = 'anti-red-confirm';
  G._pendingAntiRedCtx = { player, card, slotIdx, suit, val };

  let overlay = document.getElementById('antired-confirm-modal');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'antired-confirm-modal';
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal" style="max-width:380px;text-align:center;">
        <div class="modal-title" style="color:#ff6b5b;">🛡️ Kupon Anti Merah!</div>
        <div id="antired-confirm-desc" style="font-size:0.88rem;color:var(--text-muted);margin-bottom:24px;line-height:1.7;"></div>
        <div style="display:flex;gap:10px;">
          <button class="btn btn-primary" style="flex:1;background:linear-gradient(135deg,#1a5c36,#27ae60);" onclick="konfirmasiAntiRed(true)">🛡️ Ya, Gunakan!</button>
          <button class="btn btn-secondary" style="flex:1;" onclick="konfirmasiAntiRed(false)">✗ Tidak, Terima Hukuman</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
  }

  const desc = document.getElementById('antired-confirm-desc');
  desc.innerHTML = `Kamu mendarat di <strong style="color:#ff6b5b;">${suit.symbol} ${card.rank} ${suit.name}</strong> — harus mundur <strong style="color:#ff6b5b;">${val} langkah!</strong><br><br>
    Kamu punya <strong style="color:#52d98a;">Kupon Anti Merah 🛡️</strong>.<br>
    Gunakan untuk membatalkan hukuman ini?<br>
    <span style="font-size:0.72rem;color:var(--text-dim);display:block;margin-top:8px;">Kupon akan habis terpakai.</span>`;

  overlay.classList.remove('hidden');
  Audio_.playSFX('modal');
}

async function konfirmasiAntiRed(pakai) {
  Audio_.playSFX('btn');
  const overlay = document.getElementById('antired-confirm-modal');
  if (overlay) overlay.classList.add('hidden');

  const ctx = G._pendingAntiRedCtx;
  G._pendingAntiRedCtx = null;
  if (!ctx) return;

  const { player, card, slotIdx, suit, val } = ctx;

  if (pakai) {
    player.coupon = null;
    renderKuponSidebar();
    notifikasi(`🛡️ Anti Merah memblokir ${suit.symbol} ${card.rank}! Selamat!`, 'success');
    await tidur(700);
    gilirBerikutnya();
  } else {
    notifikasi(`${suit.symbol} ${player.name} kena Merah ${card.rank}! Mundur ${val} langkah!`, 'danger');
    await tidur(500);
    await prosesUndurMerah(player, val);
  }
}

async function prosesUndurMerah(player, val) {
  const backPos = Math.max(0, player.position - val);
  for (let p = player.position - 1; p >= backPos; p--) {
    player.position = p;
    Audio_.playSFX('walkfail');
    renderToken();
    await tidur(400);
  }
  await tidur(400);

  if (player.position > 0) {
    const landedCard = G.cards[player.position - 1];
    const landedSlotIdx = player.position - 1;
    G.pendingCardAction = { player, card: landedCard, slotIdx: landedSlotIdx };
    G.phase = 'card-action';
    tampilkanAksiKartu(landedCard, landedCard.revealed);
  } else {
    gilirBerikutnya();
  }
}

// ────────────────────────────────────────────────────────────
// MODAL KUPON (amplop tertutup)
// ────────────────────────────────────────────────────────────
function tampilkanModalKupon(player) {
  G.phase = 'coupon-pick';
  G._pendingCouponPlayer = player;

  const allTypes = ['anti-red', 'reroll', 'double-dice'];
  const icons  = { 'anti-red': '🛡️', 'reroll': '🔁', 'double-dice': '🎲' };
  const labels = { 'anti-red': 'Anti Merah', 'reroll': 'Lempar Ulang', 'double-dice': 'x2 Dadu' };

  // Acak urutan kupon agar tidak terlihat
  const shuffled = acak([...allTypes]);

  const container = document.getElementById('coupon-envelopes');
  container.innerHTML = '';

  shuffled.forEach((type, i) => {
    const env = document.createElement('div');
    env.className = 'coupon-envelope';
    env.dataset.type = type;
    env.innerHTML = `
      <div class="env-back">✉</div>
      <div class="env-seal">✦</div>
      <div class="env-label">Kupon ${i + 1}</div>
      <div class="coupon-reveal-content">
        <div style="font-size:1.8rem;">${icons[type]}</div>
        <div style="font-family:var(--font-serif);font-size:0.65rem;color:var(--gold);margin-top:6px;text-align:center;letter-spacing:0.05em;">${labels[type]}</div>
      </div>
    `;
    env.addEventListener('click', () => buka_amplop(env, type));
    container.appendChild(env);
  });

  document.getElementById('coupon-modal').classList.remove('hidden');
  Audio_.playSFX('modal');
}

function buka_amplop(envEl, type) {
  Audio_.playSFX('card');
  // Tampilkan isi amplop dulu
  envEl.classList.add('revealed');
  // Nonaktifkan semua amplop lain
  document.querySelectorAll('.coupon-envelope').forEach(e => {
    if (e !== envEl) e.style.opacity = '0.4';
    e.style.pointerEvents = 'none';
  });

  // Setelah sebentar, terapkan pilihan
  setTimeout(() => {
    pilihanKupon(type);
  }, 900);
}

function pilihanKupon(type) {
  const player = G._pendingCouponPlayer;
  if (!player) return;
  player.coupon = type;
  const labels = { 'anti-red': 'Anti Merah', 'reroll': 'Lempar Ulang', 'double-dice': 'x2 Dadu' };
  notifikasi(`✦ ${player.name} mendapat: ${labels[type]}!`, 'special');
  document.getElementById('coupon-modal').classList.add('hidden');
  G._pendingCouponPlayer = null;
  renderKuponSidebar();
  gilirBerikutnya();
}

// ────────────────────────────────────────────────────────────
// CEK KONDISI AKHIR GAME
// Dipanggil setelah setiap pemain finish.
// - Jika semua selesai → tampilkan rekap
// - Jika hanya 1 pemain tersisa (belum finish) → otomatis akhiri
// ────────────────────────────────────────────────────────────
async function periksaSelesai() {
  await tidur(600);

  const belumSelesai = G.players.filter(p => !p.finished);

  // Semua selesai
  if (belumSelesai.length === 0) {
    tampilkanRekap();
    return;
  }

  // Sisa 1 pemain — otomatis jadi terakhir, permainan berakhir
  if (belumSelesai.length === 1) {
    const sisa = belumSelesai[0];
    const rank = G.finishedPlayers.length;
    G.finishedPlayers.push(sisa.id);
    sisa.finishRank = rank;
    sisa.finished = true;
    sisa.position = CARD_TOTAL + 1;

    const pts = RANK_POINTS[Math.min(rank, RANK_POINTS.length - 1)];
    G.totalScores[sisa.id] = (G.totalScores[sisa.id] || 0) + pts;

    notifikasi(`🏁 ${sisa.name} otomatis selesai sebagai terakhir! (+${pts} poin)`, 'info');
    renderSidebar();
    renderToken();
    await tidur(800);
    tampilkanRekap();
    return;
  }

  // Masih ada 2+ pemain — lanjut giliran
  gilirBerikutnya();
}

// ────────────────────────────────────────────────────────────
// MENYERAH — semua pemain tidak akan mendapat poin, game berakhir
// ────────────────────────────────────────────────────────────
function konfirmasiMenyerah() {
  Audio_.playSFX('btn');
  if (!confirm('🏳 Menyerah?\n\nPermainan akan berakhir. Semua pemain tidak akan mendapat poin.')) return;
  menyerah();
}

function menyerah() {
  // Catat siapa yang belum selesai SEBELUM diubah
  const belumSelesai = G.players.filter(p => !p.finished);
  const sudahSelesai = G.players.filter(p => p.finished);

  // Tandai pemain belum selesai sebagai finished (rank sama = terakhir bersama)
  const rankMenyerah = G.finishedPlayers.length;
  belumSelesai.forEach(p => {
    p.finished = true;
    p.finishRank = rankMenyerah;
    G.finishedPlayers.push(p.id);
    // Hanya pemain yang belum finish
    G.totalScores[p.id] = (G.totalScores[p.id] || 0) + 0;
  });

  G.phase = 'done';

  // Tutup semua modal aktif
  ['card-action-modal','antired-confirm-modal','reroll-confirm-modal','coupon-modal'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.add('hidden');
  });

  const pesanSistem = belumSelesai.length > 0
    ? `🏳 Permainan diakhiri — ${belumSelesai.map(p => p.name).join(', ')} mendapat +1 poin`
    : '🏳 Permainan diakhiri';
  notifikasi(pesanSistem, 'info');
  renderSidebar();

  setTimeout(() => tampilkanRekapMenyerah(sudahSelesai, belumSelesai), 800);
}

function tampilkanRekapMenyerah(sudahSelesai, belumSelesai) {
  // Urutkan: pemain yang sudah finish dulu (berdasar finishRank), lalu yang belum (urutan asli)
  const sorted = [
    ...sudahSelesai.sort((a, b) => a.finishRank - b.finishRank),
    ...belumSelesai,
  ];

  let html = `
    <div style="text-align:center;margin-bottom:20px;">
      <div style="font-size:2rem;margin-bottom:8px;">🏳</div>
      <div style="font-family:var(--font-serif);font-size:0.9rem;color:var(--text-muted);font-style:italic;">
        Permainan diakhiri lebih awal.<br>
        Pemain yang belum finish mendapat <strong style="color:var(--gold)">+1 poin</strong>.
      </div>
    </div>
    <div class="recap-list">
  `;

  sorted.forEach((p, i) => {
    const totalPts = G.totalScores[p.id] || 0;
    const sudahF = sudahSelesai.includes(p);
    // Tampilkan poin yang didapat di ronde ini
    const ptRonde = sudahF
      ? RANK_POINTS[Math.min(p.finishRank, RANK_POINTS.length - 1)]
      : 1;
    const label = sudahF ? `+${ptRonde}pt` : `+1pt 🏳`;
    html += `
      <div class="recap-item">
        <div class="recap-rank">${['①','②','③','④'][i] || `${i+1}`}</div>
        <div class="recap-avatar" style="background:${p.color}">${p.initials}</div>
        <div class="recap-name">${p.name}</div>
        <div class="recap-points">${label} → Total: ${totalPts}pt</div>
      </div>
    `;
  });

  html += '</div>';

  document.getElementById('recap-content').innerHTML = html;
  Audio_.playSFX('modal');
  document.getElementById('recap-modal').classList.remove('hidden');
}

// ────────────────────────────────────────────────────────────
// MANAJEMEN GILIRAN
// ────────────────────────────────────────────────────────────
function gilirBerikutnya() {
  G.pendingExtraRoll = false;
  G.pendingAntiRed = false;
  G.useDoubleDice = false;
  G.pendingCardAction = null;

  let next = (G.currentTurn + 1) % G.players.length;
  let attempts = 0;
  while (G.players[next].finished && attempts < G.players.length) {
    next = (next + 1) % G.players.length;
    attempts++;
  }

  G.currentTurn = next;
  G.phase = 'roll';
  G.diceResults = [0, 0];

  const rollBtn = document.getElementById('roll-btn');
  if (rollBtn) rollBtn.textContent = '🎲 Lempar Dadu';

  renderSidebar();
  renderToken();

  notifikasi(`◈ Giliran ${G.players[G.currentTurn].name}`, 'info');
}

// ────────────────────────────────────────────────────────────
// REKAP & RONDE BERIKUTNYA
// ────────────────────────────────────────────────────────────
function tampilkanRekap() {
  const sorted = [...G.players].sort((a, b) => a.finishRank - b.finishRank);

  let podiumHTML = '<div class="recap-podium">';
  const order = [sorted[1], sorted[0], sorted[2]].filter(Boolean);
  const classes = sorted[1] ? ['silver','gold','bronze'] : ['gold'];
  const medals  = sorted[1] ? ['②','①','③'] : ['①'];

  order.forEach((p, i) => {
    const pts = RANK_POINTS[Math.min(p.finishRank, RANK_POINTS.length - 1)];
    podiumHTML += `
      <div class="podium-block">
        <div class="podium-avatar" style="background:${p.color}">${p.initials}</div>
        <div class="podium-name">${p.name}</div>
        <div class="podium-stand ${classes[i]}">${medals[i]}</div>
      </div>
    `;
  });
  podiumHTML += '</div>';

  let listHTML = '<div class="recap-list">';
  sorted.forEach((p, i) => {
    const pts = RANK_POINTS[Math.min(i, RANK_POINTS.length - 1)];
    const totalPts = G.totalScores[p.id] || 0;
    listHTML += `
      <div class="recap-item">
        <div class="recap-rank">${['①','②','③','④'][i]}</div>
        <div class="recap-avatar" style="background:${p.color}">${p.initials}</div>
        <div class="recap-name">${p.name}</div>
        <div class="recap-points">+${pts}pt → Total: ${totalPts}pt</div>
      </div>
    `;
  });
  listHTML += '</div>';

  document.getElementById('recap-content').innerHTML = podiumHTML + listHTML;
  Audio_.playSFX('modal');
  document.getElementById('recap-modal').classList.remove('hidden');
}

function rondeBerikutnya() {
  Audio_.playSFX('btn');
  G.gameCount++;
  document.getElementById('recap-modal').classList.add('hidden');

  G.players.forEach(p => {
    p.position = 0;
    p.finished = false;
    p.finishRank = null;
    p.coupon = null;
  });

  G.cards = buatDeck(G.difficulty);
  G.currentTurn = 0;
  G.finishedPlayers = [];
  G.phase = 'roll';
  G.diceResults = [0, 0];
  G.useDoubleDice = false;
  G.pendingExtraRoll = false;
  G.pendingAntiRed = false;
  G.pendingReroll = false;
  G.pendingCardAction = null;

  renderPermainan();
  notifikasi(`✦ Game #${G.gameCount} dimulai!`, 'special');
}

// ────────────────────────────────────────────────────────────
// SIMPAN / MUAT
// ────────────────────────────────────────────────────────────
function dapatkanDaftarSimpanan() {
  try {
    return JSON.parse(localStorage.getItem(SAVE_LIST_KEY) || '[]');
  } catch { return []; }
}

function perbaruiTombolMuat() {
  const btn = document.getElementById('load-game-btn');
  if (btn) btn.disabled = dapatkanDaftarSimpanan().length === 0;
}

function simpanPermainan() {
  Audio_.playSFX('btn');
  // Gunakan saveId yang sudah ada untuk sesi ini (berdasarkan sessionName),
  // sehingga menyimpan ulang mengupdate slot yang sama, tidak menumpuk.
  const list = dapatkanDaftarSimpanan();
  const existing = list.find(s => s.sessionName === G.sessionName);
  const saveId = existing ? existing.saveId : 'save_' + G.sessionName.replace(/\s+/g, '_') + '_' + Date.now();

  const state = { ...G, savedAt: Date.now(), saveId };
  localStorage.setItem(SAVE_KEY_PREFIX + saveId, JSON.stringify(state));

  if (existing) {
    // Update entri yang sudah ada
    existing.gameCount = G.gameCount;
    existing.savedAt   = state.savedAt;
  } else {
    // Tambahkan entri baru
    list.push({ saveId, sessionName: G.sessionName, gameCount: G.gameCount, savedAt: state.savedAt });
  }
  localStorage.setItem(SAVE_LIST_KEY, JSON.stringify(list));

  perbaruiTombolMuat();
  notifikasi('💾 Permainan tersimpan!', 'success');
}

function tampilkanModalMuatPermainan() {
  const list = dapatkanDaftarSimpanan();
  const container = document.getElementById('save-slots-list');

  if (list.length === 0) {
    container.innerHTML = '<p style="text-align:center; color:var(--text-muted); font-style:italic;">Tidak ada simpanan ditemukan.</p>';
  } else {
    container.innerHTML = list.slice().reverse().map(item => {
      const tanggal = new Date(item.savedAt).toLocaleString('id-ID');
      return `
        <div class="save-slot-item" onclick="muatPermainan('${item.saveId}')">
          <div class="save-slot-info">
            <div class="save-slot-name">${item.sessionName || 'Tanpa Nama'}</div>
            <div class="save-slot-meta">Game #${item.gameCount} · ${tanggal}</div>
          </div>
          <button class="save-slot-delete" onclick="hapusSimpanan(event,'${item.saveId}')">Hapus</button>
        </div>
      `;
    }).join('');
  }

  document.getElementById('load-game-modal').classList.remove('hidden');
  Audio_.playSFX('modal');
  Audio_.startBGM();
}

function muatPermainan(saveId) {
  Audio_.playSFX('btn');
  const raw = localStorage.getItem(SAVE_KEY_PREFIX + saveId);
  if (!raw) {
    notifikasi('Simpanan tidak ditemukan.', 'danger');
    return;
  }
  try {
    const state = JSON.parse(raw);

    // Pastikan totalScores tidak ada yang undefined
    if (state.players && state.totalScores) {
      state.players.forEach(p => {
        if (state.totalScores[p.id] === undefined) {
          state.totalScores[p.id] = 0;
        }
      });
    }

    G = state;
    tutupModal('load-game-modal');
    document.getElementById('menu-screen').classList.add('hidden');
    document.getElementById('game-screen').classList.remove('hidden');
    renderPermainan();
    notifikasi('◈ Permainan dimuat!', 'success');
  } catch (e) {
    notifikasi('Gagal memuat simpanan.', 'danger');
  }
}

function hapusSimpanan(event, saveId) {
  Audio_.playSFX('btn');
  event.stopPropagation();
  localStorage.removeItem(SAVE_KEY_PREFIX + saveId);
  const list = dapatkanDaftarSimpanan().filter(s => s.saveId !== saveId);
  localStorage.setItem(SAVE_LIST_KEY, JSON.stringify(list));
  perbaruiTombolMuat();
  tampilkanModalMuatPermainan(); // refresh
  notifikasi('Simpanan dihapus.', 'info');
}

function toggleAudioBGM() {
  const muted = Audio_.toggleBGM();
  const btn = document.getElementById('bgm-toggle-btn');
  if (btn) btn.textContent = muted ? '🔇 BGM' : '🎵 BGM';
  if (!Audio_.isSFXMuted()) Audio_.playSFX('btn');
}
function toggleAudioSFX() {
  const muted = Audio_.toggleSFX();
  const btn = document.getElementById('sfx-toggle-btn');
  if (btn) btn.textContent = muted ? '🔕 SFX' : '🔊 SFX';
  if (!muted) Audio_.playSFX('btn'); // konfirmasi saat unmute
}

function konfirmasiKeluar() {
  Audio_.playSFX('btn');
  if (confirm('Keluar ke menu utama? (Kemajuan yang belum disimpan akan hilang)')) {
    keMenu();
  }
}

function keMenu() {
  document.getElementById('recap-modal').classList.add('hidden');
  document.getElementById('card-action-modal').classList.add('hidden');
  document.getElementById('game-screen').classList.add('hidden');
  document.getElementById('menu-screen').classList.remove('hidden');
  Audio_.stopBGM();
}

// ────────────────────────────────────────────────────────────
// NOTIFIKASI
// ────────────────────────────────────────────────────────────
function notifikasi(msg, type = 'info') {
  const area = document.getElementById('notification-area');
  const el = document.createElement('div');
  el.className = `notification ${type}`;
  el.textContent = msg;
  area.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

// ────────────────────────────────────────────────────────────
// INISIALISASI
// ────────────────────────────────────────────────────────────
window.addEventListener('load', () => {
  perbaruiTombolMuat();
  perbaruiPengaturanPemain();
});

window.addEventListener('resize', () => {
  if (G.gameStarted) renderToken();
});
