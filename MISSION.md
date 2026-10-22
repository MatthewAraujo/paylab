# Mission: Docker and infrastructure fundamentals through PayLab

## Why
Land an international full-stack/backend role within six months (plan started September 2026). October of the study track is "Docker + infrastructure fundamentals": containerize, operate and diagnose PayLab without relying only on a PaaS, and be able to explain those decisions in interviews.

## Success looks like
- Explain every line of PayLab's root `compose.yaml` and both Dockerfiles without notes (October, week 1).
- Bring API + PostgreSQL up entirely via Compose, with a persistent volume and its own network, and explain why data survives restarts.
- Diagnose a broken container (port, DNS, healthcheck, volume) from `docker compose ps/logs/exec` alone.
- Later in October: multi-stage builds, non-root user, restart policies, Nginx reverse proxy, deploy to a self-managed VM, and the FakeBank provider.
- Explain the path request → proxy → application → database in an interview.

## Constraints
- 2–3 hours per day; about 2 hours of study and practice.
- One oral review or mock interview per week.
- Practice on PayLab (the single lab project), not toy examples.
- Stack: Node.js + TypeScript + React; backend emphasis.

## Out of scope
- AWS (November), queues and cache (January), observability and CI/CD (February).
- Kubernetes.

Source: Notion "Trilha de Estudos — Engenharia e Arquitetura" and "Outubro · Semana 1 — Docker fundamental".
