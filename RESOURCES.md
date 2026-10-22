# Docker and Infrastructure Resources

## Knowledge

- [Docker Docs: Docker build cache](https://docs.docker.com/build/cache/)
  How layers are cached and invalidated ("if a layer changes, all other layers that come after it are also affected"). Use for: Dockerfile instruction order.
- [Docker Docs: Optimize cache usage](https://docs.docker.com/build/cache/optimize/)
  Instruction ordering, `.dockerignore`, cache mounts (`RUN --mount=type=cache`). Use for: why PayLab's Dockerfiles copy lockfiles before source.
- [Docker Docs: Networking in Compose](https://docs.docker.com/compose/how-tos/networking/)
  Default `<project>_default` bridge network, service-name DNS, HOST:CONTAINER ports. Use for: `postgres` / `api` hostnames.
- [Docker Docs: Volumes](https://docs.docker.com/engine/storage/volumes/) and [Bind mounts](https://docs.docker.com/engine/storage/bind-mounts/)
  Named volumes managed by Docker vs host directories mounted in; mounts obscure existing container files. Use for: `postgres-data`, `demo-credentials`, hot reload of `src`.
- [Docker Docs: Control startup order](https://docs.docker.com/compose/how-tos/startup-order/)
  `depends_on` conditions `service_started`, `service_healthy`, `service_completed_successfully`. Use for: PayLab startup chain.
- [Docker Docs: Compose fragments](https://docs.docker.com/reference/compose-file/fragments/) and [Extensions](https://docs.docker.com/reference/compose-file/extension/)
  YAML anchors/aliases and `x-` fields. Use for: the `x-api: &api` block.
- [Docker Docs: Interpolation](https://docs.docker.com/reference/compose-file/interpolation/)
  `$$` escapes a literal `$` so Compose does not interpolate it. Use for: the UI `command`.
- [Docker Docs: Services reference](https://docs.docker.com/reference/compose-file/services/)
  Every service attribute (`init`, `healthcheck`, `ports`, `volumes`, ...).
- [Docker Docs: Node.js guide](https://docs.docker.com/guides/nodejs/) and [Compose Quickstart](https://docs.docker.com/compose/gettingstarted/)
  Listed in the Notion week-1 page. Use for: end-to-end walkthrough.
- [Video: Docker Tutorial for Beginners — TechWorld with Nana](https://www.youtube.com/watch?v=3c-iBn73dDE)
  Listed in the Notion week-1 page. Use for: visual overview of images, containers, volumes.

## Wisdom (Communities)

- [Docker Community Forums](https://forums.docker.com/)
  Official forum. Use for: "why does my container behave like this" questions.
- [r/docker](https://www.reddit.com/r/docker/)
  Large, active subreddit. Use for: Compose/Dockerfile reviews.

## Gaps

- Week 2 (multi-stage, non-root, restart policies) and week 3 (Nginx, DNS, HTTP) sources not yet curated.
