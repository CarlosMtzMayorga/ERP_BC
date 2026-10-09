# ERPC BC — ERP de Refacciones BC

ERP **web completo en Python (Flask + Waitress)** y **App Móvil de Repartidores (Flutter/Android)** para la administración logística y operativa integral de **BC Refaccionarias**. Conexión directa a las bases **Microsip (Firebird/ODBC)** de cada empresa, arquitectura multi-empresa con tema visual dinámico por marca (BC / RT), punto de venta touch con doble tira informativa, control de embarques con empaque foliado y tracking satelital/móvil en ruta.

---

## 🚀 ¿Qué hace la aplicación?

| Módulo | Funcionalidad |
| --- | --- |
| **Login y roles** | Autenticación con sesión segura (12 h), control de acceso granular por rol y permisos (ADMIN, compras, almacén, ventas, repartidores) y redirección automática según perfil. |
| **Tablero ejecutivo** | KPIs en tiempo real (venta del día, ticket promedio, piezas, existencias), ranking de sucursales con escala de color proporcional y acceso rápido a módulos. |
| **Punto de Venta (POS)** | Pantalla de mostrador con diseño en **dos tiras**: tira superior para cliente y cambio rápido; tira inferior para condiciones comerciales y 4 tarjetas de saldo adaptativas sin cortes (`LÍMITE CRÉDITO`, `SALDO VENCIDO`, `SALDO ACTUAL`, `DISPONIBLE`). Impresión térmica POS-80C y consulta cruzada de stock. |
| **Almacén y Embarques** | Control de existencias por sucursal, catálogo con equivalencias y el nuevo submódulo de **Embarques y Empaque de Mercancía**: detección de traspasos pendientes en Microsip, empaque por cajas foliadas (`10001-1`, `10001-2`), pistolas USB y generación de etiquetas con código de barras Code128. |
| **App Móvil Repartidores** | Aplicación nativa en **Flutter (Dart)** para choferes: escaneo de cajas por cámara, validación de carga en camión, seguimiento de ruta y confirmación de entrega en sucursal con firma digital. |
| **Ventas y Comisiones** | Consulta de tickets y facturas por período/vendedor; comisiones y objetivos calculados en tiempo real. |
| **Traspasos y Cascos** | Despacho de mercancía entre CEDIS y tiendas con validación contra Microsip. Control de cascos y traspasos de urgencia. |
| **Compras y Resurtidos** | Sugerencias de resurtido automático según demanda y máximos/mínimos; importación de facturas XML (CFDI 3.3/4.0), integración con CIOSA y listas de precios. |
| **Administración y Menús** | Configuración de empresas, asignación granular de submódulos por usuario, sincronización de sucursales y auditoría del sistema. |
| **Bot de WhatsApp** | Consulta de catálogos y atención al cliente integrada con backend local. |

---

## 📦 Estructura del Proyecto

```
├── server.py                         Entrada ERP: servidor Waitress multihilo (puerto 5000)
├── index.html                        SPA web principal con Tailwind CSS y Chart.js
├── favicon.ico                       Favicon raíz corporativo
├── app/
│   ├── config.py                     Configuraciones, DSNs y resolución de credenciales Microsip
│   ├── db.py                         Gestor de SQLite y capa de conexión ODBC Firebird
│   ├── routes/
│   │   ├── auth_routes.py            Autenticación, tokens y sesiones
│   │   ├── embarques_routes.py       API REST de embarques, cajas, tracking y traspasos pendientes
│   │   ├── pv_routes.py              Punto de venta, clientes, crédito y pedidos
│   │   ├── almacen_routes.py         Existencias, catálogo y traspasos
│   │   ├── compras_routes.py         Recepción, XML y resurtidos
│   │   └── dashboard_routes.py       Métricas y analíticas
│   └── services/                     Motores de negocio (resurtidos, impresoras, caché)
├── app_repartidores/                 📱 Aplicación Móvil para Choferes (Flutter)
│   ├── lib/
│   │   ├── main.dart                 Punto de entrada de la aplicación móvil
│   │   ├── models/                   Modelos de datos (Embarque, Caja, Chofer)
│   │   ├── screens/                  Pantallas (Login, Dashboard, Escáner, Ruta, Entrega, Servidor)
│   │   ├── services/                 Cliente API REST y persistencia local
│   │   └── theme/                    Tema corporativo BC Refaccionarias
│   └── pubspec.yaml                  Dependencias (mobile_scanner, http, shared_preferences)
├── static/
│   ├── css/custom.css                Estilos del sistema y variables de tema por marca
│   ├── img/favicon/                  Paquete completo de favicons y web manifest
│   └── js/
│       ├── app_core.js               Núcleo SPA, ruteo y gestión de permisos
│       ├── modulo_embarques.js       Lógica de empaque, escaneo de cajas y tracking
│       ├── modulo_pv.js              Lógica de caja, crédito de clientes y cotizaciones
│       └── ...                       Módulos JavaScript específicos
└── *.bat / *.ps1                     Scripts de automatización y arranque
```

---

## 🛠️ Requisitos del Sistema

1. **Servidor ERP Web:**
   - Windows 10/11 o Windows Server con **Python 3.12+**.
   - Driver ODBC de Firebird/InterBase instalado y configurado con los DSNs correspondientes (`basesmp`, etc.).
   - Dependencias Python: `flask`, `waitress`, `pyodbc`, `requests`, `openpyxl`, `playwright`.

2. **App Móvil de Repartidores (`app_repartidores`):**
   - Dispositivos Android 8.0+ (probado y optimizado en Samsung Galaxy S25 Ultra y terminales de reparto).
   - SDK de Flutter 3.20+ con Dart 3+.

---

## ⚡ Guía de Arranque

### 1. Iniciar el Servidor ERP

```bat
:: Iniciar servidor en el puerto 5000 (red local y localhost)
python server.py 5000

:: O mediante el script de arranque rápido:
INICIAR_SERVIDOR.bat
```
- Acceso local: `http://localhost:5000`
- Acceso en red local: `http://192.168.1.12:5000`
- Usuario inicial administrador: **`admin` / `admin123`**

### 2. Ejecutar / Compilar la App Móvil de Repartidores

```bat
cd app_repartidores

:: Instalar dependencias
flutter pub get

:: Ejecutar en dispositivo conectado (USB o Wi-Fi)
flutter run

:: Compilar APK final para instalación manual
flutter build apk --release
```

---

## 🚚 Submódulo de Embarques y Empaque

Diseñado para sincronizar el almacén central (CEDIS) con las sucursales y la flota de choferes:
1. **Detección Automática:** Consulta en tiempo real los documentos de traspaso generados en Microsip (`DOCTOS_IN`) no despachados.
2. **Empaque Guiado:** Lectura por código de barras de cada pieza para asegurar que no falte ni sobre producto.
3. **Cajas Foliadas:** Agrupación en bultos (`Folio-1`, `Folio-2`) con etiquetas térmicas de código de barras.
4. **Salida con Chofer:** Asignación del embarque al chofer y cambio de estatus a `EN_TRANSITO`.
5. **Recepción en Tienda:** Confirmación mediante escaneo en destino para cerrar el ciclo a `RECIBIDO`.

---

## 🔐 Seguridad y Buenas Prácticas

- Contraseñas protegidas mediante algoritmos modernos `scrypt` (`werkzeug.security`).
- Credenciales de base de datos Microsip cargadas dinámicamente desde variables de entorno o archivo protegido no versionado (`app/.microsip_conn.json`).
- Archivos `.db`, credenciales privadas, instaladores y cachés temporales estrictamente excluidos en `.gitignore`.

---

## 📄 Repositorio Oficial
- Repositorio: `https://github.com/CarlosMtzMayorga/ERPC_BC.git`
- Rama principal: `main`