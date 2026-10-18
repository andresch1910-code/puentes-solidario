// Datos de demostración (ficticios). Se cargan solo si la base de datos está vacía.
// Uso manual:  npm run seed        → borra todo y vuelve a cargar la demo
//              node server/seed.js --reset --empty → base limpia, solo con la cuenta admin
//
// Cuentas de prueba (correo / contraseña):
//   admin@puentesolidario.test        / Admin2026!   (administración)
//   coordinador@puentesolidario.test  / Coord2026!   (coordinación y verificación)
//   voluntaria@puentesolidario.test   / Volun2026!   (voluntaria y donante)
import { pathToFileURL } from 'node:url';
import { db, all, get, run, tx, DB_PATH } from './db.js';
import { hashSecret, normCedula } from './security.js';
import { fallbackCoords } from './catalog.js';

export const DEMO_DOMAIN = '@puentesolidario.test';

let rnd = 42;
const rand = () => ((rnd = (rnd * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const between = (a, b) => a + Math.floor(rand() * (b - a + 1));
const ago = (days, hours = 0) => new Date(Date.now() - days * 86_400_000 - hours * 3_600_000).toISOString().slice(0, 19).replace('T', ' ');
const dayOffset = (d) => new Date(Date.now() + d * 86_400_000).toISOString().slice(0, 10);

const COMMUNITIES = [
  ['Los Santos', 'Macaracas', 'Llano de Piedras', 7.705, -80.598],
  ['Los Santos', 'Tonosí', 'Tonosí (centro)', 7.405, -80.442],
  ['Los Santos', 'Los Santos', 'La Colorada', 7.885, -80.452],
  ['Los Santos', 'Las Tablas', 'Tablas Abajo', 7.752, -80.291],
  ['Los Santos', 'Pedasí', 'Pedasí (centro)', 7.529, -80.026],
  ['Los Santos', 'Guararé', 'Guararé Arriba', 7.801, -80.304],
  ['Herrera', 'Chitré', 'Monagrillo', 7.982, -80.441],
  ['Herrera', 'Los Pozos', 'Los Pozos (centro)', 7.783, -80.645],
  ['Herrera', 'Los Pozos', 'Esquiguita', 7.758, -80.702],
  ['Herrera', 'Ocú', 'Ocú (centro)', 7.943, -80.777],
  ['Herrera', 'Pesé', 'El Barrero', 7.889, -80.603],
  ['Veraguas', 'Soná', 'Soná (cabecera)', 8.009, -81.318],
  ['Veraguas', 'Mariato', 'Mariato', 7.640, -80.980],
  ['Veraguas', 'Santiago', 'Barriada San Martín', 8.093, -80.971],
  ['Veraguas', 'Soná', 'Bahía Honda', 7.752, -81.528],
  ['Coclé', 'Penonomé', 'Cristo Rey', 8.523, -80.352],
  ['Coclé', 'Olá', 'El Copé', 8.622, -80.590],
  ['Coclé', 'Aguadulce', 'Pocrí de Aguadulce', 8.250, -80.522],
];

const SURNAMES = ['Rodríguez', 'Pérez', 'Batista', 'Vergara', 'Castillo', 'Díaz', 'Sánchez', 'Moreno', 'Cedeño', 'Quintero',
  'González', 'Ríos', 'Vásquez', 'Domínguez', 'Saavedra', 'Frías', 'Espino', 'Barría', 'Cortez', 'Pimentel', 'Villarreal', 'Samaniego'];
const FIRST = ['María', 'José', 'Ana', 'Luis', 'Carmen', 'Carlos', 'Yaritza', 'Rubén', 'Edilma', 'Abdiel', 'Itzel', 'Omar', 'Daysi', 'Eric'];

const STORIES = [
  'La casa se agrietó con el terremoto y dormimos afuera con los niños. Tenemos miedo de entrar por las réplicas.',
  'Se cayó una pared completa y parte del techo. Perdimos la estufa y los colchones.',
  'La vivienda quedó inhabitable. Estamos donde un familiar pero ya no hay espacio.',
  'Las columnas quedaron dañadas y SINAPROC nos pidió desalojar. Necesitamos una evaluación.',
  'Mi mamá es adulta mayor y toma medicamentos para la presión. Nos quedamos sin agua desde el sismo.',
  'El techo de zinc se vino abajo y cuando llueve se moja todo. Tenemos un bebé de 5 meses.',
  'Se rajaron todas las paredes. Dormimos en una carpa prestada en el patio.',
  'Perdimos la cosecha y los animales; la casa tiene daños en la cocina y el baño.',
];

const NEED_SETS = [
  ['carpas', 'colchones', 'agua', 'alimentos'],
  ['alimentos', 'higiene', 'panales', 'leche_bebe'],
  ['cemento', 'bloques', 'zinc', 'mano_obra'],
  ['evaluacion', 'carpas', 'linternas', 'sabanas'],
  ['medicamentos', 'agua', 'alimentos', 'repelente'],
  ['estufa', 'enseres_cocina', 'colchones', 'ropa'],
  ['zinc', 'varillas', 'arena_piedra', 'remocion'],
];

export function seed({ reset = false, empty = false } = {}) {
  if (reset) {
    db.exec(`DELETE FROM audit; DELETE FROM alerts; DELETE FROM centers; DELETE FROM mission_signups; DELETE FROM missions;
      DELETE FROM visits; DELETE FROM donations; DELETE FROM messages; DELETE FROM photos; DELETE FROM request_needs;
      DELETE FROM requests; DELETE FROM users;`);
  }
  rnd = 42;
  const catalog = Object.fromEntries(all('SELECT * FROM needs_catalog').map(c => [c.key, c]));

  tx(() => {
    const addUser = (name, email, password, role, extra = {}) => Number(run(
      `INSERT INTO users (name, email, phone, password_hash, role, province, district, organization, skills, availability, has_vehicle)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, name, email, extra.phone ?? null, hashSecret(password), role,
      extra.province ?? null, extra.district ?? null, extra.organization ?? null, JSON.stringify(extra.skills ?? []),
      extra.availability ?? null, extra.has_vehicle ? 1 : 0).lastInsertRowid);

    const admin = addUser('Administración', 'admin' + DEMO_DOMAIN, 'Admin2026!', 'admin');
    if (empty) return;
    const coord = addUser('Gabriela Arosemena', 'coordinador' + DEMO_DOMAIN, 'Coord2026!', 'coordinator',
      { province: 'Los Santos', organization: 'Puente Solidario' });
    const vol = addUser('Valeria Tejeira', 'voluntaria' + DEMO_DOMAIN, 'Volun2026!', 'volunteer',
      { province: 'Herrera', district: 'Chitré', skills: ['Primeros auxilios', 'Vehículo 4x4 / transporte', 'Logística y acopio'],
        availability: 'Fines de semana', has_vehicle: true, phone: '6000-0000' });
    const others = [
      ['Ricardo Him', 'Ingeniería o arquitectura', 'Los Santos', 'Colegio de Ingenieros (demo)'],
      ['Lourdes Pinzón', 'Psicología / apoyo emocional', 'Veraguas', null],
      ['Fernando Ureña', 'Construcción / albañilería', 'Herrera', 'Grupo Scout 12 (demo)'],
      ['Katherine Lee', 'Medicina o enfermería', 'Coclé', null],
      ['Iván Montenegro', 'Vehículo 4x4 / transporte', 'Los Santos', 'Club 4x4 Azuero (demo)'],
    ].map(([n, s, p, o], i) => addUser(n, `vol${i + 1}${DEMO_DOMAIN}`, `Demo-${Math.random().toString(36).slice(2)}A1`, 'volunteer',
      { skills: [s, 'Primeros auxilios'], province: p, organization: o }));
    const volunteers = [vol, ...others];

    // ---- Solicitudes ----
    const statuses = [...Array(16).fill('verified'), 'pending', 'pending', 'pending', 'pending', 'needs_info', 'resolved'];
    statuses.forEach((status, i) => {
      const [province, district, community, lat, lng] = COMMUNITIES[i % COMMUNITIES.length];
      const surname = SURNAMES[i % SURNAMES.length];
      const first = pick(FIRST);
      const created = between(1, 19);
      const affect = pick([['vivienda_destruida', 'evacuacion'], ['vivienda_danada'], ['vivienda_danada', 'servicios'],
        ['vivienda_destruida', 'servicios', 'medios_vida'], ['vivienda_danada', 'lesionados'], ['evacuacion', 'servicios']]);
      const vul = pick([[], ['adulto_mayor'], ['bebe'], ['embarazada'], ['cronica', 'adulto_mayor'], ['discapacidad'], []]);
      const cedula = `${between(2, 9)}-${between(100, 999)}-${between(1000, 9999)}`;
      const code = 'PA-' + 'DEMO' + String.fromCharCode(65 + i);
      const rid = Number(run(`INSERT INTO requests (code, pin_hash, status, status_note, source, province, district, community, lat, lng,
          address_private, affectations, vulnerable, story, family_name, responsible_name, cedula, cedula_norm, adults, minors,
          contact_phone, allow_contact, payment_method, payment_number, payment_holder, payment_approved, coordinator_id,
          created_at, updated_at, verified_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      code, hashSecret('123456'), status,
      status === 'needs_info' ? 'Por favor envíe una foto más clara de la cédula y confirme el número de Yappy.' : null,
      i % 5 === 0 ? 'third_party' : 'self', province, district, community,
      lat + (rand() - 0.5) * 0.01, lng + (rand() - 0.5) * 0.01, 'Dato privado de ejemplo', JSON.stringify(affect), JSON.stringify(vul),
      pick(STORIES), `Familia ${surname}`, `${first} ${surname}`, cedula, normCedula(cedula), between(1, 6), between(0, 4),
      `6${between(100, 999)}-${between(1000, 9999)}`, rand() > 0.4 ? 1 : 0, rand() > 0.3 ? 'yappy' : 'ach',
      `6${between(100, 999)}-${between(1000, 9999)}`, `${first} ${surname}`, ['verified', 'resolved'].includes(status) ? 1 : 0,
      ['verified', 'resolved', 'needs_info'].includes(status) ? coord : null,
      ago(created, between(0, 12)), ago(Math.max(0, created - 1)),
      ['verified', 'resolved'].includes(status) ? ago(Math.max(0, created - 1), between(0, 10)) : null).lastInsertRowid);

      const set = NEED_SETS[i % NEED_SETS.length];
      set.slice(0, between(2, 4)).forEach((key, j) => {
        const c = catalog[key];
        const qty = c.unit === 'galones' ? between(3, 10) : between(1, 5);
        const fulfilled = status === 'resolved' ? qty : rand() > 0.6 ? between(0, qty) : 0;
        const store = j === 0 && ['estufa', 'colchones', 'carpas', 'cemento'].includes(key) && i % 2 === 0 ? pick(['Novey', 'Cochez', 'Do it Center']) : null;
        run(`INSERT INTO request_needs (request_id, catalog_id, label, icon, unit, quantity, fulfilled, store, store_branch)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, rid, c.id, c.label, c.icon, c.unit, qty, fulfilled, store,
        store ? `Sucursal ${district === 'Chitré' ? 'Chitré' : 'Las Tablas'}` : null);
      });
      if (i === 17) {
        run(`INSERT INTO request_needs (request_id, label, quantity, custom, approved) VALUES (?, 'Silla de ruedas para mi papá', 1, 1, 0)`, rid);
      }
      if (status === 'needs_info') {
        run("INSERT INTO messages (request_id, sender, author_name, body, created_at) VALUES (?, 'coordinator', 'Gabriela Arosemena', ?, ?)",
          rid, 'Por favor envíe una foto más clara de la cédula y confirme el número de Yappy.', ago(1));
      }
      if (['verified', 'resolved'].includes(status) && rand() > 0.35) {
        for (let d = 0; d < between(1, 4); d++) {
          run(`INSERT INTO donations (request_id, donor_user_id, donor_name, kind, amount, method, reference, confirmed, created_at)
               VALUES (?, ?, ?, 'money', ?, 'yappy', ?, ?, ?)`, rid, pick(volunteers), pick([...FIRST, null]),
          pick([10, 15, 20, 25, 30, 50, 75, 100]), `YP${between(100000, 999999)}`, rand() > 0.4 ? 1 : 0, ago(between(0, created)));
        }
      }
    });

    // ---- Visitas de voluntarios ----
    COMMUNITIES.slice(0, 12).forEach(([province, district, community, lat, lng], i) => {
      if (i % 3 === 2) return; // algunas comunidades quedan sin visita: el mapa las resalta
      const v = volunteers[i % volunteers.length];
      const u = get('SELECT name, organization FROM users WHERE id = ?', v);
      run(`INSERT INTO visits (user_id, volunteer_name, organization, province, district, community, lat, lng, visit_date,
           people_served, families_served, hours, aid_types, pending_needs, notes, status, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, v, u.name, u.organization, province, district, community, lat, lng,
      dayOffset(-between(0, 12)), between(10, 80), between(3, 20), between(3, 9),
      JSON.stringify(pick([['Alimentos', 'Agua'], ['Colchones', 'Carpas'], ['Atención médica'], ['Apoyo psicológico', 'Alimentos']])),
      pick(['Faltan carpas y lonas', 'Siguen sin agua potable', 'Necesitan evaluación estructural', null]),
      'Visita de demostración', i === 10 ? 'pending' : 'approved', ago(between(0, 10)));
    });

    // ---- Misiones ----
    const missions = [
      ['Entrega de kits de alimentos en Tonosí', 'entrega', 'Los Santos', 'Tonosí', 2, 15, ['Vehículo 4x4 / transporte'], 'Gimnasio de Las Tablas, 6:30 a. m.'],
      ['Clasificación de donaciones en centro de acopio', 'acopio', 'Herrera', 'Chitré', 1, 25, ['Logística y acopio'], 'Centro de acopio Chitré (demo)'],
      ['Evaluación de viviendas dañadas', 'evaluacion', 'Los Santos', 'Macaracas', 3, 6, ['Ingeniería o arquitectura'], 'Junta comunal de Macaracas'],
      ['Primeros auxilios psicológicos para niños', 'psicosocial', 'Veraguas', 'Soná', 4, 8, ['Psicología / apoyo emocional', 'Cuidado de niños'], 'Escuela de Soná'],
      ['Jornada de reparación de techos', 'reconstruccion', 'Herrera', 'Los Pozos', 5, 12, ['Construcción / albañilería', 'Electricidad'], 'Iglesia de Los Pozos'],
      ['Cocina comunitaria para albergue', 'cocina', 'Coclé', 'Penonomé', 2, 10, ['Cocina comunitaria'], 'Albergue escuela Cristo Rey (demo)'],
    ];
    for (const [title, category, province, district, inDays, slots, skills, meeting] of missions) {
      const [mlat, mlng] = fallbackCoords(province, district, title);
      const mid = Number(run(`INSERT INTO missions (title, description, category, province, district, lat, lng, meeting_point, starts_at, slots, skills, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, title,
      'Misión de demostración. Lleva agua, gorra, protector solar y zapatos cerrados. Se coordinará por WhatsApp con las personas inscritas.',
      category, province, district, mlat, mlng, meeting, `${dayOffset(inDays)}T07:00`, slots, JSON.stringify(skills), coord).lastInsertRowid);
      volunteers.slice(0, between(1, 4)).forEach(u => run('INSERT OR IGNORE INTO mission_signups (mission_id, user_id) VALUES (?, ?)', mid, u));
    }

    // ---- Centros ----
    const centers = [
      ['acopio', 'Centro de acopio Chitré (demo)', 'Herrera', 'Chitré', 7.963, -80.428, '7:00 a. m. – 7:00 p. m.', ['Agua embotellada', 'Pañales', 'Alimentos enlatados', 'Lonas'], ['Ropa']],
      ['acopio', 'Centro de acopio Las Tablas (demo)', 'Los Santos', 'Las Tablas', 7.767, -80.276, '8:00 a. m. – 6:00 p. m.', ['Colchonetas', 'Artículos de higiene', 'Linternas'], []],
      ['albergue', 'Albergue Escuela Cristo Rey (demo)', 'Coclé', 'Penonomé', 8.520, -80.355, '24 horas', ['Sábanas', 'Leche infantil'], []],
      ['albergue', 'Albergue Gimnasio de Macaracas (demo)', 'Los Santos', 'Macaracas', 7.732, -80.553, '24 horas', ['Colchonetas', 'Ventiladores'], []],
      ['salud', 'Puesto de salud móvil Tonosí (demo)', 'Los Santos', 'Tonosí', 7.407, -80.440, '8:00 a. m. – 4:00 p. m.', [], []],
      ['agua', 'Carro cisterna — Los Pozos (demo)', 'Herrera', 'Los Pozos', 7.785, -80.643, 'Lunes a sábado, 9:00 a. m.', [], []],
      ['carga', 'Punto de carga y wifi — Soná (demo)', 'Veraguas', 'Soná', 8.011, -81.316, '6:00 a. m. – 9:00 p. m.', [], []],
      ['entrega', 'Punto de entrega Ocú (demo)', 'Herrera', 'Ocú', 7.945, -80.775, 'Sábados 8:00 a. m.', [], []],
    ];
    centers.forEach(([type, name, province, district, lat, lng, hours, needs, surplus], i) => {
      run(`INSERT INTO centers (type, name, province, district, address, lat, lng, hours, contact, managed_by, capacity, occupancy, needs, surplus, verified, notes, created_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`, type, name, province, district, `Dirección pública de ejemplo, ${district}`,
      lat, lng, hours, 'Contacto de ejemplo', i % 2 ? 'Junta comunal (demo)' : 'Parroquia local (demo)',
      type === 'albergue' ? 120 : null, type === 'albergue' ? between(40, 110) : null, JSON.stringify(needs), JSON.stringify(surplus),
      'Centro de demostración.', coord);
    });

    // ---- Avisos (ejemplos; en producción se publican citando la fuente oficial) ----
    const alerts = [
      ['Ejemplo: réplicas esperadas en la región de Azuero', 'Este es un aviso de ejemplo. Aquí los coordinadores publican la información oficial verificada (por ejemplo, de SINAPROC o del Instituto de Geociencias), siempre con el enlace a la fuente original.', 'Ejemplo (demo)', 'https://www.sinaproc.gob.pa', 'alerta', null, 1],
      ['Ejemplo: horario de vacunación en albergues', 'Aviso de ejemplo. Los avisos de salud se publican citando al MINSA y la región de salud correspondiente.', 'Ejemplo (demo)', 'https://www.minsa.gob.pa', 'info', 'Los Santos', 0],
      ['Ejemplo: pronóstico de lluvias fuertes', 'Aviso de ejemplo. Las familias que duermen en carpas deben buscar un albergue si hay lluvias intensas. Fuente real: IMHPA.', 'Ejemplo (demo)', 'https://www.imhpa.gob.pa', 'precaucion', null, 0],
    ];
    alerts.forEach(([title, body, source, url, level, province, pinned], i) => run(
      'INSERT INTO alerts (title, body, source, source_url, level, province, pinned, published_by, published_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      title, body, source, url, level, province, pinned, admin, ago(i, 3)));
  });

  return DB_PATH;
}

/** Crea (o reactiva) la cuenta admin indicada en ADMIN_EMAIL y ADMIN_PASSWORD. */
export function ensureAdmin() {
  const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || '';
  if (!email || !password) {
    if (process.env.NODE_ENV === 'production' && !get("SELECT 1 FROM users WHERE role = 'admin' AND active = 1 AND email NOT LIKE ?", `%${DEMO_DOMAIN}`)) {
      console.warn('  ⚠️  No hay cuenta de administración: define ADMIN_EMAIL y ADMIN_PASSWORD.');
    }
    return;
  }
  if (password.length < 10) {
    console.error('  ADMIN_PASSWORD debe tener al menos 10 caracteres; no se creó la cuenta admin.');
    return;
  }
  const u = get('SELECT id FROM users WHERE email = ?', email);
  if (u) run("UPDATE users SET role = 'admin', active = 1 WHERE id = ?", u.id);
  else {
    run("INSERT INTO users (name, email, password_hash, role) VALUES ('Administración', ?, ?, 'admin')", email, hashSecret(password));
    console.log(`  Cuenta de administración creada: ${email}`);
  }
}

export function lockDemoAccounts() {
  const n = run(`UPDATE users SET active = 0 WHERE email LIKE '%${DEMO_DOMAIN}' AND active = 1`).changes;
  if (n) console.log(`  ${n} cuenta(s) de prueba desactivadas (modo producción).`);
}

export function seedIfEmpty() {
  if (!get('SELECT 1 FROM users LIMIT 1')) {
    seed();
    console.log('  Datos de demostración cargados (ver server/seed.js para las cuentas de prueba).');
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const reset = process.argv.includes('--reset');
  const empty = process.argv.includes('--empty');
  const p = seed({ reset, empty });
  console.log(empty ? 'Base de datos limpia (solo cuenta admin).' : 'Datos de demostración cargados.');
  console.log('Base de datos:', p);
}
