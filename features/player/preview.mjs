/** Only preview the next published video in the final ten seconds of content. */
export function showNextPreview({hasNext,started,duration,currentTime,inAd}) {
 return !!hasNext && !!started && !inAd && Number.isFinite(duration) && duration > 0 && Number.isFinite(currentTime) && currentTime >= 0 && duration-currentTime <= 10 && duration-currentTime > 0;
}

/** Wrap only within the server-authorised playlist. Empty queues cannot advance. */
export function nextPlaylistIndex(length,index) {
 return length > 0 ? (index + 1) % length : -1;
}
