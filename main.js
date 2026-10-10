// 1. Dimensiones del mapa en unidades de CRS.Simple
const tileSize = 256;
const imgWidth = 41844 / tileSize;
const imgHeight = 12822 / tileSize;

let minecraftX_ingresed = null;
let minecraftZ_ingresed = null;

// 2. Convertir desde coordenadas de Minecraft a pixeles
const converted_pixelX = 948 + minecraftX_ingresed;
const converted_pixelY = minecraftZ_ingresed + 7012;

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
    const minecraftX = pixelX - 948;
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

// Variables para controlar el estado y las capas de chunks
let chunksLayerGroup = null;
let chunkDetailLayerGroup = null;
let chunksVisible = false;

function chunks() {
    if (!chunksLayerGroup) {
        chunksLayerGroup = L.layerGroup();
        chunkDetailLayerGroup = L.layerGroup();
        
        const minMC_X = -947;
        const maxMC_X = imgWidth * tileSize - 947;
        const minMC_Z = 6834 - imgHeight * tileSize;
        const maxMC_Z = 6834;

        // 1. Generar líneas verticales
        for (let x = Math.ceil(minMC_X / 16) * 16; x <= maxMC_X; x += 16) {
            const mapX = (x + 947) / tileSize;
            const is32ChunkBoundary = (x % 512 === 0);
            
            // Si no es múltiplo de 512, pertenece a los chunks normales (cada 16)
            const isChunkLine = !is32ChunkBoundary;

            const line = L.polyline(
                [
                    [-imgHeight, mapX],
                    [0, mapX]
                ], 
                {
                    color: is32ChunkBoundary ? '#00ffff' : '#ffffff',
                    weight: is32ChunkBoundary ? 2 : 1,
                    dashArray: is32ChunkBoundary ? '5, 5' : null,
                    opacity: 0.5,
                    // Guardamos una propiedad personalizada para identificar su tipo
                    className: isChunkLine ? 'chunk-detail-line' : 'chunk-major-line'
                }
            );
            (isChunkLine ? chunkDetailLayerGroup : chunksLayerGroup).addLayer(line);
        }

        // 2. Generar líneas horizontales
        for (let z = Math.ceil(minMC_Z / 16) * 16; z <= maxMC_Z; z += 16) {
            const mapY = -(6834 - z) / tileSize;
            const is32ChunkBoundary = (z % 512 === 0);
            const isChunkLine = !is32ChunkBoundary;

            const line = L.polyline(
                [
                    [mapY, 0],
                    [mapY, imgWidth]
                ], 
                {
                    color: is32ChunkBoundary ? '#00ffff' : '#ffffff',
                    weight: is32ChunkBoundary ? 2 : 1,
                    dashArray: is32ChunkBoundary ? '5, 5' : null,
                    opacity: 0.5,
                    className: isChunkLine ? 'chunk-detail-line' : 'chunk-major-line'
                }
            );
            (isChunkLine ? chunkDetailLayerGroup : chunksLayerGroup).addLayer(line);
        }
    }

    // Alternar visibilidad general al presionar el botón
    if (chunksVisible) {
        map.removeLayer(chunksLayerGroup);
        map.removeLayer(chunkDetailLayerGroup);
        chunksVisible = false;
        // Remover también el escuchador de zoom cuando se apaga
        map.off('zoomend', updateChunksVisibilityByZoom);
    } else {
        map.addLayer(chunksLayerGroup);
        chunksVisible = true;
        // Aplicar el filtro según el zoom actual al encender
        updateChunksVisibilityByZoom();
        // Escuchar cambios de zoom para actualizar en tiempo real
        map.on('zoomend', updateChunksVisibilityByZoom);
    }
}

// Función auxiliar para mostrar/ocultar líneas internas según el zoom
function updateChunksVisibilityByZoom() {
    if (!chunksVisible || !chunksLayerGroup) return;

    const currentZoom = map.getZoom();
    const showChunkDetails = currentZoom >= 7;

    if (showChunkDetails && !map.hasLayer(chunkDetailLayerGroup)) {
        map.addLayer(chunkDetailLayerGroup);
    } else if (!showChunkDetails && map.hasLayer(chunkDetailLayerGroup)) {
        map.removeLayer(chunkDetailLayerGroup);
    }
}

// 5. Ajustar la vista inicial para encajar todo el mapa en el div
map.fitBounds(bounds);