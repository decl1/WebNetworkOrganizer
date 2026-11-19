# WebNetworkOrganizer

Веб-приложение для управления видимой сетью: контейнеры с хостами, пинг, автообновление, логи, SSH-настройки, интерактивная консоль (xterm.js), веб-сервисы, Docker-контейнеры через SSH.

A web app for managing your visible network: container hosts, ping, auto-refresh, logs, SSH settings, interactive console (xterm.js), web services, Docker containers over SSH.

## Start / Запуск

```
docker compose up -d --build webnetworkorganizer
```

Web UI: <http://localhost:8991>

Stack: FastAPI + SQLite + vanilla JS. Code: EN, UI: EN/RU (`public/js/i18n.js`).

## Main Features / Возможности

- Containers / хосты в контейнерах, ping-статус, auto-refresh
- Logs / логи (poll 2s)
- SSH: key setup, public key, ssh-copy-id hint / настройки ключей
- Interactive console (xterm.js, PTY over WebSocket) / консоль
- Web services / веб-сервисы: URLs, status check, health
- Docker: enable per host + command (default `sudo docker ps`) / докер-контейнеры по SSH

## Layout / Структура

```
app/          backend: routers, services, db (SQLite), schemas
public/       frontend: index.html, app.js, js/, style.css
```