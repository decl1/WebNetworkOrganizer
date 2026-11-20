# WebNetworkOrganizer

Веб-приложение для управления видимой сетью: контейнеры с хостами, пинг, автообновление, логи, SSH-настройки, интерактивная консоль (xterm.js), веб-сервисы, Docker-контейнеры через SSH.

A web app for managing your visible network: container hosts, ping, auto-refresh, logs, SSH settings, interactive console (xterm.js), web services, Docker containers over SSH.

## Start / Запуск

```
docker compose up -d --build webnetworkorganizer
```

Web UI: <http://localhost:8991>

Stack: FastAPI + SQLite + vanilla JS. Code: EN, UI: EN/RU (`public/js/i18n.js`).

## MCP / MCP-сервер

The app exposes an MCP server over streamable HTTP at `/mcp` — statuses are also written to `data/hosts_status.json` after every refresh. Tools: `get_hosts`, `get_host`, `get_hosts_by_ping_status`, `refresh_host`, `docker_containers`; resource `wno://snapshot`.

Приложение отдаёт MCP-сервер по streamable HTTP на `/mcp`; снапшот статусов пишется в `data/hosts_status.json` после каждого обновления. Инструменты: `get_hosts`, `get_host`, `get_hosts_by_ping_status`, `refresh_host`, `docker_containers`; ресурс `wno://snapshot`.

```json
{
  "mcpServers": {
    "webnetworkorganizer": {
      "url": "http://localhost:8991/mcp"
    }
  }
}
```

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