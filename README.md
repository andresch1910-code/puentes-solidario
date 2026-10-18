# 🤝 Puente Solidario Panamá

Plataforma comunitaria para emergencias: conecta a **familias afectadas** con **donantes**, **voluntarios**, **centros de acopio y albergues** e **información oficial**. Está inspirada en [Red de Ayuda Panamá](https://www.redayudapanama.org) y suma lo mejor de otras plataformas humanitarias.

Funciona en **Windows, macOS y Linux**. Es una aplicación web que se abre en cualquier navegador y también se puede **instalar como app** (PWA) en computadoras y celulares.

---

## ▶️ Cómo iniciarla

**Requisito único:** [Node.js](https://nodejs.org) versión **22.13 o superior** (descarga la versión LTS).

| Sistema | Pasos |
|---|---|
| **Windows** | Doble clic en `iniciar-windows.bat` |
| **macOS** | Doble clic en `iniciar-mac.command` (la primera vez: clic derecho → Abrir). Si no abre, en Terminal: `chmod +x iniciar-mac.command` |
| **Cualquiera (terminal)** | `npm install` y luego `npm start` |

Se abrirá **http://puentesolidario.localhost:3737** (un nombre propio y un puerto distinto, para no confundirla con otros proyectos que usen `localhost:3000`). Chrome, Edge y Firefox abren esa dirección sin configurar nada; si tu navegador no la reconoce (por ejemplo Safari), usa **http://127.0.0.1:3737**. La consola también muestra una dirección de red local (ej. `http://192.168.0.9:3737`) para probarla desde un celular conectado al mismo wifi.

**Instalar como app:** en Chrome o Edge, ícono de instalar en la barra de direcciones. En Safari (Mac/iPhone): Compartir → Agregar al Dock / a pantalla de inicio.

### Cuentas de prueba (modo demostración)

La primera vez se cargan datos **ficticios** de demostración:

| Rol | Correo | Contraseña |
|---|---|---|
| Administración | `admin@puentesolidario.test` | `Admin2026!` |
| Coordinación | `coordinador@puentesolidario.test` | `Coord2026!` |
| Voluntaria / donante | `voluntaria@puentesolidario.test` | `Volun2026!` |

Las solicitudes de demo (`PA-DEMOA`, `PA-DEMOB`…) se abren en **Mi solicitud** con el PIN `123456`.

```bash
npm run seed                          # borra todo y recarga la demo
node server/seed.js --reset --empty   # base limpia, solo con la cuenta admin (cambia su contraseña)
```

---

## 🧩 Qué hace

### Para familias afectadas
- **Necesito ayuda**: formulario guiado (ubicación, afectación, hogar, necesidades con cantidades, contacto, Yappy/ACH, fotos).
- **Funciona sin señal**: si no hay internet, la solicitud se guarda en el teléfono y se envía sola al volver la conexión.
- **Fotos comprimidas** en el teléfono antes de enviarlas (ahorra datos).
- **Mi solicitud** con código + PIN: ver estado, responder al coordinador, agregar necesidades, **confirmar lo que recibió** y activar o quitar el contacto por WhatsApp.

### Para donantes
- Listado de **familias verificadas** ordenado por **prioridad justa** (gravedad, vulnerabilidad, niños, cuánto ha recibido y cuánto lleva esperando).
- **Donación directa** al Yappy/ACH de la familia (la plataforma **no toca dinero**). Los datos de pago solo se muestran a personas con cuenta y cada consulta queda auditada.
- **Comprar artículos** en tiendas (Novey, Cochez…) con retiro en sucursal y registro de factura.
- **Transparencia**: cada aporte registrado puede ser **confirmado por la familia**.

### Para voluntarios
- **“Yo lo llevo”**: compromiso de entrega por 48 h, para que dos personas no lleven lo mismo.
- **Registro de visitas** (jornadas) con personas atendidas, horas, ayuda llevada y qué sigue faltando.
- **Mapa de cobertura**: distritos con familias y sin visitas, con necesidades pendientes o cubiertos.
- **Misiones** con cupos, punto de encuentro y habilidades requeridas, **recomendadas según tu perfil**.
- **Mi panel**: tu impacto (personas atendidas, horas, aportes), tus compromisos y familias cerca de ti.

### Centros y albergues
Centros de acopio (con lo que **necesitan** y lo que **tienen de sobra**), albergues con **ocupación/capacidad**, puntos de entrega, puestos de salud, puntos de agua y de carga/wifi. Cualquiera puede sugerir uno; se publica al verificarlo un coordinador.

### Información oficial
- **Avisos** publicados por coordinadores **con fuente oficial y enlace obligatorio** (SINAPROC, MINSA, IMHPA…), por nivel y provincia.
- **Sismos en tiempo real** del USGS (Panamá y alrededores), también en el mapa.
- Directorio de **fuentes oficiales**, **números de emergencia** (911, 103, 104) y **guías** (después de un sismo, agua segura, evitar estafas, mochila de emergencia).

### Para coordinadores
- Cola de verificación con **datos privados**, fotos de cédula, **detección de cédulas repetidas** y mensajes con la familia.
- Verificar / pedir más información / no validar / marcar atendida (con nota obligatoria cuando corresponde).
- Moderar **necesidades escritas por familias** (asociarlas al catálogo para no ensuciarlo), fotos, visitas y centros.
- Gestión de usuarios y roles, **auditoría completa** y **exportación CSV** para coordinar con autoridades.

---

## 🌎 Lo mejor de cada plataforma

| Idea | Inspirada en | Cómo está aquí |
|---|---|---|
| Ayuda directa sin intermediarios, verificación humana, código + PIN | Red de Ayuda Panamá | Igual, más confirmación de recepción por la familia |
| Mapa de crisis con capas | Ushahidi | Capas: familias, centros, visitas y sismos |
| “Reclamar” un caso para evitar duplicar esfuerzos | Crisis Cleanup | “Yo lo llevo” con vencimiento a 48 h |
| Estado verificado y marca de tiempo visibles | Verificado 19S (México) | Estado, “verificada hace X” y auditoría |
| Voluntariado por habilidades y disponibilidad | VolunteerMatch, PonteEnAlgo | Perfil de habilidades y misiones recomendadas |
| Inventario de centros de acopio y albergues | Sahana Eden | Necesita / tiene de sobra / ocupación |
| Pedir u ofrecer ayuda de forma simple | AyudaPy (Paraguay) | Formulario guiado, reporte por terceros |
| Transparencia de donaciones | GlobalGiving | Montos registrados y confirmados por cada familia |
| Información oficial con fuente | ReliefWeb / SINAPROC | Avisos con fuente obligatoria y datos del USGS |

---

## 🔒 Privacidad y seguridad

- Públicamente **solo** se muestra el apellido, la comunidad, la historia (revisada) y las necesidades. Cédulas, teléfonos, direcciones, fotos de documentos y datos de pago solo los ven coordinadores.
- El mapa muestra **comunidades redondeadas a ~1 km**, nunca viviendas.
- Contraseñas y PIN con **scrypt**; tokens firmados con HMAC; bloqueo tras 5 intentos fallidos de PIN.
- Límite de peticiones, validación de imágenes (tipo y contenido), cabeceras de seguridad y CSP estricta.
- Cada acción sensible (ver datos de pago, ver cédula, verificar, exportar) queda en la **auditoría**.

---

## 🏗️ Arquitectura

```
server/            Backend Node.js + Express
  index.js         servidor, seguridad, archivos estáticos
  db.js            SQLite integrado en Node (node:sqlite), esquema
  security.js      contraseñas, tokens, límites, imágenes
  catalog.js       provincias/distritos, necesidades, habilidades, fuentes oficiales
  api-requests.js  solicitudes, donaciones, compromisos, Mi solicitud
  api-community.js cuentas, visitas, misiones, centros, avisos, sismos, mapa, estadísticas
  api-admin.js     coordinación y auditoría
  seed.js          datos de demostración
public/            Frontend (sin compilación): HTML + CSS + JavaScript (módulos ES)
  js/views/*.js    pantallas
  sw.js            modo sin conexión (PWA)
data/              base de datos y fotos (se crea sola; respáldala)
```

- **Sin compilar nada**: no requiere herramientas nativas, por eso funciona igual en Windows y Mac.
- Mapas con **Leaflet** + OpenStreetMap (las librerías se sirven localmente).

### Variables de entorno (opcionales)

| Variable | Uso | Por defecto |
|---|---|---|
| `PORT` | Puerto | `3737` |
| `HOST` | Interfaz de red | `0.0.0.0` |
| `DATA_DIR` | Carpeta de base de datos y fotos | `./data` |
| `APP_SECRET` | Secreto para firmar sesiones | se genera en `data/.secret` |
| `SEED_DEMO` | `0` para no cargar la demo en una base vacía | `1` |

---

## 🚀 Publicarla en internet (link público 24/7)

La app necesita un servidor en la nube con **disco persistente** (ahí viven la base de datos y las fotos). Los planes gratuitos sin disco **borran los datos** cada vez que el servidor se reinicia, así que no sirven para familias reales.

### Opción recomendada: Render (≈ US$7.25/mes con disco de 1 GB)
1. Sube este proyecto a un repositorio de GitHub.
2. En [render.com](https://render.com): **New → Blueprint** → elige el repositorio. Render lee `render.yaml`.
3. Escribe `ADMIN_EMAIL` y `ADMIN_PASSWORD` (mín. 10 caracteres, guárdala bien). Render genera `APP_SECRET` solo.
4. Al terminar tendrás un link como `https://puente-solidario.onrender.com`. Puedes conectar un dominio propio (ej. `puentesolidario.org`) en *Settings → Custom Domains*.

### Otras opciones
- **Railway / Fly.io / cualquier VPS con Docker**: usa el `Dockerfile` incluido y monta un volumen en `/data`.

### Variables en producción
| Variable | Valor |
|---|---|
| `NODE_ENV` | `production` (desactiva la demo y las cuentas de prueba, fuerza HTTPS) |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | cuenta de administración inicial |
| `APP_SECRET` | texto largo y secreto |
| `DATA_DIR` | carpeta del disco persistente |
| `TRUST_PROXY` | `1` detrás del proxy del proveedor |

### Antes de recibir datos reales
1. Respalda el disco (`DATA_DIR`) a diario.
2. Las teselas de OpenStreetMap tienen límites de uso: con mucho tráfico usa un proveedor de mapas propio.
3. Revisa el aviso de privacidad y los términos con un abogado según la Ley 81 de 2019 de protección de datos personales de Panamá.
