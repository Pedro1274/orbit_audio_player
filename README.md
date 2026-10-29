# Orbit audio player

A responsive, dependency-free local audio player implementing the MVP in
[audio_player_mvp_requirements_scope_document.md](audio_player_mvp_requirements_scope_document.md).
Plain HTML, CSS, JavaScript modules, and the native HTML audio element. No build,
account, backend, CDN, or network access is required by the application.

## GitHub Pages deployment

The site is deployed by `.github/workflows/deploy.yml` on every push to `master`
or manual workflow run. The workflow runs the Node tests and publishes only the
five application files. GitHub Pages must use **GitHub Actions** as its source.

Site: https://Pedro1274.github.io/new_spotify_version_02/

## Run locally

From this directory, run:

```sh
python3 -m http.server 8000 --bind 127.0.0.1
```

Open **http://localhost:8000**. Alternatively, run `npm start` if Node/npm is installed.
Serve the files over HTTP; opening `index.html` directly does not reliably load ES modules.

## Use

- Add individual files, select a folder (including subfolders), or drop files/folders anywhere.
- MP3, WAV, AAC, OGG, and FLAC extensions are accepted; other extensions and duplicate files are skipped.
- Click a track in the library or queue to play it. Search by title, artist, or album.
- Play/pause, stop, previous/next, scrub, adjust volume, or mute from the bottom bar.
- Choose a playback speed from **0.5× to 2×** next to the volume control. Speed stays selected across track changes for the current session.
- Shuffle rearranges the visible queue while keeping the current track first. Turning it off restores import order.
- Repeat cycles **off → one → all**. Repeat one applies to natural track endings; Next still advances.
- Previous restarts after three seconds of playback; otherwise it selects the preceding track.
- Remove tracks individually or clear the library. Removing the active track selects its next neighbor and preserves whether playback was running.
- Press Space to play/pause and `/` to search when focus is outside controls.

Files and artwork use local object URLs, which are released on removal/clear/page exit.
The library is held in memory for this session and must be imported again after a reload.
Metadata and filenames are rendered as text, never injected as HTML.

## Metadata and playback limits

Local best-effort parsing supports ID3v2.2/2.3/2.4 text and artwork (MP3/AAC or WAV
ID3 chunks), ID3v1 fallback, WAV RIFF INFO fields, FLAC Vorbis comments/pictures,
and Ogg Vorbis/Opus comments with embedded picture blocks. Missing tags fall back
to the filename, “Unknown artist/album,” and generated CSS artwork. Native audio
metadata supplies duration. Imports scan at most three files concurrently and read
a maximum of 16 MiB of leading tags plus the ID3v1 trailer per file.

Compressed/unsynchronized ID3 frames, exotic tag encodings, tags beyond the read
limit, and AAC metadata outside ID3 are not parsed. A browser's installed codecs
ultimately determine which files play; accepting a file extension does not guarantee
its codec can decode. Failed files show an actionable status message and remain
removable. Folder selection/drop support also depends on browser capabilities.
See [MDN audio documentation](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/audio)
and [directory input documentation](https://developer.mozilla.org/en-US/docs/Web/API/HTMLInputElement/webkitdirectory).

Playback starts directly in the selection gesture without waiting for tags. The PRD's
under-200 ms latency target is **not yet benchmarked** and depends on device, file,
and browser. Cross-browser/audio-device validation remains required.

## Verification

Node 22+ (no package installation):

```sh
npm test
```

Tests cover queue boundaries, repeat modes, shuffle integrity, time formatting,
ID3 versions, FLAC comments/artwork, WAV INFO, Ogg comments, and malformed tags.

With the server running, open **http://localhost:8000/tests/browser.html** and click
**Run smoke test**. It generates two quiet WAV files locally and checks import,
deduplication, search, playback, seek, volume, mute, playback speed and its retention across tracks, automatic queue advancement,
shuffle, removal, and clear. This may briefly play a tone.

Also manually check real tagged files in all five formats, embedded artwork,
folder import/drop, repeated queue endings, narrow mobile widths, keyboard focus,
and unsupported/corrupt files on target browsers.

In the implementation environment, the eight Node tests and JavaScript syntax
checks passed. Browser smoke tests could not be executed: local socket binding was
denied and headless Firefox terminated on launch. No playback latency measurement
or visual/browser compatibility verification is claimed.
