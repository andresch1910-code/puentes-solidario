// Catálogos estáticos: geografía de Panamá, necesidades, afectaciones, habilidades.
// Las coordenadas son aproximadas (cabecera del distrito) y solo se usan para
// ubicar comunidades en el mapa cuando la familia no marca un punto.

export const PROVINCES = [
  { name: 'Bocas del Toro', center: [9.25, -82.35], districts: { 'Almirante': [9.30, -82.40], 'Bocas del Toro': [9.34, -82.24], 'Changuinola': [9.43, -82.52], 'Chiriquí Grande': [8.95, -82.12] } },
  { name: 'Coclé', center: [8.45, -80.35], districts: { 'Aguadulce': [8.243, -80.546], 'Antón': [8.396, -80.263], 'La Pintada': [8.59, -80.45], 'Natá': [8.333, -80.522], 'Olá': [8.415, -80.65], 'Penonomé': [8.518, -80.357] } },
  { name: 'Colón', center: [9.25, -79.75], districts: { 'Chagres': [9.15, -80.10], 'Colón': [9.36, -79.90], 'Donoso': [8.95, -80.55], 'Omar Torrijos Herrera': [9.05, -80.35], 'Portobelo': [9.55, -79.65], 'Santa Isabel': [9.50, -79.25] } },
  { name: 'Chiriquí', center: [8.45, -82.40], districts: { 'Alanje': [8.40, -82.56], 'Barú': [8.30, -82.87], 'Boquerón': [8.50, -82.57], 'Boquete': [8.78, -82.44], 'Bugaba': [8.48, -82.62], 'David': [8.427, -82.431], 'Dolega': [8.56, -82.42], 'Gualaca': [8.53, -82.30], 'Remedios': [8.23, -81.83], 'Renacimiento': [8.70, -82.80], 'San Félix': [8.29, -81.87], 'San Lorenzo': [8.30, -82.10], 'Tierras Altas': [8.85, -82.62], 'Tolé': [8.24, -81.67] } },
  { name: 'Darién', center: [8.20, -77.80], districts: { 'Chepigana': [8.40, -78.10], 'Pinogana': [8.12, -77.70], 'Santa Fe': [8.65, -78.15] } },
  { name: 'Herrera', center: [7.90, -80.70], districts: { 'Chitré': [7.961, -80.429], 'Las Minas': [7.799, -80.744], 'Los Pozos': [7.783, -80.645], 'Ocú': [7.943, -80.777], 'Parita': [8.000, -80.517], 'Pesé': [7.906, -80.617], 'Santa María': [8.11, -80.66] } },
  { name: 'Los Santos', center: [7.60, -80.35], districts: { 'Guararé': [7.814, -80.283], 'Las Tablas': [7.766, -80.274], 'Los Santos': [7.934, -80.414], 'Macaracas': [7.731, -80.556], 'Pedasí': [7.529, -80.026], 'Pocrí': [7.666, -80.124], 'Tonosí': [7.405, -80.442] } },
  { name: 'Panamá', center: [9.00, -79.30], districts: { 'Balboa': [8.45, -78.90], 'Chepo': [9.17, -79.10], 'Chimán': [8.72, -78.62], 'Panamá': [8.98, -79.52], 'San Miguelito': [9.03, -79.50], 'Taboga': [8.80, -79.55] } },
  { name: 'Panamá Oeste', center: [8.80, -79.85], districts: { 'Arraiján': [8.95, -79.65], 'Capira': [8.76, -79.88], 'Chame': [8.58, -79.89], 'La Chorrera': [8.88, -79.78], 'San Carlos': [8.48, -79.95] } },
  { name: 'Veraguas', center: [8.10, -81.10], districts: { 'Atalaya': [8.044, -80.927], 'Calobre': [8.32, -80.84], 'Cañazas': [8.32, -81.21], 'La Mesa': [8.15, -81.18], 'Las Palmas': [8.13, -81.45], 'Mariato': [7.64, -80.98], 'Montijo': [7.99, -81.06], 'Río de Jesús': [7.98, -81.17], 'San Francisco': [8.25, -80.97], 'Santa Fe': [8.51, -81.08], 'Santiago': [8.100, -80.983], 'Soná': [8.009, -81.318] } },
  { name: 'Comarca Guna Yala', center: [9.35, -78.70], districts: { 'Guna Yala': [9.35, -78.70] } },
  { name: 'Comarca Emberá-Wounaan', center: [8.35, -77.55], districts: { 'Cémaco': [8.45, -77.65], 'Sambú': [8.03, -78.20] } },
  { name: 'Comarca Ngäbe-Buglé', center: [8.55, -81.70], districts: { 'Besikó': [8.45, -81.85], 'Jirondai': [8.85, -81.75], 'Kankintú': [8.85, -81.85], 'Kusapín': [9.05, -81.88], 'Mironó': [8.48, -81.98], 'Müna': [8.50, -81.55], 'Nole Duima': [8.40, -81.75], 'Ñürüm': [8.55, -81.35], 'Santa Catalina o Calovébora': [8.75, -81.25] } },
  { name: 'Comarca Naso Tjër Di', center: [9.20, -82.65], districts: { 'Naso Tjër Di': [9.20, -82.65] } },
];

export function findProvince(name) {
  return PROVINCES.find(p => p.name === name);
}

/** Coordenada de respaldo para una comunidad sin punto marcado. */
export function fallbackCoords(province, district, community = '') {
  const p = findProvince(province);
  if (!p) return [8.54, -80.78];
  const base = p.districts[district] || p.center;
  // Desplazamiento determinista (≈ 1–3 km) para que comunidades distintas no se superpongan.
  let h = 0;
  for (const ch of community.toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const dx = ((h % 1000) / 1000 - 0.5) * 0.05;
  const dy = (((h / 1000) % 1000) / 1000 - 0.5) * 0.05;
  return [+(base[0] + dy).toFixed(4), +(base[1] + dx).toFixed(4)];
}

/** Redondea la ubicación (~1 km) para no exponer viviendas. */
export function blurCoords(lat, lng) {
  return [Math.round(lat * 100) / 100, Math.round(lng * 100) / 100];
}

export const NEEDS_CATALOG = [
  // alimentación
  { key: 'alimentos', label: 'Alimentos', icon: '🍎', unit: 'kits', category: 'Alimentación' },
  { key: 'agua', label: 'Agua potable', icon: '💧', unit: 'galones', category: 'Alimentación' },
  { key: 'leche_bebe', label: 'Leche o fórmula infantil', icon: '🍼', unit: 'latas', category: 'Alimentación' },
  { key: 'mascotas', label: 'Alimento para mascotas', icon: '🐾', unit: 'bolsas', category: 'Alimentación' },
  // refugio
  { key: 'carpas', label: 'Carpas', icon: '⛺', unit: 'unidades', category: 'Refugio' },
  { key: 'colchones', label: 'Colchones', icon: '🛏️', unit: 'unidades', category: 'Refugio' },
  { key: 'sabanas', label: 'Sábanas y frazadas', icon: '🧣', unit: 'unidades', category: 'Refugio' },
  { key: 'ropa', label: 'Ropa', icon: '👕', unit: 'paquetes', category: 'Refugio' },
  { key: 'linternas', label: 'Linternas y baterías', icon: '🔦', unit: 'unidades', category: 'Refugio' },
  { key: 'repelente', label: 'Repelente y mosquiteros', icon: '🦟', unit: 'unidades', category: 'Refugio' },
  // salud
  { key: 'medicamentos', label: 'Medicamentos', icon: '💊', unit: 'unidades', category: 'Salud' },
  { key: 'botiquin', label: 'Botiquín de primeros auxilios', icon: '🩹', unit: 'unidades', category: 'Salud' },
  { key: 'apoyo_psico', label: 'Apoyo psicológico', icon: '💬', unit: 'sesiones', category: 'Salud' },
  // higiene
  { key: 'higiene', label: 'Artículos de higiene', icon: '🧴', unit: 'kits', category: 'Higiene' },
  { key: 'panales', label: 'Pañales de bebé', icon: '👶', unit: 'paquetes', category: 'Higiene' },
  { key: 'panales_adulto', label: 'Pañales de adulto', icon: '🧓', unit: 'paquetes', category: 'Higiene' },
  // hogar
  { key: 'estufa', label: 'Estufa', icon: '🔥', unit: 'unidades', category: 'Hogar' },
  { key: 'refrigeradora', label: 'Refrigeradora', icon: '🧊', unit: 'unidades', category: 'Hogar' },
  { key: 'enseres_cocina', label: 'Enseres de cocina', icon: '🍳', unit: 'kits', category: 'Hogar' },
  // reconstrucción
  { key: 'cemento', label: 'Cemento', icon: '🧱', unit: 'bolsas', category: 'Reconstrucción' },
  { key: 'bloques', label: 'Bloques', icon: '🧱', unit: 'unidades', category: 'Reconstrucción' },
  { key: 'zinc', label: 'Láminas de zinc', icon: '🏠', unit: 'láminas', category: 'Reconstrucción' },
  { key: 'arena_piedra', label: 'Arena y piedra', icon: '⛰️', unit: 'm³', category: 'Reconstrucción' },
  { key: 'varillas', label: 'Varillas de acero', icon: '🔩', unit: 'unidades', category: 'Reconstrucción' },
  { key: 'materiales_electricos', label: 'Materiales eléctricos', icon: '⚡', unit: 'kits', category: 'Reconstrucción' },
  { key: 'mano_obra', label: 'Mano de obra para reparar', icon: '🔨', unit: 'jornadas', category: 'Reconstrucción' },
  { key: 'evaluacion', label: 'Evaluación estructural (ingeniero)', icon: '🏗️', unit: 'visitas', category: 'Reconstrucción' },
  { key: 'remocion', label: 'Remoción de escombros', icon: '🚜', unit: 'jornadas', category: 'Reconstrucción' },
  // servicios
  { key: 'transporte', label: 'Transporte', icon: '🚚', unit: 'viajes', category: 'Servicios' },
  { key: 'energia', label: 'Energía (planta o panel solar)', icon: '🔋', unit: 'unidades', category: 'Servicios' },
  { key: 'alquiler', label: 'Apoyo para alquiler temporal', icon: '🔑', unit: 'meses', category: 'Servicios' },
];

export const AFFECTATIONS = [
  { key: 'vivienda_destruida', label: 'Vivienda destruida', weight: 40 },
  { key: 'vivienda_danada', label: 'Vivienda dañada', weight: 20 },
  { key: 'evacuacion', label: 'Evacuación / duermen fuera de casa', weight: 15 },
  { key: 'servicios', label: 'Sin agua, luz o servicios básicos', weight: 10 },
  { key: 'lesionados', label: 'Personas lesionadas', weight: 15 },
  { key: 'medios_vida', label: 'Pérdida de empleo, cosechas o animales', weight: 8 },
  { key: 'otra', label: 'Otra afectación', weight: 3 },
];

export const VULNERABLE = [
  { key: 'embarazada', label: 'Embarazada o lactante', weight: 10 },
  { key: 'bebe', label: 'Bebé menor de 2 años', weight: 10 },
  { key: 'adulto_mayor', label: 'Adulto mayor', weight: 8 },
  { key: 'discapacidad', label: 'Persona con discapacidad', weight: 10 },
  { key: 'cronica', label: 'Enfermedad crónica (diabetes, presión…)', weight: 8 },
];

export const SKILLS = [
  'Primeros auxilios', 'Medicina o enfermería', 'Psicología / apoyo emocional', 'Ingeniería o arquitectura',
  'Construcción / albañilería', 'Electricidad', 'Plomería', 'Vehículo 4x4 / transporte', 'Logística y acopio',
  'Cocina comunitaria', 'Lenguas originarias (ngäbere, guna…)', 'Comunicación y redes', 'Tecnología / datos',
  'Cuidado de niños', 'Trabajo social',
];

export const MISSION_CATEGORIES = [
  { key: 'entrega', label: 'Entrega de ayuda', icon: '🚚' },
  { key: 'acopio', label: 'Centro de acopio', icon: '📦' },
  { key: 'reconstruccion', label: 'Reconstrucción', icon: '🔨' },
  { key: 'salud', label: 'Salud', icon: '🩺' },
  { key: 'psicosocial', label: 'Apoyo psicosocial', icon: '💬' },
  { key: 'evaluacion', label: 'Evaluación de daños', icon: '🏗️' },
  { key: 'cocina', label: 'Cocina comunitaria', icon: '🍲' },
  { key: 'logistica', label: 'Logística y datos', icon: '🗂️' },
];

export const CENTER_TYPES = [
  { key: 'acopio', label: 'Centro de acopio', icon: '📦', color: '#2563eb' },
  { key: 'albergue', label: 'Albergue', icon: '🏫', color: '#7c3aed' },
  { key: 'entrega', label: 'Punto de entrega', icon: '🤲', color: '#059669' },
  { key: 'salud', label: 'Puesto de salud', icon: '🩺', color: '#dc2626' },
  { key: 'agua', label: 'Punto de agua', icon: '🚰', color: '#0891b2' },
  { key: 'carga', label: 'Carga de celulares / wifi', icon: '🔌', color: '#d97706' },
];

export const ALERT_LEVELS = [
  { key: 'info', label: 'Información' },
  { key: 'precaucion', label: 'Precaución' },
  { key: 'alerta', label: 'Alerta' },
  { key: 'emergencia', label: 'Emergencia' },
];

export const EMERGENCY_NUMBERS = [
  { number: '911', label: 'Emergencias' },
  { number: '103', label: 'Bomberos' },
  { number: '104', label: 'Policía' },
];

export const OFFICIAL_SOURCES = [
  { name: 'SINAPROC', desc: 'Sistema Nacional de Protección Civil: alertas, albergues y evaluación de daños.', url: 'https://www.sinaproc.gob.pa' },
  { name: 'MINSA', desc: 'Ministerio de Salud: atención médica, vacunación y salud pública.', url: 'https://www.minsa.gob.pa' },
  { name: 'IMHPA', desc: 'Instituto de Meteorología e Hidrología: pronósticos y avisos de lluvia.', url: 'https://www.imhpa.gob.pa' },
  { name: 'Instituto de Geociencias (UP)', desc: 'Monitoreo sísmico de Panamá.', url: 'https://www.igc.up.ac.pa' },
  { name: 'Presidencia de Panamá', desc: 'Comunicados oficiales del Gobierno Nacional.', url: 'https://www.presidencia.gob.pa' },
  { name: 'Cruz Roja Panameña', desc: 'Socorro, primeros auxilios y apoyo humanitario.', url: 'https://www.cruzroja.org.pa' },
  { name: 'ReliefWeb', desc: 'Reportes humanitarios internacionales sobre Panamá (ONU OCHA).', url: 'https://reliefweb.int/country/pan' },
  { name: 'USGS Sismos', desc: 'Servicio Geológico de EE. UU.: sismos registrados en tiempo real.', url: 'https://earthquake.usgs.gov' },
];

export const SAFETY_GUIDES = [
  {
    title: 'Después de un sismo',
    icon: '🌎',
    items: [
      'Revise si usted o alguien cercano está herido; dé primeros auxilios si sabe hacerlo.',
      'Espere réplicas: aléjese de paredes agrietadas, techos y estructuras dañadas.',
      'No entre a una vivienda con daños hasta que un técnico la evalúe.',
      'Cierre las llaves de gas y luz si sospecha fugas o cables dañados.',
      'Use el teléfono solo para emergencias; prefiera mensajes de texto.',
      'Infórmese solo por canales oficiales y no comparta rumores.',
    ],
  },
  {
    title: 'Agua y alimentos seguros',
    icon: '💧',
    items: [
      'Hierva el agua al menos 1 minuto o use agua embotellada.',
      'Lave las manos con frecuencia, sobre todo antes de comer.',
      'Deseche alimentos que hayan estado sin refrigeración o en contacto con agua sucia.',
      'Guarde el agua en recipientes limpios y tapados.',
    ],
  },
  {
    title: 'Evite estafas',
    icon: '🛡️',
    items: [
      'Done solo a familias verificadas y confirme que el titular del Yappy coincide.',
      'Nunca envíe dinero a otra cuenta que le pidan por mensaje.',
      'La plataforma nunca pide contraseñas ni códigos de su banco.',
      'Reporte perfiles o mensajes sospechosos a los coordinadores.',
    ],
  },
  {
    title: 'Mochila de emergencia',
    icon: '🎒',
    items: [
      'Agua (4 litros por persona por día) y alimentos no perecederos para 3 días.',
      'Linterna, radio de baterías, cargador portátil y baterías extra.',
      'Botiquín y medicamentos de uso diario.',
      'Copias de documentos importantes en bolsa plástica.',
    ],
  },
];
