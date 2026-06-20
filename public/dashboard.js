/**
dashboard.js — lógica del panel de administración.

Qué hace este archivo:
- Verifica que haya un token guardado (si no, manda al login).
- Decide qué formularios de "crear producto" mostrar según el usuario.
- Carga los productos del usuario logueado desde la API y los pinta
en pantalla (con buscador, filtro por tienda, orden y paginado).
- Maneja la creación, edición y borrado de productos, incluyendo la
vista previa de imágenes antes de subirlas.

Nota sobre las URLs: todas las llamadas a la API usan rutas relativas
(por ejemplo '/api/productos') en lugar de 'http://localhost:3000/...'.
Esto funciona porque server.js sirve este mismo archivo desde el mismo
origen que la API, así que no hace falta repetir el dominio ni
preocuparse por CORS. Si en algún momento separás frontend y backend,
sólo tendrías que cambiar esta única idea (por ejemplo agregando una
constante API_BASE_URL al principio del archivo).
    */
document.addEventListener('DOMContentLoaded', async () => {
    const logoutBtn = document.getElementById('logout-btn');
    const productsContainer = document.getElementById('products-container');
    const userNameSpan = document.getElementById('user-name');
    const formSelector = document.getElementById('form-selector');
    const notificationContainer = document.getElementById('notification-container');
    const forms = {
        general: document.getElementById('form-general'),
        ropa: document.getElementById('form-ropa'),
        electronica: document.getElementById('form-electronica'),
        libros: document.getElementById('form-libros'),
        cine: document.getElementById('form-cine'),
        recuerdos: document.getElementById('form-recuerdos'),
        comision: document.getElementById('form-comision')
    };
    
    const searchInput = document.getElementById('search-input');
    const filterTiendaSelect = document.getElementById('filter-tienda');
    const sortBySelect = document.getElementById('sort-by');
    const prevPageBtn = document.getElementById('prev-page-btn');
    const nextPageBtn = document.getElementById('next-page-btn');
    const pageInfoSpan = document.getElementById('page-info');

    const editProductModal = document.getElementById('edit-product-modal');
    const closeBtn = editProductModal.querySelector('.close-btn');
    const editProductForm = document.getElementById('edit-product-form');
    const editSpecificFields = document.getElementById('edit-specific-fields');
    const currentImagesContainer = document.getElementById('current-images-container');
    const editImagesInput = document.getElementById('edit-product-images');
    const editPreviewContainer = document.getElementById('edit-preview-images-container');
    const editFileNameDisplay = document.getElementById('edit-file-name-display');
    
    let productosOriginales = [];
    let productosFiltrados = [];
    let productosPorPagina = 6;
    let paginaActual = 1;

    const token = localStorage.getItem('token');
    if (!token) {
        window.location.href = '/iniciar_sesion.html';
        return;
    }

    // ------------------------------------------------------------------
    // Configuración de qué tipos de producto puede crear cada usuario.
    //
    // En esta demo, cada usuario representa un "cliente" distinto del
    // mismo sistema (multi-tenant): el cine club administra películas,
    // recuerdos y la comisión directiva; la tienda de electrónica sólo
    // administra sus propios productos. En una app real esto vendría
    // de la base de datos (rol o tienda asociada a la cuenta).
    //
    // (Antes, esta lógica estaba duplicada tres veces para "cine",
    // "juegos" y "el resto", y tenía un bug: el array de opciones a
    // ocultar se declaraba con `const` dentro del bloque del usuario
    // "cine" y no existía para "juegos", así que al loguearse con el
    // usuario "juegos" la página rompía con un error de JavaScript y
    // volvía directo al login. Quedó arreglado acá.)
    // ------------------------------------------------------------------
    
    const configuracionPorUsuario = {
        cine: {
            tiposPermitidos: ['cine', 'recuerdos', 'comision'],
            formularioPorDefecto: 'cine'
        },
        juegos: {
            tiposPermitidos: ['electronica'],
            formularioPorDefecto: 'electronica'
        }
        // Si no hay configuración para el usuario logueado, puede crear
        // cualquier tipo de producto (comportamiento por defecto).
    };

    // Muestra un formulario y oculta el resto, con una pequeña transición.
    const mostrarFormulario = (tipoSeleccionado) => {
        Object.values(forms).forEach((form) => {
            if (form.classList.contains('show')) {
                form.classList.remove('show');
                setTimeout(() => { form.style.display = 'none'; }, 250);
            }
        });
        const formularioAMostrar = forms[tipoSeleccionado];
        if (!formularioAMostrar) return;
        formularioAMostrar.style.display = 'flex';
        setTimeout(() => formularioAMostrar.classList.add('show'), 20);
    };

    try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        userNameSpan.textContent = `Bienvenido, ${payload.username}`;

        const configUsuario = configuracionPorUsuario[payload.username];

        if (configUsuario) {
            // Oculta del selector cualquier tipo de producto que este
            // usuario de demo no deba gestionar.
            Array.from(formSelector.options).forEach((option) => {
                if (!configUsuario.tiposPermitidos.includes(option.value)) {
                    option.remove();
                }
            });
        }
        // Si no hay configUsuario, se deja el selector completo (todas las tiendas).

        formSelector.addEventListener('change', (e) => {
            mostrarFormulario(e.target.value);
            if (e.target.value === 'ropa') {
                setupTallaStockInputs('tallas-stock-container', ['XS', 'S', 'M', 'L', 'XL', 'XXL']);
            }
        });

        mostrarFormulario(configUsuario ? configUsuario.formularioPorDefecto : 'general');
    } catch (e) {
        console.error("Error al decodificar el token:", e);
        localStorage.removeItem('token');
        window.location.href = '/iniciar_sesion.html';
        return;
    }

    // Las imágenes pueden ser:
    //  - un nombre de archivo subido por el propio usuario (vive en /uploads)
    //  - una URL externa completa, como las que usan los datos de ejemplo
    //    de la demo (https://picsum.photos/...)
    // Esta función decide qué URL final usar en cada caso.
    const resolverUrlImagen = (imagen) => {
        return /^https?:\/\//i.test(imagen) ? imagen : `/uploads/${imagen}`;
    };

    const showNotification = (message, type = 'success') => {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        notificationContainer.appendChild(notification);
        setTimeout(() => {
            notification.classList.add('hide');
            notification.addEventListener('transitionend', () => {
                notification.remove();
            });
        }, 5000);
    };

    const setupImagePreview = (inputElement, previewContainer, fileNameDisplay) => {
        let fileStore = new DataTransfer();

        const renderPreviews = () => {
            previewContainer.innerHTML = '';
            fileNameDisplay.textContent = fileStore.files.length > 0 ? `${fileStore.files.length} imagen(es) seleccionada(s)` : 'Seleccionar imágenes (múltiples)';
            
            if (fileStore.files.length > 0) {
                previewContainer.style.display = 'flex';
                Array.from(fileStore.files).forEach((file, index) => {
                    const previewWrapper = document.createElement('div');
                    previewWrapper.className = 'image-preview-wrapper';

                    const img = document.createElement('img');
                    img.src = URL.createObjectURL(file);
                    
                    const removeBtn = document.createElement('button');
                    removeBtn.className = 'remove-image-btn';
                    removeBtn.textContent = '×';
                    removeBtn.type = 'button';
                    removeBtn.onclick = () => {
                        const newFiles = new DataTransfer();
                        Array.from(fileStore.files).forEach((f, i) => {
                            if (i !== index) newFiles.items.add(f);
                        });
                        fileStore = newFiles;
                        inputElement.files = fileStore.files;
                        renderPreviews();
                    };

                    previewWrapper.appendChild(img);
                    previewWrapper.appendChild(removeBtn);
                    previewContainer.appendChild(previewWrapper);
                });
            } else {
                previewContainer.style.display = 'none';
            }
        };

        inputElement.addEventListener('change', () => {
            const newFiles = Array.from(inputElement.files);
            fileStore = new DataTransfer();
            newFiles.forEach(file => fileStore.items.add(file));
            inputElement.files = fileStore.files;
            renderPreviews();
        });
        
        inputElement.form.addEventListener('reset', () => {
            fileStore = new DataTransfer();
            inputElement.files = fileStore.files;
            renderPreviews();
        });
    };

    const setupImageCarousel = (productItem) => {
        const imageContainer = productItem.querySelector('.product-image-container');
        if (!imageContainer) return;

        const images = Array.from(imageContainer.querySelectorAll('img'));
        const prevBtn = imageContainer.querySelector('.prev');
        const nextBtn = imageContainer.querySelector('.next');
        const dots = Array.from(imageContainer.querySelectorAll('.image-dot'));
        let currentImageIndex = 0;
        
        const updateCarousel = () => {
            const imageToShow = images[currentImageIndex];
            
            if (imageToShow.dataset.src) {
                imageToShow.src = imageToShow.dataset.src;
                delete imageToShow.dataset.src;
            }

            images.forEach(img => img.classList.remove('active'));
            dots.forEach(dot => dot.classList.remove('active'));
            imageToShow.classList.add('active');
            if (dots.length > 0) {
                dots[currentImageIndex].classList.add('active');
            }
        };

        if (images.length > 0) updateCarousel();
        
        if (prevBtn) {
            prevBtn.addEventListener('click', () => {
                currentImageIndex = (currentImageIndex - 1 + images.length) % images.length;
                updateCarousel();
            });
        }
        
        if (nextBtn) {
            nextBtn.addEventListener('click', () => {
                currentImageIndex = (currentImageIndex + 1) % images.length;
                updateCarousel();
            });
        }

        dots.forEach(dot => {
            dot.addEventListener('click', (e) => {
                currentImageIndex = parseInt(e.target.dataset.index);
                updateCarousel();
            });
        });
    };
    
    // Pinta en pantalla la página actual de productos (ya filtrados y
    // ordenados), incluyendo su carrusel de imágenes y los botones de
    // editar/eliminar. Se llama cada vez que cambian los filtros, la
    // página actual, o se recargan los productos desde la API.
    const renderProducts = (productos) => {
        productsContainer.innerHTML = '';

        if (productos.length === 0) {
            productsContainer.innerHTML = '<p>No hay productos que coincidan con la búsqueda.</p>';
            return;
        }

        const inicio = (paginaActual - 1) * productosPorPagina;
        const fin = inicio + productosPorPagina;
        const productosEnPagina = productos.slice(inicio, fin);
        const totalPaginas = Math.ceil(productos.length / productosPorPagina);

        productosEnPagina.forEach(producto => {
            const productItem = document.createElement('div');
            productItem.className = 'product-item';

            const imageCarouselHTML = producto.imagenes && producto.imagenes.length > 0
                ? `
                <div class="product-image-container">
                    ${producto.imagenes.map((img, index) => `
                        <img 
                            ${index === 0 ? `src="${resolverUrlImagen(img)}"` : `data-src="${resolverUrlImagen(img)}"`}
                            alt="${producto.nombre || producto.titulo || producto.nombre}" 
                            class="${index === 0 ? 'active' : ''}" 
                            loading="lazy"
                            data-index="${index}">
                    `).join('')}
                    ${producto.imagenes.length > 1 ? `
                        <button class="image-nav-btn prev"><i class="fas fa-chevron-left"></i></button>
                        <button class="image-nav-btn next"><i class="fas fa-chevron-right"></i></button>
                        <div class="image-dots-container">
                            ${producto.imagenes.map((_, index) => `<div class="image-dot ${index === 0 ? 'active' : ''}" data-index="${index}"></div>`).join('')}
                        </div>
                    ` : ''}
                </div>
                `
                : '<div class="product-image-container no-image"><p>Sin imagen</p></div>';

            const getProductDetails = (p) => {
                let details = '';
                switch (p.tipo) {
                    case 'ropa':
                        const tallasYStock = p.tallas.map(talla => `${talla}: ${p.stockPorTalla[talla] || 0}`).join(', ');
                        details += `<p><strong>Stock por talla:</strong> ${tallasYStock}</p>`;
                        details += `<p><strong>Color:</strong> ${p.color}</p>`;
                        details += p.material ? `<p><strong>Material:</strong> ${p.material}</p>` : '';
                        break;
                    case 'electronica':
                        details += `<p><strong>Stock:</strong> ${p.stock}</p>`;
                        details += `<p><strong>Marca:</strong> ${p.marca}</p>`;
                        details += `<p><strong>Modelo:</strong> ${p.modelo}</p>`;
                        details += p.especificaciones_tecnicas ? `<p><strong>Especificaciones:</strong> ${p.especificaciones_tecnicas}</p>` : '';
                        break;
                    case 'libros':
                        details += `<p><strong>Stock:</strong> ${p.stock}</p>`;
                        details += `<p><strong>Autor:</strong> ${p.autor}</p>`;
                        details += p.editorial ? `<p><strong>Editorial:</strong> ${p.editorial}</p>` : '';
                        details += p.isbn ? `<p><strong>ISBN:</strong> ${p.isbn}</p>` : '';
                        details += p.genero ? `<p><strong>Género:</strong> ${p.genero}</p>` : '';
                        break;
                    case 'cine':
                        details += p.duracion ? `<p><strong>Duración:</strong> ${p.duracion}</p>` : '';
                        details += p.genero ? `<p><strong>Género:</strong> ${p.genero}</p>` : '';
                        details += p.clasificacionEdad ? `<p><strong>Clasificación:</strong> ${p.clasificacionEdad}</p>` : '';
                        break;
                    case 'recuerdos':
                        details += p.descripcion ? `<p><strong>Descripción:</strong> ${p.descripcion}</p>` : '';
                        break;
                    case 'comision':
                        details += p.cargo ? `<p><strong>Cargo:</strong> ${p.cargo}</p>` : '';
                        details += p.biografia ? `<p><strong>Biografía:</strong> ${p.biografia}</p>` : '';
                        break;
                    default: // general
                        details += `<p><strong>Stock:</strong> ${p.stock}</p>`;
                        details += p.sku ? `<p><strong>SKU:</strong> ${p.sku}</p>` : '';
                        details += p.categoria ? `<p><strong>Categoría:</strong> ${p.categoria}</p>` : '';
                        details += p.peso ? `<p><strong>Peso:</strong> ${p.peso} kg</p>` : '';
                        details += p.estado ? `<p><strong>Estado:</strong> <span class="status-${p.estado}">${p.estado}</span></p>` : '';
                        break;
                }
                return details;
            };

            const title = producto.nombre || producto.titulo;
            const price = producto.precio !== undefined ? `<p><strong>Precio:</strong> ${new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(producto.precio)}</p>` : '';

            productItem.innerHTML = `
    ${imageCarouselHTML}
    <div class="product-info">
        <h3>${title}</h3>
        ${ (producto.tipo !== 'comision' && producto.tipo !== 'recuerdos') ? `<p>${producto.descripcion || ''}</p>` : '' }
        ${price}
        ${getProductDetails(producto)}
    </div>
    <div class="product-actions">
                    <button class="edit-btn" data-id="${producto._id}" data-type="${producto.tipo}">Editar</button>
                    <button class="delete-btn" data-id="${producto._id}">Eliminar</button>
                </div>
            `;
            productsContainer.appendChild(productItem);
            
            setupImageCarousel(productItem);
        });

        prevPageBtn.disabled = paginaActual === 1;
        nextPageBtn.disabled = paginaActual === totalPaginas;
        pageInfoSpan.textContent = `Página ${totalPaginas === 0 ? 0 : paginaActual} de ${totalPaginas}`;

        productsContainer.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const productId = btn.getAttribute('data-id');
                if (confirm('¿Estás seguro de que quieres eliminar este producto?')) {
                    try {
                        const response = await fetch(`/api/productos/${productId}`, {
                            method: 'DELETE',
                            headers: {
                                'Authorization': `Bearer ${token}`
                            }
                        });

                        if (response.ok) {
                            showNotification('Producto eliminado exitosamente.');
                            fetchProducts();
                        } else {
                            const error = await response.json();
                            showNotification('Error al eliminar: ' + error.mensaje, 'error');
                        }
                    } catch (error) {
                        console.error('Error:', error);
                        showNotification('Error de conexión al eliminar.', 'error');
                    }
                }
            });
        });

        productsContainer.querySelectorAll('.edit-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const productId = btn.getAttribute('data-id');
                const productType = btn.getAttribute('data-type') || 'general';
                const producto = productosOriginales.find(p => p._id === productId);

                if (producto) {
                    document.getElementById('edit-product-id').value = producto._id;
                    document.getElementById('edit-product-type').value = productType;
                    
                    const genericFields = document.getElementById('edit-generic-fields');
                    const priceField = document.getElementById('edit-price-field');

                    if (['recuerdos', 'comision'].includes(productType)) {
                        genericFields.style.display = 'none';
                    } else {
                        genericFields.style.display = 'block';
                        priceField.style.display = 'block';
                    }

                    if (!['recuerdos', 'comision'].includes(productType)) {
                        if (['libros', 'cine'].includes(productType)) {
                            document.getElementById('edit-product-name').value = producto.titulo ?? '';
                            document.getElementById('edit-product-name').previousElementSibling.textContent = 'Título:';
                        } else {
                            document.getElementById('edit-product-name').value = producto.nombre ?? '';
                            document.getElementById('edit-product-name').previousElementSibling.textContent = 'Nombre:';
                        }
                        const descTextarea = document.getElementById('edit-product-description');
                        descTextarea.value = producto.descripcion ?? '';
                        updateCharCounter(descTextarea, document.getElementById('edit-product-description-counter'));

                        const priceInput = document.getElementById('edit-product-price');
                        priceInput.value = (producto.precio !== undefined && producto.precio !== null) ? producto.precio : '';
                    }
                    
                    currentImagesContainer.innerHTML = '';
                    if (producto.imagenes && producto.imagenes.length > 0) {
                        producto.imagenes.forEach(imgName => {
                            const img = document.createElement('img');
                            img.src = resolverUrlImagen(imgName);
                            currentImagesContainer.appendChild(img);
                        });
                    } else {
                        currentImagesContainer.innerHTML = '<p>No hay imágenes subidas.</p>';
                    }

                    editImagesInput.value = '';
                    editImagesInput.multiple = true;
                    editImagesInput.accept = 'image/*';
                    editPreviewContainer.innerHTML = '';
                    editFileNameDisplay.textContent = 'Seleccionar imágenes (múltiples)';
                    Array.from(editSpecificFields.children).forEach(child => child.style.display = 'none');
                    
                    const fieldsToShow = document.getElementById(`edit-fields-${productType}`);
                    if (fieldsToShow) {
                        fieldsToShow.style.display = 'block';
                    }

                    switch(productType) {
                        case 'ropa':
                            document.getElementById('edit-ropa-color').value = producto.color || '';
                            document.getElementById('edit-ropa-material').value = producto.material || '';
                            const tallasStockContainer = document.getElementById('edit-tallas-stock-container');
                            tallasStockContainer.innerHTML = '';
                            ['XS', 'S', 'M', 'L', 'XL', 'XXL'].forEach(talla => {
                                const stock = producto.stockPorTalla ? (producto.stockPorTalla[talla] || 0) : 0;
                                tallasStockContainer.innerHTML += `
                                    <div class="talla-stock-input">
                                        <label for="edit-stock-${talla}">${talla}:</label>
                                        <input type="number" id="edit-stock-${talla}" value="${stock}" min="0">
                                    </div>
                                `;
                            });
                            break;
                        case 'electronica':
                            document.getElementById('edit-electronica-brand').value = producto.marca || '';
                            document.getElementById('edit-electronica-model').value = producto.modelo || '';
                            document.getElementById('edit-electronica-specs').value = producto.especificaciones_tecnicas || '';
                            document.getElementById('edit-electronica-stock').value = producto.stock;
                            break;
                        case 'libros':
                            document.getElementById('edit-libro-stock').value = producto.stock;
                            document.getElementById('edit-libro-author').value = producto.autor || '';
                            document.getElementById('edit-libro-publisher').value = producto.editorial || '';
                            document.getElementById('edit-libro-isbn').value = producto.isbn || '';
                            document.getElementById('edit-libro-genre').value = producto.genero || '';
                            break;
                        case 'cine':
                            document.getElementById('edit-cine-duration').value = producto.duracion || '';
                            document.getElementById('edit-cine-genre').value = producto.genero || '';
                            document.getElementById('edit-cine-trailer').value = producto.trailer || '';
                            document.getElementById('edit-cine-clasificacion').value = producto.clasificacionEdad || 'ATP';
                        if (producto.fechaFuncion) {
                            document.getElementById('edit-cine-fecha').value = producto.fechaFuncion.slice(0, 16);
                            }
                            break;
                        case 'recuerdos':
                            document.getElementById('edit-recuerdos-title').value = producto.titulo || '';
                            const recDescTextarea = document.getElementById('edit-recuerdos-description');
                            recDescTextarea.value = producto.descripcion || '';
                            updateCharCounter(recDescTextarea, document.getElementById('edit-recuerdos-description-counter'));
                            break;
                        case 'comision':
                            document.getElementById('edit-comision-name').value = producto.nombre || '';
                            document.getElementById('edit-comision-cargo').value = producto.cargo || '';
                            const comBioTextarea = document.getElementById('edit-comision-biografia');
                            comBioTextarea.value = producto.biografia || '';
                            updateCharCounter(comBioTextarea, document.getElementById('edit-comision-biografia-counter'));
                            editImagesInput.multiple = false;
                            editFileNameDisplay.textContent = 'Seleccionar foto de perfil';
                            break;
                        case 'general':
                            document.getElementById('edit-product-stock').value = producto.stock;
                            document.getElementById('edit-product-sku').value = producto.sku || '';
                            document.getElementById('edit-product-category').value = producto.categoria || '';
                            document.getElementById('edit-product-weight').value = producto.peso || '';
                            document.getElementById('edit-product-status').value = producto.estado || 'activo';
                            break;
                    }

                    editProductModal.style.display = 'flex';
                }
            });
        });
    };

    // Pide al backend los productos del usuario logueado (la API ya se
    // encarga de filtrar por dueño según el token) y dispara el primer
    // renderizado.
    const fetchProducts = async () => {
        productsContainer.innerHTML = '<p id="loading-message">Cargando productos...</p>';
        try {
            const response = await fetch('/api/productos', {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (response.ok) {
                const productos = await response.json();
                productosOriginales = productos;
                filterAndSortProducts();
            } else {
                throw new Error('Error al obtener productos');
            }
        } catch (error) {
            console.error('Error:', error);
            productsContainer.innerHTML = `<p style="color: var(--error);">No se pudieron cargar los productos.</p>`;
        }
    };
    
    // Aplica el texto de búsqueda, el filtro por tienda y el orden elegido
    // sobre la lista completa de productos, y vuelve a renderizar desde la
    // primera página. Se ejecuta en cada cambio de los controles de
    // búsqueda/filtro/orden.
    const filterAndSortProducts = () => {
    let tempProducts = [...productosOriginales];
    const searchTerm = searchInput.value.toLowerCase();
    const selectedTienda = filterTiendaSelect.value;
    const sortBy = sortBySelect.value;

    tempProducts = tempProducts.filter(p => {
        let textToSearch = '';
        if (p.nombre) {
            textToSearch += p.nombre;
        }
        if (p.titulo) {
            textToSearch += p.titulo;
        }
        if (p.descripcion) {
            textToSearch += p.descripcion;
        }
        if (p.categoria) {
            textToSearch += p.categoria;
        }
        if (p.sku) {
            textToSearch += p.sku;
        }
        if (p.autor) {
            textToSearch += p.autor;
        }
        if (p.genero) {
            textToSearch += p.genero;
        }
        if (p.marca) {
            textToSearch += p.marca;
        }
        if (p.modelo) {
            textToSearch += p.modelo;
        }
        if (p.biografia) {
            textToSearch += p.biografia;
        }
        if (p.cargo) {
            textToSearch += p.cargo;
        }

        const matchesSearch = textToSearch.toLowerCase().includes(searchTerm) ||
                            (p.tallas && p.tallas.some(t => t.toLowerCase().includes(searchTerm)));

        const matchesTienda = selectedTienda === 'todos' || p.tipo === selectedTienda;
        return matchesSearch && matchesTienda;
    });

    switch (sortBy) {
        case 'name-asc':
            tempProducts.sort((a, b) => (a.nombre || a.titulo || '').localeCompare(b.nombre || b.titulo || ''));
            break;
        case 'name-desc':
            tempProducts.sort((a, b) => (b.nombre || b.titulo || '').localeCompare(a.nombre || a.titulo || ''));
            break;
        case 'price-asc':
            tempProducts.sort((a, b) => (a.precio || 0) - (b.precio || 0));
            break;
        case 'price-desc':
            tempProducts.sort((a, b) => (b.precio || 0) - (a.precio || 0));
            break;
    }

    productosFiltrados = tempProducts;
    paginaActual = 1;
    renderProducts(productosFiltrados);
};

    logoutBtn.addEventListener('click', () => {
        localStorage.removeItem('token');
        window.location.href = '/iniciar_sesion.html';
    });

    // Botón "Reiniciar demo": vuelve a generar los productos de ejemplo
    // desde cero (ver POST /api/demo/reset en server.js). Útil porque esta
    // es una demo pública y los datos viven sólo en memoria del servidor.
    const resetDemoBtn = document.getElementById('reset-demo-btn');
    if (resetDemoBtn) {
        resetDemoBtn.addEventListener('click', async () => {
            if (!confirm('Esto va a borrar los productos que hayas creado/editado y va a restaurar los datos de ejemplo originales. ¿Continuar?')) {
                return;
            }
            try {
                const response = await fetch('/api/demo/reset', {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const result = await response.json();
                if (response.ok) {
                    showNotification(result.mensaje);
                    fetchProducts();
                } else {
                    showNotification('No se pudo reiniciar la demo: ' + result.mensaje, 'error');
                }
            } catch (error) {
                console.error('Error:', error);
                showNotification('Error de conexión al reiniciar la demo.', 'error');
            }
        });
    }
    
    const setupTallaStockInputs = (containerId, tallas, currentStock = {}) => {
        const container = document.getElementById(containerId);
        container.innerHTML = '';
        tallas.forEach(talla => {
            const stock = currentStock[talla] || 0;
            const div = document.createElement('div');
            div.className = 'talla-stock-input';
            div.innerHTML = `
                <label for="${containerId}-${talla}">${talla}:</label>
                <input type="number" id="${containerId}-${talla}" name="stock-talla-${talla}" value="${stock}" min="0">
            `;
            container.appendChild(div);
        });
    };
    
    // Conecta el envío de cualquiera de los formularios de "crear producto"
    // con la API. Como todos los formularios comparten esta misma función,
    // alcanza con armar un FormData (que soporta archivos) y mandarlo.
    const setupFormSubmission = (form) => {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();

            const formData = new FormData(form);
            const formType = form.querySelector('input[name="tipo"]').value;

            if (formType === 'ropa') {
                const stockPorTalla = {};
                form.querySelectorAll('.talla-stock-input input').forEach(input => {
                    const talla = input.id.split('-').pop();
                    if (input.value > 0) {
                        stockPorTalla[talla] = parseInt(input.value);
                    }
                });
                if (Object.keys(stockPorTalla).length === 0) {
                    showNotification('Por favor, introduce el stock para al menos una talla.', 'error');
                    return;
                }
                formData.append('stock_por_talla', JSON.stringify(stockPorTalla));
            }

            try {
                const response = await fetch('/api/productos', {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}` },
                    body: formData
                });

                if (response.ok) {
                    showNotification('Producto agregado exitosamente!');
                    form.reset();
                    fetchProducts();
                } else {
                    const error = await response.json();
                    showNotification('Error al agregar el producto: ' + error.mensaje, 'error');
                }
            } catch (error) {
                console.error('Error:', error);
                showNotification('Error de conexión. No se pudo agregar el producto.', 'error');
            }
        });
    };

    const updateCharCounter = (textarea, counterElement) => {
        const currentLength = textarea.value.length;
        const maxLength = 200;
        counterElement.textContent = `${currentLength}/${maxLength}`;
        if (currentLength > maxLength) {
            counterElement.style.color = 'red';
        } else {
            counterElement.style.color = 'inherit';
        }
    };

    const setupFormCounter = (formId, textareaId, counterId) => {
        const form = document.getElementById(formId);
        const textarea = document.getElementById(textareaId);
        const counter = document.getElementById(counterId);
        if (textarea && counter) {
            textarea.addEventListener('input', () => updateCharCounter(textarea, counter));
            updateCharCounter(textarea, counter);
            form.addEventListener('reset', () => setTimeout(() => updateCharCounter(textarea, counter), 0));
        }
    };

    setupFormCounter('form-general', 'product-description', 'product-description-counter');
    setupFormCounter('form-ropa', 'ropa-description', 'ropa-description-counter');
    setupFormCounter('form-electronica', 'electronica-description', 'electronica-description-counter');
    setupFormCounter('form-libros', 'libro-description', 'libro-description-counter');
    setupFormCounter('form-cine', 'cine-description', 'cine-description-counter');
    setupFormCounter('form-recuerdos', 'recuerdos-description', 'recuerdos-description-counter');
    setupFormCounter('form-comision', 'comision-biografia', 'comision-biografia-counter');


    Object.values(forms).forEach(setupFormSubmission);

    setupImagePreview(document.getElementById('product-images'), document.getElementById('preview-images-container'), document.getElementById('file-name-display'));
    setupImagePreview(document.getElementById('ropa-images'), document.getElementById('ropa-preview-images-container'), document.getElementById('ropa-file-name-display'));
    setupImagePreview(document.getElementById('electronica-images'), document.getElementById('electronica-preview-images-container'), document.getElementById('electronica-file-name-display'));
    setupImagePreview(document.getElementById('libro-images'), document.getElementById('libro-preview-images-container'), document.getElementById('libro-file-name-display'));
    setupImagePreview(document.getElementById('cine-images'), document.getElementById('cine-preview-images-container'), document.getElementById('cine-file-name-display'));
    setupImagePreview(document.getElementById('recuerdos-images'), document.getElementById('recuerdos-preview-images-container'), document.getElementById('recuerdos-file-name-display'));
    setupImagePreview(document.getElementById('comision-images'), document.getElementById('comision-preview-images-container'), document.getElementById('comision-file-name-display'));
    setupImagePreview(editImagesInput, editPreviewContainer, editFileNameDisplay);
    
    fetchProducts();

    searchInput.addEventListener('input', filterAndSortProducts);
    filterTiendaSelect.addEventListener('change', filterAndSortProducts);
    sortBySelect.addEventListener('change', filterAndSortProducts);

    prevPageBtn.addEventListener('click', () => {
        if (paginaActual > 1) {
            paginaActual--;
            renderProducts(productosFiltrados);
        }
    });

    nextPageBtn.addEventListener('click', () => {
        if (paginaActual < Math.ceil(productosFiltrados.length / productosPorPagina)) {
            paginaActual++;
            renderProducts(productosFiltrados);
        }
    });

    closeBtn.addEventListener('click', () => {
        editProductModal.style.display = 'none';
    });

    window.addEventListener('click', (event) => {
        if (event.target === editProductModal) {
            editProductModal.style.display = 'none';
        }
    });

    // Envío del formulario de edición: arma un FormData con los campos
    // correspondientes al tipo de producto que se está editando (cada tipo
    // tiene campos distintos) y lo manda como PUT a la API.
    editProductForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const productId = document.getElementById('edit-product-id').value;
        const productType = document.getElementById('edit-product-type').value;
        const formData = new FormData();

        formData.append('tipo', productType);

        switch (productType) {
            case 'ropa':
                formData.append('nombre', document.getElementById('edit-product-name').value);
                formData.append('descripcion', document.getElementById('edit-product-description').value);
                formData.append('precio', document.getElementById('edit-product-price').value);
                formData.append('color', document.getElementById('edit-ropa-color').value);
                formData.append('material', document.getElementById('edit-ropa-material').value);
                
                const stockPorTalla = {};
                document.querySelectorAll('#edit-tallas-stock-container input').forEach(input => {
                    const talla = input.id.split('-').pop();
                    stockPorTalla[talla] = parseInt(input.value) || 0;
                });
                formData.append('stock_por_talla', JSON.stringify(stockPorTalla));
                break;
            case 'electronica':
                formData.append('nombre', document.getElementById('edit-product-name').value);
                formData.append('descripcion', document.getElementById('edit-product-description').value);
                formData.append('precio', document.getElementById('edit-product-price').value);
                formData.append('marca', document.getElementById('edit-electronica-brand').value);
                formData.append('modelo', document.getElementById('edit-electronica-model').value);
                formData.append('especificaciones_tecnicas', document.getElementById('edit-electronica-specs').value);
                formData.append('stock', document.getElementById('edit-electronica-stock').value);
                break;
            case 'libros':
                formData.append('titulo', document.getElementById('edit-product-name').value);
                formData.append('descripcion', document.getElementById('edit-product-description').value);
                formData.append('precio', document.getElementById('edit-product-price').value);
                formData.append('stock', document.getElementById('edit-libro-stock').value);
                formData.append('autor', document.getElementById('edit-libro-author').value);
                formData.append('editorial', document.getElementById('edit-libro-publisher').value);
                formData.append('isbn', document.getElementById('edit-libro-isbn').value);
                formData.append('genero', document.getElementById('edit-libro-genre').value);
                break;
            case 'cine':
                formData.append('titulo', document.getElementById('edit-product-name').value);
                formData.append('descripcion', document.getElementById('edit-product-description').value);
                formData.append('precio', document.getElementById('edit-product-price').value);
                formData.append('duracion', document.getElementById('edit-cine-duration').value);
                formData.append('genero', document.getElementById('edit-cine-genre').value);
                formData.append('fechaFuncion', document.getElementById('edit-cine-fecha').value); 
                formData.append('trailer', document.getElementById('edit-cine-trailer').value); 
                formData.append('clasificacionEdad', document.getElementById('edit-cine-clasificacion').value); 
                break;
            case 'recuerdos':
                formData.append('titulo', document.getElementById('edit-recuerdos-title').value);
                formData.append('descripcion', document.getElementById('edit-recuerdos-description').value);
                break;
            case 'comision':
                formData.append('nombre', document.getElementById('edit-comision-name').value);
                formData.append('cargo', document.getElementById('edit-comision-cargo').value);
                formData.append('biografia', document.getElementById('edit-comision-biografia').value);
                break;
            case 'general':
                formData.append('nombre', document.getElementById('edit-product-name').value);
                formData.append('descripcion', document.getElementById('edit-product-description').value);
                formData.append('precio', document.getElementById('edit-product-price').value);
                formData.append('stock', document.getElementById('edit-product-stock').value);
                formData.append('sku', document.getElementById('edit-product-sku').value);
                formData.append('categoria', document.getElementById('edit-product-category').value);
                formData.append('peso', document.getElementById('edit-product-weight').value);
                formData.append('estado', document.getElementById('edit-product-status').value);
                break;
        }

        Array.from(editImagesInput.files).forEach(file => {
            formData.append('imagenes', file);
        });

        try {
            const response = await fetch(`/api/productos/${productId}`, {
                method: 'PUT',
                headers: { 'Authorization': `Bearer ${token}` },
                body: formData
            });

            if (response.ok) {
                showNotification('Producto actualizado exitosamente!');
                editProductModal.style.display = 'none';
                fetchProducts();
            } else {
                let errorMsg = 'Error desconocido';
                try {
                    const error = await response.json();
                    errorMsg = error.mensaje || JSON.stringify(error);
                } catch {
                    errorMsg = await response.text();
                }
                showNotification('Error al actualizar el producto: ' + errorMsg, 'error');
            }

        } catch (error) {
            console.error('Error:', error);
            showNotification('Error de conexión al actualizar.', 'error');
        }
    });
});