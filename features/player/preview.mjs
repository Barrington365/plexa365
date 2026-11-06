/** Only preview the next published video in the final ten seconds of content. */
export function showNextPreview({hasNext,started,duration,currentTime,inAd}) {
 return !!hasNext && !!started && !inAd && Number.isFinite(duration) && duration > 0 && Number.isFinite(currentTime) && currentTime >= 0 && duration-currentTime <= 10 && duration-currentTime > 0;
}
