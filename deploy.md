# Деплой Flex для двоих через интернет (Россия ↔ Молдова)

Ниже самый простой надёжный способ: самый дешёвый VPS (300–500 ₽/мес), Docker + Caddy для HTTPS.  
Голос идёт через сервер-релей (не P2P), поэтому пробивает любые NAT/блокировки между РФ и MD.

## 1. Купите VPS
Подойдёт любой самый дешёвый тариф (1 ядро / 1 ГБ RAM / 10 ГБ SSD):
- **Рекомендую хостинги, которые принимают рубли и работают в РФ/СНГ:** 3DNS (aeza.net), TimeWeb, Selectel, RUVDS, DigitalV/VDSina.
- Или за границей: Hetzner, DigitalOcean, Vultr — если у друга оплачивается картой.
- Требуется Ubuntu 22.04/24.04 с публичным IPv4.

## 2. Купите домен (опционально, но для HTTPS нужен)
Подойдёт любой бесплатный (например `*.duckdns.org`) или дешёвый (.xyz/.fun ~ 50–150 ₽/год).  
Привяжите DNS-запись `A` на IP вашего VPS. Можно и без домена (HTTP), но браузер не даст доступ к микрофону на не-https сайтах, кроме `localhost`. **Без HTTPS голос работать не будет.**

Если хотите без покупки домена — можно добавить самоподписанный сертификат, но это сложнее. Проще взять домен.

## 3. Установите Docker и Caddy на VPS
По SSH на сервер:

```bash
# Docker
curl -fsSL https://get.docker.com | sh
usermod -aG docker $USER
newgrp docker

# Caddy (обратный прокси с авто-HTTPS Let's Encrypt)
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install -y caddy
```

## 4. Скопируйте Flex на VPS
```bash
# на своём ПК (из папки Flex):
scp -r ./ root@IP_СЕРВЕРА:/opt/flex
```

Или клонируйте сразу на сервере `git clone <your-repo> /opt/flex && cd /opt/flex`.

## 5. Настройте Caddy
```bash
sudo cp /opt/flex/Caddyfile.example /etc/caddy/Caddyfile
sudo nano /etc/caddy/Caddyfile    # замените YOUR-DOMAIN на ваш домен
sudo systemctl restart caddy
```

## 6. Запустите Flex
```bash
cd /opt/flex
echo "JWT_SECRET=$(openssl rand -hex 48)" > .env
docker compose up -d --build
docker compose logs -f
```

Откройте в браузере `https://ваш-домен` — вы должны увидеть экран входа.

## 7. Создайте свой аккаунт и пригласите друга
1. Откройте сайт на вашем ПК — нажмите «Register» и создайте свой аккаунт.
2. Зайдите в «Добавить сервер» → «Create my own», назовите его как угодно.
3. Кликните на название сервера → «Invite People», скопируйте код (похож на `AbC123xY`).
4. Ссылка для друга: `https://ваш-домен/invite/КОД` — он открывает её, регистрируется и сразу попадает к вам на сервер.
5. Всё! Общий чат и голосовой канал уже готовы.

## Безопасность
- Поменяйте пароль от demo-аккаунтов или удалите их (можно просто написать себе и другу из них «не использовать» и потом забанить, или править `server/data/db.json` и удалить пользователей `demo` и `friend`).
- Файрвол на VPS (`ufw allow 22,80,443/tcp`) — Docker сам откроет 4000, но через Caddy он доступен только на 127.0.0.1, поэтому снаружи 4000 не виден.
- JWT_SECRET в `.env` обязательно сделайте случайным (команда выше это делает).

## Резервное копирование
Данные лежат в docker-волюме `flex-flex-data`. Дамп БД:
```bash
docker cp flex:/data/db.json ./backup-$(date +%F).json
```
Автобэкапы БД сервер делает сам (хранятся 48 почасовых копий в `/data/backups`).

## Обновление
```bash
cd /opt/flex
git pull         # если используете git, либо заново скопируйте папку
docker compose up -d --build
```

## Проблемы со связью?
Голос идёт ТОЛЬКО через сервер (релей), так что соединение всегда должно работать. Если плохое качество:
- Понизьте битрейт (в будущем будет настройка, сейчас 32 кбит/с — для голоса нормально).
- Проверьте пинг до сервера — если > 150 мс, голос будет с задержкой. Берите VPS в Москве/Франкфурте — пинг и из РФ, и из Молдовы будет ~40–80 мс.
