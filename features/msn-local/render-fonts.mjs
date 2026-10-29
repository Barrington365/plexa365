import path from 'node:path';
// Bundled fonts make text and caption measurements independent of the host OS.
export const renderFontsDirectory=path.join(process.cwd(),'assets/fonts/news-shorts');
export function renderFont(bold=false){return {font:`Roboto Condensed${bold?' Bold':''}`,fontfile:path.join(renderFontsDirectory,bold?'RobotoCondensed-Bold.ttf':'RobotoCondensed-Regular.ttf')};}
