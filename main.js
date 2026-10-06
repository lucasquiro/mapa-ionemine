// 1. Dimensiones del mapa en unidades de CRS.Simple
const tileSize = 256;
const imgWidth = 41844 / tileSize;
const imgHeight = 12822 / tileSize;

// 2. CRS.Simple usa latitudes negativas hacia abajo, como las filas de las teselas
const bounds = L.latLngBounds(
    [-imgHeight, 0],
    [0, imgWidth]
);

// 3. Inicializar el mapa
const map = L.map('map', {
    crs: L.CRS.Simple,
    minZoom: 4,
    maxZoom: 11,
    maxBounds: bounds,
    maxBoundsViscosity: 1.0,
    attributionControl: false
});

// 4. Cargar las teselas: zoom/fila/columna
const tiles = L.tileLayer('tiles/{z}/{y}/{x}.webp', {
    tileSize: tileSize,
    minZoom: 0,
    maxNativeZoom: 8,
    maxZoom: 11,
    bounds: bounds,
    noWrap: true
}).addTo(map);

// Variable para almacenar el marcador actual
let clickMarker = null;

// Evento de clic en el mapa
map.on('click', function(e) {
    // 1. Obtener píxeles
    const pixelX = Math.round(e.latlng.lng * tileSize);
    const pixelY = Math.round((imgHeight - Math.abs(e.latlng.lat)) * tileSize);

    // 2. Convertir a coordenadas de Minecraft
    const minecraftX = pixelX - 946;
    const minecraftZ = 7012 - pixelY;

    // 3. Actualizar el div correctamente usando `${variable}`
    const coordsDiv = document.getElementById('coords');
    if (coordsDiv) {
        coordsDiv.innerText = `Píxel: (${pixelX}, ${pixelY}) | Minecraft: X: ${minecraftX}, Z: ${minecraftZ}`;
    }

    // 4. Actualizar el comando /tp guardado y mostrarlo en el botón
    currentTpCommand = `/tp ${minecraftX} ~ ${minecraftZ}`;
    const tpBtn = document.getElementById('tp_command');
    if (tpBtn) {
        tpBtn.innerText = `${currentTpCommand}`;
    }

    // 4. Crear o mover el marcador/punto en la posición del clic
    if (clickMarker) {
        clickMarker.setLatLng(e.latlng); // Mueve el marcador existente
    } else {
        // Crea un nuevo punto rojo con estilo CSS
        clickMarker = L.circleMarker(e.latlng, {
            radius: 6,             // Tamaño del punto en píxeles de pantalla
            color: '#ff0000',      // Borde rojo
            fillColor: '#ff4444',  // Relleno rojo claro
            fillOpacity: 0.9,      // Opacidad
            weight: 2
        }).addTo(map);
    }
});

// Función para copiar el comando al portapapeles
async function tp_command() {
    if (!currentTpCommand) {
        alert('Haz clic primero en algún lugar del mapa para generar la coordenada.');
        return;
    }

    try {
        await navigator.clipboard.writeText(currentTpCommand);
        alert(`¡Comando copiado!: ${currentTpCommand}`);
    } catch (err) {
        console.error('Error al copiar:', err);
    }
}

// 5. Ajustar la vista inicial para encajar todo el mapa en el div
map.fitBounds(bounds);