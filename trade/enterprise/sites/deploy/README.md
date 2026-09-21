---
description: "Deploy the enterprise website and open-source services on a private company server."
kind: "package-reference"
---

# Deploy a company website

English | [中文](README.zh.md)

## Summary

This package composes the existing dsh profile with Caddy, Umami/PostgreSQL, Ollama, SearXNG, ntfy and optional EspoCRM/MariaDB. No paid service or commercial extension is required. The administrator supplies a Linux server, Docker Engine with Compose, two DNS names and sufficient model memory. Container startup, public DNS/TLS, backup recovery and live-model quality require acceptance on that server; they have not been verified on the Windows development host.

## Table of Contents

- [Initialize](#initialize)
- [Connect services](#connect-services)
- [Verify publication](#verify-publication)
- [Back up and isolate enterprises](#back-up-and-isolate-enterprises)

## Initialize {#initialize}

1. Place this source checkout on the server and enter this directory. Point both DNS names to the server and allow HTTP/HTTPS. Administration ports bind only to loopback. Initialization refuses to overwrite existing private inputs.

```sh
node init.mjs www.company.example metrics.company.example
docker compose --env-file private/deployment.env config --quiet
docker compose --env-file private/deployment.env up -d --build
docker compose --env-file private/deployment.env exec ollama ollama pull qwen3:8b
```

2. Keep `private/` accessible only to the operator. It contains database passwords, backup credentials and service configuration. The application starts through `dsh --profile trade`. The default [Qwen3 8B model](https://ollama.com/library/qwen3:8b) uses Apache-2.0; change `SITE_MODEL` and pull another open-source model when required. CPU inference is supported; GPU setup follows the [Ollama guide](https://docs.ollama.com/docker). Pin tested image digests using the override variables in [compose.yml](compose.yml) before production rollout.

3. Open SSH tunnels for administration. Read the authenticated workspace URL from `docker compose --env-file private/deployment.env logs app` and keep its token private. Replace the SSH destination below.

```sh
ssh -L 3080:127.0.0.1:3080 -L 3081:127.0.0.1:3081 -L 3082:127.0.0.1:3082 -L 3083:127.0.0.1:3083 operator@server
```

## Connect services {#connect-services}

4. Open Umami through the tunnel on port 3081, change its initial administrator password, and create a [self-hosted API key](https://docs.umami.is/docs/api/authentication). Add the `umami` object below to `private/site-services.json`, retaining `search`. Replace the domain and key placeholders. The public metrics domain exposes only the tracker and collection endpoint; the dashboard remains private.

```json
{
  "search": { "baseUrl": "http://searxng:8080/" },
  "umami": {
    "baseUrl": "http://umami:3000/",
    "publicUrl": "https://metrics.company.example/",
    "dashboardUrl": "http://localhost:3081/",
    "apiKey": "YOUR_PRIVATE_UMAMI_KEY"
  }
}
```

5. For notifications, run `docker compose --env-file private/deployment.env exec ntfy ntfy user add --role=admin site-owner`, then `docker compose --env-file private/deployment.env exec ntfy ntfy token add site-owner`. Add `notifications: {baseUrl, topic, token}` with `http://ntfy/` and a dedicated topic. Subscribe through the tunnel using the ntfy web interface. Anonymous access is denied. Separate publisher/subscriber accounts follow [ntfy access control](https://docs.ntfy.sh/config/#access-control).

6. For CRM, run `docker compose --env-file private/deployment.env --profile crm up -d`. Open port 3083 through the tunnel with the generated `CRM_ADMIN_PASSWORD`. Create an EspoCRM API user with Lead read/create permissions; add `crm: {baseUrl, apiKey}` using `http://espocrm/`. This integration uses standard Lead REST operations and requires no paid Advanced Pack. See [EspoCRM API permissions](https://docs.espocrm.com/development/api/).

7. Restart after configuration changes: `docker compose --env-file private/deployment.env restart app`. In Sites, load website configuration, enable automatic Umami connection and the consultant, review public content and save a draft. Enable notifications, CRM and periodic search checks separately in operation settings. Missing service configuration disables its controls.

## Verify publication {#verify-publication}

8. Review and publish the saved website. Copy its complete public URL, including `/sites-live/<site-id>/`, and run the acceptance script. `--consult` calls the actual model, records a Session and consumes consultation quota. Omit the flag for read-only page checks. Review the actual answer and terminology before serving customers.

```sh
node verify.mjs https://www.company.example/sites-live/00000000-0000-4000-8000-000000000001/ --consult
```

9. Visit without workspace credentials, submit a labeled test inquiry and confirm its inbox receipt, Umami event and enabled ntfy/CRM receipts. Delete test records and external copies after acceptance. Search failures must appear as incomplete or failed checks; zero matches alone do not prove deindexing. The reverse proxy refuses administration paths. To use the domain homepage, add a root redirect in the website block of `Caddyfile` to the published directory, then reload Caddy.

## Back up and isolate enterprises {#back-up-and-isolate-enterprises}

Run `sh backup.sh` in this directory. It stops the running writers, backs up application, analytics, CRM, notification and configuration data with open-source restic, checks integrity, then restarts the same services even after failure. Copy the encrypted `backups/` repository off the server and separately retain `private/restic-password`. Model files are excluded because they can be downloaded again. Expect a maintenance window during backup.

Restore with restic into a new empty directory on a recovery host; never overwrite a running database. Preserve original database image versions, restore matching volume contents and configuration, then repeat public acceptance before switching DNS. Follow the [restic restore guide](https://restic.readthedocs.io/en/stable/050_restore.html). A backup is operationally accepted only after a recovery drill.

Use an independent installation, private directory, Compose project and volume set per enterprise. Separate trust domains use separate hosts. Sharing a server requires distinct loopback ports and an operator-managed front proxy. The workspace retains single-enterprise authorization; this package does not introduce shared multi-tenant accounts. Service credentials must belong to that enterprise.
