/**
script.js — lógica de la pantalla de inicio de sesión.

Qué hace:
    1) Envía el formulario de login al backend (POST /login).
    2) Si las credenciales son correctas, guarda el token JWT en localStorage
    y redirige al dashboard.
    3) Maneja el botón de "mostrar/ocultar contraseña".
    4) Si el visitante hace clic en alguna de las credenciales de ejemplo,
    se autocompletan los campos del formulario (sólo una ayuda para la demo).

    Nota: como el frontend se sirve desde el mismo servidor Express que la
    API (ver server.js), usamos rutas relativas ('/login') en vez de
    'http://localhost:3000/login'. Esto permite que la demo funcione igual
    si la subís a un hosting con otro dominio, sin tocar el código.
*/
document.addEventListener('DOMContentLoaded', () => {

    const loginForm = document.querySelector('form');
    const mensajeDiv = document.getElementById('mensaje');
    const usuarioInput = document.getElementById('usuario');
    const passwordInput = document.getElementById('password');

    // --- Envío del formulario de login ---
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        mensajeDiv.textContent = '';
        mensajeDiv.style.color = '';

        const data = {
            usuario: usuarioInput.value,
            password: passwordInput.value
        };

        try {
            const response = await fetch('/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(data)
            });
            const result = await response.json();

            if (response.ok) {
                mensajeDiv.textContent = result.mensaje;
                mensajeDiv.style.color = 'var(--verde-400)';
                localStorage.setItem('token', result.token);
                window.location.href = '/dashboard.html';
            } else {
                mensajeDiv.textContent = 'Error: ' + result.mensaje;
                mensajeDiv.style.color = '#f87171';
            }

        } catch (error) {
            console.error('Error de red o del servidor:', error);
            mensajeDiv.textContent = 'Error: No se pudo conectar al servidor.';
            mensajeDiv.style.color = '#f87171';
        }
    });

    // --- Mostrar / ocultar contraseña ---
    const togglePassword = document.getElementById('togglePassword');
    const eyeOpen = document.getElementById('eyeOpen');
    const eyeClosed = document.getElementById('eyeClosed');

    togglePassword.addEventListener('click', () => {
        const isPassword = passwordInput.type === 'password';
        passwordInput.type = isPassword ? 'text' : 'password';
        eyeOpen.style.display = isPassword ? 'none' : 'inline';
        eyeClosed.style.display = isPassword ? 'inline' : 'none';
    });

    // --- Ayuda de demo: autocompletar con un usuario de ejemplo al hacer clic ---
    // (Esto es sólo para que cualquiera pueda probar la demo sin tener que
    // recordar usuario/contraseña. En una app real esto NO debería existir).
    document.querySelectorAll('.demo-credential').forEach((boton) => {
        boton.addEventListener('click', () => {
            usuarioInput.value = boton.dataset.usuario;
            passwordInput.value = boton.dataset.password;
            mensajeDiv.textContent = '';
        });
    });
});
