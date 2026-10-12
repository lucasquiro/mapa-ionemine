// 1. Dimensiones del mapa en unidades de CRS.Simple
const tileSize = 256;
const imgWidth = 41844 / tileSize;
const imgHeight = 12822 / tileSize;

let currentTpCommand = null;
let copyFeedbackTimeout = null;

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

let zoneLayers = [];
let zonesVisible = false;
let zonesLoadPromise = null;

const zoneInfoPanel = document.createElement('aside');
zoneInfoPanel.className = 'zone-info-panel';
zoneInfoPanel.hidden = true;
zoneInfoPanel.setAttribute('aria-label', 'Información de zona');

const zoneInfoHeader = document.createElement('header');
zoneInfoHeader.className = 'zone-info-header';
const zoneInfoTitle = document.createElement('h2');
const zoneInfoClose = document.createElement('button');
zoneInfoClose.type = 'button';
zoneInfoClose.className = 'zone-info-close';
zoneInfoClose.setAttribute('aria-label', 'Cerrar información de zona');
zoneInfoClose.textContent = '×';
zoneInfoHeader.append(zoneInfoTitle, zoneInfoClose);

const zoneInfoDetails = document.createElement('dl');
zoneInfoDetails.className = 'zone-info-details';
zoneInfoPanel.append(zoneInfoHeader, zoneInfoDetails);
map.getContainer().append(zoneInfoPanel);
L.DomEvent.disableClickPropagation(zoneInfoPanel);
L.DomEvent.disableScrollPropagation(zoneInfoPanel);

zoneInfoClose.addEventListener('click', () => {
    zoneInfoPanel.hidden = true;
});

function openZoneInfo(zone, rectangle) {
    zoneInfoTitle.textContent = zone.nombre ?? 'Zona sin nombre';
    zoneInfoDetails.replaceChildren();

    [
        ['Ubicación', 'ubicacion'],
        ['Lore', 'lore'],
        ['Gameplay', 'gameplay'],
        ['Aparición', 'aparicion']
    ].forEach(([labelText, field]) => {
        const label = document.createElement('dt');
        const value = document.createElement('dd');
        label.textContent = labelText;
        value.textContent = zone[field] ?? '';
        zoneInfoDetails.append(label, value);
    });

    zoneInfoPanel.hidden = false;

    const zoom = map.getZoom();
    const viewport = map.getSize();
    const zoneBounds = rectangle.getBounds();
    const zoneCenter = zoneBounds.getCenter();
    const northEastPoint = map.project(zoneBounds.getNorthEast(), zoom);
    const southWestPoint = map.project(zoneBounds.getSouthWest(), zoom);
    const zoneHalfWidth = Math.abs(northEastPoint.x - southWestPoint.x) / 2;
    const isNarrowViewport = window.matchMedia('(max-width: 700px)').matches;
    const panelRight = zoneInfoPanel.offsetLeft + zoneInfoPanel.offsetWidth;
    const zoneGap = isNarrowViewport ? 10 : 24;
    const preferredZoneX = viewport.x * (isNarrowViewport ? 0.78 : 0.68);
    const minimumZoneX = panelRight + zoneHalfWidth + zoneGap;
    const maximumZoneX = viewport.x - zoneHalfWidth - zoneGap;
    const desiredZoneX = minimumZoneX <= maximumZoneX
        ? Math.max(minimumZoneX, Math.min(preferredZoneX, maximumZoneX))
        : Math.min(viewport.x * 0.9, Math.max(preferredZoneX, minimumZoneX));
    const horizontalShift = desiredZoneX - viewport.x / 2;
    const shiftedCenter = map.project(zoneCenter, zoom).subtract([horizontalShift, 0]);
    map.panTo(map.unproject(shiftedCenter, zoom), { animate: true });
}

function minecraftToMapCoords(position) {
    const pixelX = position.x + 948;
    const pixelY = 7012 - position.z;

    return [pixelY / tileSize - imgHeight, pixelX / tileSize];
}

function createZoneLayer(zone) {
    const firstCorner = minecraftToMapCoords(zone.pos1);
    const secondCorner = minecraftToMapCoords(zone.pos2);
    const southWest = [
        Math.min(firstCorner[0], secondCorner[0]),
        Math.min(firstCorner[1], secondCorner[1])
    ];
    const northEast = [
        Math.max(firstCorner[0], secondCorner[0]),
        Math.max(firstCorner[1], secondCorner[1])
    ];
    const color = /^#[0-9a-f]{6}$/i.test(zone.color) ? zone.color : '#d4ed5e';
    const rectangle = L.rectangle([southWest, northEast], {
        color,
        fillColor: color,
        fillOpacity: 0.28,
        opacity: 0.9,
        weight: 2
    });
    rectangle.on('click', () => openZoneInfo(zone, rectangle));
    rectangle.bindTooltip(zone.nombre ?? '', {
        permanent: true,
        direction: 'center',
        className: 'zone-label',
        opacity: 1
    });

    return { layer: rectangle, priority: Number(zone.prioridad) };
}

async function loadZones() {
    if (!zonesLoadPromise) {
        zonesLoadPromise = fetch('https://raw.githubusercontent.com/lucasquiro/islands/refs/heads/main/islands.json')
            .then((response) => {
                if (!response.ok) {
                    throw new Error(`No se pudo cargar islands.json (${response.status})`);
                }
                return response.json();
            })
            .then((zones) => {
                zoneLayers = zones.map(createZoneLayer);
            })
            .catch((error) => {
                zonesLoadPromise = null;
                throw error;
            });
    }

    return zonesLoadPromise;
}

function updateZonesVisibilityByZoom() {
    if (!zonesVisible) return;

    const zoom = map.getZoom();
    const priority = zoom <= 5 ? 1 : zoom <= 8 ? 2 : 3;

    zoneLayers.forEach(({ layer, priority: zonePriority }) => {
        if (zonePriority === priority && !map.hasLayer(layer)) {
            layer.addTo(map);
        } else if (zonePriority !== priority && map.hasLayer(layer)) {
            map.removeLayer(layer);
        }
    });
}

async function info_zones() {
    if (zonesVisible) {
        zonesVisible = false;
        document.getElementById('info_zones').setAttribute('aria-pressed', 'false');
        map.off('zoomend', updateZonesVisibilityByZoom);
        zoneLayers.forEach(({ layer }) => map.removeLayer(layer));
        return;
    }

    try {
        await loadZones();
        zonesVisible = true;
        document.getElementById('info_zones').setAttribute('aria-pressed', 'true');
        updateZonesVisibilityByZoom();
        map.on('zoomend', updateZonesVisibilityByZoom);
    } catch (error) {
        console.error('Error al cargar las zonas:', error);
        alert('No se pudieron cargar las zonas del mapa.');
    }
}

document.getElementById('info_zones').addEventListener('click', info_zones);

let clickMarker = null;
const coordinateInputs = {
    x: document.getElementById('minecraft-x'),
    y: document.getElementById('minecraft-y'),
    z: document.getElementById('minecraft-z')
};
const coordsOutput = document.getElementById('coords');
const coordinateError = document.getElementById('coordinate-error');
const tpButton = document.getElementById('tp_command');

function parseCoordinate(input) {
    const value = input.value.trim();
    if (value === '~') return { valid: true, number: null, value };

    const isNumber = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value);
    const number = Number(value);
    return {
        valid: isNumber && Number.isFinite(number),
        number,
        value
    };
}

function setMarkerPosition(latlng) {
    if (clickMarker) {
        clickMarker.setLatLng(latlng);
        return;
    }

    clickMarker = L.circleMarker(latlng, {
        radius: 6,
        color: '#ff0000',
        fillColor: '#ff4444',
        fillOpacity: 0.9,
        weight: 2
    }).addTo(map);
}

function syncCoordinateInputs(panMap = false) {
    const parsed = Object.fromEntries(
        Object.entries(coordinateInputs).map(([axis, input]) => [axis, parseCoordinate(input)])
    );
    const invalidAxes = Object.entries(coordinateInputs)
        .filter(([axis]) => !parsed[axis].valid)
        .map(([axis, input]) => {
            input.setAttribute('aria-invalid', 'true');
            return axis.toUpperCase();
        });

    Object.entries(coordinateInputs).forEach(([axis, input]) => {
        if (parsed[axis].valid) input.removeAttribute('aria-invalid');
    });
    coordinateError.textContent = invalidAxes.length
        ? `Revisa ${invalidAxes.join(', ')}: usa un número o ~.`
        : '';
    coordinateError.hidden = invalidAxes.length === 0;

    const x = parsed.x;
    const z = parsed.z;
    if (x.valid && z.valid && x.number !== null && z.number !== null) {
        const pixelX = Math.round(x.number + 948);
        const pixelY = Math.round(7012 - z.number);
        coordsOutput.textContent = `Píxel: ${pixelX}, ${pixelY}`;

        const latlng = L.latLng(...minecraftToMapCoords({ x: x.number, z: z.number }));
        setMarkerPosition(latlng);
        if (panMap) map.panTo(latlng);
    }

    currentTpCommand = Object.values(parsed).every((coordinate) => coordinate.valid)
        && x.number !== null
        && z.number !== null
        ? `/tp ${x.value} ${parsed.y.value} ${z.value}`
        : null;
    tpButton.disabled = !currentTpCommand;
    tpButton.textContent = currentTpCommand ?? 'Haz clic en el mapa para generar el comando';
    tpButton.classList.remove('is-copied', 'is-copy-error');
    clearTimeout(copyFeedbackTimeout);
}

Object.values(coordinateInputs).forEach((input) => {
    input.addEventListener('input', () => syncCoordinateInputs(true));
});

map.on('click', (event) => {
    const pixelX = Math.round(event.latlng.lng * tileSize);
    const pixelY = Math.round((imgHeight + event.latlng.lat) * tileSize);
    const minecraftX = pixelX - 948;
    const minecraftZ = 7012 - pixelY;

    coordinateInputs.x.value = String(minecraftX);
    coordinateInputs.z.value = String(minecraftZ);
    syncCoordinateInputs(false);
    setMarkerPosition(event.latlng);
});

async function writeClipboard(text) {
    if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return;
    }

    const temporaryInput = document.createElement('textarea');
    temporaryInput.value = text;
    temporaryInput.style.position = 'fixed';
    temporaryInput.style.opacity = '0';
    document.body.append(temporaryInput);
    temporaryInput.select();
    const copied = document.execCommand('copy');
    temporaryInput.remove();
    if (!copied) throw new Error('El navegador no permitió copiar el comando.');
}

async function tp_command() {
    if (!currentTpCommand) return;

    try {
        await writeClipboard(currentTpCommand);
        tpButton.textContent = 'Copiado';
        tpButton.classList.add('is-copied');
        tpButton.classList.remove('is-copy-error');
        clearTimeout(copyFeedbackTimeout);
        copyFeedbackTimeout = setTimeout(() => syncCoordinateInputs(false), 1800);
    } catch (error) {
        console.error('Error al copiar:', error);
        tpButton.textContent = 'No se pudo copiar';
        tpButton.classList.add('is-copy-error');
        clearTimeout(copyFeedbackTimeout);
        copyFeedbackTimeout = setTimeout(() => syncCoordinateInputs(false), 1800);
    }
}

tpButton.addEventListener('click', tp_command);

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
        document.getElementById('chunks-btn').setAttribute('aria-pressed', 'false');
        // Remover también el escuchador de zoom cuando se apaga
        map.off('zoomend', updateChunksVisibilityByZoom);
    } else {
        map.addLayer(chunksLayerGroup);
        chunksVisible = true;
        document.getElementById('chunks-btn').setAttribute('aria-pressed', 'true');
        // Aplicar el filtro según el zoom actual al encender
        updateChunksVisibilityByZoom();
        // Escuchar cambios de zoom para actualizar en tiempo real
        map.on('zoomend', updateChunksVisibilityByZoom);
    }
}

document.getElementById('chunks-btn').addEventListener('click', chunks);

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