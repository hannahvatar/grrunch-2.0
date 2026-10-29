#!/bin/sh
# Web build for Cloudflare Pages (app.grrunch.com). Cloudflare's build
# command: `npm run build:web`, root directory `app`, output `dist`.
set -e
npx expo export -p web
# Cloudflare Pages never uploads folders named node_modules, and Expo puts
# the bundled fonts and images under dist/assets/node_modules/..., so the
# site loaded with every font answered by index.html and stayed blank.
# Move them, and rewrite the bundle's original URLs to the new folder.
if [ -d dist/assets/node_modules ]; then
  mv dist/assets/node_modules dist/assets/nm
  echo "/assets/node_modules/* /assets/nm/:splat 200" > dist/_redirects
fi
