# ERPC BC — ERP de Refacciones BC

ERP **web completo en Python (Flask + Waitress)** para la administración integral de **BC Refaccionarias**. Conexión directa a las bases **Microsip (Firebird/ODBC)** de cada empresa, multi-empresa con tema visual dinámico por marca (BC / RT), punto de venta, ventas, compras, almacén, resurtidos, administración y bot de WhatsApp.

## ¿Qué hace la aplicación?

| Módulo | Funcionalidad |
| --- | --- |
| **Login y roles** | Autenticación con sesión segura (12 h), control de acceso por rol/permisos (ADMIN / usuario) y por sucursal/vendedor. |
| **Tablero ejecutivo** | KPIs en tiempo real (venta del día, ticket promedio, piezas, existencias), ranking de sucursales, acceso rápido. |
| **Punto de Venta (POS)** | Pantalla de venta con clientes, crédito, listas de precios (público/talleres/mayoreo/mínimo), impresión de tickets, solicitud de traspasos a CEDIS y consulta de stock en red (BC + RENOHER). |
| **Ventas** | Consulta de tickets/ventas por día, período y vendedor; venta cruzada "revolución". |
| **Vendedores** | Comisiones, objetivos, resumen por vendedor. |
| **Almacén** | Existencias por sucursal, catálogo de artículos con equivalencias, stock en red (BC + RENOHER + Global Vehículos). |
| **Traspasos** | Generación de traspasos entre sucursales con folios de Microsip, validación de solicitudes desde POS. |
| **Cascos** | Traspasos urgentes/operativos de refacciones entre configuraciones. |
| **Compras** | Resurtidos y captura de compras, recepción de XML de proveedores, listas de precios, selección de proveedor. |
| **CIOSA** | Alta de compras de la campaña CIOSA con análisis automático de claves. |
| **Atención a proveedores** | Catálogo de proveedores con marcas, listas, excluidos globales y precio mínimo. |
| **Administración** | Informe de negocio (ventas, márgenes, formas de cobro, estatus), usuarios, sucursales. |
| **Configuración** | Gestión de empresas (alta, edición, logos, visibilidad), sincronización del catálogo de empresas desde Microsip, reinicio del servicio. |
| **Bot de WhatsApp** | Bot de presentación de contenidos interactivos a partir de `contenidos/` (versión administrador incorporada). |

## Arquitectura

- **Backend**: Python 3.12, Flask (blueprints modulares) + **Waitress** (WSGI multihilo, 8 hilos), servidor perpetuo autorrecuperable y autodetecta el puerto libre.
- **Datos**: 
  - `usuarios.db` (SQLite) — usuarios, sesiones, solicitudes de traspasos y cachés de alto rendimiento (resumen de almacenes, métricas globales).
  - **Microsip / Firebird** vía **pyodbc** (DSNs ODBC registrados en el servidor o conexión directa por archivo `.FDB`).
- **Frontend**: SPA en `index.html` (vanilla JS), **Tailwind CSS (CDN)** y **Chart.js**; tema dinámico por empresa (BC azul / RT rojo) desde variables CSS; gráficas generadas con la paleta de la marca.
- **Servidor de archivos**: compresión GZIP transparente (hasta 85 %), cabeceras de seguridad (nosniff, SAMEORIGIN, Referrer-Policy) y caché de estáticos.

### Estructura
```
├── server.py                     Entrada: arranca Waitress en 0.0.0.0:<puerto> (default 5000)
├── app/
│   ├── config.py                 Constantes, empresas (DEFAULT_EMPRESAS), credenciales Microsip seguras
│   ├── db.py                     SQLite + capa de conexión ODBC/Firebird centralizada
│   ├── routes/                   Blueprints modulares (auth, ventas, pv, compras, almacén, …)
│   ├── services/                 Motor de resurtidos, traspasos, compras, caché, impresión POS
│   └── __init__.py               create_app(): registro de blueprints, seguridad, GZIP, warmup
├── static/
│   ├── css/custom.css            Estilos del tema, barra superior, dropdowns
│   └── js/                       módulos por pantalla + app_core.js (núcleo SPA)
├── index.html                    Aplicación SPA completa
├── config_empresas.json          (NO versionado) definición de empresas con DSN/logo
├── config_empresas.example.json  Plantilla del archivo anterior
├── config_menu_sistema.json      Estructura del menú global (se edita desde Configuración)
├── proveedores.json              Proveedores, marcas, listas y markup de precios
├── usuarios.db                   (NO versionado) usuarios y cachés (generado al arrancar)
└── *.bat / *.vbs / .ps1 / .pyw   Scripts de operación (ver abajo)
```

## Requisitos

- Windows Server / PC con **Python 3.12**.
- **pyodbc** con driver **Firebird/InterBase(r) driver** y los DSNs ODBC de Microsip registrados en el equipo para cada sucursal (normalmente `basesmp`, `basesrenoher`, `basesRTT`, `GLOBALVEHICULOS`).
- Dependencias Python: `flask`, `flask-cors`, `waitress`, `pyodbc`, `openpyxl` (ver importaciones de cada módulo).
- Acceso de red a los servidores de Microsip (`File Server` / base Firebird, por ejemplo `192.168.1.127`).

## Arranque rápido

```bat
python server.py 5000
:: Alt + 1: iniciar_servidor_5000.bat   (abre navegador)
:: Alt + 2: INICIAR_SERVIDOR.bat
```

- URL: `http://localhost:5000` (o `http://<IP-de-la-PC>:5000` en la red local).
- Usuario inicial: **`admin` / `admin123`** (se crea automáticamente la primera vez).

### Instalación como servicio / arranque automático
- `INSTALAR_COMO_SERVICIO_BOOT.bat` — instala el arranque automático al iniciar Windows.
- `iniciar_oculto.vbs` / `perpetual_service.pyw` — lanzamiento en segundo plano sin consola.
- `ESTADO_SERVIDOR.bat` — comprueba si el puerto del servidor está activo.

> ⚠️ `DETENER_SERVIDOR.bat` detiene **todos** los procesos `python.exe` (incluye el Bot de WhatsApp en el puerto 8000). Para detener solo el ERP use el administrador de tareas sobre el PID de `server.py`.

## Configuración de empresas

Las empresas se definen en `config_empresas.json` (no versionado por contener rutas/DSNs de red). Su estructura está documentada en `config_empresas.example.json`:

```json
[
  {
    "id": "BC",
    "nombre": "BC Refacciones",
    "empresa_id": 1,
    "archivo": "",
    "dsn": "basesmp",
    "logo": "logo bc.png",
    "visible": true
  }
]
```

- Si el archivo no existe, se usan las `DEFAULT_EMPRESAS` de `app/config.py`.
- Desde **Configuración → Empresas** se sincroniza el catálogo oficial desde Microsip (`/api/config/empresas/sincronizar-microsip`).

### Credenciales de Microsip (seguridad)

Las credenciales de conexión a Microsip **no están en el código**. Se resuelven en este orden:

1. Variables de entorno: `MICROSIP_UID`, `MICROSIP_PWD`, `MICROSIP_SERVER` (server default `192.168.1.127`).
2. Archivo local `app/.microsip_conn.json` (no versionado):
   ```json
   { "uid": "SYSDBA", "pwd": "****", "server": "192.168.1.127" }
   ```
3. Si ninguna está disponible, las funciones de conexión lanzan un error claro (no se envía password en duro).

## Scripts auxiliares

| Script | Uso |
| --- | --- |
| `sincronizar_con_servidor.py` | Proyecta/actualiza tablas intermedias desde el servidor de Microsip. |
| `SINCRONIZAR_AHORA.bat` / `SINCRONIZAR_AUTOMATICO.bat` | Disparo manual / automático de la sincronización. |
| `SINCRONIZADOR_OCULTO.vbs` / `perpetual_service.py` | Sincronizador perpetuo en segundo plano. |
| `reiniciar_servidor_remoto.ps1` | Reinicio remoto del servicio ERP. |
| `ABRIR_NAVEGADOR_5000.bat` | Abre el navegador en el puerto 5000. |
| `HABILITAR_ACCESO_RED.bat` | Reglas de firewall de Windows para acceso desde la red. |
| `CONECTAR_RDP_SERVIDOR.bat` | Conexión de escritorio remoto al servidor principal. |

## Seguridad

- Contraseñas con hash (`werkzeug`, scrypt) en `usuarios.db`; sesiones HTTPOnly/`SameSite=Lax` con caducidad de 12 h.
- RBAC: rutas de administración requieren rol `ADMIN` o permiso `configuracion`.
- Cabeceras de seguridad por defecto en todas las respuestas.
- Secretos (password de Microsip, clave secreta de Flask, DSNs de producción) **excluidos del repositorio** vía `.gitignore`.
- Los backups de `usuarios.db` y el uso de tokens secretos quedan bajo responsabilidad del administrador.

## Pruebas

En la raíz existen verificaciones rápidas (`test_admin_negocio.py`, `test_endpoints_verification.py`, `test_both_modes.py`, `test_resurtidos_engine.py`, `test_revolucion.py`) que ejecutan consultas/clases contra los datos reales:

```bat
python test_endpoints_verification.py
```

## Repositorio

- Origen: `https://github.com/CarlosMtzMayorga/ERPC_BC.git` (rama `main`).
- Archivos versionados: código, SPA, estáticos, README y configuraciones sin secretos.
- No se versionan: `config_empresas.json`, `usuarios.db`, `.flask_secret`, `app/.microsip_conn.json`, `*.log`, `index.html.gz`.