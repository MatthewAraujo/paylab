# PayLab

Start the API, console and isolated demo database from this directory:

```sh
docker compose up --build
```

Open http://localhost:3000 (console) or http://localhost:3333/health (API).

Requires Docker with Compose. Development mode includes source reload and automatic demo setup. Data and credentials persist across restarts. Stop with `docker compose stop`.

See [PROJECT.md](PROJECT.md) for background execution, logs, rebuilds, database isolation and credential handling.
