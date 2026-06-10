# Deployment

Mailtid is deployed as a **local Home Assistant add-on**. The HA
Supervisor on the host machine (default `192.168.50.171`) builds
the add-on's Docker image from a local folder, so a "deploy" is
literally a `rsync` of the add-on package into place.

## One-command deploy

From the repo root:

```sh
./bin/deploy.sh
```

The script:

1. Reads the SSH password from `$MAILTID_DEPLOY_PASS` or, if unset,
   from `.pass` in the repo root.
2. `rsync -a --delete` syncs `addons/mailtid/` to
   `root@192.168.50.171:/addons/mailtid/`.
3. Over SSH, asks the HA Supervisor to rebuild the `mailtid` add-on
   (`ha addons rebuild mailtid`). If that command returns
   non-zero, the error is **surfaced to stderr** with the command's
   own output; the script does not abort at this step because the
   Supervisor also auto-rebuilds on next add-on start.
4. Runs `bin/smoke-test.sh http://192.168.50.171:8200/ Mailtid` —
   a post-deploy smoke test that asserts the add-on's home screen
   is reachable and responds with `Mailtid`. **This is the real
   gate for a successful deploy.** If the smoke test fails, the
   script exits non-zero loudly and the deploy is considered
   failed.

The script is idempotent and safe to run repeatedly. The smoke
test step uses the `Mailtid` greeting returned by `GET /` (the
Hono app's `app.get("/", ...)` handler), so a freshly built
container that has not yet started serving — or one whose server
crashed during boot — will fail the smoke test and abort the
deploy.

## Post-deploy smoke test

`bin/smoke-test.sh <url> <expected-substring>` is a standalone
bash script that:

- curls the URL with `curl -fsS` (fails on HTTP 4xx/5xx and on
  network errors, propagating curl's exit code)
- greps the body for the expected substring (literal match, not a
  regex)
- exits 0 on success, 1 on substring mismatch, 2 on bad usage

The script is invoked from `bin/deploy.sh` and is independently
executable for ad-hoc checks:

```sh
bin/smoke-test.sh http://192.168.50.171:8200/ Mailtid
```

The deploy script targets port `8200` by default; override with
`SMOKE_PORT` if the add-on's port is set to something else in the
HA add-on options.

## Required environment

| Tool      | Why                                       | Install (Debian/Ubuntu) |
| --------- | ----------------------------------------- | ----------------------- |
| `rsync`   | file sync                                 | `apt install rsync`     |
| `ssh`     | remote shell + rsync transport            | preinstalled            |
| `sshpass` | non-interactive password auth             | `apt install sshpass`   |
| `curl`    | post-deploy smoke test against the add-on | preinstalled            |

If you prefer public-key auth, drop a key in
`/root/.ssh/authorized_keys` on the HA host and the script will
detect the missing password and use the key instead.

## Local-first development

For local work, run the app directly with `npm run dev` in
`addons/mailtid/app/`. The bootstrap reads
`$MAILTID_OPTIONS_FILE` (default `/data/options.json`) — point
that at a fixture file with the options you want:

```sh
MAILTID_OPTIONS_FILE=./dev-options.json npm run dev
```

The same JSON shape is what the HA Supervisor writes into
`/data/options.json` inside the container. The standalone smoke
test is useful here too: once `npm run dev` is serving on
`http://localhost:8200/`, run `bin/smoke-test.sh
http://localhost:8200/ Mailtid` to confirm the server is up.
