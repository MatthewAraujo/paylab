# PayLab

Start the API, console and isolated demo database from this directory:

```sh
docker compose up --build
```

Open http://localhost:3000 (console) or http://localhost:3333/health (API).

Requires Docker with Compose. Development mode includes source reload and automatic demo setup. Data and credentials persist across restarts. Stop with `docker compose stop`.

For a production-local stack (compiled non-root images, migrations on startup, manual backups), copy `.env.production.example` to `.env.production`, set real values, and run `docker compose -f compose.production.yaml up --build -d`. Stop the development stack first; both use the same ports.

See [PROJECT.md](PROJECT.md) for background execution, logs, rebuilds, database isolation, credential handling, and production-local backup and restore.
