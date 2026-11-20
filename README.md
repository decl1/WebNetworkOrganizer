# WebNetworkOrganizer

Веб-приложение для управления видимой сетью: контейнеры с хостами, пинг, автообновление, логи, SSH-настройки, интерактивная консоль (xterm.js), веб-сервисы, Docker-контейнеры через SSH, файловый менеджер с редактором.

A web app for managing your visible network: container hosts, ping, auto-refresh, logs, SSH settings, interactive console (xterm.js), web services, Docker containers over SSH, file manager with an editor.

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
- Interactive console (xterm.js, PTY over WebSocket) / консоль; "Open in console" from the file manager starts the shell in the current folder
- Web services / веб-сервисы: URLs, status check, health
- File manager / файловый менеджер (button next to the console): SFTP browsing with breadcrumbs, selection like a file explorer (click, Ctrl/Shift multi-select), drag & drop between folders and between hosts (move on the same host, copy to another host), context menu (open / rename / delete / download), folders and multi-selection download as a tar.gz archive, drag & drop upload, built-in text editor window (double-click, Ctrl+S, binary and oversized files are view-only); unreadable paths fall back to the sudo attempt chain (NOPASSWD or the host sudo password) / кнопка рядом с консолью: обзор по SFTP с хлебными крошками, выделение как в проводнике (клик, Ctrl/Shift-мультивыделение), перетаскивание объектов между папками и между хостами (перемещение на том же хосте, копирование на другой), контекстное меню (открыть / переименовать / удалить / скачать), папки и множественное выделение скачиваются архивом tar.gz, загрузка drag & drop, встроенный редактор в отдельном окне (двойной клик, Ctrl+S, бинарные и слишком большие файлы — только просмотр); недоступные пути обрабатываются через sudo-цепочку (NOPASSWD или пароль sudo хоста)
- Docker: enable per host + command (default `sudo docker ps`); sudo fallbacks are tried automatically (docker group, NOPASSWD, sudo password in the General section of host settings) / докер-контейнеры по SSH; sudo-варианты пробуются автоматически (группа docker, NOPASSWD, пароль sudo в общих настройках хоста)
- SysInfo: customizable per-host console parameters (defaults: CPU, RAM, disk, temperature); each parameter supports an optional regex to extract the value from the command output (capture group 1, or the whole match); `sudo` supported via the host's sudo password (General settings) / кастомные sysinfo-параметры хоста (по умолчанию: ЦП, ОЗУ, диск, температура); у каждого параметра есть необязательный regex для извлечения значения из вывода команды (первая группа или всё найденное); `sudo` поддерживается через пароль sudo хоста (общие настройки)

## Layout / Структура

```
app/          backend: routers, services, db (SQLite), schemas
public/       frontend: index.html, app.js, js/, style.css
```