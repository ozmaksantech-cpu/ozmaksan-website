#!/usr/bin/env bash
# Exit 0 = SKIP build (sadece içerik/medya değişti)
# Exit 1 = BUILD yap (kod, şablon, CSS, admin shell değişti)
set -e
if [ -z "$CACHED_COMMIT_REF" ] || [ -z "$COMMIT_REF" ]; then
  exit 1
fi
# Commit mesajında [netlify build] varsa her durumda build al.
# [skip netlify] ile atlanan push'lar Netlify'da "son build" sayılabiliyor; o durumda
# sonraki içerik commit'i kod değişikliklerini göremeyip build'i yanlışlıkla atlar.
if git log -1 --pretty=%B "$COMMIT_REF" 2>/dev/null | grep -qi "\[netlify build\]"; then
  echo "Building: forced by [netlify build] in commit message"
  exit 1
fi
# İçerik dışı bir şey değiştiyse build gerekli → quiet DEĞİL → exit 1
if git diff --quiet "$CACHED_COMMIT_REF" "$COMMIT_REF" -- . \
  ':!content/**' \
  ':!assets/products/**' \
  ':!assets/news/**' \
  ':!assets/catalogs/**' \
  ':!assets/uploads/**' \
  ':!_build/translate.mjs' \
  ':!_build/should-build.sh' \
  ':!.github/**' \
  ':!*.md'
then
  echo "Skipping build: only CMS content/media changed"
  exit 0
fi
echo "Building: site code or config changed"
exit 1
