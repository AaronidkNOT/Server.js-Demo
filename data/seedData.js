/**
data/seedData.js
Datos de ejemplo ("seed") que usa la demo para no depender de una base de
datos real. Cada vez que se reinicia el servidor (o se llama al endpoint
de demo POST /api/demo/reset) se vuelve a generar todo desde acá.

Por qué es una función y no un objeto fijo:
Las fechas de las "funciones de cine" se calculan en relación al momento
en que arranca el servidor (Date.now()), así la demo siempre muestra una
película "en cartelera" y otra "próximo estreno", sin importar en qué
fecha del futuro alguien clone este repositorio y lo ejecute.
Las imágenes usan https://picsum.photos (fotos de stock gratuitas, sin
derechos de autor) en vez de carátulas reales, para que el repositorio
no dependa de imágenes con copyright de terceros.
 */

// Pequeño helper: devuelve una fecha ISO desplazada N días desde "ahora"
const diasDesdeAhora = (n) => new Date(Date.now() + n * 24 * 60 * 60 * 1000).toISOString();

function generarDatosIniciales() {
    // --- Usuarios de demostración (cada uno representa un "cliente" / tienda) ---
    // La contraseña en texto plano sólo existe acá, en el seed. El servidor la
    // encripta con bcrypt al arrancar; nunca se guarda ni se compara en texto plano.
    const usuarios = [
        {
            _id: 'user1',
            usuario: 'cine',
            passwordPlano: 'demo1234',
            nombre: 'Cine Cloudi (demo)'
        },
        {
            _id: 'user2',
            usuario: 'juegos',
            passwordPlano: 'demo1234',
            nombre: 'Tienda Electrónica (demo)'
        }
    ];

    // --- Productos de ejemplo ---
    const productos = [
        // Tenant "cine": funciones de cine
        {
            _id: 'prod1',
            userId: 'user1',
            tipo: 'cine',
            titulo: 'El Último Vuelo',
            descripcion: 'Una tripulación se enfrenta a una tormenta inesperada en su último viaje antes de jubilarse.',
            precio: 4500,
            imagenes: ['https://picsum.photos/seed/cloudi-pelicula-1/600/800'],
            duracion: '118 min',
            genero: 'Aventura',
            fechaFuncion: diasDesdeAhora(-5), // ya se está proyectando -> "en cartelera"
            trailer: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
            rating: { promedio: 4.2, votos: 18 },
            clasificacionEdad: 'ATP'
        },
        {
            _id: 'prod3',
            userId: 'user1',
            tipo: 'cine',
            titulo: 'Sombras del Pasado',
            descripcion: 'Una detective vuelve a su ciudad natal para resolver un caso que la marcó de joven.',
            precio: 4800,
            imagenes: ['https://picsum.photos/seed/cloudi-pelicula-2/600/800'],
            duracion: '132 min',
            genero: 'Misterio',
            fechaFuncion: diasDesdeAhora(-20),
            trailer: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
            rating: { promedio: 3.8, votos: 9 },
            clasificacionEdad: '+13'
        },
        {
            _id: 'prod4',
            userId: 'user1',
            tipo: 'cine',
            titulo: 'Galaxia Perdida',
            descripcion: 'Un grupo de exploradores descubre un planeta que no debería existir.',
            precio: 5200,
            imagenes: ['https://picsum.photos/seed/cloudi-pelicula-3/600/800'],
            duracion: '141 min',
            genero: 'Ciencia Ficción',
            fechaFuncion: diasDesdeAhora(12), // próximo estreno
            trailer: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
            rating: { promedio: 0, votos: 0 },
            clasificacionEdad: 'ATP'
        },
        {
            _id: 'prod7',
            userId: 'user1',
            tipo: 'cine',
            titulo: 'Risas en la Oficina',
            descripcion: 'Una comedia sobre un equipo de trabajo que tiene que sobrevivir a una semana sin internet.',
            precio: 4200,
            imagenes: ['https://picsum.photos/seed/cloudi-pelicula-4/600/800'],
            duracion: '101 min',
            genero: 'Comedia',
            fechaFuncion: diasDesdeAhora(30),
            trailer: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
            rating: { promedio: 0, votos: 0 },
            clasificacionEdad: 'ATP'
        },

        // Tenant "cine": galería de recuerdos
        {
            _id: 'prod5',
            userId: 'user1',
            tipo: 'recuerdos',
            titulo: 'Aniversario del Cine Club',
            descripcion: 'Fotos del festejo anual con toda la comunidad de socios.',
            imagenes: [
                'https://picsum.photos/seed/cloudi-recuerdo-1/600/400',
                'https://picsum.photos/seed/cloudi-recuerdo-2/600/400'
            ]
        },
        {
            _id: 'prod8',
            userId: 'user1',
            tipo: 'recuerdos',
            titulo: 'Festival de Cortometrajes',
            descripcion: 'Resumen del festival donde se proyectaron producciones independientes locales.',
            imagenes: ['https://picsum.photos/seed/cloudi-recuerdo-3/600/400']
        },

        // Tenant "cine": comisión directiva
        {
            _id: 'prod6',
            userId: 'user1',
            tipo: 'comision',
            nombre: 'Lucía Fernández',
            cargo: 'Presidenta',
            biografia: 'Más de 15 años de trayectoria en la gestión de espacios culturales independientes.',
            imagenes: ['https://picsum.photos/seed/cloudi-comision-1/300/300']
        },
        {
            _id: 'prod9',
            userId: 'user1',
            tipo: 'comision',
            nombre: 'Martín Sosa',
            cargo: 'Secretario',
            biografia: 'Encargado de la programación y la relación con realizadores locales.',
            imagenes: ['https://picsum.photos/seed/cloudi-comision-2/300/300']
        },

        // Tenant "juegos": tienda de electrónica (otro "cliente" del mismo sistema)
        {
            _id: 'prod2',
            userId: 'user2',
            tipo: 'electronica',
            nombre: 'Consola de Videojuegos NextGen',
            descripcion: 'Consola de última generación con soporte 4K y modo de juego rápido.',
            precio: 899999,
            stock: 50,
            imagenes: ['https://picsum.photos/seed/cloudi-consola/600/600'],
            marca: 'TecnoPlay',
            modelo: 'X-200'
        },
        {
            _id: 'prod10',
            userId: 'user2',
            tipo: 'electronica',
            nombre: 'Auriculares Gamer Pro',
            descripcion: 'Sonido envolvente y micrófono con cancelación de ruido para largas sesiones de juego.',
            precio: 89999,
            stock: 80,
            imagenes: ['https://picsum.photos/seed/cloudi-auriculares/600/600'],
            marca: 'SoundMax',
            modelo: 'G-7'
        }
    ];

    return { usuarios, productos };
}

module.exports = { generarDatosIniciales };
