/**
 * Build a new player bracket: First Four + main tree, save single CSV (main + ff0–ff3).
 */
(function () {
  const C = window.BracketCore;
  if (!C) {
    console.error('BracketCore missing — load app.js first');
    return;
  }

  const host = document.getElementById('bracket-main');
  const placeholderEl = document.getElementById('bracket-placeholder');
  const ffHost = document.getElementById('first-four-host');
  const btnSave = document.getElementById('btn-save');
  const btnDownload = document.getElementById('btn-download');
  const statusEl = document.getElementById('save-status');
  const saveHint = document.getElementById('save-hint');
  const inputName = document.getElementById('input-name');
  const inputSlug = document.getElementById('input-slug');

  let teams = [];
  let seeds = [];
  let seedsMap = {};
  let master = [];
  let firstFourGames = [];
  /** @type {number[]} */
  let player = [];
  /** @type {(number|null)[]} */
  let ffPicks = [null, null, null, null];
  let slugManual = false;

  function setStatus(msg, kind = 'warn') {
    statusEl.textContent = msg;
    statusEl.className = kind === 'ok' ? 'status-saved' : 'status-unsaved';
  }

  function slugify(name) {
    const s = name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    return s || 'player';
  }

  function getSlug() {
    const raw = (inputSlug.value || '').trim().toLowerCase();
    if (/^[a-z0-9][a-z0-9-]*$/.test(raw)) return raw;
    return slugify(inputName.value || 'player');
  }

  inputName.addEventListener('input', () => {
    if (!slugManual) inputSlug.value = slugify(inputName.value);
    updateSaveEnabled();
  });
  inputSlug.addEventListener('input', () => {
    slugManual = true;
    updateSaveEnabled();
  });

  function ffComplete() {
    return ffPicks.length === 4 && ffPicks.every((x) => x != null && !Number.isNaN(x));
  }

  function isBracketComplete(tree) {
    for (let p = 1; p <= 63; p++) {
      if (tree[p] == null) return false;
    }
    return true;
  }

  function updateSaveEnabled() {
    const ok = ffComplete() && isBracketComplete(player) && /^[a-z0-9][a-z0-9-]*$/.test(getSlug());
    btnSave.disabled = !ok;
    btnDownload.disabled = !ok;
  }

  /** Reset main-bracket picks when First Four choices change who advances. */
  function clearMainBracketPicks() {
    for (let p = 1; p <= 63; p++) {
      player[p] = null;
    }
  }

  function hasAnyMainBracketPicks() {
    for (let p = 1; p <= 63; p++) {
      if (player[p] != null) return true;
    }
    return false;
  }

  function setBracketLocked(locked) {
    if (!placeholderEl) return;
    placeholderEl.hidden = !locked;
    host.hidden = locked;
  }

  /**
   * Apply First Four winners to seed slots (overrides bracket.csv at each play-in slot).
   * Must run before rendering so the main bracket shows the teams you picked.
   */
  function syncSeedsFromFfPicks() {
    seeds = C.buildTreeFromMaps(seedsMap, {});
    for (let i = 0; i < firstFourGames.length; i++) {
      const pick = ffPicks[i];
      if (pick != null && !Number.isNaN(pick)) {
        const bp = firstFourGames[i].bracketPosition;
        seeds[bp] = pick;
      }
    }
  }

  function renderFfPicker() {
    ffHost.innerHTML = '';
    const sec = document.createElement('section');
    sec.className = 'first-four';
    sec.innerHTML = '<h2>First Four — pick each winner</h2>';
    const grid = document.createElement('div');
    grid.className = 'first-four-grid';

    firstFourGames.forEach((g, i) => {
      const box = document.createElement('div');
      box.className = 'ff-game ff-picker';

      const row = document.createElement('div');
      row.className = 'ff-teams ff-picker-row';

      const mkBtn = (tid) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'ff-pick-btn';
        if (ffPicks[i] === tid) b.classList.add('ff-picked');
        b.textContent = C.teamName(teams, tid);
        b.addEventListener('click', () => {
          const prev = ffPicks[i];
          if (prev === tid) return;
          if (
            prev != null &&
            prev !== tid &&
            hasAnyMainBracketPicks() &&
            !window.confirm(
              'Changing a First Four winner will erase all tournament bracket picks you already made. This cannot be undone. Continue?'
            )
          ) {
            return;
          }
          ffPicks[i] = tid;
          if (prev != null && prev !== tid) {
            clearMainBracketPicks();
          }
          syncSeedsFromFfPicks();
          renderFfPicker();
          renderBracket();
          updateSaveEnabled();
        });
        return b;
      };

      row.appendChild(mkBtn(g.team1));
      const vs = document.createElement('span');
      vs.className = 'vs';
      vs.textContent = 'vs';
      row.appendChild(vs);
      row.appendChild(mkBtn(g.team2));

      box.appendChild(row);
      grid.appendChild(box);
    });
    sec.appendChild(grid);
    ffHost.appendChild(sec);
  }

  function pickWinner(p, tid) {
    if (!C.applyPickAtPosition(player, seeds, p, tid)) return;
    renderBracket();
    updateSaveEnabled();
  }

  function clearResult(p) {
    C.clearPickAtPosition(player, p);
    renderBracket();
    updateSaveEnabled();
  }

  function renderBracket() {
    if (!ffComplete()) {
      setBracketLocked(true);
      host.innerHTML = '';
      return;
    }
    setBracketLocked(false);
    syncSeedsFromFfPicks();
    /* No master-based elimination or score styling while building a new bracket */
    const eliminated = new Set();
    host.innerHTML = '';
    C.renderFullBracket(host, player, master, seeds, teams, eliminated, {
      interactive: true,
      bracketEntryMode: true,
      onPickWinner: pickWinner,
      onClear: clearResult,
    });
  }

  function buildCsv() {
    return C.playerDataToCsv(player, ffPicks);
  }

  function downloadCsv(filename, csvString) {
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function writeFile(handle, text) {
    const w = await handle.createWritable();
    await w.write(text);
    await w.close();
  }

  /**
   * User selects project root (folder containing `data/`).
   */
  async function saveToProjectFolder() {
    const csvString = buildCsv();
    const slug = getSlug();
    if (!window.showDirectoryPicker) return false;
    try {
      const root = await window.showDirectoryPicker({ mode: 'readwrite' });
      const dataHandle = await root.getDirectoryHandle('data', { create: false });
      const playersHandle = await dataHandle.getDirectoryHandle('players', { create: false });
      const fh = await playersHandle.getFileHandle(`${slug}.csv`, { create: true });
      await writeFile(fh, csvString);

      const indexHandle = await playersHandle.getFileHandle('index.csv', { create: true });
      let text = '';
      try {
        const file = await indexHandle.getFile();
        text = await file.text();
      } catch (_) {
        /* new file */
      }
      const lines = text
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);
      const displayName = (inputName.value || '').trim();
      const line = displayName ? `${slug}.csv,${displayName}` : `${slug}.csv`;
      const alreadyListed = lines.some((l) => l.split(',')[0].trim() === `${slug}.csv`);
      if (!alreadyListed) lines.push(line);
      const iw = await indexHandle.createWritable();
      await iw.write(`${lines.join('\n')}\n`);
      await iw.close();

      setStatus(`Saved ${slug}.csv and updated index.csv — refresh the leaderboard.`, 'ok');
      saveHint.innerHTML = `Open <a href="index.html">Leaderboard</a> and refresh the page.`;
      return true;
    } catch (e) {
      if (e.name === 'AbortError') return false;
      console.warn(e);
      setStatus(e.message || String(e), 'warn');
      return false;
    }
  }

  function downloadOnly() {
    const slug = getSlug();
    downloadCsv(`${slug}.csv`, buildCsv());
    const displayName = (inputName.value || '').trim();
    const indexLine = displayName ? `${slug}.csv,${displayName}` : `${slug}.csv`;
    setStatus(`Downloaded ${slug}.csv — add "${indexLine}" as a new line in data/players/index.csv`, 'ok');
    saveHint.textContent =
      'Copy the file into data/players/ and append the line to index.csv, then reload the leaderboard.';
  }

  btnSave.addEventListener('click', async () => {
    if (!ffComplete() || !isBracketComplete(player)) return;
    if (!window.showDirectoryPicker) {
      downloadOnly();
      return;
    }
    await saveToProjectFolder();
  });

  btnDownload.addEventListener('click', () => downloadOnly());

  (async function init() {
    if (window.location.protocol === 'file:') {
      if (placeholderEl) placeholderEl.hidden = true;
      host.hidden = false;
      C.renderServeHelp(host);
      setStatus('Open over http://', 'warn');
      return;
    }
    try {
      const teamsRows = await C.loadCSV('data/teams.csv');
      teams = teamsRows.map((r) => r[0]);

      const bracketRows = await C.loadCSV('data/bracket.csv');
      seedsMap = C.rowsToPositionMap(bracketRows, true);
      seeds = C.buildTreeFromMaps(seedsMap, {});

      const masterRows = await C.loadCSV('data/master.csv');
      const masterMap = C.rowsToPositionMap(masterRows, true);
      master = C.buildTreeFromMaps(seedsMap, masterMap);

      const ffRows = await C.loadCSV('data/first_four.csv');
      firstFourGames = C.parseFirstFour(ffRows);

      player = C.buildTreeFromMaps(seedsMap, {});
      syncSeedsFromFfPicks();

      renderFfPicker();
      renderBracket();
      updateSaveEnabled();
      setStatus('Pick all four First Four winners to unlock the tournament bracket.', 'warn');
    } catch (err) {
      console.error(err);
      if (placeholderEl) placeholderEl.hidden = true;
      host.hidden = false;
      C.renderServeHelp(host, err.message || String(err));
      setStatus('Load error', 'warn');
    }
  })();
})();
