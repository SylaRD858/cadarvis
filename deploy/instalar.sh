#!/bin/bash
# CADARVIS - instalador para Ubuntu (Oracle Cloud Always Free).
# Uso como cloud-init (user data) o: sudo bash instalar.sh
# Solo caracteres ASCII en este archivo.
set -euxo pipefail
exec > >(tee -a /var/log/cadarvis-instalar.log) 2>&1

REPO="${CADARVIS_REPO:-https://github.com/SylaRD858/cadarvis.git}"
DIR=/opt/cadarvis
DATA=/var/lib/cadarvis
export DEBIAN_FRONTEND=noninteractive

# 1) Paquetes: Node 22, git, sqlite3, caddy (HTTPS automatico)
apt-get update
apt-get install -y ca-certificates curl gnupg git sqlite3 debian-keyring debian-archive-keyring apt-transport-https
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
apt-get update
apt-get install -y caddy

# 2) Usuario y codigo
id cadarvis >/dev/null 2>&1 || useradd -r -m -d $DATA -s /usr/sbin/nologin cadarvis
mkdir -p $DATA/respaldos
# Reintenta hasta 60 minutos (por si el repo aun no es publico)
for i in $(seq 1 120); do
  [ -d $DIR/.git ] && break
  GIT_TERMINAL_PROMPT=0 git clone --depth 1 "$REPO" $DIR && break
  rm -rf $DIR; sleep 30
done
[ -d $DIR/.git ] || { echo "No se pudo descargar el codigo"; exit 1; }
bash $DIR/scripts/descargar-vendor.sh || true
chown -R cadarvis:cadarvis $DIR $DATA

# 3) Servicio de la app (puerto local 3200)
cat > /etc/systemd/system/cadarvis.service <<EOF
[Unit]
Description=CADARVIS
After=network.target

[Service]
User=cadarvis
WorkingDirectory=$DIR
Environment=PORT=3200
Environment=DB_PATH=$DATA/cadarvis.db
Environment=TRUST_PROXY=1
ExecStart=/usr/bin/node --disable-warning=ExperimentalWarning src/server.js
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

# 4) Actualizacion automatica desde GitHub cada 5 minutos
cat > /usr/local/bin/cadarvis-actualizar <<'EOF'
#!/bin/bash
cd /opt/cadarvis || exit 1
ANTES=$(git rev-parse HEAD)
sudo -u cadarvis git fetch --depth 1 origin main -q && sudo -u cadarvis git reset --hard origin/main -q
DESPUES=$(git rev-parse HEAD)
if [ "$ANTES" != "$DESPUES" ]; then
  [ -f public/vendor/leaflet/leaflet.js ] || sudo -u cadarvis bash scripts/descargar-vendor.sh || true
  systemctl restart cadarvis
  echo "$(date -Is) actualizado a $DESPUES" >> /var/log/cadarvis-actualizar.log
fi
EOF
chmod +x /usr/local/bin/cadarvis-actualizar
git config --system --add safe.directory $DIR

# 5) Respaldo de la base de datos cada hora (se guardan 7 dias)
cat > /usr/local/bin/cadarvis-respaldo <<'EOF'
#!/bin/bash
DB=/var/lib/cadarvis/cadarvis.db
[ -f $DB ] || exit 0
sudo -u cadarvis sqlite3 $DB ".backup /var/lib/cadarvis/respaldos/cadarvis-$(date +%Y%m%d-%H).db"
find /var/lib/cadarvis/respaldos -name 'cadarvis-*.db' -mtime +7 -delete
EOF
chmod +x /usr/local/bin/cadarvis-respaldo
# Temporizadores de systemd (no dependen de que cron este instalado)
rm -f /etc/cron.d/cadarvis
cat > /etc/systemd/system/cadarvis-actualizar.service <<'EOF'
[Unit]
Description=CADARVIS - actualizar desde GitHub
[Service]
Type=oneshot
ExecStart=/usr/local/bin/cadarvis-actualizar
EOF
cat > /etc/systemd/system/cadarvis-actualizar.timer <<'EOF'
[Unit]
Description=CADARVIS - actualizar cada 5 minutos
[Timer]
OnBootSec=2min
OnUnitActiveSec=5min
[Install]
WantedBy=timers.target
EOF
cat > /etc/systemd/system/cadarvis-respaldo.service <<'EOF'
[Unit]
Description=CADARVIS - respaldo de la base de datos
[Service]
Type=oneshot
ExecStart=/usr/local/bin/cadarvis-respaldo
EOF
cat > /etc/systemd/system/cadarvis-respaldo.timer <<'EOF'
[Unit]
Description=CADARVIS - respaldo cada hora
[Timer]
OnCalendar=*-*-* *:07:00
Persistent=true
[Install]
WantedBy=timers.target
EOF

# 6) HTTPS con Caddy usando sslip.io (necesario para el GPS del celular)
IP=$(curl -fsS https://ifconfig.me || curl -fsS https://api.ipify.org)
DOMINIO="$(echo $IP | tr '.' '-').sslip.io"
cat > /etc/caddy/Caddyfile <<EOF
$DOMINIO {
  encode gzip
  reverse_proxy 127.0.0.1:3200
}
EOF
echo "$DOMINIO" > /etc/cadarvis-dominio

# 7) Firewall de la VM (Ubuntu en Oracle trae iptables cerrado)
iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT || true
iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT || true
netfilter-persistent save || true

systemctl daemon-reload
systemctl enable --now cadarvis
systemctl enable --now cadarvis-actualizar.timer cadarvis-respaldo.timer
systemctl restart caddy
echo "CADARVIS listo en https://$DOMINIO"
