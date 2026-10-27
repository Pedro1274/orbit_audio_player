import { readMetadata } from './metadata.js';
import { shuffled, nextTrack, formatTime } from './queue.js';
const $ = id => document.getElementById(id);
const audio = $('audio');
const tracks = new Map();
let order = [], current = null, shuffle = false, repeat = 'off', counter = 0, importing = Promise.resolve();
let dragDepth = 0;
audio.volume = .8;
const status = message => { $('status').textContent = message; };
const node = (tag, className, text) => { const el = document.createElement(tag); if (className) el.className = className; if (text != null) el.textContent = text; return el; };
function artwork(container, track, mini = false) {
  container.replaceChildren();
  if (track?.artUrl) { const img = node('img'); img.src = track.artUrl; img.alt = mini ? '' : `Album art for ${track.album}`; container.append(img); }
  else if (mini) container.textContent = '♪';
  else { container.append(node('div', 'cover-orbit'), node('span', '', '♪')); }
}
function render() {
  const query = $('search').value.trim().toLocaleLowerCase();
  $('track-count').textContent = tracks.size;
  $('queue-count').textContent = order.length;
  $('clear').disabled = !tracks.size;
  $('empty').hidden = !!tracks.size;
  $('table-wrap').hidden = !tracks.size;
  $('queue-empty').hidden = !!tracks.size;
  const body = document.createDocumentFragment();
  let visible = 0;
  [...tracks.values()].forEach((track, index) => {
    if (query && !`${track.title} ${track.artist} ${track.album}`.toLocaleLowerCase().includes(query)) return;
    visible++;
    const row = node('tr', track.id === current ? 'active' : '');
    const number = node('td', 'number', track.id === current ? '♫' : index + 1);
    const title = node('td');
    const select = node('button', 'track-select');
    select.setAttribute('aria-label', `Play ${track.title} by ${track.artist}`);
    if (track.id === current) select.setAttribute('aria-current', 'true');
    select.append(node('strong', '', track.title), node('span', 'artist', track.artist));
    select.onclick = () => selectTrack(track.id);
    title.append(select);
    const remove = node('button', 'remove', '×'); remove.setAttribute('aria-label', `Remove ${track.title}`); remove.onclick = () => removeTrack(track.id);
    const actions = node('td'); actions.append(remove);
    row.append(number, title, node('td', 'album-column', track.album), node('td', 'duration', formatTime(track.duration)), actions);
    body.append(row);
  });
  $('tracks').replaceChildren(body);
  $('no-results').hidden = visible > 0;
  const queue = document.createDocumentFragment();
  order.forEach((id, index) => {
    const track = tracks.get(id), li = node('li', current === id ? 'active' : '');
    const button = node('button', '', track.title); button.onclick = () => selectTrack(id);
    if (current === id) button.setAttribute('aria-current', 'true');
    li.append(node('span', '', current === id ? '♫' : index + 1), button, node('span', '', formatTime(track.duration))); queue.append(li);
  });
  $('queue').replaceChildren(queue);
  const durations = [...tracks.values()].filter(t => Number.isFinite(t.duration));
  const scanning = [...tracks.values()].some(t => !t.scanned);
  $('library-summary').textContent = tracks.size ? `${tracks.size} track${tracks.size === 1 ? '' : 's'} · ${formatTime(durations.reduce((sum, t) => sum + t.duration, 0))} total${scanning ? ' (scanning…)' : ''}` : 'Your next favorite moment is a play away.';
  const track = tracks.get(current);
  $('now-title').textContent = track?.title || 'Nothing playing yet';
  $('now-artist').textContent = track?.artist || 'Choose a track to find your rhythm';
  $('now-album').textContent = track?.album || '';
  $('mini-title').textContent = track?.title || 'Your soundtrack awaits';
  $('mini-artist').textContent = track?.artist || 'Add a track to get started';
  artwork($('cover'), track); artwork($('mini-cover'), track, true);
  ['play', 'stop', 'previous', 'next', 'shuffle', 'repeat'].forEach(id => { $(id).disabled = !tracks.size; });
  syncPlayer();
}
function syncPlayer() {
  const playing = !!current && !audio.paused && !audio.ended;
  $('play').textContent = playing ? 'Ⅱ' : '▶';
  $('play').setAttribute('aria-label', playing ? 'Pause' : 'Play');
  $('play-state').textContent = !current ? 'READY' : audio.error ? 'ERROR' : playing ? 'PLAYING' : 'PAUSED';
  const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
  $('seek').disabled = !current || !duration;
  $('seek').max = duration;
  $('seek').value = audio.currentTime || 0;
  $('seek').setAttribute('aria-valuetext', `${formatTime(audio.currentTime || 0)} of ${formatTime(duration)}`);
  $('elapsed').textContent = formatTime(audio.currentTime || 0);
  $('duration').textContent = formatTime(duration);
}
async function play() {
  try { await audio.play(); }
  catch (error) { if (error.name !== 'AbortError') status(`Cannot play this track: ${error.name === 'NotAllowedError' ? 'press Play to allow playback.' : 'the file may be damaged or its codec unsupported by this browser.'}`); }
  syncPlayer();
}
function selectTrack(id, shouldPlay = true) {
  const track = tracks.get(id); if (!track) return;
  if (current !== id) { current = id; audio.src = track.url; audio.load(); }
  else if (audio.ended) audio.currentTime = 0;
  // Call play immediately during the user gesture; do not await metadata.
  if (shouldPlay) void play();
  render();
}
function stop() { audio.pause(); if (current) audio.currentTime = 0; syncPlayer(); }
function advance(ended = false) {
  const next = nextTrack(order, current, repeat, ended);
  if (next != null) { if (next === current) audio.currentTime = 0; selectTrack(next); }
  else { audio.pause(); syncPlayer(); if (ended) status('You’ve reached the end of your queue.'); }
}
function release(track) { URL.revokeObjectURL(track.url); if (track.artUrl) URL.revokeObjectURL(track.artUrl); }
function removeTrack(id) {
  const track = tracks.get(id); if (!track) return;
  const position = order.indexOf(id), active = current === id, wasPlaying = !audio.paused;
  if (active) { audio.pause(); audio.removeAttribute('src'); audio.load(); current = null; }
  tracks.delete(id); order = order.filter(item => item !== id); release(track);
  if (active && order.length) selectTrack(order[Math.min(position, order.length - 1)], wasPlaying);
  render();
}
function probeDuration(track) {
  return new Promise(resolve => {
    const probe = new Audio(); probe.preload = 'metadata';
    const finish = () => { clearTimeout(timeout); probe.onloadedmetadata = probe.onerror = null; probe.removeAttribute('src'); probe.load(); resolve(); };
    const timeout = setTimeout(() => { if (tracks.has(track.id)) { track.scanned = true; render(); } finish(); }, 8000);
    probe.onloadedmetadata = () => { if (tracks.has(track.id)) { track.duration = Number.isFinite(probe.duration) ? probe.duration : null; track.scanned = true; render(); } finish(); };
    probe.onerror = () => { if (tracks.has(track.id)) { track.scanned = true; render(); } finish(); };
    probe.src = track.url;
  });
}
async function importFiles(files) {
  let added = 0, duplicates = 0, unsupported = 0;
  const pending = [];
  for (const file of files) {
    if (!/\.(mp3|wav|aac|ogg|flac)$/i.test(file.name)) { unsupported++; continue; }
    const key = `${file.webkitRelativePath || file.name}:${file.size}:${file.lastModified}`;
    if ([...tracks.values()].some(t => t.key === key)) { duplicates++; continue; }
    const track = { id: ++counter, key, title: file.name.replace(/\.[^.]+$/, ''), artist: 'Unknown artist', album: 'Unknown album', url: URL.createObjectURL(file), duration: null, scanned: false };
    tracks.set(track.id, track); pending.push({ file, track }); order.push(track.id); added++;
  }
  render();
  status(added ? `Added ${added} track${added === 1 ? '' : 's'}. Reading tags…` : 'No new audio files to add.');
  // At most three files are scanned simultaneously to keep large imports responsive.
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(3, pending.length) }, async () => {
    while (cursor < pending.length) {
      const { file, track } = pending[cursor++];
      try {
        const metadata = await readMetadata(file);
        if (!tracks.has(track.id)) continue;
        for (const key of ['title', 'artist', 'album']) if (metadata[key]) track[key] = metadata[key];
        if (metadata.art) track.artUrl = URL.createObjectURL(metadata.art);
      } catch { /* Filename and default artwork remain available. */ }
      if (tracks.has(track.id)) { render(); await probeDuration(track); }
    }
  }));
  if (shuffle) order = shuffled([...tracks.keys()], current);
  render();
  status(`${added} track${added === 1 ? '' : 's'} added${duplicates ? ` · ${duplicates} duplicate(s) skipped` : ''}${unsupported ? ` · ${unsupported} unsupported file(s) skipped` : ''}. Files stay on this device.`);
}
const enqueueImport = files => { const list = [...files]; importing = importing.then(() => importFiles(list)).catch(() => status('Import could not finish. Please try adding your files again.')); };
$('import-button').onclick = $('empty-import').onclick = () => $('file-input').click();
$('folder-button').onclick = () => $('folder-input').click();
for (const id of ['file-input', 'folder-input']) $(id).onchange = event => { enqueueImport(event.target.files); event.target.value = ''; };
$('search').oninput = render;
$('play').onclick = () => { if (!current) selectTrack(order[0]); else if (audio.paused) void play(); else audio.pause(); };
$('stop').onclick = stop;
$('next').onclick = () => advance();
$('previous').onclick = () => { if (audio.currentTime > 3) { audio.currentTime = 0; return; } const position = order.indexOf(current); selectTrack(order[position > 0 ? position - 1 : repeat === 'all' ? order.length - 1 : 0]); };
$('seek').oninput = event => { if (Number.isFinite(audio.duration)) { audio.currentTime = Number(event.target.value); syncPlayer(); } };
$('volume').oninput = event => { audio.volume = Number(event.target.value); audio.muted = false; };
$('mute').onclick = () => { audio.muted = !audio.muted; };
audio.addEventListener('volumechange', () => { const muted = audio.muted || audio.volume === 0; $('mute').setAttribute('aria-pressed', String(muted)); $('mute').setAttribute('aria-label', muted ? 'Unmute' : 'Mute'); $('mute').textContent = muted ? '◖×' : '◖))'; $('volume').value = audio.volume; $('volume-value').textContent = `${Math.round((audio.muted ? 0 : audio.volume) * 100)}%`; });
$('shuffle').onclick = () => { shuffle = !shuffle; order = shuffle ? shuffled([...tracks.keys()], current) : [...tracks.keys()]; $('shuffle').setAttribute('aria-pressed', String(shuffle)); render(); status(`Shuffle ${shuffle ? 'on' : 'off'}.`); };
$('repeat').onclick = () => { repeat = { off: 'one', one: 'all', all: 'off' }[repeat]; $('repeat').setAttribute('aria-pressed', String(repeat !== 'off')); $('repeat').setAttribute('aria-label', `Repeat: ${repeat}`); $('repeat').title = `Repeat: ${repeat}`; $('repeat').textContent = repeat === 'one' ? '↻₁' : '↻'; status(`Repeat: ${repeat}.`); };
$('clear').onclick = () => { stop(); audio.removeAttribute('src'); audio.load(); current = null; for (const track of tracks.values()) release(track); tracks.clear(); order = []; render(); status('Library cleared. Add tracks whenever you’re ready.'); };
for (const event of ['play', 'pause', 'timeupdate', 'durationchange', 'loadedmetadata', 'emptied', 'ended']) audio.addEventListener(event, syncPlayer);
audio.addEventListener('loadedmetadata', () => { const track = tracks.get(current); if (track) { track.duration = Number.isFinite(audio.duration) ? audio.duration : null; render(); } });
audio.addEventListener('ended', () => advance(true));
audio.addEventListener('error', () => { if (current) status('This file could not be played. Its codec may not be supported, or the file may be damaged. Choose another track to continue.'); syncPlayer(); });
document.addEventListener('keydown', event => {
  if (event.target.closest('input,button,textarea,select,a') || event.ctrlKey || event.metaKey || event.altKey) return;
  if (event.code === 'Space') { event.preventDefault(); if (tracks.size) $('play').click(); }
  if (event.key === '/') { event.preventDefault(); $('search').focus(); }
});
const hasFiles = event => [...(event.dataTransfer?.types || [])].includes('Files');
document.addEventListener('dragenter', event => { if (hasFiles(event)) { event.preventDefault(); dragDepth++; $('drop-overlay').hidden = false; } });
document.addEventListener('dragover', event => { if (hasFiles(event)) { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; } });
document.addEventListener('dragleave', event => { if (hasFiles(event) && --dragDepth <= 0) { dragDepth = 0; $('drop-overlay').hidden = true; } });
async function walkEntry(entry) {
  if (entry.isFile) return new Promise(resolve => entry.file(file => resolve([file]), () => resolve([])));
  if (!entry.isDirectory) return [];
  const reader = entry.createReader(); let all = [];
  while (true) { const entries = await new Promise(resolve => reader.readEntries(resolve, () => resolve([]))); if (!entries.length) break; for (const child of entries) all.push(...await walkEntry(child)); }
  return all;
}
document.addEventListener('drop', async event => {
  event.preventDefault(); dragDepth = 0; $('drop-overlay').hidden = true;
  const entries = [...(event.dataTransfer.items || [])].map(item => item.webkitGetAsEntry?.()).filter(Boolean);
  const files = [...event.dataTransfer.files];
  if (entries.some(entry => entry.isDirectory)) { status('Reading dropped folders…'); const groups = []; for (const entry of entries) groups.push(...await walkEntry(entry)); enqueueImport(groups); }
  else enqueueImport(files);
});
window.addEventListener('pagehide', event => { if (!event.persisted) for (const track of tracks.values()) release(track); });
render();
