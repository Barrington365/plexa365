import test from 'node:test';
import assert from 'node:assert/strict';
import {brandPlayerLinks, videoMrss} from './video-mrss.mjs';

const state = {
  jobs: [{id: 'job', status: 'complete', output: {asset: 'videos/a.mp4', duration: 12.4}}],
  assets: {'videos/a.mp4': {asset: 'videos/a.mp4', sha256: 'media'}, 'poster.png': {asset: 'poster.png', sha256: 'poster'}},
  playerDestinations: [{id: 'teamtalk', clientId: 'client', brand: 'TEAMtalk', enabled: true, origins: ['https://teamtalk.com']}],
  websiteVideos: [{id: 'video-1', jobId: 'job', destinationId: 'teamtalk', title: 'TEAMtalk & live', description: 'Saved bulletin', posterAsset: 'poster.png', asset: 'videos/a.mp4', mediaHash: 'media', posterHash: 'poster', duration: 12.4, status: 'published', publishedAt: '2026-11-05T21:53:27.002Z'}],
};
const clients = {client: {active: true, allowedBrands: []}};

test('the test feed lists a published player video and leaves unpublished videos out', () => {
  const xml = videoMrss(state, clients, 'https://planetsport.studio');
  assert.match(xml, /xmlns:media="http:\/\/search\.yahoo\.com\/mrss\/"/);
  assert.match(xml, /TEAMtalk &amp; live/);
  assert.match(xml, /media:content url="https:\/\/planetsport\.studio\/api\/player\/media\/video-1\/video\?destination=teamtalk"/);
  assert.match(xml, /duration="12"/);
  const hidden = videoMrss({...state, websiteVideos: [{...state.websiteVideos[0], status: 'unpublished'}]}, clients, 'https://planetsport.studio');
  assert.equal(hidden.includes('video-1'), false);
});

test('each brand gets one player link, starting at its playlist', () => {
  const links = brandPlayerLinks({
    playlists: [{id: 'football365', destinationId: 'football365', brand: 'Football365', videoIds: ['rice', 'carrick']}],
    videos: [
      {id: 'carrick', destinationId: 'football365'},
      {id: 'rice', destinationId: 'football365'},
      {id: 'bulletin', destinationId: 'teamtalk'},
    ],
    finished: [{player: [{destinationId: 'teamtalk', brand: 'TEAMtalk', status: 'published'}]}],
  });
  assert.deepEqual(links, [
    {href: '/embed/video/rice?destination=football365&playlist=football365', label: 'Football365 player'},
    {href: '/embed/video/bulletin?destination=teamtalk', label: 'TEAMtalk player'},
  ]);
});

test('an empty brand playlist still appears in the player menu', () => {
  const links = brandPlayerLinks({
    playlists: [
      {id: 'football365', destinationId: 'football365', brand: 'Football365', videoIds: ['rice']},
      {id: 'hollywoodbets', destinationId: 'hollywoodbets', brand: 'Hollywood Bets', videoIds: []},
    ],
    videos: [{id: 'rice', destinationId: 'football365'}],
  });
  assert.deepEqual(links, [
    {href: '/embed/video/rice?destination=football365&playlist=football365', label: 'Football365 player'},
    {href: '/playlist#playlist-hollywoodbets', label: 'Hollywood Bets player'},
  ]);
});
