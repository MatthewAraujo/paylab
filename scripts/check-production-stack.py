"""Verify the running production-local Docker stack from the outside.

Read-only by default. Opt-in flags disrupt the stack:
  --restart  stops and starts the whole stack, then checks data preservation.
  --kill     kills the API and console processes and waits for Docker to restart them.
Never removes volumes and never prints the Merchant key.
"""

import argparse
import json
import subprocess
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
COMPOSE = ["docker", "compose", "-f", str(ROOT / "compose.production.yaml")]
SERVICES = ("postgres", "api", "ui")
# PID 1 is docker-init; its only child is the application (healthchecks are not its children).
KILL_APPLICATION = "kill -KILL $(cut -d' ' -f1 /proc/1/task/1/children)"


def compose(*args, check=True):
    result = subprocess.run([*COMPOSE, *args], capture_output=True, text=True, check=False)
    if check and result.returncode != 0:
        raise AssertionError(f"docker compose {' '.join(args)} failed: {result.stderr.strip()}")
    return result.stdout


def passed(message):
    print(f"PASS: {message}", flush=True)


def wait_for(description, check, seconds=120):
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        try:
            if check():
                return
        except (OSError, ValueError, AssertionError):
            pass
        time.sleep(1)
    raise AssertionError(f"Timed out waiting for {description}")


def containers():
    rows = [json.loads(line) for line in compose("ps", "--all", "--format", "json").splitlines() if line]
    return {row["Service"]: row for row in rows}


def all_healthy():
    state = containers()
    return all(state.get(name, {}).get("Health") == "healthy" for name in SERVICES)


def check_health_and_ordering():
    wait_for("healthy postgres, api and ui", all_healthy)
    state = containers()
    init = state.get("demo-init", {})
    assert init.get("State") == "exited" and init.get("ExitCode") == 0, "demo-init must complete successfully"
    passed("postgres, api and ui are healthy; demo-init completed successfully")


def check_ports():
    state = containers()
    published = {
        (port.get("URL"), port.get("PublishedPort"))
        for row in state.values()
        for port in row.get("Publishers") or []
        if port.get("PublishedPort")
    }
    assert published == {("127.0.0.1", 3000), ("127.0.0.1", 3333)}, f"Unexpected published ports: {published}"
    passed("only 127.0.0.1:3000 and 127.0.0.1:3333 are published; PostgreSQL has no host port")


def check_isolation():
    project = json.loads(compose("ls", "--all", "--format", "json"))
    assert any(p["Name"] == "paylab-production" for p in project), "Compose project paylab-production not found"
    volumes = compose("volumes", "--format", "{{.Name}}").split()
    assert sorted(volumes) == ["paylab-production_credentials", "paylab-production_postgres-data"], volumes
    passed(f"project paylab-production uses its own volumes: {', '.join(sorted(volumes))}")


def check_non_root_and_runtime_contents():
    for service in ("api", "ui"):
        uid = compose("exec", "-T", service, "id", "-u").strip()
        assert uid != "0", f"{service} runs as root"
        command = "command -v pnpm || test -e node_modules/.bin/tsc || test -e node_modules/.bin/ts-node || test -d src"
        tooling = subprocess.run([*COMPOSE, "exec", "-T", service, "sh", "-c", command], capture_output=True)
        assert tooling.returncode != 0, f"{service} contains build tooling or source"
    passed("api and ui run as non-root and contain no pnpm, compilers or source")


def api_key():
    return compose("exec", "-T", "ui", "cat", "/run/paylab/api-key").strip()


def wallet_ids(key):
    request = urllib.request.Request(
        "http://localhost:3333/v1/accounts", headers={"Authorization": f"Bearer {key}"}
    )
    with urllib.request.urlopen(request, timeout=10) as response:
        body = json.load(response)
    ids = sorted(item["id"] for item in body["items"])
    assert ids, "Demo Store has no Wallets"
    return ids


def console_html(path):
    with urllib.request.urlopen(f"http://localhost:3000{path}", timeout=30) as response:
        return response.read().decode()


def check_authenticated_data(key):
    ids = wallet_ids(key)
    html = console_html("/accounts")
    assert any(wallet_id in html for wallet_id in ids), "Console did not render Demo Store Wallets"
    assert key not in html, "Merchant key leaked into console HTML"
    mounts = json.loads(subprocess.run(
        ["docker", "inspect", containers()["ui"]["ID"], "--format", "{{json .Mounts}}"],
        capture_output=True, text=True, check=True,
    ).stdout)
    assert any(m["Destination"] == "/run/paylab" and not m["RW"] for m in mounts), "Credential mount must be read-only"
    passed(f"API and console serve {len(ids)} Demo Store Wallets; key absent from HTML; credential mount read-only")
    return ids


def check_restart(key, ids):
    compose("stop")
    compose("up", "-d", "--wait")
    logs = compose("logs", "demo-init")
    assert "Existing demo data and credential preserved." in logs, "demo-init did not report preservation"
    assert api_key() == key, "Credential changed across restart"
    assert wallet_ids(key) == ids, "Wallet ids changed across restart"
    passed("stop/start preserved Wallet ids and the credential without reseeding")


def check_kill():
    for service in ("api", "ui"):
        before = containers()[service]["ID"]
        restarts = int(subprocess.run(
            ["docker", "inspect", before, "--format", "{{.RestartCount}}"], capture_output=True, text=True, check=True
        ).stdout)
        # Killing the application makes the container exit. Slim images have no pgrep.
        # The exec session dies with the container, so its exit status is not meaningful.
        compose("exec", "-T", service, "sh", "-c", KILL_APPLICATION, check=False)

        def recovered():
            count = int(subprocess.run(
                ["docker", "inspect", before, "--format", "{{.RestartCount}}"], capture_output=True, text=True, check=True
            ).stdout)
            return count > restarts and containers()[service].get("Health") == "healthy"

        wait_for(f"{service} to be restarted and healthy", recovered)
        passed(f"{service} was restarted by its restart policy and is healthy again")


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--restart", action="store_true", help="stop and start the stack and check preservation")
    parser.add_argument("--kill", action="store_true", help="kill the API and console processes and check recovery")
    args = parser.parse_args()

    check_health_and_ordering()
    check_ports()
    check_isolation()
    check_non_root_and_runtime_contents()
    key = api_key()
    ids = check_authenticated_data(key)
    if args.restart:
        check_restart(key, ids)
    if args.kill:
        check_kill()


if __name__ == "__main__":
    main()
