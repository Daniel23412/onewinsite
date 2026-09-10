# VOLT PIX

Отдельная версия прокладки с 13 играми, крупным Falling Pixage, промокодом 205bonus и 15 вариантами языка.

## Ссылка

В Vercel → проект `voltpix` → Environment Variables измените `AFFILIATE_URL` для Production, затем Redeploy. Эта переменная имеет приоритет над `affiliateUrl` в `public/site-config.json`. Если переменной нет, используется значение из файла.

## Настройки

Промокод: `promoCode` в `public/site-config.json`. Лента примеров: `showDemoFeed`. Лента явно обозначена как демонстрация. Язык определяется по языкам браузера телефона; выбор сохраняется на этом сайте.

## Публикация

Репозиторий: `Daniel23412/onewinsite`. Production-ветка: `landing-voltpix`. Публикация на Vercel после каждого коммита в эту ветку.

## Постбэки

На сервере требуются `BOT_TOKEN`, `POSTBACK_LOG_CHAT_ID`, `POSTBACK_SECRET`. Секреты не входят в исходники. Уведомления содержат название площадки VOLT PIX. Форматы событий — в `POSTBACKS.md`. Настройка callback URL в кабинете партнёрской программы обязательна для реальных регистраций и депозитов.

## Проверка

`npm run build` и `npm test`. Локальный запуск: `npm start`.
