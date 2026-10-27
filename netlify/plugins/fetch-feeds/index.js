// The Netlify UI installs philhawksworth/netlify-plugin-fetch-feeds, whose
// node-expat binary does not load on the current build image. Studio does not
// read that plugin's output, so this local package replaces it and does nothing.
module.exports = {
  async onPreBuild() {
    console.log("netlify-plugin-fetch-feeds: no feeds to fetch");
  },
};
