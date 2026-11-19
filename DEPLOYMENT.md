# Self-Hosting Guide (VPS + Caddy + Optional Auto-Sort)

Deploy **Spotify Playlist Sorter** to any small Linux VPS (tested on a 1 GB RAM Oracle Always Free Ubuntu 24.04 VM) behind **Caddy** with automatic HTTPS and `basic_auth`.

[← Back to README](README.md)

---

## Overview

| Component | Role | Port / Path |
| :--- | :--- | :--- |
| **Caddy** | Automatic HTTPS, `basic_auth` gate, serves `dist/`, proxies `/auto-api/*` | `:80`, `:443` |
| **Static Frontend (`dist/`)** | Login-only React + TypeScript SPA | `/var/www/spotify-sorter/dist` |
| **Auto-Sort Service *(Optional)*** | Standalone Node `systemd` daemon polling every 2 min + saving disk backups | `127.0.0.1:3001` |
| **Auto-Sort State & Backups** | Serialized refresh token, rules, and pre-sort snapshots (`chmod 0600`) | `/var/lib/spotify-sorter` |

> [!TIP]
> **No custom domain?** Spotify rejects plain `http://<VPS_IP>/callback` and requires HTTPS for non-loopback redirect URIs. Use **`sslip.io`**—replace dots in your VPS IP with dashes (e.g. `203.0.113.10` → `203-0-113-10.sslip.io`). Caddy automatically issues a Let's Encrypt TLS certificate for it at zero cost.

---

## 1. Register Your VPS Redirect URI on Spotify

In the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard) → Your App → **Settings → Redirect URIs**, add:

```text
https://203-0-113-10.sslip.io/callback
```
*(Replace `203-0-113-10.sslip.io` with your own VPS `sslip.io` hostname or domain.)*

---

## 2. Open Ports `80` & `443`

> [!WARNING]
> On Oracle Cloud VMs, inbound HTTP/HTTPS must be allowed in **both** the cloud VCN Security List **and** the VM's OS firewall, otherwise Let's Encrypt TLS issuance will time out.

1. **Cloud Console (OCI VCN / Security Group):** Add ingress rules for `0.0.0.0/0` on TCP ports `80` and `443`.
2. **Inside the VM:**
   - **Oracle Ubuntu (`iptables`):**
     ```bash
     sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
     sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
     sudo netfilter-persistent save
     ```
   - **Ubuntu (`ufw`):**
     ```bash
     sudo ufw allow 80/tcp && sudo ufw allow 443/tcp
     ```

---

## 3. Build Locally & Upload to the VPS

Building locally prevents out-of-memory errors on 1 GB RAM instances:

```bash
# 1. Configure .env locally (recommended: set VITE_ALLOWED_SPOTIFY_USER_ID)
cp .env.example .env

# 2. Build both frontend (dist/) and standalone server (dist-server/)
npm install
npm run build:all
```

Prepare directories on the VPS:
```bash
sudo mkdir -p /var/www/spotify-sorter/dist /var/www/spotify-sorter/dist-server /var/lib/spotify-sorter
sudo chown -R $USER:$USER /var/www/spotify-sorter /var/lib/spotify-sorter
chmod 700 /var/lib/spotify-sorter
```

Upload build outputs from your local machine:
```bash
rsync -avz --delete dist/ ubuntu@203.0.113.10:/var/www/spotify-sorter/dist/
rsync -avz dist-server/ ubuntu@203.0.113.10:/var/www/spotify-sorter/dist-server/
```

<details>
<summary>Alternative: building directly on a 1 GB RAM VPS</summary>

Enable a 1–2 GB swapfile first, then limit Node's heap during build:
```bash
NODE_OPTIONS="--max-old-space-size=512" npm run build:all
```

</details>

---

## 4. Configure Caddy (`basic_auth` + HTTPS)

Install Caddy and generate a bcrypt password hash:
```bash
sudo apt update && sudo apt install -y caddy
caddy hash-password
```

Add the site block from [deploy/Caddyfile.example](deploy/Caddyfile.example) into `/etc/caddy/Caddyfile`:

```caddyfile
203-0-113-10.sslip.io {
    header {
        X-Robots-Tag "noindex, nofollow"
        Referrer-Policy "no-referrer"
        X-Content-Type-Options "nosniff"
    }

    basic_auth {
        youruser $2a$14$REPLACE_WITH_OUTPUT_FROM_CADDY_HASH_PASSWORD
    }

    # Optional: background auto-sort API (remove this block for static-only hosting)
    handle /auto-api/* {
        reverse_proxy 127.0.0.1:3001
    }

    handle {
        root * /var/www/spotify-sorter/dist
        encode zstd gzip
        try_files {path} /index.html
        file_server
    }
}
```

Validate and reload Caddy:
```bash
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl enable --now caddy
sudo systemctl reload caddy
```

> [!NOTE]
> Because Caddy's `basic_auth` sits in front of both `handle` blocks, unauthenticated requests to `/` or `/auto-api/*` receive `HTTP 401` before any HTML, JS bundle, or API data is returned.

---

## 5. Enable 24/7 Background Auto-Sort *(Optional)*

Requires Node.js v20+ on the VPS (`node -v`). Install the `systemd` unit from [deploy/spotify-sorter-autosort.service](deploy/spotify-sorter-autosort.service):

```bash
sudo cp deploy/spotify-sorter-autosort.service /etc/systemd/system/spotify-sorter-autosort.service
sudo systemctl daemon-reload
sudo systemctl enable --now spotify-sorter-autosort
```

- **Polling footprint:** Makes **1 `GET /v1/me/playlists`** call every 2 minutes (~0.5 calls/min) and only fetches/reorders items when a watched playlist's `snapshot_id` changes.
- **Pre-sort backups:** Every automatic reorder writes a `(uri, occurrenceIndex)` snapshot to `/var/lib/spotify-sorter/backups/<playlistId>.json` (up to 20 per playlist) first, viewable and restorable in the UI's **Backups** drawer.
- **Token lifecycle:** The VPS acts as the single serialized token refresher for up to Spotify's 180-day refresh token lifetime.

---

## 6. First Sign-In

1. Open `https://203-0-113-10.sslip.io` and enter your Caddy `basic_auth` credentials *(cached by the browser for the origin, so Spotify's `/callback` redirect passes automatically)*.
2. Click **Sign in with Spotify** *(your session syncs automatically to the VPS auto-sort service if enabled)*.
3. To enable 24/7 sorting on a playlist, open it, click **Auto-Sort**, choose a preset *(e.g. **Date Added: Newest First**)*, and click **Save Auto-Sort**.

---

<details>
<summary>Maintenance: updating builds & viewing logs</summary>

**Deploy an update from local machine:**
```bash
npm run build:all
rsync -avz --delete dist/ ubuntu@203.0.113.10:/var/www/spotify-sorter/dist/
rsync -avz dist-server/ ubuntu@203.0.113.10:/var/www/spotify-sorter/dist-server/
```

**Restart auto-sort service & inspect logs on VPS:**
```bash
sudo systemctl restart spotify-sorter-autosort
sudo journalctl -u spotify-sorter-autosort -n 50 --no-pager
sudo journalctl -u caddy -n 50 --no-pager
```

</details>
