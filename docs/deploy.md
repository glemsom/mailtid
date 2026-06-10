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
   (`ha addons rebuild mailtid`).

The script is idempotent and safe to run repeatedly. A failed
Supervisor rebuild prints a warning but does not fail the deploy,
because the Supervisor also auto-rebuilds on next add-on start.

## Required environment

| Tool    | Why                              | Install (Debian/Ubuntu) |
| ------- | -------------------------------- | ----------------------- |
| `rsync` | file sync                        | `apt install rsync`     |
| `ssh`   | remote shell + rsync transport   | preinstalled            |
| `sshpass` | non-interactive password auth  | `apt install sshpass`   |

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
`/data/options.json` inside the container.
