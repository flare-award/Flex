# Flex — P2P Edition (GitHub Pages + Firebase + WebRTC)

Бесплатный аналог Discord: серверы, текстовые каналы, голосовые P2P каналы. Статическая версия, которая целиком работает в браузере и раздаётся с GitHub Pages, без Node/Express бэкенда, без Docker, без Socket.IO, без серверного голосового relay.

**Stack:**
- **Client:** React + Vite + Tailwind, hosted on GitHub Pages (`client/dist`)
- **Auth:** Firebase Authentication (Email/Password)
- **Database:** Firebase Realtime Database (profiles, guilds, channels, messages, invites, voice presence & signaling)
- **Voice:** WebRTC P2P (audio only v1) — `RTCPeerConnection`, `getUserMedia({audio:true})`, signaling через RTDB, `HTMLAudioElement` для воспроизведения
- **ICE:** STUN по умолчанию `stun.l.google.com:19302`, `stun1.l.google.com:19302`, конфигурируется через env, TURN опционально для CGNAT

> ⚠️ Честно: P2P без TURN не гарантирует голос во всех сетях. В мобильных, корпоративных и CGNAT/symmetric NAT сетях соединение может не установиться. В UI показывается понятное предупреждение и состояние ICE failed/disconnected.

Старый серверный код (`server/`) оставлен в репозитории для локальной/legacy версии, но GitHub Pages от него **не зависит**.

---

## Демо-архитектура

```
Browser (User A)  <---- WebRTC P2P (Opus audio) ----> Browser (User B)
       |                                                    |
       |--- Firebase Realtime Database (signaling) ---------|
       |--- Firebase Auth (login) --------------------------|
       |--- Firebase RTDB (guilds, channels, messages) -----|

GitHub Pages раздаёт только client/dist, никакой серверной логики.
```

### RTDB структура

```
profiles/{uid}
usernames/{username} -> uid
guilds/{guildId}
guildMembers/{guildId}/{uid}
userGuilds/{uid}/{guildId}
guildChannels/{guildId}/{channelId}
guildCategories/{guildId}/{categoryId}
messages/{channelId}/{messageId}
invites/{code}
guildInvites/{guildId}/{code}
typing/{channelId}/{uid}
voice/{guildId}/{channelId}/
  state/{uid} = {userId, displayName, muted, deaf, speaking, joinedAt}
  offers/{toUid}/{fromUid} = {sdp, type, ts}
  answers/{toUid}/{fromUid} = {sdp, type, ts}
  candidates/{toUid}/{fromUid}/{pushId} = {candidate, ts}
```

---

## 1) Пошаговая инструкция: как развернуть P2P версию на GitHub Pages

### 1.1 Создать Firebase project

1. Откройте https://console.firebase.google.com/ → Add project → название `flex-p2p` (или любое)
2. Отключите Google Analytics если не нужно → Create project
3. В left sidebar: **Build → Authentication**
   - Get started → Sign-in method → **Email/Password → Enable → Save**
4. **Build → Realtime Database → Create database**
   - Выберите регион (us-central1 или europe-west близкий к вам)
   - Start in **locked mode** (мы потом вставим свои правила)
   - Скопируйте URL базы вида `https://your-project-abc-default-rtdb.firebaseio.com`
5. **Build → Realtime Database → Rules → вставьте содержимое `firebase-rules.json` из этого репозитория**
   - Нажмите Publish. **Не оставляйте `.read: true / .write: true`!**
   - Правила проверяют:
     - auth != null для всего
     - пользователь может редактировать только свой профиль
     - доступ к guild/channel/message/voice только если membership (`guildMembers/{guildId}/{uid}`)
     - signaling offers/answers/candidates: запись только от себя, чтение только адресованное себе (toUid == auth.uid)
   - Минимально безопасные, но не оставляют открытую базу. Для production можно ужесточить валидацию текста/размера.
6. **Project Settings (шестерёнка) → General → Your apps → Web app (</>)**
   - Register app: `FlexP2P` → не включайте hosting
   - Скопируйте config:
     ```js
     apiKey: "...",
     authDomain: "...",
     databaseURL: "...",
     projectId: "...",
     storageBucket: "...",
     messagingSenderId: "...",
     appId: "..."
     ```

### 1.2 Создать GitHub репозиторий и Secrets

1. Форкните или создайте новый публичный репозиторий `Flex` (имя важно — оно определяет base path `/Flex/`)
2. Запушьте эту ветку в `main`
3. В GitHub: **Settings → Secrets and variables → Actions → New repository secret** — создайте 7 секретов:
   - `VITE_FIREBASE_API_KEY`
   - `VITE_FIREBASE_AUTH_DOMAIN`
   - `VITE_FIREBASE_DATABASE_URL`
   - `VITE_FIREBASE_PROJECT_ID`
   - `VITE_FIREBASE_STORAGE_BUCKET`
   - `VITE_FIREBASE_MESSAGING_SENDER_ID`
   - `VITE_FIREBASE_APP_ID`
   - (опционально) `VITE_ICE_SERVERS` — JSON строка вида `[{"urls":"stun:stun.l.google.com:19302"},{"urls":"turn:your.turn.server:3478","username":"user","credential":"pass"}]` — если нужен TURN

   **Не печатайте значения секретов в логах workflow.** Наш `deploy-pages.yml` не делает `echo` секретов.

### 1.3 Включить GitHub Pages + Actions workflow

1. В репозитории проверьте наличие `.github/workflows/deploy-pages.yml` (он уже добавлен)
   - Workflow:
     - on push to main + manual dispatch
     - `npm ci` в client
     - `npm run build` с env из secrets
     - копирует `dist/index.html → dist/404.html` для SPA fallback
     - деплой через `actions/upload-pages-artifact` + `actions/deploy-pages`
     - `VITE_BASE=/Flex/` для корректного base path
2. **Settings → Pages → Source: GitHub Actions** (не "Deploy from a branch")
3. Зайдите в **Actions → Deploy P2P to GitHub Pages → Run workflow** (или сделайте push в main)
4. Дождитесь зелёной галки. В логах будет ссылка вида `https://<username>.github.io/Flex/`

### 1.4 Открыть сайт и проверить

1. Откройте `https://<username>.github.io/Flex/`
   - Если Firebase config отсутствует — увидите Setup Screen с инструкцией, а не падение.
   - Если всё настроено — увидите Login/Register (Firebase Auth)
2. Зарегистрируйте два аккаунта (в двух разных браузерах/профилях, или обычная + инкогнито вкладка, но лучше два браузера чтобы микрофон не конфликтовал)
   - Email/password
   - Username 2-32 символа `[a-z0-9-_~]`
3. **Создание сервера:** после входа нажмите `+` в левой панели → введите имя → создастся сервер с `#general` текст и `General` voice (автоматически)
4. **Чат в двух вкладках:** откройте второй аккаунт во второй вкладке, создайте invite (`Invite People` в меню сервера), скопируйте код, во втором аккаунте `Join a Server` → вставьте код. Теперь оба в одном сервере, отправьте сообщение в #general — оно появится realtime у второго клиента через RTDB `onValue`.
5. **P2P голос в двух вкладках с наушниками:**
   - В каждой вкладке нажмите на voice канал `General` (🔊) → разрешите микрофон
   - Вы должны увидеть присутствие друг друга, speaking indicator (зелёное кольцо при разговоре)
   - Говорите — второй должен слышать через `HTMLAudioElement` + `MediaStream`
   - Проверьте mute (микрофон), deafen (локальное отключение звука)
   - Если ICE connection state = failed/disconnected — в UI покажется предупреждение: «Голос работает напрямую между браузерами. В некоторых мобильных, корпоративных и CGNAT-сетях соединение без TURN-сервера может не установиться.»
   - Используйте наушники чтобы избежать эха!
6. **Как посмотреть GitHub Actions logs:** GitHub → Actions → последний workflow → Build logs, Deploy logs. Убедитесь что секреты не печатаются.
7. **Как позже подключить TURN, если голос не проходит:**
   - Поднимите TURN сервер (например coturn на VPS, или используйте платный/бесплатный сервис типа Cloudflare Calls, Twilio, Xirsys)
   - Получите статический auth: url `turn:your.server:3478`, username, credential
   - В GitHub Secrets добавьте `VITE_ICE_SERVERS` = `[{"urls":"stun:stun.l.google.com:19302"},{"urls":"stun:stun1.l.google.com:19302"},{"urls":"turn:your.server:3478","username":"user","credential":"pass"}]`
   - Запустите workflow заново. Клиенты начнут использовать TURN как fallback.
   - В коде `lib/webrtcConfig.js` уже вынесен в конфиг и проверяется `hasTurnServer()`.

---

## 2) Локальная разработка P2P версии

```bash
cd client
cp .env.example .env
# заполните VITE_FIREBASE_* значениями из Firebase Console
npm ci
npm run build   # проверка сборки
npm run dev     # dev server :5173
```

Открой http://localhost:5173

**Проверки перед коммитом (как в ТЗ):**
```bash
cd client
npm ci
npm run build
# убедитесь что dist не коммитится
git check-ignore -v client/dist
# workflow YAML валиден
cat ../.github/workflows/deploy-pages.yml
# .env не коммитится
git check-ignore -v .env client/.env
git diff --check
git status
```

---

## 3) Firebase Security Rules — подробности

Файл `firebase-rules.json` в корне — минимально безопасные правила.

**Где вставить:** Firebase Console → Realtime Database → Rules → заменить содержимое → Publish

**Что проверяют:**
- `.read/.write: false` в корне
- `profiles/{uid}`: читать может любой auth, писать только владелец, валидация наличия uid/username/displayName
- `usernames/{username}`: чтение auth, запись только если не занято или принадлежит себе
- `guilds/{guildId}`: чтение/запись только членам guild
- `guildMembers/{guildId}/{uid}`: членство проверяется, писать может сам или owner
- `userGuilds/{uid}/{guildId}`: только свой uid
- `guildChannels/Categories`: только члены guild
- `messages/{channelId}/{messageId}`: читать auth (упрощено — можно ужесточить до членов guild, но тогда нужен lookup guildId по channelId, что сложно в RTDB rules без денормализации), писать только автор и только если auth, удалять только автор. **Ограничение:** в этой версии read сообщений разрешён любому auth пользователю, а не только членам guild. Это минимально безопасный вариант для простоты; для усиления: хранить `channelGuild/{channelId}=guildId` и проверять membership по нему, или дублировать guildId в сообщении и валидировать.
- `invites/{code}`: чтение auth, создание auth, удаление владельцем или членом guild
- `voice/{guildId}/{channelId}/state/{uid}`: писать только себе, читать только членам guild
- `voice/.../offers/{toUid}/{fromUid}`: писать только fromUid==auth.uid, читать только если toUid==auth.uid
- Аналогично answers, candidates

Если нужны более строгие правила — добавьте индекс `channelGuild` и проверку `root.child('guildMembers').child(root.child('channelGuild').child($channelId).val()).child(auth.uid).exists()`.

**Важно:** не оставляйте тестовые правила `.read: true, .write: true`.

---

## 4) GitHub Pages нюансы

- Vite `base` настроен на `/Flex/` для project pages. В workflow передаётся `VITE_BASE=/Flex/`. Для кастомного домена установите `/`
- SPA fallback: GitHub Pages не умеет Express fallback. Решение: в workflow `cp dist/index.html dist/404.html` + `404.html` редирект с `?p=` в `index.html`. Также поддерживается hash routing `/#/invite/CODE` — гарантированно работает без 404.html
- Invite deep-links: практичный подход — hash routing (рекомендуется) + 404.html redirect (для обычных ссылок). Пример: `https://username.github.io/Flex/#/invite/ABC123` и `https://username.github.io/Flex/invite/ABC123` (вторая использует 404.html fallback)
- Workflow `.github/workflows/deploy-pages.yml` использует `actions/upload-pages-artifact` и `actions/deploy-pages`, запускается на push в main и вручную

---

## 5) UX особенности P2P версии

- Сохранён дизайн Flex (тёмная тема, sidebar, channel sidebar, member list)
- Экран регистрации/входа использует Firebase, а не старый REST
- Создание сервера работает, автоматически создаёт #general и General voice
- Сообщения realtime через RTDB onValue
- Приглашения работают (код + hash ссылка)
- Голосовой канал: Join/Leave, mute, deafen (локальный), индикатор участников, speaking indicator (через анализатор громкости + presence speaking)
- Предупреждение: «Голос работает напрямую между браузерами. В некоторых мобильных, корпоративных и CGNAT-сетях соединение без TURN-сервера может не установиться.»
- Cleanup: остановка tracks, закрытие peer connections, удаление presence/signaling при выходе

---

## 6) Что изменено в коде

- **client/package.json:** удалён `socket.io-client`, добавлен `firebase`, версия 2.0.0
- **client/src/lib/firebase.js:** инициализация Firebase, проверка isConfigured, getMissingKeys
- **client/src/lib/webrtcConfig.js:** ICE servers конфиг, STUN default, TURN optional via `VITE_ICE_SERVERS`
- **client/src/lib/voiceP2P.js:** полностью новый P2P менеджер: getUserMedia, RTCPeerConnection mesh, signaling через RTDB, presence, speaking detection, audio elements, ICE failed handling, cleanup
- **client/src/lib/db.js:** хелперы для RTDB: profiles, guilds, members, channels, messages, invites, voice
- **client/src/lib/id.js:** генерация id, invite code, username validation
- **client/src/state/Auth.jsx:** переписан на Firebase Auth, onAuthStateChanged, register/login с проверкой username uniqueness через RTDB
- **client/src/state/AppState.jsx:** переписан на Firebase RTDB: listeners userGuilds, guilds, members, channels, categories, messages, typing, voice P2P join/leave/mute/deafen, createGuild, invites, leave/delete guild, createChannel/Category
- **client/src/pages/Login.jsx:** setup screen при отсутствии Firebase config, Firebase email/password, invite code support
- **client/src/pages/MainApp.jsx:** упрощён, убран DM (оставлен home view), сохранён дизайн
- **client/src/components/**: VoiceOverlay переписан для P2P, ModalHost для Firebase invites, ChannelSidebar с P2P предупреждением, MessageList/Message/Composer упрощены для RTDB, ServerSidebar сохранён, etc
- **client/src/api.js, config.js, voice/VoiceEngine.js:** помечены deprecated, оставлены как stub чтобы не ломать старые импорты, но не используются
- **client/vite.config.js:** base из `VITE_BASE`, по умолчанию `/`
- **client/index.html:** убран `FLEX_API_URL`, оставлен SPA `?p=` handler
- **client/public/404.html:** улучшен для base `/Flex/` detection + hash fallback support
- **client/.env.example:** добавлен пример Firebase env
- **.github/workflows/deploy-pages.yml:** новый workflow для P2P версии, secrets для Firebase, base /Flex/, no printing secrets
- **firebase-rules.json:** минимально безопасные RTDB правила
- **.gitignore:** обновлён чтобы .env не коммитился, dist игнор
- **server/**: оставлен как есть для локальной legacy версии, но GH Pages не зависит

---

## 7) Ограничения честно

- **P2P без TURN не гарантирует голос в сетях с CGNAT/symmetric NAT** — это фундаментальное ограничение WebRTC. В этой версии TURN не включён по умолчанию (чтобы остаться бесплатным), но его можно добавить через `VITE_ICE_SERVERS`
- **Сообщения read правило упрощено:** любой auth может читать любые каналы (чтобы не усложнять rules). Для production ужесточить как описано выше
- **Файлы/вложения не реализованы** в P2P v1 (требует Firebase Storage). В MessageComposer показывается warning
- **Роли/права упрощены:** только owner vs member, без битовой маски
- **Друзья/DM убраны** в P2P версии для упрощения, но старый UI частично оставлен
- **Presence online/offline не реализован** (только voice presence)

---

## 8) Старая версия (Docker/Glitch/Socket.IO) — для справки

Оригинальный Flex использовал Express + Socket.IO + серверный voice relay. Этот код остался в `server/` и может запускаться локально:

```bash
npm run install:all
npm run dev # server :4000, client :5173 (но теперь client использует Firebase, так что для старой версии нужно чекаутить старый main)
```

Dockerfile, Caddyfile.example, deploy.md, glitch.json оставлены для истории, но не используются в P2P деплое.

---

## Лицензия

MIT (или как в оригинальном репозитории)

---

## Автор

Flare Award / Flex — P2P Edition сделан для GitHub Pages бесплатного деплоя. PR welcome!
