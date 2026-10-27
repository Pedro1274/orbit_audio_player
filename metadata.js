// Bounded, best-effort readers for common local audio tags. Never decode audio here.
const latin = new TextDecoder('windows-1252');
const utf8 = new TextDecoder();
const ascii = (b, start, size) => String.fromCharCode(...b.subarray(start, start + size));
const u32 = (b, p, le = false) => new DataView(b.buffer, b.byteOffset, b.byteLength).getUint32(p, le);
const sync = (b, p) => (b[p] & 127) * 2097152 + (b[p + 1] & 127) * 16384 + (b[p + 2] & 127) * 128 + (b[p + 3] & 127);
const clean = s => s.replace(/\0/g, '').trim();
function textTag(b) {
  const encoding = b[0];
  const decoder = encoding === 0 ? latin : encoding === 1 ? new TextDecoder('utf-16') : encoding === 2 ? new TextDecoder('utf-16be') : utf8;
  return clean(decoder.decode(b.subarray(1)));
}
function picture(b, out) {
  let p = 4;
  const mimeLength = u32(b, p); p += 4;
  const mime = ascii(b, p, mimeLength); p += mimeLength;
  const descriptionLength = u32(b, p); p += 4 + descriptionLength + 16;
  const length = u32(b, p); p += 4;
  if (p + length <= b.length && /^image\/(jpeg|png|webp|gif)$/i.test(mime)) out.art = new Blob([b.subarray(p, p + length)], { type: mime });
}
function comments(b, out) {
  let p = 0;
  const vendorLength = u32(b, p, true); p += 4 + vendorLength;
  const count = u32(b, p, true); p += 4;
  for (let i = 0; i < count && p + 4 <= b.length; i++) {
    const length = u32(b, p, true); p += 4;
    if (p + length > b.length) break;
    const value = utf8.decode(b.subarray(p, p + length)); p += length;
    const at = value.indexOf('=');
    const key = value.slice(0, at).toUpperCase();
    if (['TITLE', 'ARTIST', 'ALBUM'].includes(key)) out[key.toLowerCase()] = clean(value.slice(at + 1));
    if (key === 'METADATA_BLOCK_PICTURE') {
      try { picture(Uint8Array.from(atob(value.slice(at + 1)), c => c.charCodeAt(0)), out); } catch { /* malformed optional artwork */ }
    }
  }
}
function id3(b, out) {
  const version = b[3];
  if (![2, 3, 4].includes(version)) return;
  const end = Math.min(b.length, 10 + sync(b, 6));
  let p = 10;
  if (b[5] & 64) p += version === 4 ? sync(b, p) : 4 + u32(b, p);
  // Global unsynchronisation and compressed frames are intentionally skipped.
  if (b[5] & 128) return;
  while (p + (version === 2 ? 6 : 10) <= end) {
    const id = ascii(b, p, version === 2 ? 3 : 4);
    if (!/^[A-Z0-9]+$/.test(id)) break;
    const size = version === 2 ? b[p + 3] * 65536 + b[p + 4] * 256 + b[p + 5] : version === 4 ? sync(b, p + 4) : u32(b, p + 4);
    const flags = version === 2 ? 0 : b[p + 9];
    p += version === 2 ? 6 : 10;
    if (!size || p + size > end) break;
    const frame = b.subarray(p, p + size); p += size;
    if ((version === 3 && flags & 224) || (version === 4 && flags & 79)) continue;
    const names = { TIT2: 'title', TT2: 'title', TPE1: 'artist', TP1: 'artist', TALB: 'album', TAL: 'album' };
    if (names[id]) out[names[id]] = textTag(frame);
    if (id === 'APIC' || id === 'PIC') {
      let q = 1, mime;
      if (id === 'PIC') { mime = ascii(frame, q, 3).toUpperCase() === 'PNG' ? 'image/png' : 'image/jpeg'; q += 3; }
      else { const start = q; while (q < frame.length && frame[q]) q++; mime = ascii(frame, start, q - start); q++; }
      q++; // picture type
      const wide = frame[0] === 1 || frame[0] === 2;
      while (q < frame.length && !(frame[q] === 0 && (!wide || frame[q + 1] === 0))) q += wide ? 2 : 1;
      q += wide ? 2 : 1;
      if (q < frame.length && /^image\/(jpeg|png|webp|gif)$/i.test(mime)) out.art = new Blob([frame.subarray(q)], { type: mime });
    }
  }
}
export function parseMetadata(b) {
  const out = {};
  try {
    if (ascii(b, 0, 3) === 'ID3') id3(b, out);
    if (ascii(b, 0, 4) === 'fLaC') {
      let p = 4;
      while (p + 4 <= b.length) {
        const type = b[p] & 127, last = b[p] & 128;
        const size = b[p + 1] * 65536 + b[p + 2] * 256 + b[p + 3]; p += 4;
        if (p + size > b.length) break;
        if (type === 4) comments(b.subarray(p, p + size), out);
        if (type === 6) picture(b.subarray(p, p + size), out);
        p += size; if (last) break;
      }
    }
    if (ascii(b, 0, 4) === 'OggS') {
      // Reassemble packet lacing, since comments/artwork can span pages.
      let p = 0, chunks = [], length = 0, packets = 0;
      while (p + 27 <= b.length && packets < 3) {
        if (ascii(b, p, 4) !== 'OggS') break;
        const segments = b[p + 26], table = p + 27;
        let data = table + segments;
        if (data > b.length) break;
        for (let i = 0; i < segments; i++) {
          const size = b[table + i];
          if (data + size > b.length) return out;
          chunks.push(b.subarray(data, data + size)); length += size; data += size;
          if (size < 255) {
            const packet = new Uint8Array(length); let offset = 0;
            for (const chunk of chunks) { packet.set(chunk, offset); offset += chunk.length; }
            if (packet[0] === 3 && ascii(packet, 1, 6) === 'vorbis') comments(packet.subarray(7), out);
            if (ascii(packet, 0, 8) === 'OpusTags') comments(packet.subarray(8), out);
            chunks = []; length = 0; packets++;
          }
        }
        p = data;
      }
    }
    if (ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 4) === 'WAVE') {
      let p = 12;
      while (p + 8 <= b.length) {
        const id = ascii(b, p, 4), size = u32(b, p + 4, true), start = p + 8;
        if (start + size > b.length) break;
        if (id.toLowerCase() === 'id3 ') id3(b.subarray(start, start + size), out);
        if (id === 'LIST' && ascii(b, start, 4) === 'INFO') {
          let q = start + 4;
          while (q + 8 <= start + size) {
            const key = ascii(b, q, 4), n = u32(b, q + 4, true); q += 8;
            if (q + n > start + size) break;
            const field = { INAM: 'title', IART: 'artist', IPRD: 'album' }[key];
            if (field) out[field] = clean(latin.decode(b.subarray(q, q + n)));
            q += n + n % 2;
          }
        }
        p = start + size + size % 2;
      }
    }
  } catch { /* Return fields already read when tags are incomplete or malformed. */ }
  return out;
}
export async function readMetadata(file) {
  // A fixed cap prevents a large library from loading entire audio files into memory.
  const result = parseMetadata(new Uint8Array(await file.slice(0, 16 * 1024 * 1024).arrayBuffer()));
  if (file.size >= 128) {
    const tail = new Uint8Array(await file.slice(-128).arrayBuffer());
    if (ascii(tail, 0, 3) === 'TAG') {
      result.title ||= clean(latin.decode(tail.subarray(3, 33)));
      result.artist ||= clean(latin.decode(tail.subarray(33, 63)));
      result.album ||= clean(latin.decode(tail.subarray(63, 93)));
    }
  }
  return result;
}
