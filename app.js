/**
 * March Madness Bracket Tracker — shared logic and main app UI
 * Binary tree: index 1 = champion; leaves 64–127 = Round of 64 seeds.
 */

const TREE_SIZE = 128;

const REGION_ROUNDS = [
  { name: 'South', root: 4, r64: [32, 33, 34, 35, 36, 37, 38, 39], r32: [16, 17, 18, 19], s16: [8, 9], e8: [4] },
  { name: 'East', root: 5, r64: [40, 41, 42, 43, 44, 45, 46, 47], r32: [20, 21, 22, 23], s16: [10, 11], e8: [5] },
  { name: 'West', root: 6, r64: [48, 49, 50, 51, 52, 53, 54, 55], r32: [24, 25, 26, 27], s16: [12, 13], e8: [6] },
  { name: 'Midwest', root: 7, r64: [56, 57, 58, 59, 60, 61, 62, 63], r32: [28, 29, 30, 31], s16: [14, 15], e8: [7] },
];

const FINAL_FOUR = { games: [4, 5, 6, 7], semis: [2, 3], champ: 1 };

// --- CSV ---

function parseCSV(text) {
  const lines = text.trim().split('\n').filter((l) => l.length);
  return lines.map((line) => line.split(',').map((c) => c.trim()));
}

function rowsToPositionMap(rows, hasHeader = true) {
  const map = {};
  const start = hasHeader ? 1 : 0;
  for (let i = start; i < rows.length; i++) {
    const [pos, tid] = rows[i];
    if (pos === undefined || tid === undefined) continue;
    map[Number(pos)] = Number(tid);
  }
  return map;
}

function buildTreeFromMaps(seedsMap, picksMap) {
  const t = new Array(TREE_SIZE).fill(null);
  for (let p = 64; p <= 127; p++) {
    if (seedsMap[p] != null) t[p] = seedsMap[p];
  }
  for (let p = 1; p <= 63; p++) {
    if (picksMap[p] != null) t[p] = picksMap[p];
  }
  return t;
}

function treeToCSVRows(tree) {
  const rows = [['position', 'team_id']];
  for (let p = 1; p <= 63; p++) {
    if (tree[p] != null) rows.push([String(p), String(tree[p])]);
  }
  return rows;
}

function treeToCSVString(tree) {
  return treeToCSVRows(tree)
    .map((r) => r.join(','))
    .join('\n');
}

/** Clear parent chain from floor(p/2) to root (after setting or clearing a game at p). */
function cascadeClearAncestors(tree, p) {
  let x = Math.floor(p / 2);
  while (x >= 1) {
    tree[x] = null;
    x = Math.floor(x / 2);
  }
}

/**
 * Set winner at internal node p; clears ancestors. Returns false if invalid.
 * @param {number[]} tree - pick tree (seeds + picks 1–63)
 * @param {number[]} seeds - seed values at 64–127
 */
function applyPickAtPosition(tree, seeds, p, tid) {
  const L = 2 * p;
  const R = 2 * p + 1;
  let left;
  let right;
  if (L >= 64) {
    left = seeds[L];
    right = seeds[R];
  } else {
    left = tree[L];
    right = tree[R];
  }
  if (left == null || right == null) return false;
  if (tid !== left && tid !== right) return false;
  tree[p] = tid;
  cascadeClearAncestors(tree, p);
  return true;
}

function clearPickAtPosition(tree, p) {
  tree[p] = null;
  cascadeClearAncestors(tree, p);
}

/**
 * Parse player CSV: main bracket rows 1–63 and optional ff0–ff3 rows.
 * @returns {{ mainMap: Object<number,number>, ffPicks: (number|null)[] }}
 */
function parsePlayerCsv(rows) {
  const mainMap = {};
  const ffPicks = [null, null, null, null];
  if (!rows || !rows.length) return { mainMap, ffPicks };
  const start = rows[0][0] === 'position' ? 1 : 0;
  for (let i = start; i < rows.length; i++) {
    const row = rows[i];
    const posRaw = row[0];
    const tidRaw = row[1];
    if (posRaw === undefined || tidRaw === undefined) continue;
    const pos = String(posRaw).trim();
    const m = /^ff([0-3])$/.exec(pos);
    if (m) {
      ffPicks[Number(m[1])] = Number(tidRaw);
    } else {
      const pn = Number(pos);
      if (!Number.isNaN(pn)) mainMap[pn] = Number(tidRaw);
    }
  }
  return { mainMap, ffPicks };
}

/** Full player file: main tree picks + four First Four lines ff0..ff3. */
function playerDataToCsv(tree, ffPicks) {
  let s = treeToCSVString(tree);
  for (let i = 0; i < 4; i++) {
    if (ffPicks[i] != null && !Number.isNaN(ffPicks[i])) {
      s += `\nff${i},${ffPicks[i]}`;
    }
  }
  return s;
}

// --- Elimination & scoring ---

/**
 * @param {number[]} master - tree with seeds + master results
 * @param {number[]} seeds - seed tree (64–127)
 */
function computeEliminated(master, seeds) {
  const eliminated = new Set();
  for (let p = 1; p <= 63; p++) {
    const w = master[p];
    if (w == null) continue;
    const L = 2 * p;
    const R = 2 * p + 1;
    let left;
    let right;
    if (L >= 64) {
      left = seeds[L];
      right = seeds[R];
    } else {
      left = master[L];
      right = master[R];
      if (left == null || right == null) continue;
    }
    if (left !== w) eliminated.add(left);
    if (right !== w) eliminated.add(right);
  }
  return eliminated;
}

/**
 * @param {number[]} player - full player pick tree
 * @param {number[]} master - master results (partial internal + seeds)
 * @param {Set<number>} eliminated
 */
function scoreBracket(player, master, eliminated) {
  let score = 0;
  let pendingRecoverable = 0;
  for (let p = 1; p <= 63; p++) {
    const pick = player[p];
    if (pick == null) continue;
    const actual = master[p];
    if (actual != null) {
      if (pick === actual) score++;
    } else if (!eliminated.has(pick)) {
      pendingRecoverable++;
    }
  }
  return { score, maxPossible: score + pendingRecoverable };
}

/**
 * Status for the pick at game position `pos` (1–63).
 */
function getPickStatus(pos, playerPick, master, eliminated) {
  if (playerPick == null) return 'empty';
  const actual = master[pos];
  if (actual != null) {
    return playerPick === actual ? 'correct' : 'wrong';
  }
  if (eliminated.has(playerPick)) return 'impossible';
  return 'pending';
}

/**
 * Team shown at slot `pos` for display (participant advancing from subtree).
 */
function displayTeamAt(pos, picks, seeds) {
  if (pos >= 64) return seeds[pos];
  return picks[pos];
}

function teamName(teams, id) {
  if (id == null || id === undefined) return '—';
  return teams[id] ?? `#${id}`;
}

// --- Fetch ---

async function loadCSV(path) {
  const res = await fetch(path, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`Failed to load ${path}: ${res.status}`);
  return parseCSV(await res.text());
}

// --- First Four ---

function parseFirstFour(rows) {
  const header = rows[0];
  const games = [];
  const start = header[0] === 'team1_id' ? 1 : 0;
  for (let i = start; i < rows.length; i++) {
    const [a, b, w, bp] = rows[i].map(Number);
    games.push({ team1: a, team2: b, winner: w, bracketPosition: bp });
  }
  return games;
}

/** Master First Four winners in the same order as `first_four.csv` rows. */
function masterFfWinners(games) {
  return games.map((g) => g.winner);
}

/**
 * @param {(number|null)[]} playerFf - four picked winner team IDs (same order as first_four.csv)
 * @param {number[]} masterFf - four actual winner team IDs
 */
function scoreFirstFour(playerFf, masterFf) {
  if (!playerFf || !masterFf || masterFf.length < 4) return 0;
  let s = 0;
  for (let i = 0; i < 4; i++) {
    const p = playerFf[i];
    const m = masterFf[i];
    if (p == null || m == null || Number.isNaN(p)) continue;
    if (Number(p) === Number(m)) s++;
  }
  return s;
}

// --- Render: leaderboard ---

function renderLeaderboard(container, rows, onSelect) {
  container.innerHTML = '';
  if (!rows.length) {
    const empty = document.createElement('div');
    empty.className = 'leaderboard-empty';
    empty.innerHTML = `
      <p><strong>No players yet.</strong> Add a bracket with <a href="add-player.html">Add new player</a>.</p>
      <p class="hint">Each player is one CSV under <code>data/players/</code> listed in <code>index.csv</code>.</p>`;
    container.appendChild(empty);
    return;
  }
  const table = document.createElement('table');
  table.className = 'leaderboard';
  table.innerHTML = `
    <thead><tr><th>Rank</th><th>Player</th><th>Score</th><th>Max possible</th><th></th></tr></thead>
    <tbody></tbody>`;
  const tbody = table.querySelector('tbody');
  rows.forEach((r, i) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${i + 1}</td><td class="player-name">${escapeHtml(r.name)}</td><td>${r.score}</td><td>${r.maxPossible}</td><td><span class="view-bracket-btn">View Bracket &rarr;</span></td>`;
    tr.tabIndex = 0;
    tr.setAttribute('role', 'link');
    tr.setAttribute('aria-label', `View bracket for ${r.name}`);
    tr.addEventListener('click', () => onSelect(r.slug || r.name));
    tr.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') onSelect(r.slug || r.name);
    });
    tbody.appendChild(tr);
  });
  container.appendChild(table);
}

function escapeHtml(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

// --- Render: matchup box ---

function statusClass(status) {
  if (status === 'correct') return 'pick-correct';
  if (status === 'wrong') return 'pick-wrong';
  if (status === 'impossible') return 'pick-impossible';
  if (status === 'pending') return 'pick-pending';
  return 'pick-empty';
}

function teamLineClass(teamId, eliminated) {
  if (teamId == null) return 'team-unknown';
  if (eliminated.has(teamId)) return 'team-out';
  return '';
}

/**
 * Render one game at position `gamePos` for player comparison view.
 */
function renderMatchup(el, gamePos, player, master, seeds, teams, eliminated, opts = {}) {
  const {
    showMaster = false,
    interactive = false,
    onPickWinner = null,
    onClear = null,
    /** True on add-player: no elimination styling, no vs-master pick colors, pick games ignore master lock */
    bracketEntryMode = false,
    ffPositions = null,
    ffStatus = null,
  } = opts;
  const L = 2 * gamePos;
  const R = 2 * gamePos + 1;
  const leftId = displayTeamAt(L, player, seeds);
  const rightId = displayTeamAt(R, player, seeds);
  const pick = player[gamePos];
  const actual = master[gamePos];
  const status = bracketEntryMode
    ? 'pending'
    : getPickStatus(gamePos, pick, master, eliminated);

  const wrap = document.createElement('div');
  wrap.className = 'matchup';
  wrap.dataset.position = String(gamePos);
  if (!interactive && !bracketEntryMode) {
    wrap.classList.add('matchup-detailable');
  }

  const mkLine = (tid, childPos) => {
    const line = document.createElement('div');
    const isFfSlot = ffPositions && ffPositions.has(childPos);
    const ffCorrect = isFfSlot && ffStatus && ffStatus.get(childPos) === 'correct';
    const skipElim = childPos >= 64 && (!isFfSlot || ffCorrect);

    /** Advancement styling from the prior-round game (or First Four slot). */
    let advClass = '';
    if (!bracketEntryMode && tid != null) {
      if (childPos < 64) {
        const childStatus = getPickStatus(childPos, player[childPos], master, eliminated);
        advClass = statusClass(childStatus);
      } else if (ffStatus && ffStatus.has(childPos)) {
        advClass = statusClass(ffStatus.get(childPos));
      }
    }

    // Don't strike out eliminated teams on this line when their prior-round pick was correct
    // (yellow highlight should not combine with team-out — e.g. right R64 pick, then lost R32).
    const suppressTeamOut = advClass === 'pick-correct';
    const base =
      bracketEntryMode || skipElim || suppressTeamOut ? '' : teamLineClass(tid, eliminated);
    const isPick = tid != null && pick != null && tid === pick;

    line.className = ['team-line', base, isPick ? 'is-pick' : '', advClass].filter(Boolean).join(' ');
    line.textContent = teamName(teams, tid);
    const canClick =
      interactive &&
      leftId != null &&
      rightId != null &&
      tid != null &&
      (bracketEntryMode || actual == null);
    if (canClick) {
      line.classList.add('clickable');
      line.addEventListener('click', () => onPickWinner(gamePos, tid));
    }
    return line;
  };

  const rowL = mkLine(leftId, L);
  const rowR = mkLine(rightId, R);

  const mid = document.createElement('div');
  mid.className = 'matchup-meta';
  if (showMaster && actual != null) {
    mid.textContent = `Result: ${teamName(teams, actual)}`;
  }

  wrap.appendChild(rowL);
  wrap.appendChild(rowR);
  if (GAME_SCHEDULE[gamePos]) {
    const iso = GAME_SCHEDULE[gamePos];
    wrap.dataset.gameStart = iso;
    const gameDate = new Date(iso);
    const now = new Date();
    const live = isGameInLiveWindow(iso, now);
    if (live) wrap.classList.add('matchup-live');
    const timeEl = document.createElement('div');
    timeEl.className =
      'matchup-time' + (live ? ' matchup-time-live' : gameDate < now ? ' played' : '');
    const ch = GAME_CHANNELS[gamePos];
    timeEl.textContent = compactTimeFmt.format(gameDate) + (ch ? ` · ${ch}` : '');
    wrap.appendChild(timeEl);
  }
  if (mid.textContent) wrap.appendChild(mid);
  const showClear = onClear && (bracketEntryMode ? pick != null : actual != null);
  if (showClear) {
    const clr = document.createElement('button');
    clr.type = 'button';
    clr.className = 'btn-clear';
    clr.textContent = 'Clear';
    clr.title = bracketEntryMode
      ? 'Clear your pick here and any later picks that depended on it'
      : 'Undo this result and all later rounds that depend on it';
    clr.addEventListener('click', () => onClear(gamePos));
    wrap.appendChild(clr);
  }
  el.appendChild(wrap);
}

function renderRoundColumn(el, gamePositions, player, master, seeds, teams, eliminated, opts) {
  const col = document.createElement('div');
  col.className = 'round-col';
  for (const g of gamePositions) {
    renderMatchup(col, g, player, master, seeds, teams, eliminated, opts);
  }
  el.appendChild(col);
}

/**
 * Vertical strip between two rounds: each cell merges a pair of games into the next round.
 * LTR: feeders on the left, outlet on the right. RTL regions mirror so outlets face the next column.
 */
function createBracketGutter(slots, direction) {
  const gutter = document.createElement('div');
  gutter.className = 'bracket-gutter' + (direction === 'rtl' ? ' bracket-gutter--rtl' : '');
  gutter.setAttribute('aria-hidden', 'true');
  const pathD = 'M 0 25 H 36 V 50 M 0 75 H 36 V 50 M 36 50 H 100';
  for (let i = 0; i < slots; i++) {
    const cell = document.createElement('div');
    cell.className = 'bracket-gutter__cell';
    cell.innerHTML = `<svg viewBox="0 0 100 100" preserveAspectRatio="none" class="bracket-gutter__svg" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path vector-effect="non-scaling-stroke" d="${pathD}" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    gutter.appendChild(cell);
  }
  return gutter;
}

/** Connector from the two Final Four games down into the championship matchup. */
function createSemisToChampJoin() {
  const el = document.createElement('div');
  el.className = 'bracket-join-semis-champ';
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = '<svg viewBox="0 0 100 100" preserveAspectRatio="none" class="bracket-join-semis-champ__svg" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path vector-effect="non-scaling-stroke" d="M 22 0 L 22 40 L 50 40 M 78 0 L 78 40 L 50 40 M 50 40 L 50 100" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  return el;
}

function renderRegion(el, cfg, player, master, seeds, teams, eliminated, opts, direction) {
  const region = document.createElement('div');
  region.className = `region region-${direction}`;
  const title = document.createElement('div');
  title.className = 'region-title';
  title.textContent = cfg.name;
  region.appendChild(title);

  const body = document.createElement('div');
  body.className = 'region-body';

  const ROUND_LABELS = ['First Round', 'Second Round', 'Sweet 16', 'Elite 8'];
  const rounds = [cfg.r64, cfg.r32, cfg.s16, cfg.e8];
  const labels = [...ROUND_LABELS];
  if (direction === 'rtl') { rounds.reverse(); labels.reverse(); }

  for (let i = 0; i < rounds.length; i++) {
    const rc = document.createElement('div');
    rc.className = 'round-wrap';
    const lab = document.createElement('div');
    lab.className = 'round-label';
    lab.textContent = labels[i];
    rc.appendChild(lab);
    renderRoundColumn(rc, rounds[i], player, master, seeds, teams, eliminated, opts);
    body.appendChild(rc);
    if (i < rounds.length - 1) {
      const slots = Math.min(rounds[i].length, rounds[i + 1].length);
      body.appendChild(createBracketGutter(slots, direction));
    }
  }

  region.appendChild(body);
  el.appendChild(region);
}

function renderFinalFourSection(el, player, master, seeds, teams, eliminated, opts) {
  const ff = document.createElement('div');
  ff.className = 'final-four-center';

  function labeledRound(className, label, setup) {
    const group = document.createElement('div');
    group.className = 'center-round-group';
    const lab = document.createElement('div');
    lab.className = 'center-round-label';
    lab.textContent = label;
    group.appendChild(lab);
    const row = document.createElement('div');
    row.className = className;
    setup(row);
    group.appendChild(row);
    ff.appendChild(group);
  }

  labeledRound('ff-row semis', 'Final Four', (row) => {
    renderRoundColumn(row, FINAL_FOUR.semis, player, master, seeds, teams, eliminated, opts);
  });

  ff.appendChild(createSemisToChampJoin());

  labeledRound('ff-row champ', 'Championship', (row) => {
    renderMatchup(row, FINAL_FOUR.champ, player, master, seeds, teams, eliminated, opts);
  });

  const winnerId = player[1];
  const winnerGroup = document.createElement('div');
  winnerGroup.className = 'center-round-group champion-group';
  const winLabel = document.createElement('div');
  winLabel.className = 'center-round-label';
  winLabel.textContent = 'Champion';
  winnerGroup.appendChild(winLabel);
  const winBox = document.createElement('div');
  winBox.className = 'champion-box' + (winnerId != null ? ' has-winner' : '');
  winBox.textContent = winnerId != null ? teamName(teams, winnerId) : '—';
  winnerGroup.appendChild(winBox);
  ff.appendChild(winnerGroup);

  el.appendChild(ff);
}

function renderFirstFourSection(container, games, teams, seeds, playerFfPicks) {
  const sec = document.createElement('section');
  sec.className = 'first-four';
  sec.innerHTML = '<h2>First Four</h2>';
  const grid = document.createElement('div');
  grid.className = 'first-four-grid';

  games.forEach((g, idx) => {
    const slotTeam = seeds[g.bracketPosition];
    const w = g.winner;
    const box = document.createElement('div');
    box.className = 'ff-game';
    const t1 = g.team1 === w ? 'ff-win' : 'ff-loss';
    const t2 = g.team2 === w ? 'ff-win' : 'ff-loss';

    let pickLine = '';
    if (playerFfPicks && playerFfPicks[idx] != null && !Number.isNaN(playerFfPicks[idx])) {
      const pick = playerFfPicks[idx];
      const ok = pick === w;
      const cls = ok ? 'ff-pick-correct' : 'ff-pick-wrong';
      pickLine = `<div class="ff-your-pick ${cls}">Your pick: ${escapeHtml(teamName(teams, pick))}${ok ? ' ✓' : ' ✗'}</div>`;
    }

    box.innerHTML = `
      <div class="ff-teams">
        <span class="${t1}">${escapeHtml(teamName(teams, g.team1))}</span>
        <span class="vs">vs</span>
        <span class="${t2}">${escapeHtml(teamName(teams, g.team2))}</span>
      </div>
      <div class="ff-to">Actual: <strong>${escapeHtml(teamName(teams, w))}</strong> → slot ${g.bracketPosition} (${escapeHtml(teamName(teams, slotTeam))})</div>
      ${pickLine}`;
    grid.appendChild(box);
  });
  sec.appendChild(grid);
  container.appendChild(sec);
}

function renderFullBracket(container, player, master, seeds, teams, eliminated, opts = {}) {
  container.innerHTML = '';
  const bracket = document.createElement('div');
  bracket.className = 'bracket-shell';

  const left = document.createElement('div');
  left.className = 'bracket-left';
  renderRegion(left, REGION_ROUNDS[0], player, master, seeds, teams, eliminated, opts, 'ltr');
  renderRegion(left, REGION_ROUNDS[1], player, master, seeds, teams, eliminated, opts, 'ltr');

  const center = document.createElement('div');
  center.className = 'bracket-center';
  renderFinalFourSection(center, player, master, seeds, teams, eliminated, opts);

  const right = document.createElement('div');
  right.className = 'bracket-right';
  renderRegion(right, REGION_ROUNDS[3], player, master, seeds, teams, eliminated, opts, 'rtl');
  renderRegion(right, REGION_ROUNDS[2], player, master, seeds, teams, eliminated, opts, 'rtl');

  bracket.appendChild(left);
  bracket.appendChild(center);
  bracket.appendChild(right);
  container.appendChild(bracket);
  syncLiveMatchupHighlights(document);
  ensureLiveMatchupTicker();
}

// --- Contested upcoming games ---

const GAME_SCHEDULE = {
  // Round of 64 — Thursday March 19 (EDT, UTC-4)
  35: '2026-03-19T12:40:00-04:00', // Nebraska vs Troy
  34: '2026-03-19T15:15:00-04:00', // Vanderbilt vs McNeese
  40: '2026-03-19T14:50:00-04:00', // Duke vs Siena
  41: '2026-03-19T12:15:00-04:00', // Ohio State vs TCU
  44: '2026-03-19T13:30:00-04:00', // Louisville vs South Florida
  45: '2026-03-19T16:05:00-04:00', // Michigan State vs North Dakota State
  36: '2026-03-19T18:50:00-04:00', // North Carolina vs VCU
  56: '2026-03-19T19:10:00-04:00', // Michigan vs Howard
  52: '2026-03-19T19:25:00-04:00', // BYU vs Texas
  38: '2026-03-19T19:35:00-04:00', // Saint Mary's vs Texas A&M
  37: '2026-03-19T21:25:00-04:00', // Illinois vs Penn
  57: '2026-03-19T21:45:00-04:00', // Georgia vs Saint Louis
  53: '2026-03-19T22:00:00-04:00', // Gonzaga vs Kennesaw State
  39: '2026-03-19T22:10:00-04:00', // Houston vs Idaho
  50: '2026-03-19T13:50:00-04:00', // Wisconsin vs High Point
  51: '2026-03-19T16:25:00-04:00', // Arkansas vs Hawaii
  // Round of 64 — Friday March 20
  62: '2026-03-20T12:15:00-04:00', // Kentucky vs Santa Clara
  58: '2026-03-20T12:40:00-04:00', // Texas Tech vs Akron
  48: '2026-03-20T13:35:00-04:00', // Arizona vs LIU
  61: '2026-03-20T13:50:00-04:00', // Virginia vs Wright State
  63: '2026-03-20T14:50:00-04:00', // Iowa State vs Tennessee State
  59: '2026-03-20T15:15:00-04:00', // Alabama vs Hofstra
  49: '2026-03-20T16:10:00-04:00', // Villanova vs Utah State
  60: '2026-03-20T16:25:00-04:00', // Tennessee vs Miami (Ohio)
  33: '2026-03-20T18:50:00-04:00', // Clemson vs Iowa
  42: '2026-03-20T19:10:00-04:00', // St. John's vs Northern Iowa
  46: '2026-03-20T19:25:00-04:00', // UCLA vs UCF
  55: '2026-03-20T19:35:00-04:00', // Purdue vs Queens
  32: '2026-03-20T21:25:00-04:00', // Florida vs Prairie View A&M
  43: '2026-03-20T21:45:00-04:00', // Kansas vs Cal Baptist
  47: '2026-03-20T22:00:00-04:00', // UConn vs Furman
  54: '2026-03-20T22:10:00-04:00', // Miami (Fla.) vs Missouri
  // Round of 32 — Saturday March 21
  28: '2026-03-21T12:10:00-04:00',
  22: '2026-03-21T14:45:00-04:00',
  20: '2026-03-21T17:15:00-04:00',
  19: '2026-03-21T18:10:00-04:00',
  26: '2026-03-21T19:10:00-04:00',
  18: '2026-03-21T19:50:00-04:00',
  17: '2026-03-21T20:45:00-04:00',
  25: '2026-03-21T21:45:00-04:00',
  // Round of 32 — Sunday March 22
  27: '2026-03-22T12:10:00-04:00',
  31: '2026-03-22T14:45:00-04:00',
  21: '2026-03-22T17:15:00-04:00',
  30: '2026-03-22T18:10:00-04:00',
  16: '2026-03-22T19:10:00-04:00',
  24: '2026-03-22T19:50:00-04:00',
  23: '2026-03-22T20:45:00-04:00',
  29: '2026-03-22T21:45:00-04:00',
  // Sweet 16 — March 26 (South + West) & March 27 (East + Midwest)
  8:  '2026-03-26T19:00:00-04:00',
  9:  '2026-03-26T21:30:00-04:00',
  12: '2026-03-26T19:30:00-04:00',
  13: '2026-03-26T22:00:00-04:00',
  10: '2026-03-27T19:00:00-04:00',
  11: '2026-03-27T21:30:00-04:00',
  14: '2026-03-27T19:30:00-04:00',
  15: '2026-03-27T22:00:00-04:00',
  // Elite Eight — March 28 (South + West) & March 29 (East + Midwest)
  4: '2026-03-28T18:00:00-04:00',
  6: '2026-03-28T20:30:00-04:00',
  5: '2026-03-29T14:00:00-04:00',
  7: '2026-03-29T17:00:00-04:00',
  // Final Four — April 4
  2: '2026-04-04T18:00:00-04:00',
  3: '2026-04-04T20:30:00-04:00',
  // Championship — April 6
  1: '2026-04-06T21:00:00-04:00',
};

/** Broadcast network per bracket position (same keys as GAME_SCHEDULE). */
const GAME_CHANNELS = {
  // Round of 64 — Thu Mar 19 (USA Today / March Madness schedule)
  41: 'CBS',
  35: 'truTV',
  44: 'TNT',
  50: 'TBS',
  40: 'CBS',
  34: 'truTV',
  45: 'TNT',
  51: 'TBS',
  36: 'TNT',
  56: 'CBS',
  52: 'TBS',
  38: 'truTV',
  37: 'TNT',
  57: 'CBS',
  53: 'TBS',
  39: 'truTV',
  // Round of 64 — Fri Mar 20
  62: 'CBS',
  58: 'truTV',
  48: 'TNT',
  61: 'TBS',
  63: 'CBS',
  59: 'truTV',
  49: 'TNT',
  60: 'TBS',
  33: 'TNT',
  42: 'CBS',
  46: 'TBS',
  55: 'truTV',
  32: 'TNT',
  43: 'CBS',
  47: 'TBS',
  54: 'truTV',
  // Round of 32 — Sat Mar 21 & Sun Mar 22 (CBS Sports second-round tables)
  28: 'CBS',
  22: 'CBS',
  20: 'CBS',
  19: 'TNT',
  26: 'TBS',
  18: 'CBS',
  17: 'TNT',
  25: 'TBS',
  27: 'CBS',
  31: 'CBS',
  21: 'CBS',
  30: 'TNT',
  16: 'TBS',
  24: 'truTV',
  23: 'TNT',
  29: 'TBS',
  // Sweet 16 — 7:00 & 9:30 ET CBS; 7:30 & 10:00 ET TBS (NCAA/Turner release pattern)
  8: 'CBS',
  9: 'CBS',
  12: 'TBS',
  13: 'TBS',
  10: 'CBS',
  11: 'CBS',
  14: 'TBS',
  15: 'TBS',
  // Elite Eight — March 28–29 (CBS)
  4: 'CBS',
  6: 'CBS',
  5: 'CBS',
  7: 'CBS',
  // Final Four & Championship (CBS)
  2: 'CBS',
  3: 'CBS',
  1: 'CBS',
};

const gameTimeFmt = new Intl.DateTimeFormat(undefined, {
  weekday: 'short', month: 'short', day: 'numeric',
  hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
});

const compactTimeFmt = new Intl.DateTimeFormat(undefined, {
  month: '2-digit', day: '2-digit',
  hour: 'numeric', minute: '2-digit',
});

function formatGameTime(position) {
  const iso = GAME_SCHEDULE[position];
  if (!iso) return null;
  return gameTimeFmt.format(new Date(iso));
}

function formatGameTimeWithChannel(position) {
  const timeStr = formatGameTime(position);
  const ch = GAME_CHANNELS[position];
  if (!timeStr) return ch || null;
  return ch ? `${timeStr} · ${ch}` : timeStr;
}

/** True while local time is within 3 hours after scheduled start (treated as "current" / in progress). */
const LIVE_GAME_WINDOW_MS = 3 * 60 * 60 * 1000;

function isGameInLiveWindow(iso, now = new Date()) {
  if (!iso) return false;
  const start = new Date(iso).getTime();
  const t = now.getTime();
  return t >= start && t < start + LIVE_GAME_WINDOW_MS;
}

function syncLiveMatchupHighlights(root = document) {
  const now = new Date();
  for (const el of root.querySelectorAll('[data-game-start]')) {
    const iso = el.dataset.gameStart;
    const live = isGameInLiveWindow(iso, now);
    if (el.classList.contains('matchup')) {
      el.classList.toggle('matchup-live', live);
    }
    if (el.classList.contains('contested-card')) {
      el.classList.toggle('contested-card-live', live);
    }
    const timeEl = el.querySelector('.matchup-time');
    if (timeEl) {
      timeEl.classList.toggle('matchup-time-live', live);
      const gameDate = new Date(iso);
      timeEl.classList.toggle('played', !live && gameDate < now);
    }
    const contestedTime = el.querySelector('.contested-time');
    if (contestedTime) {
      contestedTime.classList.toggle('contested-time-live', live);
    }
  }
}

function ensureLiveMatchupTicker() {
  if (typeof window === 'undefined' || window.__liveMatchupInterval) return;
  window.__liveMatchupInterval = setInterval(() => syncLiveMatchupHighlights(document), 30000);
}

function getRoundName(p) {
  if (p >= 32) return 'Round of 64';
  if (p >= 16) return 'Round of 32';
  if (p >= 8) return 'Sweet 16';
  if (p >= 4) return 'Elite Eight';
  if (p >= 2) return 'Final Four';
  return 'Championship';
}

/** Region + round label for a game position (e.g. South · Elite Eight). */
function getGameBracketContext(pos) {
  if (pos === 1) return 'Championship';
  if (pos === 2 || pos === 3) return 'Final Four';
  const roundKeys = ['r64', 'r32', 's16', 'e8'];
  const roundLabels = ['First Round', 'Second Round', 'Sweet 16', 'Elite Eight'];
  for (const cfg of REGION_ROUNDS) {
    for (let i = 0; i < roundKeys.length; i++) {
      const arr = cfg[roundKeys[i]];
      const idx = arr.indexOf(pos);
      if (idx !== -1) {
        return `${cfg.name} · ${roundLabels[i]} (${idx + 1}/${arr.length})`;
      }
    }
  }
  return `Bracket position ${pos}`;
}

function pickStatusDisplay(status) {
  switch (status) {
    case 'correct':
      return { label: 'Correct', cls: 'game-popup-status--correct' };
    case 'wrong':
      return { label: 'Wrong', cls: 'game-popup-status--wrong' };
    case 'impossible':
      return { label: 'Busted', cls: 'game-popup-status--impossible' };
    case 'pending':
      return { label: 'Pending', cls: 'game-popup-status--pending' };
    case 'empty':
    default:
      return { label: 'No pick', cls: 'game-popup-status--empty' };
  }
}

function findContestedUpcomingGames(master, seeds, players, displayNames, n = 3) {
  const upcoming = [];
  const playerSlugs = Object.keys(players);

  for (let p = 1; p <= 63; p++) {
    if (master[p] != null) continue;

    const L = 2 * p;
    const R = 2 * p + 1;
    let leftTeam, rightTeam;
    if (L >= 64) {
      leftTeam = seeds[L];
      rightTeam = seeds[R];
    } else {
      leftTeam = master[L];
      rightTeam = master[R];
    }
    if (leftTeam == null || rightTeam == null) continue;

    const pickGroups = {};
    for (const slug of playerSlugs) {
      const pick = players[slug][p];
      if (pick == null) continue;
      if (!pickGroups[pick]) pickGroups[pick] = [];
      pickGroups[pick].push(displayNames[slug] || slug);
    }

    if (Object.keys(pickGroups).length <= 1) continue;

    const sizes = Object.values(pickGroups).map((g) => g.length);
    const balance = Math.min(...sizes) / sizes.reduce((a, b) => a + b, 0);

    upcoming.push({ position: p, leftTeam, rightTeam, pickGroups, balance, round: getRoundName(p) });
  }

  upcoming.sort((a, b) => {
    const tA = GAME_SCHEDULE[a.position] ? new Date(GAME_SCHEDULE[a.position]).getTime() : Infinity;
    const tB = GAME_SCHEDULE[b.position] ? new Date(GAME_SCHEDULE[b.position]).getTime() : Infinity;
    if (tA !== tB) return tA - tB;
    if (b.balance !== a.balance) return b.balance - a.balance;
    return b.position - a.position;
  });

  return upcoming.slice(0, n);
}

function renderContestedGames(container, games, teams) {
  container.innerHTML = '';
  if (!games.length) return;

  const section = document.createElement('div');
  section.className = 'contested-section';

  const heading = document.createElement('h3');
  heading.textContent = 'Upcoming Contested Games';
  section.appendChild(heading);

  const subtitle = document.createElement('p');
  subtitle.className = 'hint';
  subtitle.textContent = 'Next games where players disagree on the winner';
  section.appendChild(subtitle);

  for (const game of games) {
    const card = document.createElement('div');
    card.className = 'contested-card';
    const schedIso = GAME_SCHEDULE[game.position];
    if (schedIso) {
      card.dataset.gameStart = schedIso;
      if (isGameInLiveWindow(schedIso)) card.classList.add('contested-card-live');
    }

    const header = document.createElement('div');
    header.className = 'contested-header';

    const roundLabel = document.createElement('span');
    roundLabel.className = 'contested-round';
    roundLabel.textContent = game.round;
    header.appendChild(roundLabel);

    const matchup = document.createElement('span');
    matchup.className = 'contested-matchup';
    matchup.textContent = `${teamName(teams, game.leftTeam)} vs ${teamName(teams, game.rightTeam)}`;
    header.appendChild(matchup);

    card.appendChild(header);

    const time = formatGameTimeWithChannel(game.position);
    if (time) {
      const timeLine = document.createElement('div');
      timeLine.className =
        'contested-time' + (schedIso && isGameInLiveWindow(schedIso) ? ' contested-time-live' : '');
      timeLine.textContent = time;
      card.appendChild(timeLine);
    }

    const picks = document.createElement('div');
    picks.className = 'contested-picks';

    for (const [tid, names] of Object.entries(game.pickGroups)) {
      const teamId = Number(tid);
      const isValid = teamId === game.leftTeam || teamId === game.rightTeam;
      const group = document.createElement('div');
      group.className = 'contested-pick-group' + (isValid ? '' : ' busted');

      const teamLabel = document.createElement('div');
      teamLabel.className = 'contested-team-label';
      teamLabel.textContent = teamName(teams, teamId) + (isValid ? '' : ' (eliminated)');
      group.appendChild(teamLabel);

      const playerList = document.createElement('div');
      playerList.className = 'contested-players';
      playerList.textContent = names.join(', ');
      group.appendChild(playerList);

      picks.appendChild(group);
    }

    card.appendChild(picks);
    section.appendChild(card);
  }

  container.appendChild(section);
}

// --- App bootstrap ---

function renderServeHelp(container, errDetail = '') {
  const port = '8080';
  const base = `http://127.0.0.1:${port}`;
  container.innerHTML = `
    <div class="serve-help" role="alert">
      <p class="serve-help-title">Data did not load — use a local web server</p>
      <p>Browsers block loading <code>data/*.csv</code> when you open this page as <strong>file://</strong> (double-clicking the HTML file). That is why the leaderboard is empty.</p>
      ${errDetail ? `<p class="serve-help-detail">${escapeHtml(errDetail)}</p>` : ''}
      <p><strong>Fix:</strong> in a terminal, open the <code>brackets2026</code> folder and run:</p>
      <pre class="serve-help-cmd"><code>python3 -m http.server ${port}</code></pre>
      <p>Then open this page at <a href="${base}/index.html">${base}/index.html</a> (not the file on disk).</p>
      <p class="serve-help-note">Or run <code>./serve.sh</code> if you use the helper script in this project.</p>
    </div>`;
}

// --- App bootstrap ---

async function initApp() {
  const leaderboardEl = document.getElementById('leaderboard');
  if (!leaderboardEl) return;
  const bracketView = document.getElementById('bracket-view');
  const bracketTitle = document.getElementById('bracket-title');
  const tabBar = document.getElementById('tab-bar');
  const firstFourHost = document.getElementById('first-four-host');

  if (window.location.protocol === 'file:') {
    renderServeHelp(leaderboardEl);
    return;
  }

  let teamsRows;
  try {
    teamsRows = await loadCSV('data/teams.csv');
  } catch (e) {
    console.error(e);
    renderServeHelp(leaderboardEl, e.message || String(e));
    return;
  }

  try {
    const teams = teamsRows.map((r) => r[0]);

    const bracketRows = await loadCSV('data/bracket.csv');
    const seedsMap = rowsToPositionMap(bracketRows, true);
    const seeds = buildTreeFromMaps(seedsMap, {});

    const masterRows = await loadCSV('data/master.csv');
    const masterMap = rowsToPositionMap(masterRows, true);
    const master = buildTreeFromMaps(seedsMap, masterMap);

    const ffRows = await loadCSV('data/first_four.csv');
    const firstFourGames = parseFirstFour(ffRows);
    const masterFf = masterFfWinners(firstFourGames);

    const indexRows = await loadCSV('data/players/index.csv');

    const players = {};
    const playerFf = {};
    const playerDisplayNames = {};
    for (const row of indexRows) {
      const file = (row[0] || '').trim();
      if (!file) continue;
      const slug = file.replace(/\.csv$/i, '');
      const displayName = (row[1] || '').trim() || slug;
      const pr = await loadCSV(`data/players/${file}`);
      const { mainMap, ffPicks } = parsePlayerCsv(pr);
      players[slug] = buildTreeFromMaps(seedsMap, mainMap);
      playerFf[slug] = ffPicks;
      playerDisplayNames[slug] = displayName;
    }

    const eliminated = computeEliminated(master, seeds);

    const leaderboardData = Object.keys(players)
      .map((slug) => {
        const main = scoreBracket(players[slug], master, eliminated);
        const pff = playerFf[slug] || [null, null, null, null];
        const ff = scoreFirstFour(pff, masterFf);
        return {
          slug,
          name: playerDisplayNames[slug] || slug,
          mainScore: main.score,
          ffScore: ff,
          score: main.score + ff,
          maxPossible: main.maxPossible + ff,
        };
      })
      .sort((a, b) => b.score - a.score || b.maxPossible - a.maxPossible);

    const masterLabel = 'Master (actual)';
    let bracketViewSeeds = seeds;
    let bracketPlayerTree = master;
    let currentView = 'leaderboard';
    let selectedPlayer = null;

    const gamePopupOverlay = document.getElementById('game-popup-overlay');
    const gamePopupContent = document.getElementById('game-popup-content');
    const gamePopupCloseBtn = gamePopupOverlay?.querySelector('.game-popup-close');
    let gamePopupCloseTimer = null;

    function closeGamePopupImmediate() {
      if (!gamePopupOverlay) return;
      clearTimeout(gamePopupCloseTimer);
      gamePopupOverlay.classList.remove('game-popup-overlay--open');
      gamePopupOverlay.hidden = true;
      gamePopupOverlay.setAttribute('aria-hidden', 'true');
    }

    function closeGamePopup() {
      if (!gamePopupOverlay) return;
      clearTimeout(gamePopupCloseTimer);
      gamePopupOverlay.classList.remove('game-popup-overlay--open');
      gamePopupCloseTimer = setTimeout(() => {
        gamePopupOverlay.hidden = true;
        gamePopupOverlay.setAttribute('aria-hidden', 'true');
      }, 200);
    }

    function renderGamePopupContent(pos) {
      if (!gamePopupContent) return;
      gamePopupContent.innerHTML = '';
      const L = 2 * pos;
      const R = 2 * pos + 1;
      const leftTeam = displayTeamAt(L, bracketPlayerTree, bracketViewSeeds);
      const rightTeam = displayTeamAt(R, bracketPlayerTree, bracketViewSeeds);
      const actualWinner = master[pos];

      const header = document.createElement('div');
      header.className = 'game-popup-header';

      const posEl = document.createElement('div');
      posEl.className = 'game-popup-pos';
      posEl.textContent = getGameBracketContext(pos);

      const h2 = document.createElement('h2');
      h2.className = 'game-popup-title';
      h2.id = 'game-popup-title';
      h2.textContent = `${teamName(teams, leftTeam)} vs ${teamName(teams, rightTeam)}`;

      const sub = document.createElement('p');
      sub.className = 'game-popup-sub';
      const timeStr = formatGameTimeWithChannel(pos);
      const roundName = getRoundName(pos);
      sub.textContent = [roundName, timeStr].filter(Boolean).join(' · ');

      header.appendChild(posEl);
      header.appendChild(h2);
      header.appendChild(sub);

      const matchupBox = document.createElement('div');
      matchupBox.className = 'game-popup-matchup';
      const t1 = document.createElement('span');
      t1.className = 'game-popup-team';
      t1.textContent = teamName(teams, leftTeam);
      const vs = document.createElement('span');
      vs.className = 'game-popup-vs';
      vs.textContent = 'vs';
      const t2 = document.createElement('span');
      t2.className = 'game-popup-team';
      t2.textContent = teamName(teams, rightTeam);
      matchupBox.appendChild(t1);
      matchupBox.appendChild(vs);
      matchupBox.appendChild(t2);

      const resultLine = document.createElement('div');
      resultLine.className = 'game-popup-result';
      if (actualWinner != null) {
        resultLine.innerHTML = `Actual: <strong>${escapeHtml(teamName(teams, actualWinner))}</strong>`;
      } else {
        resultLine.textContent = 'Winner not yet decided';
      }
      matchupBox.appendChild(resultLine);

      const picksTitle = document.createElement('h3');
      picksTitle.className = 'game-popup-picks-title';
      picksTitle.textContent = 'Picks by player';

      const table = document.createElement('table');
      table.className = 'game-popup-table';
      const thead = document.createElement('thead');
      const headRow = document.createElement('tr');
      for (const label of ['Player', 'Pick', 'Status']) {
        const th = document.createElement('th');
        th.textContent = label;
        headRow.appendChild(th);
      }
      thead.appendChild(headRow);
      table.appendChild(thead);

      const tbody = document.createElement('tbody');

      const trM = document.createElement('tr');
      const tdM1 = document.createElement('td');
      tdM1.textContent = masterLabel;
      const tdM2 = document.createElement('td');
      tdM2.textContent = actualWinner != null ? teamName(teams, actualWinner) : '—';
      const tdM3 = document.createElement('td');
      const spanM = document.createElement('span');
      spanM.className = `game-popup-status ${actualWinner != null ? 'game-popup-status--actual' : 'game-popup-status--empty'}`;
      spanM.textContent = actualWinner != null ? 'Actual result' : 'Not yet played';
      tdM3.appendChild(spanM);
      trM.appendChild(tdM1);
      trM.appendChild(tdM2);
      trM.appendChild(tdM3);
      tbody.appendChild(trM);

      const slugs = Object.keys(players).sort((a, b) => {
        const na = (playerDisplayNames[a] || a).toLowerCase();
        const nb = (playerDisplayNames[b] || b).toLowerCase();
        return na.localeCompare(nb);
      });
      for (const slug of slugs) {
        const pick = players[slug][pos];
        const status = getPickStatus(pos, pick, master, eliminated);
        const disp = pickStatusDisplay(status);
        const tr = document.createElement('tr');
        const td1 = document.createElement('td');
        td1.textContent = playerDisplayNames[slug] || slug;
        const td2 = document.createElement('td');
        td2.textContent = pick != null ? teamName(teams, pick) : '—';
        const td3 = document.createElement('td');
        const sp = document.createElement('span');
        sp.className = `game-popup-status ${disp.cls}`;
        sp.textContent = disp.label;
        tr.appendChild(td1);
        tr.appendChild(td2);
        tr.appendChild(td3);
        tbody.appendChild(tr);
      }
      table.appendChild(tbody);

      gamePopupContent.appendChild(header);
      gamePopupContent.appendChild(matchupBox);
      gamePopupContent.appendChild(picksTitle);
      gamePopupContent.appendChild(table);
    }

    function openGamePopup(pos) {
      if (!gamePopupOverlay || !gamePopupContent) return;
      clearTimeout(gamePopupCloseTimer);
      renderGamePopupContent(pos);
      gamePopupOverlay.hidden = false;
      gamePopupOverlay.setAttribute('aria-hidden', 'false');
      requestAnimationFrame(() => {
        gamePopupOverlay.classList.add('game-popup-overlay--open');
      });
    }

    if (gamePopupOverlay) {
      gamePopupOverlay.setAttribute('aria-hidden', 'true');
    }
    if (gamePopupCloseBtn) {
      gamePopupCloseBtn.addEventListener('click', (e) => {
        e.preventDefault();
        closeGamePopup();
      });
    }
    if (gamePopupOverlay) {
      gamePopupOverlay.addEventListener('click', (e) => {
        if (e.target === gamePopupOverlay) closeGamePopup();
      });
    }
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      if (!gamePopupOverlay || gamePopupOverlay.hidden) return;
      closeGamePopup();
    });

    const bracketMainEl = document.getElementById('bracket-main');
    if (bracketMainEl) {
      bracketMainEl.addEventListener('click', (e) => {
        if (e.target.closest('.btn-clear')) return;
        if (e.target.closest('.team-line.clickable')) return;
        const mu = e.target.closest('.matchup.matchup-detailable');
        if (!mu) return;
        const p = Number(mu.dataset.position);
        if (!Number.isFinite(p) || p < 1 || p > 63) return;
        openGamePopup(p);
      });
    }

    function showLeaderboard(pushState = true) {
      closeGamePopupImmediate();
      currentView = 'leaderboard';
      selectedPlayer = null;
      document.getElementById('view-leaderboard').hidden = false;
      bracketView.hidden = true;
      if (pushState) history.pushState({ view: 'leaderboard' }, '');
      renderLeaderboard(leaderboardEl, leaderboardData, (slug) => {
        selectedPlayer = slug;
        showBracket(slug);
      });
    }

    function buildTabs(slugs) {
      tabBar.innerHTML = '';
      const all = [{ slug: masterLabel, label: masterLabel }, ...slugs.map((s) => ({ slug: s, label: playerDisplayNames[s] || s }))];
      for (const { slug, label } of all) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'tab';
        b.textContent = label;
        b.dataset.slug = slug;
        b.addEventListener('click', () => showBracket(slug));
        tabBar.appendChild(b);
      }
    }

    function showBracket(slug, pushState = true) {
      closeGamePopupImmediate();
      currentView = 'bracket';
      document.getElementById('view-leaderboard').hidden = true;
      bracketView.hidden = false;
      selectedPlayer = slug;
      if (pushState) history.pushState({ view: 'bracket', player: slug }, '');
      const displayName = playerDisplayNames[slug] || slug;
      bracketTitle.textContent = slug === masterLabel ? 'Tournament bracket (actual results)' : `Bracket — ${displayName}`;

      const playerTree = slug === masterLabel ? master : players[slug];
      if (!playerTree) return;

      [...tabBar.children].forEach((b) => {
        b.classList.toggle('active', b.dataset.slug === slug);
      });

      firstFourHost.innerHTML = '';
      const pff = slug === masterLabel ? null : playerFf[slug] || null;
      renderFirstFourSection(firstFourHost, firstFourGames, teams, seeds, pff);

      const host = document.getElementById('bracket-main');
      host.innerHTML = '';
      const ffPositions = new Set(firstFourGames.map((g) => g.bracketPosition));
      const ffStatus = new Map();
      const pffPicks = slug === masterLabel ? null : playerFf[slug];
      firstFourGames.forEach((g, idx) => {
        if (pffPicks && pffPicks[idx] != null && !Number.isNaN(pffPicks[idx])) {
          ffStatus.set(g.bracketPosition, Number(pffPicks[idx]) === Number(g.winner) ? 'correct' : 'wrong');
        }
      });
      const viewSeeds = [...seeds];
      if (pffPicks) {
        firstFourGames.forEach((g, idx) => {
          if (pffPicks[idx] != null && !Number.isNaN(pffPicks[idx])) {
            viewSeeds[g.bracketPosition] = Number(pffPicks[idx]);
          }
        });
      }
      renderFullBracket(host, playerTree, master, viewSeeds, teams, eliminated, { showMaster: slug === masterLabel, ffPositions, ffStatus });
      bracketViewSeeds = viewSeeds;
      bracketPlayerTree = playerTree;
    }

    window.addEventListener('popstate', (e) => {
      const state = e.state;
      if (state && state.view === 'bracket' && state.player) {
        showBracket(state.player, false);
      } else {
        showLeaderboard(false);
      }
    });

    const siteHeader = document.querySelector('.site-header');
    if (siteHeader) {
      siteHeader.style.cursor = 'pointer';
      siteHeader.addEventListener('click', () => showLeaderboard());
    }

    const backLink = document.getElementById('back-to-leaderboard');
    if (backLink) {
      backLink.addEventListener('click', (e) => { e.preventDefault(); showLeaderboard(); });
    }

    history.replaceState({ view: 'leaderboard' }, '');
    buildTabs(Object.keys(players));

    renderLeaderboard(leaderboardEl, leaderboardData, (name) => {
      showBracket(name);
    });

    const contestedEl = document.getElementById('contested-games');
    if (contestedEl) {
      const contested = findContestedUpcomingGames(master, seeds, players, playerDisplayNames, 3);
      renderContestedGames(contestedEl, contested, teams);
      syncLiveMatchupHighlights(document);
      ensureLiveMatchupTicker();
    }

    // expose for admin / tests
    window.BracketApp = {
      TREE_SIZE,
      parseCSV,
      buildTreeFromMaps,
      computeEliminated,
      scoreBracket,
      scoreFirstFour,
      masterFfWinners,
      getPickStatus,
      displayTeamAt,
      teamName,
      treeToCSVString,
      playerDataToCsv,
      parsePlayerCsv,
      seedsMap,
      seeds,
      master,
      teams,
      playerFf,
      masterFf,
      REGION_ROUNDS,
      FINAL_FOUR,
    };
  } catch (e) {
    console.error(e);
    renderServeHelp(leaderboardEl, e.message || String(e));
  }
}

/** Exposed for admin.html — no async required */
window.BracketCore = {
  TREE_SIZE,
  parseCSV,
  rowsToPositionMap,
  buildTreeFromMaps,
  treeToCSVString,
  playerDataToCsv,
  parsePlayerCsv,
  cascadeClearAncestors,
  applyPickAtPosition,
  clearPickAtPosition,
  computeEliminated,
  scoreBracket,
  scoreFirstFour,
  masterFfWinners,
  getPickStatus,
  displayTeamAt,
  teamName,
  loadCSV,
  renderFullBracket,
  renderFirstFourSection,
  parseFirstFour,
  renderServeHelp,
  REGION_ROUNDS,
  FINAL_FOUR,
};

function bootMainApp() {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
  } else {
    initApp();
  }
}
bootMainApp();
