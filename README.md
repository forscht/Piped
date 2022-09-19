# Piped
Best Protected Open Source File Sharing.

## Requirement:
- Postgres (To use docker postgres -> `cd .devcontainer && docker compose up`)
- WebhookURL (Use multiple webhooks for better upload speed)

## Setup:
- Setup Postgres
- Copy `.env_sample` to `.env` and fill up environment variables
- `npm run migration:up`
- `npm start`

## TODO:
- [ ] Documentation
- [ ] Responsive Frontend
- [ ] Write Dockerfile
- [ ] Better logging
- [ ] Benchmark with lots of webhooks
