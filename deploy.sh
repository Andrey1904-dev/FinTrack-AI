#!/usr/bin/env bash
# Публикация FinTrack AI из этой папки.
# Использование:  ./deploy.sh https://github.com/ПОЛЬЗОВАТЕЛЬ/РЕПОЗИТОРИЙ.git
set -e
REPO="$1"
if [ -z "$REPO" ]; then echo "Укажите адрес репозитория: ./deploy.sh git@github.com:user/repo.git"; exit 1; fi

# Сборка нужна, только если исходники src/ есть в репозитории:
# иначе публикуется готовый index.html (он уже собран и проверен).
if [ -d src ]; then
  node build.mjs                       # собрать index.html из src/
else
  echo "src/ нет — используем готовый index.html"
fi
# Тесты запускаются, если они есть и установлены зависимости (npm i).
[ -f tests/unit.mjs ] && node tests/unit.mjs
if [ -f tests/smoke.mjs ] && [ -d node_modules/jsdom ]; then node tests/smoke.mjs; fi
[ -f tests/functions.mjs ] && node tests/functions.mjs
true                                     # не падаем, если тестов нет (set -e)

rm -rf .git-deploy && mkdir .git-deploy
git --git-dir=.git-deploy --work-tree=. init -q
git --git-dir=.git-deploy --work-tree=. add -A
git --git-dir=.git-deploy --work-tree=. -c user.name="FinTrack AI" -c user.email="deploy@local" commit -qm "FinTrack AI 2.0"
git --git-dir=.git-deploy --work-tree=. remote add origin "$REPO"
git --git-dir=.git-deploy --work-tree=. branch -M main
git --git-dir=.git-deploy --work-tree=. push -f origin main
echo "Готово. Если это GitHub Pages: Settings → Pages → Source = GitHub Actions."
