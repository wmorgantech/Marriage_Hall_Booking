# infra/

Local/dev infrastructure as code.

## Postgres (local dev)

```bash
docker compose -f infra/docker-compose.yml up -d
```

Default credentials (match `apps/api/.env.example`):
- host: `localhost`
- port: `5432`
- user: `postgres`
- password: `postgres`
- database: `checknbook`

Stop and keep data:
```bash
docker compose -f infra/docker-compose.yml down
```

Wipe data (fresh start):
```bash
docker compose -f infra/docker-compose.yml down -v
```

## Future

- `infra/docker/api.Dockerfile` — prod image for the API.
- `infra/docker/web.Dockerfile` — static build for the web app.
- `infra/terraform/` or `infra/fly/` — deploy configs.
