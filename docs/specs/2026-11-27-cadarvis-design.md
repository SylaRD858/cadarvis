# CADARVIS — Sistema del Acueducto Rural de Villa Sombrero
Documento de diseño · 27/11/2026

## 1. Qué es y por qué
CADARVIS es el sistema principal del acueducto rural de Villa Sombrero. Reemplaza el manejo manual de abonados, facturas, cobros, averías e inventario, y pone la red (acometidas, válvulas, hidrantes, etc.) en un mapa.

Debe estar disponible **24/7**. **Aunque se caiga el internet, se debe poder seguir cobrando e imprimiendo.**

## 2. Objetivos
- Registrar clientes con su ubicación marcada en el mapa.
- Planes con precio mensual fijo y facturación automática mensual.
- Cobro en caja con recibo térmico (80 mm y 58 mm) y factura en carta o PDF.
- Acuerdos de pago (deuda dividida en cuotas).
- Averías: reporte, asignación, materiales usados y estados.
- Inventario con entradas, salidas, existencia mínima e historial.
- Mapa de la red con tipos de punto configurables.
- Staff con rangos y permisos.
- Portal de clientes: consultar facturas y reportar averías.
- Trabajar sin internet y sincronizar al volver la conexión.

## 3. Fuera de alcance por ahora
- **NCF/DGII:** se deja el espacio en la configuración (apagado). Se activa cuando haya datos de la empresa.
- **Pagos en línea** desde el portal.
- **Lectura de medidores:** no hay medidores. Todo es tarifa fija.
- **Apps nativas:** es una web instalable (PWA) en PC y celular.

## 4. Lo que haría que fracase aunque "funcione"
- Que no se pueda cobrar cuando no hay internet.
- Números de recibo duplicados entre cajas, o pagos perdidos o duplicados al sincronizar.
- Que un cliente vea datos de otro en el portal.
- Afectar AuraPlay o AuraSport en el servidor de Oracle.
- Usar servicios de pago (todo debe ser gratis).

## 5. Restricciones
- Hosting: **Oracle Cloud Always Free** (la misma VM), aislado de las otras apps: su propia carpeta, su propio puerto, su propio servicio y su propia base de datos.
- Código en GitHub (cuenta SylaRD858, repo privado `cadarvis`).
- Instalación limpia: **un solo superusuario**, sin datos de ejemplo.
- Moneda RD$. Interfaz en español. Zona horaria America/Santo_Domingo.

## 6. Enfoques considerados
| Enfoque | A favor | En contra |
|---|---|---|
| **A. Nube + copia local en cada equipo (elegido)** | Gratis; cobra sin internet en oficina y en la calle; sin equipo que mantener | Sin internet, una caja no ve los pagos que hizo otra hasta sincronizar |
| B. Servidor local en la oficina + copia en la nube | Las cajas de la oficina se ven entre sí sin internet | Hay que comprar el equipo, tenerlo 24/7 con UPS, y la calle se queda sin sistema |
| C. Las dos combinadas | Lo más robusto | Complejo y caro de mantener |

**Elegido: A**, por Eucar.

## 7. Arquitectura (decisiones técnicas: mi propuesta)
- **Servidor:** Node.js + Express + **SQLite** (un archivo, con copia de seguridad diaria). Es suficiente para un acueducto rural y no gasta recursos de la VM.
- **Cliente:** PWA en HTML/JS sin framework pesado. **Service Worker** para que la app abra sin internet e **IndexedDB** como base local.
- **Mapa:** Leaflet (incluido en el proyecto, no por CDN) con dos capas de fondo gratis: calles (OpenStreetMap) y satélite (Esri World Imagery). Las zonas ya vistas quedan guardadas en el equipo para usarlas sin internet.
- **Impresión:** desde el navegador con hojas de estilo de impresión. Térmica a 80/58 mm; carta para la factura. El PDF se saca con "Guardar como PDF", que funciona sin internet.
- **Servidor web:** el proceso corre como servicio `systemd` en su propio puerto (p. ej. 3200), con Nginx solo si ya existe, en un bloque separado. No se toca nada de las otras apps.

### 7.1 Trabajo sin conexión y sincronización
- Cada equipo que cobra se registra como **caja** y recibe una **serie** propia: R1, R2… Los recibos se numeran R1-000001 y siguen en orden **en ese equipo**, con o sin internet. Así nunca se repiten números.
- Cada operación creada en el equipo (pago, avería, punto de mapa, cliente nuevo, salida de inventario) lleva un **ID único generado en el equipo** y entra a una **cola de salida**. Al haber conexión, la cola se envía. El servidor ignora los IDs repetidos, así que reenviar nunca duplica.
- **Los pagos nunca se editan ni se borran:** se anulan con una operación de anulación (requiere permiso y motivo). Por eso no puede haber conflictos de pagos.
- Ediciones de datos (cliente, punto de mapa): gana la última, y queda registro en la bitácora con el valor anterior.
- El equipo descarga periódicamente clientes, planes, facturas pendientes, saldos e inventario para tener todo a mano sin internet.
- Si un cliente tiene pagos de otra caja pendientes de sincronizar, la caja no lo puede saber. Si el equipo lleva más de X horas sin sincronizar, se muestra el aviso "Datos de hace X horas".
- Indicador visible en todo momento: En línea / Sin conexión · N operaciones pendientes.
- **Inicio de sesión sin internet:** solo para usuarios que ya iniciaron sesión con internet en ese equipo (se guarda un hash local). El cierre de caja se puede hacer sin internet y se sube después.

## 8. Módulos

### 8.1 Clientes (abonados)
Código de cliente (automático, p. ej. C-00001), nombre, cédula, teléfono(s), dirección o sector, plan, fecha de alta, estado (activo, suspendido, cortado, retirado), notas, y **ubicación en el mapa** (se toca el mapa o se usa el GPS). Se puede ligar a una o más acometidas. La ficha incluye el historial de facturas, pagos, acuerdos y averías.

### 8.2 Planes y facturación
- Planes con nombre y precio mensual (Residencial, Comercial, etc.).
- Generación mensual automática el **día configurable**: una factura por cliente activo, con su número (F-AAAAMM-00001). La genera el servidor, que está 24/7. También se puede generar a mano.
- **Cargos extra** configurables (reconexión, instalación de acometida, cambio de llave…): se agregan a la próxima factura o se cobran en el momento.
- **Mora** (opcional): recargo fijo o en % después de N días de atraso. Se aplica una vez por factura vencida.
- **Pagos parciales:** se aplican primero a lo más viejo.
- **Saldo a favor:** si alguien paga de más, se guarda y se aplica a la próxima factura.

### 8.3 Acuerdos de pago
- Se toma la deuda seleccionada y se congela en un acuerdo con monto, número de cuotas, frecuencia (mensual) y fecha de inicio.
- Las facturas incluidas pasan a "en acuerdo" y dejan de generar mora.
- Cada cuota se cobra como una línea más en la factura mensual, o se paga suelta en caja (configurable por acuerdo).
- Si el cliente acumula N cuotas vencidas (configurable), el acuerdo pasa a **incumplido** y la deuda restante vuelve a quedar como deuda normal.

### 8.4 Caja y cobro
- Buscar por código, nombre, cédula o teléfono. Se ve el saldo, las facturas pendientes y las cuotas.
- Formas de pago: efectivo, transferencia y cheque (con referencia).
- Se imprime un **recibo térmico** automáticamente o con un botón. Se puede reimprimir (marcado "COPIA").
- **Factura en carta/PDF** desde la ficha del cliente o desde la lista de facturas.
- **Cierre de caja:** cada cajero cierra su turno con los totales por forma de pago, el efectivo contado y la diferencia. Se imprime en térmica o en carta.

### 8.5 Averías
- Las crea el personal o el **portal de clientes**.
- Datos: tipo (fuga, sin servicio, baja presión, tubo roto, otro), descripción, fotos, **punto en el mapa**, cliente relacionado (opcional), prioridad, técnico asignado y estado (nueva, asignada, en proceso, resuelta, cerrada).
- Materiales usados: se eligen del inventario y **se descuentan automáticamente**.
- Fotos de antes y después. Las fotos se comprimen en el equipo antes de subirse.

### 8.6 Inventario
Artículos (código, nombre, unidad, existencia, mínimo, costo). Movimientos: entrada (compra), salida (avería, instalación, otro) y ajuste. Alerta cuando un artículo baja del mínimo. Historial por artículo.

### 8.7 Mapa de la red
- Tipos de punto que se pueden configurar, cada uno con su ícono y color. Vienen precargados: Cliente, Acometida, Válvula, Hidrante, Tanque, Pozo, Bomba, Avería.
- Cada punto tiene nombre o código, datos del tipo (p. ej. diámetro o estado de la válvula), notas y fotos.
- Filtros por tipo, búsqueda, y vista de calles o satélite.
- Opcional en v1: **tramos de tubería** como líneas (diámetro, material).

### 8.8 Staff y rangos
- Rangos predefinidos (sus permisos se pueden editar): **Superadmin, Administrador, Cajero, Técnico, Almacén**. Se pueden crear rangos nuevos.
- Los permisos son por acción (p. ej. `pagos.anular`, `facturas.generar`, `config.editar`).
- **Bitácora** de acciones importantes: quién hizo qué, cuándo y desde qué caja.

### 8.9 Portal de clientes
- Ruta separada, `/portal`, con diseño para celular.
- Se entra con **cédula + código de cliente** (impreso en facturas y recibos). Tiene límite de intentos.
- Muestra saldo, facturas pendientes y pagadas (con descarga en PDF), las cuotas del acuerdo, y permite **reportar una avería** (descripción, foto, ubicación por GPS) y seguir su estado.
- Requiere internet. No usa la copia local.

### 8.10 Configuración
Datos de la empresa (nombre, RNC, dirección, teléfono, logo), día de facturación, mora, cargos extra, ancho de la térmica, texto al pie del recibo, cajas y series, tipos de punto del mapa, rangos y permisos, y NCF (apagado por ahora).

### 8.11 Reportes
Cobros por día, cajero y forma de pago; morosos (con antigüedad de la deuda); facturación del mes; acuerdos activos e incumplidos; averías por estado y por tiempo de resolución; inventario bajo mínimo. Se pueden exportar a CSV.

## 9. Seguridad y respaldo
- Contraseñas con hash (scrypt). Sesiones con token y expiración.
- HTTPS (Let's Encrypt gratis) cuando haya dominio. Mientras tanto, la IP.
- Copia diaria del archivo SQLite con 30 días de historial. Opcionalmente se sube al almacenamiento gratis de Oracle.

## 10. Diseño visual
Colores del logo: azul agua, celeste y el ocre del sombrero como acento. Logo de CADARVIS en el encabezado, el recibo, la factura y el portal. Botones grandes en caja para que se pueda cobrar rápido.

## 11. Orden de entrega propuesto
1. Base: servidor, usuarios y rangos, configuración, clientes y planes, mapa con clientes.
2. Facturación mensual, caja, recibo térmico y factura carta/PDF, cierre de caja.
3. Modo sin internet y sincronización.
4. Acuerdos de pago y mora.
5. Averías e inventario.
6. Mapa de la red completo.
7. Portal de clientes.
8. Reportes, despliegue en Oracle y respaldos.

## 12. Decisiones que tomé yo (revisar)
- Stack: Node + Express + SQLite + PWA sin framework, con Leaflet.
- Series de recibo por caja para cobrar sin internet.
- Los pagos solo se anulan, nunca se editan.
- Portal con cédula + código de cliente, no solo con cédula.
- Mora y cargos extra configurables y apagables.
- El acuerdo incumplido devuelve la deuda a normal.
- Formato de números: C-00001, F-AAAAMM-00001, R1-000001.

## 13. Lo que queda a criterio del programador
Nombres internos, estructura de carpetas, librerías menores y detalles de la interfaz dentro de este diseño.
