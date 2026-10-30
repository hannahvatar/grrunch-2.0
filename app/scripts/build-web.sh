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
# Icons, versioned (Anabelle, 2026-10-30): phones kept showing Expo's old
# logo from their own icon cache, which only refreshes when the icon's URL
# changes. Point the favicon at a versioned URL and declare the iPhone icon
# (app/public/apple-touch-icon.png) explicitly. Bump ICON_VERSION whenever
# the icon art changes.
ICON_VERSION=2
sed -i.bak "s#<link rel=\"icon\" href=\"/favicon.ico\" />#<link rel=\"icon\" href=\"/favicon.ico?v=$ICON_VERSION\" /><link rel=\"apple-touch-icon\" href=\"/apple-touch-icon.png?v=$ICON_VERSION\" />#" dist/index.html
rm -f dist/index.html.bak
grep -q "favicon.ico?v=$ICON_VERSION" dist/index.html || { echo "build-web: favicon link not found in dist/index.html" >&2; exit 1; }
