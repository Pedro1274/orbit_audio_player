import test from 'node:test';
import assert from 'node:assert/strict';
import { shuffled, nextTrack, formatTime } from '../queue.js';
import { parseMetadata, readMetadata } from '../metadata.js';
const bytes = s => new TextEncoder().encode(s);
const join = (...arrays) => Uint8Array.from(arrays.flatMap(a => [...a]));
const be = n => Uint8Array.of(n >>> 24, n >>> 16 & 255, n >>> 8 & 255, n & 255);
const le = n => Uint8Array.from(be(n)).reverse();
const ss = n => Uint8Array.of(n >>> 21 & 127, n >>> 14 & 127, n >>> 7 & 127, n & 127);
function id3(version, title) {
  const value = join([3], bytes(title));
  const frame = join(bytes('TIT2'), version === 4 ? ss(value.length) : be(value.length), [0, 0], value);
  return join(bytes('ID3'), [version, 0, 0], ss(frame.length), frame);
}
test('queue respects natural end, manual next and all repeat modes', () => {
  assert.equal(nextTrack([1, 2, 3], 1, 'off', true), 2);
  assert.equal(nextTrack([1, 2, 3], 3, 'off', true), null);
  assert.equal(nextTrack([1, 2, 3], 3, 'all', true), 1);
  assert.equal(nextTrack([1, 2, 3], 2, 'one', true), 2);
  assert.equal(nextTrack([1, 2, 3], 2, 'one', false), 3);
  assert.equal(nextTrack([], null, 'all'), null);
  assert.equal(nextTrack([1], null, 'off'), 1);
});
test('shuffle preserves active track and includes each track exactly once', () => {
  const result = shuffled([1, 2, 3, 4], 3, () => 0);
  assert.equal(result[0], 3);
  assert.deepEqual([...result].sort(), [1, 2, 3, 4]);
  assert.deepEqual(shuffled([], null), []);
});
test('time formatting handles unknown and long tracks', () => {
  assert.equal(formatTime(NaN), '—:—'); assert.equal(formatTime(0), '0:00'); assert.equal(formatTime(3661), '61:01');
});
test('reads ID3v2.3 and v2.4 UTF-8 text', () => {
  for (const version of [3, 4]) assert.equal(parseMetadata(id3(version, 'Música')).title, 'Música');
});
test('reads FLAC Vorbis comments and embedded image', () => {
  const comment = bytes('TITLE=Night flight');
  const tags = join(le(0), le(1), le(comment.length), comment);
  const pic = join(be(3), be(9), bytes('image/png'), be(0), be(1), be(1), be(8), be(0), be(3), [1, 2, 3]);
  const block = (type, data) => join([type, data.length >>> 16 & 255, data.length >>> 8 & 255, data.length & 255], data);
  const result = parseMetadata(join(bytes('fLaC'), block(4, tags), block(134, pic)));
  assert.equal(result.title, 'Night flight'); assert.equal(result.art.type, 'image/png'); assert.equal(result.art.size, 3);
});
test('reads WAV INFO tags', () => {
  const value = bytes('Studio\0\0');
  const info = join(bytes('INFOINAM'), le(value.length), value);
  const result = parseMetadata(join(bytes('RIFF'), le(info.length + 12), bytes('WAVELIST'), le(info.length), info));
  assert.equal(result.title, 'Studio');
});
test('reads Ogg Vorbis comment packets', () => {
  const comment = bytes('ARTIST=Orbit');
  const packet = join([3], bytes('vorbis'), le(0), le(1), le(comment.length), comment);
  const header = new Uint8Array(27); header.set(bytes('OggS')); header[26] = 1;
  assert.equal(parseMetadata(join(header, [packet.length], packet)).artist, 'Orbit');
});
test('falls back to ID3v1 and tolerates malformed input', async () => {
  const tag = new Uint8Array(128); tag.set(bytes('TAG')); tag.set(bytes('Legacy'), 3);
  assert.equal((await readMetadata(new Blob([tag]))).title, 'Legacy');
  for (let n = 0; n < 70; n++) assert.doesNotThrow(() => parseMetadata(id3(4, 'Title').slice(0, n)));
  assert.deepEqual(parseMetadata(new Uint8Array()), {});
});
