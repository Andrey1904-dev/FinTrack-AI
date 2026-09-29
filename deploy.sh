#!/usr/bin/env bash
# Публикация FinTrack AI из этой папки.
# Использование:  ./deploy.sh https://github.com/ПОЛЬЗОВАТЕЛЬ/РЕПОЗИТОРИЙ.git
set -e
REPO="$1"
if [ -z "$REPO" ]; then echo "Укажите адрес репозитория: ./deploy.sh git@github.com:user/repo.git"; exit 1; fi

node build.mjs                       # собрать index.html из src/
node tests/unit.mjs                  # быстрые проверки логики
node tests/smoke.mjs                 # прогон интерфейса (нужен jsdom: npm i jsdom)
node tests/functions.mjs             # серверные функции (Deno не нужен)

rm -rf .git-deploy && mkdir .git-deploy
git --git-dir=.git-deploy --work-tree=. init -q
git --git-dir=.git-deploy --work-tree=. add -A
git --git-dir=.git-deploy --work-tree=. -c user.name="FinTrack AI" -c user.email="deploy@local" commit -qm "FinTrack AI 2.0"
git --git-dir=.git-deploy --work-tree=. remote add origin "$REPO"
git --git-dir=.git-deploy --work-tree=. branch -M main
git --git-dir=.git-deploy --work-tree=. push -f origin main
echo "Готово. Если это GitHub Pages: Settings → Pages → Source = GitHub Actions."
