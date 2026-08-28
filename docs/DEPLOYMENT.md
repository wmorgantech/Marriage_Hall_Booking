# CheckNBook — Deploying to a Hostinger VPS with HTTPS subdomain

End-to-end: fresh Ubuntu VPS → `https://checknbook.yourdomain.com` with a Let's Encrypt cert, Node API, Postgres, and static React build all on one box.

> **Assumptions**: you have a Hostinger VPS (Ubuntu 22.04 or 24.04), your domain is already registered (on Hostinger or elsewhere), and you're comfortable with SSH.

---

## 0. What you'll end up with

| Piece | Where it runs |
|---|---|
| React static build | `/home/checknbook/app/frontend/dist`, served by Nginx |
| Node API | systemd service `checknbook-api` on `127.0.0.1:4000` |
| PostgreSQL | local Postgres on `127.0.0.1:5432` |
| Public domain | `https://checknbook.yourdomain.com` (Nginx on 443) |
| SSL | Let's Encrypt (auto-renewed) |

Nginx routing:
- `/api/*` → proxies to `http://127.0.0.1:4000` (the Node API)
- everything else → serves `frontend/dist/index.html` (SPA)

---

## 1. Point the subdomain at the VPS

In **Hostinger hPanel → Domains → DNS / Name Servers** (or your DNS provider if the domain lives elsewhere), add:

| Type | Name | Points to | TTL |
|---|---|---|---|
| A | `checknbook` | `<your VPS public IP>` | 3600 |

Replace `checknbook` with whatever subdomain you want. Find your VPS IP in hPanel → VPS → Overview.

DNS takes a few minutes to propagate. Verify from your laptop:

```bash
nslookup checknbook.yourdomain.com
# Should return your VPS IP
```

Don't move on until this returns the VPS IP.

---

## 2. Initial server setup

SSH into the VPS as root (Hostinger gives you the command in hPanel → VPS → Overview):

```bash
ssh root@<vps-ip>
```

### 2a. Create a non-root user

```bash
adduser checknbook                 # set a password
usermod -aG sudo checknbook
rsync --archive --chown=checknbook:checknbook ~/.ssh /home/checknbook
su - checknbook
```

From this point on, run as `checknbook` (use `sudo` when needed).

### 2b. Update + firewall

```bash
sudo apt update && sudo apt upgrade -y
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw --force enable
sudo ufw status
```

---

## 3. Install runtime dependencies

### Node.js 20 + pnpm + build tools

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs build-essential git
sudo npm install -g pnpm
node -v   # should be v20.x
pnpm -v   # should be 9.x
```

### PostgreSQL 15

```bash
sudo apt install -y postgresql postgresql-contrib
sudo systemctl enable --now postgresql
```

### Nginx + Certbot

```bash
sudo apt install -y nginx certbot python3-certbot-nginx
sudo systemctl enable --now nginx
```

---

## 4. Create the production database

```bash
sudo -u postgres psql <<'SQL'
CREATE USER checknbook WITH PASSWORD 'REPLACE_WITH_A_STRONG_PASSWORD';
CREATE DATABASE checknbook OWNER checknbook;
GRANT ALL PRIVILEGES ON DATABASE checknbook TO checknbook;
SQL
```

Write the password down — you'll paste it into `.env` next.

Test the connection:

```bash
PGPASSWORD='REPLACE_WITH_A_STRONG_PASSWORD' psql -h 127.0.0.1 -U checknbook -d checknbook -c 'SELECT 1;'
```

---

## 5. Pull the code

```bash
cd ~
git clone <your-git-remote-url> app
cd app/backend && pnpm install && cd ../frontend && pnpm install && cd ..
```

> `backend` and `frontend` are independent apps, each with its own `package.json`/lockfile — install each separately.

> If you haven't pushed to a git remote yet, do that first (GitHub / GitLab / Hostinger Git). Alternatively, `scp -r` the folder from your laptop, but git is cleaner for future updates.

---

## 6. Production env vars

```bash
cp backend/.env.example backend/.env
nano backend/.env
```

Set:

```
DATABASE_URL="postgresql://checknbook:REPLACE_WITH_A_STRONG_PASSWORD@127.0.0.1:5432/checknbook?schema=public"
JWT_SECRET="<40+ char random string — e.g. from `openssl rand -hex 32`>"
PORT=4000
CORS_ORIGIN="https://checknbook.yourdomain.com"
```

And for the web build:

```bash
cp frontend/.env.example frontend/.env
nano frontend/.env
```

Set:

```
VITE_API_BASE_URL=https://checknbook.yourdomain.com
```

(Same origin — the web app fetches `/api/*` on its own domain; Nginx proxies that to the Node API. So the base URL is the public domain, not `localhost:4000`.)

---

## 7. Migrate + seed + build

```bash
# From ~/app
cd backend
pnpm prisma:migrate -- --name init     # creates tables
pnpm seed                               # sample data (remove later for real launch)
pnpm build                              # compiles TS → dist/
cd ../frontend
pnpm build                              # outputs frontend/dist
cd ..
```

Sanity check the API once, in the foreground:

```bash
cd backend
NODE_ENV=production node dist/index.js
# Another SSH window:
curl http://127.0.0.1:4000/health
# Ctrl-C to stop
```

---

## 8. Run the API under systemd

```bash
sudo cp ~/app/infra/systemd/checknbook-api.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now checknbook-api
sudo systemctl status checknbook-api     # should say "active (running)"
```

Tail the logs:

```bash
sudo journalctl -u checknbook-api -f
```

---

## 9. Configure Nginx

Copy the template and fill in the placeholders:

```bash
sudo cp ~/app/infra/nginx/checknbook.conf /etc/nginx/sites-available/checknbook
sudo nano /etc/nginx/sites-available/checknbook
```

Replace `${SUBDOMAIN}` with `checknbook.yourdomain.com` and `${WEB_ROOT}` with `/home/checknbook/app/frontend/dist`. Then:

```bash
sudo ln -s /etc/nginx/sites-available/checknbook /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default   # optional — removes the "Welcome to nginx" page
sudo nginx -t                                 # should say "syntax is ok"
sudo systemctl reload nginx
```

Visit `http://checknbook.yourdomain.com` (plain HTTP). You should see your React app. If you get `502 Bad Gateway`, the API isn't running — `sudo systemctl status checknbook-api`.

---

## 10. Add HTTPS with Let's Encrypt

```bash
sudo certbot --nginx -d checknbook.yourdomain.com
```

Follow the prompts:
- Enter an email (for expiry notices).
- Agree to ToS.
- Choose **redirect** when asked (forces HTTP → HTTPS).

Certbot edits your Nginx config to add the 443 listener and the cert paths. It also installs a systemd timer for auto-renewal — verify:

```bash
sudo systemctl list-timers | grep certbot
```

Visit **`https://checknbook.yourdomain.com`** — padlock should be green.

---

## 11. Smoke test

- Open the site, search a city + date → halls render.
- Click WhatsApp on a hall → `wa.me` opens with a pre-filled message.
- Log in as the seeded owner (`+919876500001` / `owner123`) → dashboard loads → toggle a date → it persists after refresh.
- `curl https://checknbook.yourdomain.com/health` → `{"ok":true}`.

---

## 12. Day-2 ops

### Deploying updates

```bash
cd ~/app
git pull
cd backend && pnpm install && pnpm build && pnpm prisma:migrate && cd ..   # if schema changed (uses `prisma migrate deploy` in prod ideally)
cd frontend && pnpm install && pnpm build && cd ..
sudo systemctl restart checknbook-api
# Nginx just serves the new dist/ — no restart needed.
```

> For production, prefer `prisma migrate deploy` (non-interactive) over `prisma migrate dev`. Update the script in `backend/package.json` when you're ready.

### Logs

```bash
sudo journalctl -u checknbook-api -f       # API
sudo tail -f /var/log/nginx/access.log     # web traffic
sudo tail -f /var/log/nginx/error.log
```

### Backups

Quick nightly Postgres dump (run under the `checknbook` user):

```bash
echo '0 3 * * * pg_dump -U checknbook -h 127.0.0.1 checknbook | gzip > /home/checknbook/backups/cnb-$(date +\%F).sql.gz' | crontab -
mkdir -p ~/backups
```

Keep the `.pgpass` file at `/home/checknbook/.pgpass` with `127.0.0.1:5432:checknbook:checknbook:YOUR_PASSWORD` (`chmod 600`) so `pg_dump` doesn't prompt.

Copy backups off the server periodically (rsync / rclone to B2 or S3).

---

## 13. Common pitfalls

- **Subdomain won't resolve** → wrong A record, or DNS hasn't propagated. `dig checknbook.yourdomain.com` tells the truth.
- **502 Bad Gateway** → API process not running. `sudo systemctl status checknbook-api`, check `journalctl -u checknbook-api -n 100`.
- **CORS errors in the browser** → `CORS_ORIGIN` in `backend/.env` must exactly match the public HTTPS origin (including `https://`, no trailing slash).
- **`DATABASE_URL not found`** → systemd didn't pick up the env file. Check `EnvironmentFile=` path in `/etc/systemd/system/checknbook-api.service` and that the file is readable by the `checknbook` user.
- **Password with special chars in DATABASE_URL** → URL-encode it. `@` → `%40`, `:` → `%3A`, `/` → `%2F`.
- **Certbot fails with "DNS problem"** → A record isn't pointing at this VPS yet. Wait for DNS, try again.
- **Firewall blocks the world** → if you can SSH but the site doesn't load, `sudo ufw status` must include `Nginx Full`.

---

## 14. Sharing it

Once the HTTPS site loads, the URL `https://checknbook.yourdomain.com` is what you share. That's it — no further steps.

For a quick "coming soon" splash while you polish, add a `maintenance.html` to `frontend/dist/` and in Nginx temporarily `return 503; error_page 503 /maintenance.html;`. Easy to roll in and out.
