import {publicVideo, visibleVideo} from '../player/service.mjs';

function xml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;'}[character]));
}

/** One public player link per brand. Uses the playlist's first video when that brand has one. */
export function brandPlayerLinks(view = {}) {
  const playlists = view.playlists || [];
  const videos = view.videos || [];
  const seen = new Set();
  const links = [];
  const brandOf = destinationId => playlists.find(playlist => playlist.destinationId === destinationId && playlist.brand)?.brand
    || (view.finished || []).flatMap(video => video.player || []).find(player => player.destinationId === destinationId && player.brand)?.brand
    || destinationId;
  const add = (destinationId, videoId, playlistId) => {
    if (!destinationId || !videoId || seen.has(destinationId)) return;
    seen.add(destinationId);
    const query = '?destination=' + encodeURIComponent(destinationId) + (playlistId ? '&playlist=' + encodeURIComponent(playlistId) : '');
    links.push({href: '/embed/video/' + encodeURIComponent(videoId) + query, label: brandOf(destinationId) + ' player'});
  };
  for (const playlist of playlists) {
    const video = videos.find(item => item.id === playlist.videoIds?.[0]) || videos.find(item => item.destinationId === playlist.destinationId);
    if (video) add(playlist.destinationId, video.id, playlist.id);
  }
  for (const video of videos) add(video.destinationId, video.id, '');
  return links.sort((a, b) => a.label.localeCompare(b.label));
}

/** Signed-in test feed of videos already on the public player. It does not publish anything. */
export function videoMrss(state, clients, base) {
  const items = (state.websiteVideos || []).filter(video => visibleVideo(state, clients, video)).map(video => publicVideo(state, video, base));
  const body = items.map(video => `  <item>
    <title>${xml(video.title)}</title>
    <link>${xml(video.embedUrl)}</link>
    <guid isPermaLink="false">${xml(video.id)}</guid>
    <pubDate>${xml(new Date(video.publishedAt).toUTCString())}</pubDate>
    <description>${xml(video.description)}</description>
    <media:content url="${xml(video.contentUrl)}" type="video/mp4" medium="video" duration="${Math.round(video.duration || 0)}"/>
    <media:thumbnail url="${xml(video.thumbnail)}"/>
    <media:category>${xml(video.brand)}</media:category>
  </item>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/">
<channel>
  <title>Plexa test video feed</title>
  <link>${xml(base)}</link>
  <description>Videos already published to a brand player. This feed does not publish or replace any video.</description>
${body}
</channel>
</rss>
`;
}
