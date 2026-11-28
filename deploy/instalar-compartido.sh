#!/bin/bash
# CADARVIS - instalacion en una maquina que YA tiene otra app con Node y Caddy (ej. AuraSport).
# No reinstala Node ni Caddy, no toca la otra app. Solo agrega un sitio nuevo a Caddy.
# Uso: sudo bash instalar-compartido.sh
# Solo caracteres ASCII en este archivo.
set -euo pipefail
exec > >(tee -a /var/log/cadarvis-instalar.log) 2>&1

REPO="${CADARVIS_REPO:-https://github.com/SylaRD858/cadarvis.git}"
DIR=/opt/cadarvis
DATA=/var/lib/cadarvis
PORT=3200

command -v node >/dev/null || { echo "Falta Node en esta maquina"; exit 1; }
command -v caddy >/dev/null || { echo "Falta Caddy en esta maquina"; exit 1; }
if ss -ltn | grep -q ":$PORT "; then
  systemctl is-active --quiet cadarvis || { echo "El puerto $PORT esta ocupado por otra app"; exit 1; }
fi

# 1) Paquetes pequenos que no afectan a otras apps
command -v sqlite3 >/dev/null || { apt-get update -q; DEBIAN_FRONTEND=noninteractive apt-get install -y -q sqlite3; }
command -v git >/dev/null || { apt-get update -q; DEBIAN_FRONTEND=noninteractive apt-get install -y -q git; }

# 2) Usuario y codigo
id cadarvis >/dev/null 2>&1 || useradd -r -m -d $DATA -s /usr/sbin/nologin cadarvis
mkdir -p $DATA/respaldos
[ -d $DIR/.git ] || git clone --depth 1 "$REPO" $DIR
git config --system --add safe.directory $DIR || true
bash $DIR/scripts/descargar-vendor.sh || true
chown -R cadarvis:cadarvis $DIR $DATA

# 3) Servicio propio (con limite de memoria para no afectar a la otra app)
cat > /etc/systemd/system/cadarvis.service <<EOF
[Unit]
Description=CADARVIS
After=network.target

[Service]
User=cadarvis
WorkingDirectory=$DIR
Environment=PORT=$PORT
Environment=DB_PATH=$DATA/cadarvis.db
Environment=TRUST_PROXY=1
ExecStart=$(command -v node) --disable-warning=ExperimentalWarning --max-old-space-size=160 src/server.js
Restart=always
RestartSec=3
MemoryMax=220M

[Install]
WantedBy=multi-user.target
EOF

# 4) Actualizacion automatica y respaldos
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
cat > /usr/local/bin/cadarvis-respaldo <<'EOF'
#!/bin/bash
DB=/var/lib/cadarvis/cadarvis.db
[ -f $DB ] || exit 0
sudo -u cadarvis sqlite3 $DB ".backup /var/lib/cadarvis/respaldos/cadarvis-$(date +%Y%m%d-%H).db"
find /var/lib/cadarvis/respaldos -name 'cadarvis-*.db' -mtime +7 -delete
EOF
chmod +x /usr/local/bin/cadarvis-actualizar /usr/local/bin/cadarvis-respaldo
cat > /etc/cron.d/cadarvis <<'EOF'
*/5 * * * * root /usr/local/bin/cadarvis-actualizar
7 * * * * root /usr/local/bin/cadarvis-respaldo
EOF

systemctl daemon-reload
systemctl enable --now cadarvis
sleep 2
curl -fsS http://127.0.0.1:$PORT/api/salud

# 5) Sitio nuevo en Caddy (subdominio propio). Copia de seguridad y validacion antes de recargar.
IP=$(curl -fsS https://ifconfig.me || curl -fsS https://api.ipify.org)
DOMINIO="cadarvis.$(echo $IP | tr '.' '-').sslip.io"
CF=/etc/caddy/Caddyfile
if ! grep -q "^$DOMINIO" $CF; then
  cp -a $CF $CF.antes-cadarvis
  printf '\n%s {\n  encode gzip\n  reverse_proxy 127.0.0.1:%s\n}\n' "$DOMINIO" "$PORT" >> $CF
  if caddy validate --config $CF --adapter caddyfile; then
    systemctl reload caddy 2>/dev/null || caddy reload --config $CF --adapter caddyfile
  else
    echo "Configuracion de Caddy invalida, restaurando la anterior"
    cp -a $CF.antes-cadarvis $CF
    exit 1
  fi
fi
echo "$DOMINIO" > /etc/cadarvis-dominio
echo "CADARVIS listo en https://$DOMINIO"
