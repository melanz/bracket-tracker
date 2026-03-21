/**
 * Admin: edit master bracket in memory and save master.csv
 */
(function () {
  const C = window.BracketCore;
  if (!C) {
    console.error('BracketCore missing — load app.js first');
    return;
  }

  const host = document.getElementById('bracket-main');
  const firstFourHost = document.getElementById('first-four-host');
  const statusEl = document.getElementById('save-status');
  const btnSave = document.getElementById('btn-save');
  const btnDownload = document.getElementById('btn-download');

  let teams = [];
  let seeds = [];
  let master = [];
  let firstFourGames = [];
  let dirty = false;
  /** @type {FileSystemFileHandle | null} */
  let saveHandle = null;

  function setStatus(msg, kind = 'warn') {
    statusEl.textContent = msg;
    statusEl.className = kind === 'ok' ? 'status-saved' : 'status-unsaved';
  }

  function pickWinner(p, tid) {
    if (!C.applyPickAtPosition(master, seeds, p, tid)) return;
    dirty = true;
    setStatus('Unsaved changes', 'warn');
    render();
  }

  function clearResult(p) {
    C.clearPickAtPosition(master, p);
    dirty = true;
    setStatus('Unsaved changes', 'warn');
    render();
  }

  function render() {
    const eliminated = C.computeEliminated(master, seeds);
    host.innerHTML = '';
    C.renderFullBracket(host, master, master, seeds, teams, eliminated, {
      interactive: true,
      onPickWinner: pickWinner,
      onClear: clearResult,
    });
  }

  function downloadCsv(csvString) {
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'master.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function writeToHandle(handle, csvString) {
    const writable = await handle.createWritable();
    await writable.write(csvString);
    await writable.close();
  }

  async function save() {
    const csvString = C.treeToCSVString(master);
    if (window.showSaveFilePicker) {
      try {
        if (!saveHandle) {
          saveHandle = await window.showSaveFilePicker({
            suggestedName: 'master.csv',
            types: [{ description: 'CSV', accept: { 'text/csv': ['.csv'] } }],
          });
        }
        await writeToHandle(saveHandle, csvString);
        dirty = false;
        setStatus('Saved to file.', 'ok');
        return;
      } catch (e) {
        if (e.name === 'AbortError') return;
        console.warn(e);
      }
    }
    downloadCsv(csvString);
    dirty = false;
    setStatus('Downloaded master.csv — copy to data/ if needed.', 'ok');
  }

  async function saveAs() {
    const csvString = C.treeToCSVString(master);
    if (!window.showSaveFilePicker) {
      downloadCsv(csvString);
      setStatus('Downloaded master.csv', 'ok');
      return;
    }
    try {
      saveHandle = await window.showSaveFilePicker({
        suggestedName: 'master.csv',
        types: [{ description: 'CSV', accept: { 'text/csv': ['.csv'] } }],
      });
      await writeToHandle(saveHandle, csvString);
      dirty = false;
      setStatus('Saved to chosen file.', 'ok');
    } catch (e) {
      if (e.name !== 'AbortError') console.warn(e);
    }
  }

  btnSave.addEventListener('click', () => save());
  btnDownload.addEventListener('click', () => saveAs());

  (async function init() {
    if (window.location.protocol === 'file:') {
      C.renderServeHelp(host);
      setStatus('Open over http:// — see instructions above', 'warn');
      return;
    }
    try {
      const teamsRows = await C.loadCSV('data/teams.csv');
      teams = teamsRows.map((r) => r[0]);

      const bracketRows = await C.loadCSV('data/bracket.csv');
      const seedsMap = C.rowsToPositionMap(bracketRows, true);
      seeds = C.buildTreeFromMaps(seedsMap, {});

      const masterRows = await C.loadCSV('data/master.csv');
      const masterMap = C.rowsToPositionMap(masterRows, true);
      master = C.buildTreeFromMaps(seedsMap, masterMap);

      const ffRows = await C.loadCSV('data/first_four.csv');
      firstFourGames = C.parseFirstFour(ffRows);

      firstFourHost.innerHTML = '';
      C.renderFirstFourSection(firstFourHost, firstFourGames, teams, seeds);

      render();
      setStatus(dirty ? 'Unsaved changes' : 'Loaded — edit and save', dirty ? 'warn' : 'ok');
    } catch (err) {
      console.error(err);
      C.renderServeHelp(host, err.message || String(err));
      setStatus('Load error', 'warn');
    }
  })();
})();
