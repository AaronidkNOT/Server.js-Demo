/**
    server.js
    ============================================================================
    Backend de "Cloudi" - una demo de panel de administración multi-tienda.

    Qué hace este servidor:
    - Sirve el frontend (HTML/CSS/JS) que está en la carpeta /public.
    - Expone una API REST para iniciar sesión y administrar "productos"
    (que pueden ser películas, ropa, libros, electrónica, etc. según el
    tipo de tienda).
    - Protege las rutas de escritura con autenticación basada en JWT.
    - Procesa y optimiza las imágenes que se suben (las redimensiona y las
    convierte a formato .webp con la librería "sharp").

    Importante: esto es un proyecto de DEMOSTRACIÓN.
    - Los "usuarios" y "productos" viven en memoria (arrays de JS), no en una
    base de datos real. Si reiniciás el servidor, los datos vuelven a su
    estado inicial (ver /data/seedData.js).
    - Para usar esto en producción habría que reemplazar el array `productos`
    y `usuarios` por una base de datos real (MongoDB, PostgreSQL, etc.).
    ============================================================================
 */

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const sharp = require('sharp');

const { generarDatosIniciales } = require('./data/seedData');

// ----------------------------------------------------------------------------
// 1) VARIABLES DE ENTORNO
// ----------------------------------------------------------------------------
// Cargamos un archivo ".env" (si existe) a mano, sin depender de paquetes
// externos. Así el proyecto queda más liviano. El formato soportado es el
// clásico CLAVE=valor, una por línea (igual que dotenv).

function cargarVariablesDeEntorno() {
    const envPath = path.join(__dirname, '.env');
    if (!fs.existsSync(envPath)) return;

    const contenido = fs.readFileSync(envPath, 'utf-8');
    contenido.split('\n').forEach((linea) => {
        const limpia = linea.trim();
        if (!limpia || limpia.startsWith('#')) return;

        const idx = limpia.indexOf('=');
        if (idx === -1) return;

        const clave = limpia.slice(0, idx).trim();
        let valor = limpia.slice(idx + 1).trim();

        // Permite valores entre comillas simples o dobles
        if (
            (valor.startsWith('"') && valor.endsWith('"')) ||
            (valor.startsWith("'") && valor.endsWith("'"))
        ) {
            valor = valor.slice(1, -1);
        }

        if (clave && process.env[clave] === undefined) {
            process.env[clave] = valor;
        }
    });
}
cargarVariablesDeEntorno();

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'cloudi-demo-secret-CAMBIAR-EN-PRODUCCION';
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*';

if (!process.env.JWT_SECRET) {
    console.warn(
        '   No definiste JWT_SECRET en un archivo .env. Se está usando una clave de desarrollo.\n' +
        '   Esto está bien para probar la demo en tu máquina, pero NO lauses así en producción.\n' +
        '   Copiá ".env.example" como ".env" y poné tu propia clave.'
    );
}

// ----------------------------------------------------------------------------
// 2) APP DE EXPRESS Y MIDDLEWARES GLOBALES
// ----------------------------------------------------------------------------
const app = express();

app.use(express.json());
app.use(cors({ origin: ALLOWED_ORIGIN }));

// Algunas cabeceras de seguridad básicas (versión liviana de lo que hace
// el paquete "helmet", sin agregar una dependencia más al proyecto).
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
});

// Carpeta donde se guardan las imágenes que suben los usuarios
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Servimos el frontend estático (HTML, CSS, JS) y las imágenes subidas.
// Gracias a esto, todo el proyecto corre con un solo comando: "npm start".
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(uploadDir));

// Al entrar a la raíz del sitio, mandamos directo al login.
app.get('/', (req, res) => {
    res.redirect('/iniciar_sesion.html');
});

// ----------------------------------------------------------------------------
// 3) "BASE DE DATOS" EN MEMORIA (sólo para esta demo)
// ----------------------------------------------------------------------------

let usuarios = [];
let productos = [];

// Vuelve a generar los datos de ejemplo desde cero. Se usa al arrancar el
// servidor y también desde el endpoint de demo POST /api/demo/reset.
const reiniciarDatosDeDemo = async () => {
    const datos = generarDatosIniciales();

    // Encriptamos las contraseñas de ejemplo con bcrypt antes de guardarlas.
    // Nunca se guarda ni se compara una contraseña en texto plano.
    usuarios = await Promise.all(
        datos.usuarios.map(async (u) => ({
            _id: u._id,
            usuario: u.usuario,
            nombre: u.nombre,
            password: await bcrypt.hash(u.passwordPlano, 10)
        }))
    );

    productos = datos.productos;

    // Limpiamos imágenes subidas por los usuarios de la demo (las imágenes
    // de los datos de ejemplo son URLs externas, no archivos locales, así
    // que esto no borra nada importante).
    fs.readdirSync(uploadDir).forEach((archivo) => {
        if (archivo !== '.gitkeep') {
            fs.unlinkSync(path.join(uploadDir, archivo));
        }
    });
};

// Genera un identificador único simple para nuevos productos.
const generarIdUnico = () => crypto.randomUUID();

// ----------------------------------------------------------------------------
// 4) SUBIDA Y PROCESAMIENTO DE IMÁGENES
// ----------------------------------------------------------------------------
// Guardamos los archivos en memoria primero (no en disco) para poder
// procesarlos con "sharp" antes de escribirlos. Esto nos permite:
//   - Redimensionarlos a un tamaño máximo razonable (800x800).
//   - Convertir todo a .webp, que pesa mucho menos que jpg/png.
//   - Limitar el tamaño y la cantidad de archivos para evitar abusos.
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 5 * 1024 * 1024, // 5 MB por imagen
        files: 5 // máximo 5 imágenes por producto
    },
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Solo se permiten archivos de imagen.'));
        }
    }
}).array('imagenes', 5);

// Borra del disco las imágenes asociadas a un producto (al eliminarlo o
// al reemplazar sus fotos por unas nuevas). Si el "nombre" es en realidad
// una URL externa (como las de los datos de ejemplo), no hace nada.
const eliminarImagenes = (imagenes) => {
    if (!imagenes || imagenes.length === 0) return;
    imagenes.forEach((imagen) => {
        if (/^https?:\/\//i.test(imagen)) return; // es una URL externa, no un archivo local
        const imagePath = path.join(uploadDir, imagen);
        if (fs.existsSync(imagePath)) {
            fs.unlinkSync(imagePath);
        }
    });
};

// Procesa los archivos recibidos por multer y los guarda como .webp.
// Devuelve la lista de nombres de archivo generados.
const procesarYGuardarImagenes = async (files) => {
    if (!files || files.length === 0) return [];

    const nombresDeImagenes = [];
    for (const file of files) {
        const filename = `${Date.now()}-${Math.round(Math.random() * 1e9)}.webp`;
        const outputPath = path.join(uploadDir, filename);

        await sharp(file.buffer)
            .resize(800, 800, { fit: 'inside', withoutEnlargement: true })
            .toFormat('webp', { quality: 80 })
            .toFile(outputPath);

        nombresDeImagenes.push(filename);
    }
    return nombresDeImagenes;
};

// ----------------------------------------------------------------------------
// 5) AUTENTICACIÓN
// ----------------------------------------------------------------------------

// Middleware que protege rutas: exige un token JWT válido en el header
// "Authorization: Bearer <token>".
const verificarToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ mensaje: 'Token no proporcionado' });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ mensaje: 'Token inválido o expirado' });
        }
        req.user = user;
        next();
    });
};

// Limitador de intentos de login muy simple (en memoria) para frenar
// ataques de fuerza bruta contra /login. No reemplaza a algo como
// express-rate-limit en producción, pero para una demo alcanza y sobra.
const intentosPorIp = new Map();
const LIMITE_INTENTOS = 10;
const VENTANA_MS = 15 * 60 * 1000; // 15 minutos

const limitarIntentosDeLogin = (req, res, next) => {
    const ip = req.ip;
    const ahora = Date.now();
    const registro = intentosPorIp.get(ip);

    if (!registro || ahora - registro.desde > VENTANA_MS) {
        intentosPorIp.set(ip, { intentos: 1, desde: ahora });
        return next();
    }

    if (registro.intentos >= LIMITE_INTENTOS) {
        const minutosRestantes = Math.ceil((VENTANA_MS - (ahora - registro.desde)) / 60000);
        return res.status(429).json({
            mensaje: `Demasiados intentos de inicio de sesión. Probá de nuevo en ${minutosRestantes} minuto(s).`
        });
    }

    registro.intentos += 1;
    next();
};

app.post('/login', limitarIntentosDeLogin, async (req, res) => {
    const { usuario, password } = req.body;

    if (!usuario || !password) {
        return res.status(400).json({ mensaje: 'Usuario y contraseña son obligatorios' });
    }

    const user = usuarios.find((u) => u.usuario === usuario);
    if (!user) {
        return res.status(401).json({ mensaje: 'Credenciales inválidas' });
    }

    const passwordCorrecto = await bcrypt.compare(password, user.password);
    if (!passwordCorrecto) {
        return res.status(401).json({ mensaje: 'Credenciales inválidas' });
    }

    const token = jwt.sign({ userId: user._id, username: user.usuario }, JWT_SECRET, {
        expiresIn: '1h'
    });

    res.json({ mensaje: 'Inicio de sesión exitoso', token });
});

// ----------------------------------------------------------------------------
// 6) RUTAS PÚBLICAS (no necesitan token)
// ----------------------------------------------------------------------------

// Galería de recuerdos del cine club
app.get('/api/recuerdos', (req, res) => {
    res.json(productos.filter((p) => p.tipo === 'recuerdos'));
});

app.get('/api/recuerdos/:id', (req, res) => {
    const recuerdo = productos.find((p) => p._id === req.params.id && p.tipo === 'recuerdos');
    if (!recuerdo) return res.status(404).json({ mensaje: 'Recuerdo no encontrado' });
    res.json(recuerdo);
});

// Comisión directiva
app.get('/api/comision', (req, res) => {
    res.json(productos.filter((p) => p.tipo === 'comision'));
});

app.get('/api/comision/:id', (req, res) => {
    const miembro = productos.find((p) => p._id === req.params.id && p.tipo === 'comision');
    if (!miembro) return res.status(404).json({ mensaje: 'Miembro no encontrado' });
    res.json(miembro);
});

// Película que está actualmente en cartelera (o el próximo estreno si
// todavía no se estrenó ninguna).
app.get('/api/pelicula-actual', (req, res) => {
    const ahora = new Date();

    const enCartelera = productos
        .filter((p) => p.tipo === 'cine' && p.fechaFuncion && new Date(p.fechaFuncion) <= ahora)
        .sort((a, b) => new Date(b.fechaFuncion) - new Date(a.fechaFuncion));

    if (enCartelera.length > 0) {
        return res.json(enCartelera[0]);
    }

    const proximosEstrenos = productos
        .filter((p) => p.tipo === 'cine' && p.fechaFuncion && new Date(p.fechaFuncion) > ahora)
        .sort((a, b) => new Date(a.fechaFuncion) - new Date(b.fechaFuncion));

    if (proximosEstrenos.length > 0) {
        return res.json(proximosEstrenos[0]);
    }

    res.status(404).json({ mensaje: 'No hay ninguna película disponible en cartelera o como próximo estreno.' });
});

// Listado de próximos estrenos (todas las películas con fecha futura)
app.get('/api/proximos-estrenos', (req, res) => {
    const ahora = new Date();
    const proximosEstrenos = productos
        .filter((p) => p.tipo === 'cine' && p.fechaFuncion && new Date(p.fechaFuncion) > ahora)
        .sort((a, b) => new Date(a.fechaFuncion) - new Date(b.fechaFuncion));

    if (proximosEstrenos.length === 0) {
        return res.status(404).json({ mensaje: 'No hay próximos estrenos.' });
    }
    res.json(proximosEstrenos);
});

app.get('/api/pelicula/:id', (req, res) => {
    const pelicula = productos.find((p) => p._id === req.params.id && p.tipo === 'cine');
    if (!pelicula) return res.status(404).json({ mensaje: 'Película no encontrada' });
    res.json(pelicula);
});

// Calificar una película (1 a 5 estrellas). No requiere login a propósito,
// para que cualquier visitante de la demo pueda probarlo.
app.post('/api/peliculas/:id/calificar', (req, res) => {
    const { calificacion } = req.body;

    if (!calificacion || calificacion < 1 || calificacion > 5) {
        return res.status(400).json({ mensaje: 'La calificación debe ser un número entre 1 y 5.' });
    }

    const pelicula = productos.find((p) => p._id === req.params.id);
    if (!pelicula) {
        return res.status(404).json({ mensaje: 'Película no encontrada.' });
    }

    if (!pelicula.rating) {
        pelicula.rating = { promedio: 0, votos: 0 };
    }

    // Promedio ponderado: se suma el puntaje nuevo y se recalcula el promedio
    const totalPuntosActuales = pelicula.rating.promedio * pelicula.rating.votos;
    const nuevosVotos = pelicula.rating.votos + 1;
    pelicula.rating.promedio = (totalPuntosActuales + calificacion) / nuevosVotos;
    pelicula.rating.votos = nuevosVotos;

    res.json(pelicula.rating);
});

// ----------------------------------------------------------------------------
// 7) RUTAS PROTEGIDAS DE PRODUCTOS (requieren estar logueado)
// ----------------------------------------------------------------------------

// Devuelve únicamente los productos que pertenecen al usuario logueado
// (cada "tienda" sólo ve y administra lo suyo).
app.get('/api/productos', verificarToken, (req, res) => {
    const userProducts = productos.filter((p) => p.userId === req.user.userId);
    res.json(userProducts);
});

app.post('/api/productos', verificarToken, upload, async (req, res) => {
    try {
        const nombresDeImagenes = await procesarYGuardarImagenes(req.files);
        const { tipo, stock_por_talla, ...rest } = req.body;

        let nuevoProducto = {
            _id: generarIdUnico(),
            userId: req.user.userId,
            tipo,
            imagenes: nombresDeImagenes
        };

        // Cada tipo de tienda tiene sus propios campos obligatorios.
        // (En un proyecto más grande, esto se modelaría con esquemas/validadores
        // como Joi o Zod; para esta demo lo mantenemos explícito y simple.)
        switch (tipo) {
            case 'ropa': {
                const { nombre, descripcion, precio, color, material } = rest;
                if (!nombre || !descripcion || !precio || !color || !stock_por_talla) {
                    return res.status(400).json({ mensaje: 'Faltan campos obligatorios para el producto de ropa' });
                }
                const tallasConStock = JSON.parse(stock_por_talla);
                Object.assign(nuevoProducto, {
                    nombre,
                    descripcion,
                    precio: parseFloat(precio),
                    stock: Object.values(tallasConStock).reduce((sum, val) => sum + parseInt(val), 0),
                    tallas: Object.keys(tallasConStock),
                    stockPorTalla: tallasConStock,
                    color,
                    material
                });
                break;
            }
            case 'electronica': {
                const { nombre, descripcion, precio, stock, marca, modelo, especificaciones_tecnicas } = rest;
                if (!nombre || !descripcion || !precio || !stock || !marca || !modelo) {
                    return res.status(400).json({ mensaje: 'Faltan campos obligatorios para el producto de electrónica' });
                }
                Object.assign(nuevoProducto, {
                    nombre,
                    descripcion,
                    precio: parseFloat(precio),
                    stock: parseInt(stock),
                    marca,
                    modelo,
                    especificaciones_tecnicas
                });
                break;
            }
            case 'libros': {
                const { titulo, descripcion, precio, stock, autor, editorial, isbn, genero } = rest;
                if (!titulo || !descripcion || !precio || !stock || !autor) {
                    return res.status(400).json({ mensaje: 'Faltan campos obligatorios para el producto de libros' });
                }
                Object.assign(nuevoProducto, {
                    titulo,
                    descripcion,
                    precio: parseFloat(precio),
                    stock: parseInt(stock),
                    autor,
                    editorial,
                    isbn,
                    genero
                });
                break;
            }
            case 'cine': {
                const { titulo, descripcion, precio, duracion, genero, fechaFuncion, trailer, clasificacionEdad } = rest;
                if (!titulo || !descripcion || !precio || !fechaFuncion || !clasificacionEdad) {
                    return res.status(400).json({ mensaje: 'Faltan campos obligatorios para el producto de cine' });
                }
                Object.assign(nuevoProducto, {
                    titulo,
                    descripcion,
                    precio: parseFloat(precio),
                    duracion,
                    genero,
                    fechaFuncion,
                    trailer,
                    clasificacionEdad
                });
                break;
            }
            case 'recuerdos': {
                const { titulo, descripcion } = rest;
                if (!titulo || !descripcion) {
                    return res.status(400).json({ mensaje: 'Faltan campos obligatorios para la Galería de Recuerdos' });
                }
                Object.assign(nuevoProducto, { titulo, descripcion });
                break;
            }
            case 'comision': {
                const { nombre, cargo, biografia } = rest;
                if (!nombre || !cargo || !biografia) {
                    return res.status(400).json({ mensaje: 'Faltan campos obligatorios para la Comisión Directiva' });
                }
                Object.assign(nuevoProducto, { nombre, cargo, biografia });
                break;
            }
            default: {
                // "general": tienda genérica
                const { nombre, descripcion, precio, stock, categoria, sku, peso, estado } = rest;
                if (!nombre || !descripcion || !precio || !stock) {
                    return res.status(400).json({ mensaje: 'Faltan campos obligatorios para el producto genérico' });
                }
                Object.assign(nuevoProducto, {
                    nombre,
                    descripcion,
                    precio: parseFloat(precio),
                    stock: parseInt(stock),
                    categoria,
                    sku,
                    peso: peso ? parseFloat(peso) : undefined,
                    estado
                });
                break;
            }
        }

        productos.push(nuevoProducto);
        res.status(201).json(nuevoProducto);
    } catch (error) {
        console.error('Error al procesar el producto:', error);
        res.status(500).json({ mensaje: 'Error interno del servidor al crear el producto.' });
    }
});

app.put('/api/productos/:id', verificarToken, upload, async (req, res) => {
    try {
        const productId = req.params.id;
        const { tipo, ...updatedData } = req.body;

        const productIndex = productos.findIndex((p) => p._id === productId && p.userId === req.user.userId);
        if (productIndex === -1) {
            return res.status(404).json({ mensaje: 'Producto no encontrado o no autorizado' });
        }

        const productoExistente = productos[productIndex];

        // Caso especial: productos de tipo "ropa" guardan el stock como un
        // objeto { talla: cantidad }, viene serializado como JSON en el body.
        if (tipo === 'ropa' && updatedData.stock_por_talla) {
            updatedData.stockPorTalla = JSON.parse(updatedData.stock_por_talla);
            updatedData.tallas = Object.keys(updatedData.stockPorTalla);
            updatedData.stock = Object.values(updatedData.stockPorTalla).reduce((sum, val) => sum + parseInt(val), 0);
            delete updatedData.stock_por_talla;
        }

        // Caso especial: normalizamos la fecha de función a formato ISO
        if (tipo === 'cine' && updatedData.fechaFuncion) {
            updatedData.fechaFuncion = new Date(updatedData.fechaFuncion).toISOString();
        }

        // Si llegaron imágenes nuevas, reemplazamos las anteriores
        if (req.files && req.files.length > 0) {
            eliminarImagenes(productoExistente.imagenes);
            updatedData.imagenes = await procesarYGuardarImagenes(req.files);
        }

        productos[productIndex] = {
            ...productoExistente,
            ...updatedData,
            tipo: productoExistente.tipo // el tipo de producto no se puede cambiar
        };

        res.json({ mensaje: 'Producto actualizado exitosamente', producto: productos[productIndex] });
    } catch (error) {
        console.error('Error al actualizar el producto:', error);
        res.status(500).json({ mensaje: 'Error interno del servidor al actualizar el producto.' });
    }
});

app.delete('/api/productos/:id', verificarToken, (req, res) => {
    const productId = req.params.id;
    const productIndex = productos.findIndex((p) => p._id === productId && p.userId === req.user.userId);

    if (productIndex === -1) {
        return res.status(404).json({ mensaje: 'Producto no encontrado o no autorizado' });
    }

    eliminarImagenes(productos[productIndex].imagenes);
    productos.splice(productIndex, 1);

    res.json({ mensaje: 'Producto eliminado exitosamente' });
});

// ----------------------------------------------------------------------------
// 8) RUTA ESPECIAL DE LA DEMO: reiniciar los datos a su estado original
// ----------------------------------------------------------------------------
// Como esta es una demo pública pensada para que cualquiera la pruebe, los
// datos en memoria pueden terminar "desordenados". Este endpoint los
// restaura. Requiere estar logueado para evitar que bots anónimos lo
// disparen en bucle.

app.post('/api/demo/reset', verificarToken, async (req, res) => {
    try {
        await reiniciarDatosDeDemo();
        res.json({ mensaje: 'Los datos de la demo se reiniciaron correctamente.' });
    } catch (error) {
        console.error('Error al reiniciar los datos de demo:', error);
        res.status(500).json({ mensaje: 'No se pudieron reiniciar los datos de la demo.' });
    }
});

// ----------------------------------------------------------------------------
// 9) MANEJO DE RUTAS NO ENCONTRADAS Y ERRORES
// ----------------------------------------------------------------------------

app.use('/api', (req, res) => {
    res.status(404).json({ mensaje: 'Endpoint no encontrado.' });
});

app.use((req, res) => {
    res.status(404).send('Recurso no encontrado.');
});

// Middleware de errores (debe ir al final). Acá caen, por ejemplo, los
// errores que lanza multer (imagen demasiado grande, tipo no permitido, etc).

app.use((err, req, res, next) => {
    if (err instanceof multer.MulterError || err.message === 'Solo se permiten archivos de imagen.') {
        return res.status(400).json({ mensaje: `Error al subir el archivo: ${err.message}` });
    }
    console.error('Error inesperado:', err);
    res.status(500).json({ mensaje: 'Error interno del servidor.' });
});

// ----------------------------------------------------------------------------
// 10) ARRANQUE DEL SERVIDOR
// ----------------------------------------------------------------------------
// Esperamos a que los datos de ejemplo (con sus contraseñas ya encriptadas)
// estén listos ANTES de empezar a aceptar pedidos, para evitar una
// condición de carrera donde alguien intenta loguearse antes de que las
// contraseñas terminen de encriptarse.

reiniciarDatosDeDemo()
    .then(() => {
        app.listen(PORT, () => {
            console.log(`   Cloudi (demo) escuchando en http://localhost:${PORT}`);
            console.log(`   Usuarios de prueba: "cine" / "juegos" — contraseña: demo1234`);
        });
    })
    .catch((error) => {
        console.error('No se pudo inicializar el servidor:', error);
        process.exit(1);
    });
