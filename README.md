# CADARVIS — Sistema del Acueducto Rural de Villa Sombrero

Fase 1: usuarios con rangos, configuración, planes, clientes con ubicación y mapa de la red.

**No usa librerías externas**: solo Node.js. No hace falta `npm install`.

## Requisitos
- Node.js **22.13 o más nuevo** (`node -v`).

## Probar en tu PC (Windows, Linux o Mac)
```bash
node scripts/crear-superadmin.js eucar "Eucar Alvarez"   # pide la contraseña (mínimo 8)
npm start                                                  # abre http://localhost:3200
```
El mapa usa Leaflet. Con internet se carga solo. Para tener la copia local (recomendado en el servidor):
```bash
bash scripts/descargar-vendor.sh
```

## Variables
| Variable | Por defecto | Uso |
|---|---|---|
| `PORT` | `3200` | Puerto web |
| `DB_PATH` | `data/cadarvis.db` | Archivo de la base de datos |

## Pruebas
```bash
npm test
```

## Instalar en Oracle Cloud (sin tocar AuraPlay ni AuraSport)
1. Copiar el proyecto a `/opt/cadarvis` y crear un usuario propio:
   `sudo useradd -r -s /usr/sbin/nologin cadarvis && sudo chown -R cadarvis /opt/cadarvis`
2. Crear el superadmin: `cd /opt/cadarvis && sudo -u cadarvis node scripts/crear-superadmin.js eucar "Eucar Alvarez"`
3. Crear `/etc/systemd/system/cadarvis.service`:
   ```ini
   [Unit]
   Description=CADARVIS
   After=network.target

   [Service]
   User=cadarvis
   WorkingDirectory=/opt/cadarvis
   Environment=PORT=3200
   ExecStart=/usr/bin/node --disable-warning=ExperimentalWarning src/server.js
   Restart=always

   [Install]
   WantedBy=multi-user.target
   ```
   `sudo systemctl daemon-reload && sudo systemctl enable --now cadarvis`
4. Abrir el puerto **3200** en la *Security List* de la VCN de Oracle y en el firewall de la VM:
   `sudo iptables -I INPUT -p tcp --dport 3200 -j ACCEPT && sudo netfilter-persistent save`
5. **No** editar los servicios ni los archivos de Nginx de las otras apps. Si después se usa Nginx con dominio, crear un archivo de sitio **nuevo** solo para CADARVIS.

## Copia de seguridad
La base de datos es un solo archivo: `data/cadarvis.db`. Para copiarla en caliente:
`sqlite3 data/cadarvis.db ".backup data/respaldo-$(date +%F).db"` (la copia automática diaria llega en una fase posterior).
