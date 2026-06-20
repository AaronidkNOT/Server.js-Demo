# Cloudi — Panel de administración multi-tienda (demo)

Demo full-stack de un sistema de login + panel de administración (CRUD) que permite gestionar distintos tipos de "productos" — funciones de cine, ropa, electrónica, libros, galería de recuerdos y comisión directiva — según el rubro de cada cuenta.

Pensado como **pieza de portfolio**: corre 100% en local con un solo comando, no necesita base de datos para probarse, e incluye usuarios de prueba para que cualquiera pueda entrar y jugar con el CRUD en segundos.

> **Es un proyecto de demostración.** Los datos viven en memoria (no hay base de datos real) y se reinician cada vez que se reinicia el servidor. Más detalles en [Limitaciones](#-limitaciones-de-la-demo-a-propósito).

---

## Demo en vivo (local)

```bash
npm install
npm start
```

Abrí **http://localhost:3000** y entrá con cualquiera de estos usuarios de prueba (también aparecen como botones en la propia pantalla de login):

| Usuario  | Contraseña | Qué administra |
|----------|------------|-----------------|
| `cine`   | `demo1234` | Funciones de cine, galería de recuerdos, comisión directiva |
| `juegos` | `demo1234` | Productos de una tienda de electrónica |

---

## Funcionalidades

- **Login con JWT**: autenticación con token, sin sesiones en servidor.
- **Multi-tenant**: cada usuario sólo ve y administra sus propios productos. El mismo sistema sirve para "tiendas" completamente distintas (un cine, una tienda de electrónica, etc.) sólo cambiando qué tipos de producto puede crear cada cuenta.
- **CRUD completo de productos**, con formularios específicos por rubro:
  - 🛒 Tienda general · 👕 Ropa (con stock por talla) · 💻 Electrónica · 📚 Libros · 🎬 Cine · 🖼️ Galería de recuerdos · 🧑‍💼 Comisión directiva
- **Subida y optimización de imágenes**: las fotos se redimensionan y se convierten a `.webp` automáticamente con [sharp](https://sharp.pixelplumbing.com/), antes de guardarse.
- **Buscador, filtro por tipo, orden y paginado** de productos en el panel.
- **Cartelera de cine dinámica**: endpoints públicos que calculan sola la película "en cartelera" y los "próximos estrenos" según la fecha.
- **Sistema de calificación** de películas (1 a 5 estrellas).
- **Botón "Reiniciar demo"**: como esto es una demo pública pensada para que cualquiera la pruebe, hay un botón (y un endpoint) para devolver los datos a su estado original en cualquier momento.
- **Seguridad básica pensada para un repo público**: límite de intentos de login, validación de tipo/tamaño de archivos subidos, cabeceras HTTP de seguridad, contraseñas con hash (bcrypt), variables sensibles fuera del código.

---

## Tecnologías usadas

**Backend**
- [Node.js](https://nodejs.org/) + [Express 5](https://expressjs.com/) — servidor y API REST
- [jsonwebtoken](https://github.com/auth0/node-jsonwebtoken) — autenticación con JWT
- [bcryptjs](https://github.com/dcodeIO/bcrypt.js) — hash de contraseñas (implementación en JS puro, sin compilación nativa)
- [multer](https://github.com/expressjs/multer) — manejo de subida de archivos (`multipart/form-data`)
- [sharp](https://sharp.pixelplumbing.com/) — redimensionado y conversión de imágenes a WebP
- [cors](https://github.com/expressjs/cors) — control de acceso entre orígenes

**Frontend**
- HTML5, CSS3 (variables CSS / custom properties, diseño responsive) y JavaScript "vanilla" (sin frameworks ni build step)
- [particles.js](https://vincentgarreau.com/particles.js/) — fondo animado decorativo
- [Font Awesome](https://fontawesome.com/) — iconos

**Sin base de datos**: los datos de ejemplo viven en un array en memoria (ver [`data/seedData.js`](./data/seedData.js)), pensado para que el proyecto se pueda clonar y correr sin instalar ni configurar nada externo.

---

## Instalación y uso

### Requisitos
- [Node.js](https://nodejs.org/) 18 o superior (incluye `npm`)

### Pasos

```bash
# 1) Cloná el repositorio
git clone https://github.com/tu-usuario/cloudi-demo.git
cd cloudi-demo

# 2) Instalá las dependencias
npm install

# 3) (Opcional) configurá tus propias variables de entorno
cp .env.example .env
# y editá .env con tu propia JWT_SECRET

# 4) Iniciá el servidor
npm start
```

Y listo: abrí **http://localhost:3000** en el navegador. Un solo proceso de Node sirve tanto el frontend (HTML/CSS/JS) como la API.

> Variante para desarrollo: `npm run dev` reinicia el servidor automáticamente al guardar cambios (usa `node --watch`).

---

## 📁 Estructura del proyecto

```
cloudi-demo/
├── server.js              # Servidor Express: rutas, auth, subida de imágenes
├── data/
│   └── seedData.js        # Datos de ejemplo (usuarios y productos) de la demo
├── public/                 # Todo el frontend, servido como archivos estáticos
│   ├── iniciar_sesion.html # Pantalla de login
│   ├── dashboard.html      # Panel de administración
│   ├── style.css           # Estilos del login
│   ├── dashboard.css       # Estilos del panel
│   ├── script.js           # Lógica del login
│   ├── dashboard.js        # Lógica del panel (CRUD, filtros, paginado...)
│   ├── particle.js         # Configuración del fondo animado
│   └── imagenes/
├── uploads/                 # Imágenes subidas por los usuarios (se genera solo)
├── .env.example             # Plantilla de variables de entorno
├── package.json
└── LICENSE
```

---

## Endpoints principales de la API

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| `POST` | `/login` | — | Inicia sesión y devuelve un token JWT |
| `GET` | `/api/productos` | ✅ | Lista los productos del usuario logueado |
| `POST` | `/api/productos` | ✅ | Crea un producto (acepta imágenes) |
| `PUT` | `/api/productos/:id` | ✅ | Edita un producto propio |
| `DELETE` | `/api/productos/:id` | ✅ | Elimina un producto propio |
| `GET` | `/api/pelicula-actual` | — | Película en cartelera (o próximo estreno) |
| `GET` | `/api/proximos-estrenos` | — | Próximos estrenos |
| `GET` | `/api/pelicula/:id` | — | Detalle de una película |
| `POST` | `/api/peliculas/:id/calificar` | — | Califica una película (1 a 5) |
| `GET` | `/api/recuerdos` / `/api/comision` | — | Galería de recuerdos / comisión directiva |
| `POST` | `/api/demo/reset` | ✅ | Restaura los datos de ejemplo originales |

---

## Decisiones de diseño (y mejoras hechas sobre la versión original)

Este proyecto partió de una versión que ya tenía la funcionalidad principal funcionando, y se mejoró pensando en que viva como demo pública en GitHub:

- **Se separó el frontend del código del servidor** en una carpeta `public/`, y el servidor pasó a servir todo (`npm start` y ya tenés todo corriendo, antes había que levantar el backend y el frontend por separado).
- **Se cambiaron las URLs absolutas (`http://localhost:3000/...`) por rutas relativas**, así la demo funciona igual si la desplegás en cualquier hosting, sin tocar el código del frontend.
- **Se corrigió un bug real**: el usuario de prueba `juegos` rompía la página al loguearse por un error de scope en JavaScript (una variable se declaraba dentro de un `if` y se usaba en el `else if` siguiente, donde no existía). Se reemplazó toda esa lógica duplicada por una configuración centralizada y más fácil de extender.
- **Se separaron los datos de ejemplo del código del servidor** (`data/seedData.js`), y las fechas de las "funciones de cine" ahora se calculan en relación al momento en que arranca el servidor, para que la demo siempre se vea "viva" sin importar cuándo la clones.
- **Se sacaron las imágenes y nombres reales** que tenía el proyecto original (carátulas de películas con derechos de autor, fotos de personas reales) y se reemplazaron por datos e imágenes de stock genéricas, pensando en que esto va a vivir en un repositorio público.
- **Se agregaron mejoras de seguridad** livianas (sin sumar dependencias pesadas): límite de intentos de login, validación de archivos subidos (tipo y tamaño), cabeceras de seguridad básicas, y la clave JWT se mueve a una variable de entorno en vez de estar harcodeada.
- Se agregó el **botón/endpoint de "reiniciar demo"**, pensado específicamente para que la demo se pueda compartir públicamente sin que se vaya degradando con el uso.
- Comentarios a lo largo de todo el código explicando el *por qué* de las decisiones, no sólo el *qué* hace cada línea.

---

## Limitaciones de la demo (a propósito)

Para mantener el proyecto fácil de clonar y probar, se tomaron decisiones que **no** se recomendarían para producción:

- **No hay base de datos real**: todo vive en arrays en memoria. Si reiniciás el servidor (o usás el botón "Reiniciar demo"), todo vuelve al estado inicial. El siguiente paso natural sería reemplazar `data/seedData.js` por MongoDB, PostgreSQL, etc.
- **Es un entorno compartido**: si subís esto a un hosting público, cualquier visitante ve y puede modificar los mismos datos que los demás (no hay aislamiento entre "visitantes", sólo entre los dos usuarios de prueba).
- **CORS abierto por defecto** (`ALLOWED_ORIGIN=*`) para que sea fácil de probar. Restringilo en `.env` si lo desplegás en serio.
- El límite de intentos de login es en memoria (se reinicia si el servidor se reinicia), pensado para frenar abuso básico, no como reemplazo de un servicio dedicado de rate limiting.

---

## Licencia

Este proyecto está bajo la licencia MIT — podés usarlo, modificarlo y compartirlo libremente. Ver [LICENSE](./LICENSE).
