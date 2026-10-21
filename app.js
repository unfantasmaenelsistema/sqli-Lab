// ── STATE ──
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* sin almacenamiento */ } },
};
let currentLesson = 0;
let lang = store.get('sqlilab-lang', (navigator.language || 'es').toLowerCase().startsWith('es') ? 'es' : 'en');
if (lang !== 'es' && lang !== 'en') lang = 'es';
let theme = store.get('sqlilab-theme', window.matchMedia && matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
let completed = new Set(store.get('sqlilab-completed', []));

// ── TRANSLATIONS ──
const T = {
  es: {
    lessonOf: (c, t) => `Lección ${c} de ${t}`,
    theory: 'CONCEPTO TEÓRICO',
    labTitle: 'LABORATORIO INTERACTIVO',
    serverTitle: 'VENTANA DEL SERVIDOR / BASE DE DATOS',
    submit: 'Enviar',
    hint: '💡 Pista',
    nextHint: '💡 Siguiente pista',
    hintLabel: l => `PISTA NIVEL ${l}`,
    nextLesson: 'Siguiente lección →',
    prevLesson: '← Anterior',
    complete: '¡Misión completada!',
    completeText: 'Has ejecutado el ataque con éxito. Ahora entiendes cómo funciona.',
    goNext: 'Continuar →',
    idle: 'EN ESPERA',
    querying: 'CONSULTANDO...',
    success: 'ÉXITO',
    pwned: '¡VULNERADO!',
    progress: 'Progreso',
    username: 'Usuario',
    password: 'Contraseña',
    search: 'Búsqueda',
    searchPlaceholder: 'Buscar producto...',
    userPlaceholder: 'Introduce el usuario',
    passPlaceholder: 'Introduce la contraseña',
    waiting: 'Esperando consulta...',
    serverReady: 'Servidor MySQL iniciado. Esperando consultas.',
    loginSuccess: '✔ Autenticación correcta — sesión iniciada como ADMIN',
    loginFail: '✘ Usuario o contraseña incorrectos',
    unionSuccess: '✔ UNION inyectado — datos de otra tabla expuestos',
    blindTrue: '✔ Respuesta: VERDADERO — el carácter existe',
    blindFalse: '✘ Respuesta: FALSO — carácter no encontrado',
    errorLeak: '✔ Error de base de datos expone información sensible',
    defense: '🛡 DEFENSA — Cómo prevenirlo',
    injected: '⚠ INYECCIÓN DETECTADA',
    safe: '✔ CONSULTA SEGURA',
  },
  en: {
    lessonOf: (c, t) => `Lesson ${c} of ${t}`,
    theory: 'THEORY CONCEPT',
    labTitle: 'INTERACTIVE LAB',
    serverTitle: 'SERVER / DATABASE WINDOW',
    submit: 'Submit',
    hint: '💡 Hint',
    nextHint: '💡 Next hint',
    hintLabel: l => `HINT LEVEL ${l}`,
    nextLesson: 'Next lesson →',
    prevLesson: '← Previous',
    complete: 'Mission complete!',
    completeText: 'You have successfully executed the attack. Now you understand how it works.',
    goNext: 'Continue →',
    idle: 'IDLE',
    querying: 'QUERYING...',
    success: 'SUCCESS',
    pwned: 'PWNED!',
    progress: 'Progress',
    username: 'Username',
    password: 'Password',
    search: 'Search',
    searchPlaceholder: 'Search product...',
    userPlaceholder: 'Enter username',
    passPlaceholder: 'Enter password',
    waiting: 'Waiting for query...',
    serverReady: 'MySQL server started. Waiting for queries.',
    loginSuccess: '✔ Authentication success — session started as ADMIN',
    loginFail: '✘ Invalid username or password',
    unionSuccess: '✔ UNION injected — data from another table exposed',
    blindTrue: '✔ Response: TRUE — character exists',
    blindFalse: '✘ Response: FALSE — character not found',
    errorLeak: '✔ Database error leaks sensitive information',
    defense: '🛡 DEFENSE — How to prevent it',
    injected: '⚠ INJECTION DETECTED',
    safe: '✔ SAFE QUERY',
  }
};
const t = () => T[lang];

// ── LESSONS DATA ──
const lessons = [
  // 0: Welcome
  null,
  // 1: What is SQLi
  {
    titleEs: '¿Qué es SQL Injection?',
    titleEn: 'What is SQL Injection?',
    type: 'intro',
  },
  // 2: Login Bypass
  {
    titleEs: 'Bypass de Login',
    titleEn: 'Login Bypass',
    type: 'login',
  },
  // 3: UNION
  {
    titleEs: 'Extracción de Datos con UNION',
    titleEn: 'Data Extraction with UNION',
    type: 'union',
  },
  // 4: Blind
  {
    titleEs: 'Blind SQL Injection',
    titleEn: 'Blind SQL Injection',
    type: 'blind',
  },
  // 5: Error-Based
  {
    titleEs: 'Error-Based Injection',
    titleEn: 'Error-Based Injection',
    type: 'error',
  },
  // 6: Defense
  {
    titleEs: 'Cómo Defenderse de SQLi',
    titleEn: 'How to Defend Against SQLi',
    type: 'defense',
  },
];

// ── THEME ──
function applyTheme(next) {
  theme = next === 'light' ? 'light' : 'dark';
  document.body.dataset.theme = theme;
  const btn = document.getElementById('theme-btn');
  btn.textContent = theme === 'dark' ? '☀️' : '🌙';
  btn.title = theme === 'dark' ? (lang === 'es' ? 'Tema claro' : 'Light theme') : (lang === 'es' ? 'Tema oscuro' : 'Dark theme');
}

function toggleTheme() {
  applyTheme(theme === 'dark' ? 'light' : 'dark');
  store.set('sqlilab-theme', theme);
}

// ── LANGUAGE ──
function setLang(l) {
  lang = l === 'en' ? 'en' : 'es';
  store.set('sqlilab-lang', lang);
  document.documentElement.lang = lang;
  applyTheme(theme);
  document.getElementById('btn-es').classList.toggle('active', l === 'es');
  document.getElementById('btn-en').classList.toggle('active', l === 'en');
  document.querySelectorAll('[data-es]').forEach(el => {
    el.textContent = el.dataset[lang];
  });
  showLesson(currentLesson);
}

// ── NAVIGATION ──
function showLesson(idx) {
  currentLesson = idx;
  document.querySelectorAll('.lesson-item').forEach((el, i) => {
    el.classList.remove('active');
    if (completed.has(i)) el.classList.add('completed');
    else el.classList.remove('completed');
  });
  const nav = document.getElementById('nav-' + idx);
  if (nav) {
    nav.classList.add('active');
    if (window.matchMedia && matchMedia('(max-width: 900px)').matches) nav.scrollIntoView({ block: 'nearest', inline: 'center' });
  }

  const main = document.getElementById('main-content');
  main.innerHTML = '';
  main.scrollTop = 0;
  window.scrollTo(0, 0);

  if (idx === 0) { renderWelcome(main); return; }

  const renderers = {
    intro: renderIntro,
    login: renderLogin,
    union: renderUnion,
    blind: renderBlind,
    error: renderError,
    defense: renderDefense,
  };
  const lesson = lessons[idx];
  if (lesson && renderers[lesson.type]) renderers[lesson.type](main, idx);
}

function markComplete(idx) {
  completed.add(idx);
  store.set('sqlilab-completed', [...completed]);
  const nav = document.getElementById('nav-' + idx);
  if (nav) nav.classList.add('completed');
}

// ── HELPERS ──
function now() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}`;
}

function logLine(cls, prefix, msg) {
  return `<div class="log-line log-${cls}">
    <span class="log-time">${now()}</span>
    <span class="log-prefix">[${prefix}]</span>
    <span class="log-msg">${msg}</span>
  </div>`;
}

function sqlBlock(html) {
  return `<div class="sql-block">${html}</div>`;
}

function dbTable(headers, rows, exposedRows = []) {
  const ths = headers.map(h => `<th>${SqlEngine.escapeHtml(h)}</th>`).join('');
  const trs = rows.map((r, i) => {
    const cls = exposedRows.includes(i) ? 'exposed' : '';
    return `<tr class="${cls}">${r.map(c => `<td>${SqlEngine.escapeHtml(c)}</td>`).join('')}</tr>`;
  }).join('');
  return `<div class="table-wrap"><table class="db-table"><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table></div>`;
}

function resultBadge(type, msg) {
  return `<div class="result-badge badge-${type}">${msg}</div>`;
}

function serverWin(id, statusId) {
  return `<div class="server-win">
    <div class="server-topbar">
      <div class="sim-dot" style="background:#ff5555"></div>
      <div class="sim-dot" style="background:#ffb86c"></div>
      <div class="sim-dot" style="background:#50fa7b"></div>
      <div class="server-title">mysql://localhost:3306/shop_db &nbsp;— &nbsp;query_log</div>
      <span class="server-status status-idle" id="${statusId}">${t().idle}</span>
    </div>
    <div class="server-body" id="${id}">
      ${logLine('info','SRV', t().serverReady)}
    </div>
  </div>`;
}

function footerNav(idx, canFinish = false) {
  const max = lessons.length - 1;
  return `<div class="lesson-footer">
    <button class="nav-btn" onclick="showLesson(${idx - 1})" ${idx <= 1 ? 'disabled' : ''}>${t().prevLesson}</button>
    <span style="font-size:12px;color:var(--text3)">${t().lessonOf(idx, max)}</span>
    <button class="nav-btn primary" onclick="showLesson(${idx < max ? idx + 1 : idx})" ${idx >= max ? 'disabled' : ''}>${t().nextLesson}</button>
  </div>`;
}

// ── RENDER WELCOME ──
function renderWelcome(main) {
  const totalLessons = lessons.length - 1;
  const doneCount = completed.size;
  main.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;min-height:calc(100vh - 130px);padding:2rem">
    <div class="welcome-card">
      <div class="welcome-icon"><img src="icono.png" alt="Un Fantasma en el Sistema"></div>
      <div class="welcome-title" data-es="SQLi Lab" data-en="SQLi Lab">SQLi Lab</div>
      <p class="welcome-sub" data-es="Aprende cómo funcionan los ataques de SQL Injection paso a paso, desde cero. Observa en tiempo real lo que ocurre dentro del servidor y la base de datos." data-en="Learn how SQL Injection attacks work step by step, from scratch. Watch in real time what happens inside the server and database.">
        ${lang === 'es' ? 'Aprende cómo funcionan los ataques de SQL Injection paso a paso, desde cero. Observa en tiempo real lo que ocurre dentro del servidor y la base de datos.' : 'Learn how SQL Injection attacks work step by step, from scratch. Watch in real time what happens inside the server and database.'}
      </p>
      <button class="start-btn" onclick="showLesson(1)">${lang === 'es' ? '🚀 Comenzar el laboratorio' : '🚀 Start the lab'}</button>
      <div class="welcome-stats">
        <div class="welcome-stat"><div class="num">${totalLessons}</div><div class="lbl">${lang === 'es' ? 'Lecciones' : 'Lessons'}</div></div>
        <div class="welcome-stat"><div class="num">${doneCount}</div><div class="lbl">${lang === 'es' ? 'Completadas' : 'Completed'}</div></div>
        <div class="welcome-stat"><div class="num">100%</div><div class="lbl">${lang === 'es' ? 'Gratis' : 'Free'}</div></div>
        <div class="welcome-stat"><div class="num">🛡</div><div class="lbl">${lang === 'es' ? 'Ético & Educativo' : 'Ethical & Educational'}</div></div>
      </div>
    </div>
  </div>`;
}

// ── RENDER LESSON 1: INTRO ──
function renderIntro(main, idx) {
  main.innerHTML = `
    <div class="lesson-header">
      <div class="lesson-header-top">
        <div class="lesson-title">${lang === 'es' ? '¿Qué es SQL Injection?' : 'What is SQL Injection?'}</div>
      </div>
      <div class="lesson-progress">
        <span>${t().progress}</span>
        <div class="progress-bar"><div class="progress-fill" style="width:16%"></div></div>
        <span>1/6</span>
      </div>
    </div>

    <div class="theory-panel">
      <div class="panel-label">${t().theory}</div>
      <div class="theory-text">
        ${lang === 'es' ? `
        <strong>SQL</strong> (Structured Query Language) es el lenguaje que usan las aplicaciones web para comunicarse con su base de datos. Por ejemplo, cuando te registras en una web, la aplicación ejecuta algo así:<br><br>
        <code>SELECT * FROM usuarios WHERE nombre='Ana' AND clave='1234'</code><br><br>
        <strong>SQL Injection</strong> es una vulnerabilidad donde un atacante <strong>inserta código SQL malicioso</strong> dentro de un campo de texto (usuario, contraseña, buscador…) que la aplicación luego ejecuta sin comprobarlo. El resultado: el atacante puede <strong>saltarse contraseñas, robar datos, borrar tablas</strong> o tomar control total del servidor.
        ` : `
        <strong>SQL</strong> (Structured Query Language) is the language web applications use to communicate with their database. For example, when you log into a site, the application runs something like:<br><br>
        <code>SELECT * FROM users WHERE name='Ana' AND pass='1234'</code><br><br>
        <strong>SQL Injection</strong> is a vulnerability where an attacker <strong>inserts malicious SQL code</strong> into a text field (username, password, search box…) which the application then executes without checking it. The result: the attacker can <strong>bypass passwords, steal data, delete tables</strong> or take full control of the server.
        `}
      </div>
      <div class="concept-box">
        <div class="concept-title">${lang === 'es' ? '⚠ Impacto real' : '⚠ Real impact'}</div>
        ${lang === 'es'
          ? 'SQLi figura cada año en el <strong>OWASP Top 10</strong> — la lista de vulnerabilidades más críticas del mundo. Ha provocado brechas masivas en LinkedIn, Sony, Yahoo y miles de empresas. Es la vulnerabilidad #1 en aplicaciones web por número de incidentes.'
          : 'SQLi appears every year in the <strong>OWASP Top 10</strong> — the world\'s most critical vulnerability list. It has caused massive breaches at LinkedIn, Sony, Yahoo and thousands of companies. It\'s the #1 web application vulnerability by number of incidents.'}
      </div>
    </div>

    <div class="theory-panel">
      <div class="panel-label">${lang === 'es' ? 'CÓMO FUNCIONA' : 'HOW IT WORKS'}</div>
      <div class="theory-text">
        ${lang === 'es' ? 'Imagina este formulario de búsqueda:' : 'Imagine this search form:'}
      </div>
      <div style="margin:1rem 0">
        ${sqlBlock(`
<span class="sq-k">SELECT</span> <span class="sq-v">*</span> <span class="sq-k">FROM</span> productos
<span class="sq-k">WHERE</span> nombre <span class="sq-op">=</span> <span class="sq-s">'</span><span class="sq-v">${lang === 'es' ? 'zapatillas' : 'sneakers'}</span><span class="sq-s">'</span>
        `)}
      </div>
      <div class="theory-text">
        ${lang === 'es'
          ? 'Si el usuario escribe <code>zapatillas\' OR \'1\'=\'1</code> la query se convierte en:'
          : 'If the user types <code>sneakers\' OR \'1\'=\'1</code> the query becomes:'}
      </div>
      <div style="margin:1rem 0">
        ${sqlBlock(`
<span class="sq-k">SELECT</span> <span class="sq-v">*</span> <span class="sq-k">FROM</span> productos
<span class="sq-k">WHERE</span> nombre <span class="sq-op">=</span> <span class="sq-s">'zapatillas'</span> <span class="sq-k">OR</span> <span class="sq-inj">'1'='1'</span>
        `)}
      </div>
      <div class="theory-text">
        ${lang === 'es'
          ? '<code>1=1</code> es siempre verdadero → la base de datos devuelve <strong>TODOS los registros</strong>, ignorando el filtro original.'
          : '<code>1=1</code> is always true → the database returns <strong>ALL records</strong>, bypassing the original filter.'}
      </div>
    </div>

    <div class="theory-panel">
      <div class="panel-label">${lang === 'es' ? 'TIPOS DE SQL INJECTION' : 'TYPES OF SQL INJECTION'}</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:1rem;margin-top:0.5rem">
        ${[
          ['🎯', lang==='es'?'In-Band (Clásico)':'In-Band (Classic)', lang==='es'?'El resultado se ve directamente en la respuesta de la web.':'The result is visible directly in the web response.', 'Lecciones 2, 3', 'Lessons 2, 3'],
          ['🔍', 'Blind', lang==='es'?'Sin salida visible. Se infiere mediante respuestas verdadero/falso.':'No visible output. Inferred via true/false responses.', 'Lección 4', 'Lesson 4'],
          ['💥', 'Error-Based', lang==='es'?'Se leen datos en los mensajes de error del servidor.':'Data read from server error messages.', 'Lección 5', 'Lesson 5'],
          ['⏱', 'Time-Based', lang==='es'?'Se mide el tiempo de respuesta para inferir datos.':'Response time measured to infer data.', 'Lección 4 · SLEEP()', 'Lesson 4 · SLEEP()'],
        ].map(([icon, name, desc, tagEs, tagEn]) => `
          <div style="background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);padding:1rem">
            <div style="font-size:20px;margin-bottom:6px">${icon}</div>
            <div style="font-weight:700;font-size:14px;margin-bottom:4px">${name}</div>
            <div style="font-size:12px;color:var(--text2);line-height:1.5">${desc}</div>
            <div style="font-size:11px;color:var(--accent);margin-top:6px;font-family:var(--font-mono)">${lang==='es'?tagEs:tagEn}</div>
          </div>
        `).join('')}
      </div>
    </div>

    ${footerNav(idx)}
  `;
  markComplete(idx);
}

// ── RENDER LESSON 2: LOGIN BYPASS ──
function renderLogin(main, idx) {
  main.innerHTML = `
    <div class="lesson-header">
      <div class="lesson-header-top">
        <div class="lesson-title">${lang === 'es' ? 'Bypass de Login' : 'Login Bypass'}</div>
      </div>
      <div class="lesson-progress">
        <span>${t().progress}</span>
        <div class="progress-bar"><div class="progress-fill" style="width:33%"></div></div>
        <span>2/6</span>
      </div>
    </div>

    <div class="theory-panel">
      <div class="panel-label">${t().theory}</div>
      <div class="theory-text">
        ${lang === 'es' ? `
        El ataque más famoso de SQLi: <strong>saltarse una pantalla de login sin saber la contraseña</strong>.<br><br>
        La aplicación construye esta query con lo que el usuario escribe:<br>
        ` : `
        The most famous SQLi attack: <strong>bypassing a login screen without knowing the password</strong>.<br><br>
        The application builds this query with what the user types:<br>
        `}
      </div>
      ${sqlBlock(`
<span class="sq-k">SELECT</span> <span class="sq-v">*</span> <span class="sq-k">FROM</span> usuarios
<span class="sq-k">WHERE</span> usuario <span class="sq-op">=</span> <span class="sq-s">'<span style="color:var(--accent)">[USUARIO]</span>'</span>
<span class="sq-k">AND</span> clave <span class="sq-op">=</span> <span class="sq-s">'<span style="color:var(--accent)">[CONTRASEÑA]</span>'</span>
      `)}
      <div class="theory-text" style="margin-top:1rem">
        ${lang === 'es'
          ? 'Si el servidor encuentra una fila, el login es correcto. La trampa: si metemos <code>\'</code> seguido de <code>OR \'1\'=\'1\' -- -</code> en el campo usuario, el comentario <code>-- </code> anula el resto de la query, eliminando la comprobación de contraseña. Ojo: en MySQL <code>--</code> necesita un espacio detrás (por eso <code>-- -</code>); también vale <code>#</code>.'
          : 'If the server finds a row, login succeeds. The trap: if we inject <code>\'</code> followed by <code>OR \'1\'=\'1\' -- -</code> in the username field, the <code>-- </code> comment cancels the rest of the query, removing the password check. Note: in MySQL <code>--</code> needs a space after it (hence <code>-- -</code>); <code>#</code> works too.'}
      </div>
      <div class="concept-box">
        <div class="concept-title">${lang === 'es' ? '🎯 Objetivo' : '🎯 Goal'}</div>
        ${lang === 'es'
          ? 'Introduce el payload correcto en el campo <strong>Usuario</strong> para entrar como administrador sin conocer la contraseña.'
          : 'Enter the correct payload in the <strong>Username</strong> field to log in as admin without knowing the password.'}
      </div>
    </div>

    <div class="lab-grid">
      <div class="sim-panel">
        <div class="sim-topbar">
          <div class="sim-dot" style="background:#ff5f57"></div>
          <div class="sim-dot" style="background:#ffbd2e"></div>
          <div class="sim-dot" style="background:#28c840"></div>
          <div class="sim-title">🌐 shop.empresa.com/login</div>
        </div>
        <div class="sim-body">
          <div class="mock-app">
            <div class="mock-app-bar">🔒 ${lang==='es'?'Panel de Administración':'Admin Panel'} — Login</div>
            <div class="mock-app-content">
              <div class="mock-label">${t().username}</div>
              <input class="mock-input" id="l-user" placeholder="${t().userPlaceholder}" oninput="updateLoginQuery()" onkeydown="if(event.key==='Enter')doLogin()" autocomplete="off" spellcheck="false">
              <div class="mock-label">${t().password}</div>
              <input class="mock-input" id="l-pass" placeholder="${t().passPlaceholder}" type="text" oninput="updateLoginQuery()" onkeydown="if(event.key==='Enter')doLogin()" autocomplete="off" spellcheck="false">
              <br>
              <button class="mock-btn" onclick="doLogin()">${t().submit}</button>
              <div id="l-result"></div>
            </div>
          </div>
          <div class="live-sql" id="l-live"></div>

          <div id="login-hints">
            <button class="hint-btn" onclick="showLoginHint(1)">
              ${t().hint} — <span>${lang==='es'?'¿Qué carácter rompe la query?':'What character breaks the query?'}</span>
            </button>
            <div class="hint-box" id="hint-l1">
              <div class="hint-level">${t().hintLabel(1)}</div>
              ${lang==='es'
                ? 'La comilla simple <code>\'</code> cierra el string que la aplicación construye. Prueba escribir solo <code>\'</code> en el campo usuario y observa el error 1064 en el servidor: es la señal de que la entrada llega sin filtrar.'
                : 'The single quote <code>\'</code> closes the string the application builds. Try typing just <code>\'</code> in the username field and watch error 1064 on the server: it means the input arrives unfiltered.'}
            </div>
            <button class="hint-btn" id="hint-btn-l2" style="display:none" onclick="showLoginHint(2)">
              ${t().nextHint} — <span>${lang==='es'?'¿Cómo eliminar la comprobación de contraseña?':'How to remove the password check?'}</span>
            </button>
            <div class="hint-box" id="hint-l2">
              <div class="hint-level">${t().hintLabel(2)}</div>
              ${lang==='es'
                ? 'Un comentario anula todo lo que viene detrás. En MySQL se escribe <code>-- </code> (con espacio) o <code>#</code>. Si escribes <code>admin\'#</code> la query ya no comprueba la contraseña… pero solo funciona si el usuario <code>admin</code> existe.'
                : 'A comment cancels everything after it. In MySQL it is <code>-- </code> (with a space) or <code>#</code>. If you type <code>admin\'#</code> the query no longer checks the password… but only if the user <code>admin</code> exists.'}
            </div>
            <button class="hint-btn" id="hint-btn-l3" style="display:none" onclick="showLoginHint(3)">
              ${t().nextHint} — <span>${lang==='es'?'Dame el payload completo':'Give me the full payload'}</span>
            </button>
            <div class="hint-box" id="hint-l3">
              <div class="hint-level">${t().hintLabel(3)}</div>
              ${lang==='es'
                ? '✅ Payload: <code>\' OR \'1\'=\'1\' -- -</code> en el campo usuario. La contraseña puede ser cualquier cosa: la condición es siempre verdadera, la consulta devuelve todos los usuarios y la aplicación inicia sesión con el primero (admin).'
                : '✅ Payload: <code>\' OR \'1\'=\'1\' -- -</code> in the username field. Password can be anything: the condition is always true, the query returns every user and the app logs in as the first one (admin).'}
            </div>
          </div>
        </div>
      </div>

      <div>
        ${serverWin('server-login', 'status-login')}
      </div>
    </div>

    <div class="completion-panel" id="comp-login">
      <div class="completion-icon">🎉</div>
      <div class="completion-title">${t().complete}</div>
      <div class="completion-text">${t().completeText}</div>
      <button class="next-btn" onclick="showLesson(${idx+1})">${t().goNext}</button>
    </div>

    ${footerNav(idx)}
  `;

  updateLoginQuery();
}

function showLoginHint(level) {
  if (level >= 1) { document.getElementById('hint-l1').classList.add('visible'); document.getElementById('hint-btn-l2').style.display = 'flex'; }
  if (level >= 2) { document.getElementById('hint-l2').classList.add('visible'); document.getElementById('hint-btn-l3').style.display = 'flex'; }
  if (level >= 3) { document.getElementById('hint-l3').classList.add('visible'); }
}

// ── RENDER LESSON 3: UNION ──
function renderUnion(main, idx) {
  main.innerHTML = `
    <div class="lesson-header">
      <div class="lesson-header-top">
        <div class="lesson-title">${lang === 'es' ? 'Extracción de Datos con UNION' : 'Data Extraction with UNION'}</div>
      </div>
      <div class="lesson-progress">
        <span>${t().progress}</span>
        <div class="progress-bar"><div class="progress-fill" style="width:50%"></div></div>
        <span>3/6</span>
      </div>
    </div>

    <div class="theory-panel">
      <div class="panel-label">${t().theory}</div>
      <div class="theory-text">
        ${lang === 'es' ? `
        <strong>UNION SELECT</strong> es una cláusula SQL que permite combinar el resultado de dos queries en una sola respuesta.<br><br>
        Si una aplicación tiene un buscador de productos, la query original puede ser:<br>
        ` : `
        <strong>UNION SELECT</strong> is a SQL clause that combines the results of two queries into one response.<br><br>
        If an app has a product search, the original query might be:<br>
        `}
      </div>
      ${sqlBlock(`
<span class="sq-k">SELECT</span> nombre, precio <span class="sq-k">FROM</span> productos
<span class="sq-k">WHERE</span> nombre <span class="sq-op">LIKE</span> <span class="sq-s">'%<span style="color:var(--accent)">[BÚSQUEDA]</span>%'</span>
      `)}
      <div class="theory-text" style="margin-top:1rem">
        ${lang === 'es'
          ? 'Un atacante puede inyectar un <code>UNION SELECT</code> para obtener datos de <em>otra tabla</em>, como la tabla de usuarios o contraseñas. <strong>Requisito</strong>: el número de columnas debe coincidir.'
          : 'An attacker can inject a <code>UNION SELECT</code> to get data from <em>another table</em>, like the users or passwords table. <strong>Requirement</strong>: column count must match.'}
      </div>
      <div class="concept-box">
        <div class="concept-title">${lang === 'es' ? '🎯 Objetivo' : '🎯 Goal'}</div>
        ${lang === 'es'
          ? 'Usa UNION SELECT para extraer los datos de la tabla <code>usuarios</code> a través del buscador de productos. La tabla tiene columnas: <code>id, usuario, clave, email, rol</code>.'
          : 'Use UNION SELECT to extract data from the <code>usuarios</code> table through the product search. The table has columns: <code>id, usuario, clave, email, rol</code>.'}
        ${lang==='es'
          ? '<br><br>El motor es real: prueba <code>\' ORDER BY 3 -- -</code> para contar columnas o consulta <code>information_schema.tables</code> para descubrir tablas.'
          : '<br><br>The engine is real: try <code>\' ORDER BY 3 -- -</code> to count columns or query <code>information_schema.tables</code> to discover tables.'}
      </div>
    </div>

    <div class="lab-grid">
      <div class="sim-panel">
        <div class="sim-topbar">
          <div class="sim-dot" style="background:#ff5f57"></div>
          <div class="sim-dot" style="background:#ffbd2e"></div>
          <div class="sim-dot" style="background:#28c840"></div>
          <div class="sim-title">🌐 shop.empresa.com/productos</div>
        </div>
        <div class="sim-body">
          <div class="mock-app">
            <div class="mock-app-bar">🛍 ${lang==='es'?'Catálogo de Productos':'Product Catalog'}</div>
            <div class="mock-app-content">
              <div class="mock-label">${t().search}</div>
              <input class="mock-input" id="u-search" placeholder="${t().searchPlaceholder}" oninput="updateUnionInput()" onkeydown="if(event.key==='Enter')doUnion()" autocomplete="off" spellcheck="false">
              <button class="mock-btn" onclick="doUnion()">${lang==='es'?'Buscar':'Search'}</button>
              <div id="u-result"></div>
            </div>
          </div>
          <div class="live-sql" id="u-live"></div>

          <button class="hint-btn" onclick="showUnionHint(1)">
            ${t().hint} — <span>${lang==='es'?'¿Cómo funciona UNION SELECT?':'How does UNION SELECT work?'}</span>
          </button>
          <div class="hint-box" id="hint-u1">
            <div class="hint-level">${t().hintLabel(1)}</div>
            ${lang==='es'
              ? 'UNION SELECT une dos resultados y las columnas deben coincidir en número. Averígualo con <code>\' ORDER BY 1 -- -</code>, <code>2</code>, <code>3</code>…: cuando da error, te has pasado. Aquí la query original tiene 2 columnas (nombre, precio).'
              : 'UNION SELECT joins two results and the column count must match. Find it with <code>\' ORDER BY 1 -- -</code>, <code>2</code>, <code>3</code>…: when it errors, you went too far. Here the original query has 2 columns (name, price).'}
          </div>
          <button class="hint-btn" id="hint-btn-u2" style="display:none" onclick="showUnionHint(2)">
            ${t().nextHint} — <span>${lang==='es'?'¿Cómo escapar del WHERE y añadir UNION?':'How to escape the WHERE and add UNION?'}</span>
          </button>
          <div class="hint-box" id="hint-u2">
            <div class="hint-level">${t().hintLabel(2)}</div>
            ${lang==='es'
              ? 'Cierra la comilla del <code>LIKE \'%...%\'</code> con <code>\'</code>, añade <code>UNION SELECT</code> con dos columnas de la tabla <code>usuarios</code> y termina con <code>-- -</code> para anular el <code>%\'</code> final.'
              : 'Close the quote of <code>LIKE \'%...%\'</code> with <code>\'</code>, add a two-column <code>UNION SELECT</code> from the <code>usuarios</code> table and finish with <code>-- -</code> to cancel the trailing <code>%\'</code>.'}
          </div>
          <button class="hint-btn" id="hint-btn-u3" style="display:none" onclick="showUnionHint(3)">
            ${t().nextHint} — <span>${lang==='es'?'Dame el payload completo':'Give me the full payload'}</span>
          </button>
          <div class="hint-box" id="hint-u3">
            <div class="hint-level">${t().hintLabel(3)}</div>
            ${lang==='es'
              ? '✅ Escribe: <code>\' UNION SELECT usuario, clave FROM usuarios -- -</code>'
              : '✅ Type: <code>\' UNION SELECT usuario, clave FROM usuarios -- -</code>'}
          </div>
        </div>
      </div>

      <div>${serverWin('server-union','status-union')}</div>
    </div>

    <div class="completion-panel" id="comp-union">
      <div class="completion-icon">🔓</div>
      <div class="completion-title">${t().complete}</div>
      <div class="completion-text">${t().completeText}</div>
      <button class="next-btn" onclick="showLesson(${idx+1})">${t().goNext}</button>
    </div>

    ${footerNav(idx)}
  `;
}

function showUnionHint(level) {
  if (level >= 1) { document.getElementById('hint-u1').classList.add('visible'); document.getElementById('hint-btn-u2').style.display = 'flex'; }
  if (level >= 2) { document.getElementById('hint-u2').classList.add('visible'); document.getElementById('hint-btn-u3').style.display = 'flex'; }
  if (level >= 3) { document.getElementById('hint-u3').classList.add('visible'); }
}

// ── RENDER LESSON 4: BLIND ──
function renderBlind(main, idx) {
  main.innerHTML = `
    <div class="lesson-header">
      <div class="lesson-header-top">
        <div class="lesson-title">${lang === 'es' ? 'Blind SQL Injection' : 'Blind SQL Injection'}</div>
      </div>
      <div class="lesson-progress">
        <span>${t().progress}</span>
        <div class="progress-bar"><div class="progress-fill" style="width:66%"></div></div>
        <span>4/6</span>
      </div>
    </div>

    <div class="theory-panel">
      <div class="panel-label">${t().theory}</div>
      <div class="theory-text">
        ${lang === 'es' ? `
        A veces la aplicación <strong>no muestra el resultado de la query</strong>. Solo da una respuesta binaria: ✔ existe / ✘ no existe.<br><br>
        En <strong>Blind SQLi</strong>, el atacante hace preguntas tipo "verdadero/falso" para deducir datos carácter a carácter. Por ejemplo, para saber la versión de la BD:<br>
        ` : `
        Sometimes the application <strong>doesn't show the query result</strong>. It only gives a binary response: ✔ exists / ✘ doesn't exist.<br><br>
        In <strong>Blind SQLi</strong>, the attacker asks true/false questions to infer data character by character. For example, to find the DB version:<br>
        `}
      </div>
      ${sqlBlock(`
<span class="sq-c">-- ¿El primer carácter de la versión es '5'?</span>
<span class="sq-k">SELECT</span> id <span class="sq-k">FROM</span> productos
<span class="sq-k">WHERE</span> id <span class="sq-op">=</span> <span class="sq-s">1</span> <span class="sq-k">AND</span> <span class="sq-inj">SUBSTRING(VERSION(),1,1)='5'</span>
      `)}
      <div class="theory-text" style="margin-top:1rem">
        ${lang === 'es'
          ? 'Si la página responde igual que normalmente → la condición es <strong>verdadera</strong>. Si la respuesta cambia (error, vacío) → es <strong>falsa</strong>.'
          : 'If the page responds normally → the condition is <strong>true</strong>. If the response changes (error, empty) → it\'s <strong>false</strong>.'}
      </div>
      <div class="concept-box">
        <div class="concept-title">${lang === 'es' ? '🎯 Objetivo' : '🎯 Goal'}</div>
        ${lang === 'es'
          ? 'Descubre el <strong>nombre de la base de datos</strong> haciendo solo preguntas de verdadero/falso con <code>SUBSTRING(database(),N,1)=\'X\'</code> y escríbelo abajo. El servidor no te enseñará el dato: solo si la página encuentra el producto. Con <code>SLEEP()</code> puedes hacer lo mismo midiendo el tiempo (time-based).'
          : 'Find the <strong>database name</strong> by asking only true/false questions with <code>SUBSTRING(database(),N,1)=\'X\'</code> and type it below. The server will not show you the data: only whether the page finds the product. With <code>SLEEP()</code> you can do the same by timing the response (time-based).'}
      </div>
    </div>

    <div class="lab-grid">
      <div class="sim-panel">
        <div class="sim-topbar">
          <div class="sim-dot" style="background:#ff5f57"></div>
          <div class="sim-dot" style="background:#ffbd2e"></div>
          <div class="sim-dot" style="background:#28c840"></div>
          <div class="sim-title">🌐 shop.empresa.com/producto?id=</div>
        </div>
        <div class="sim-body">
          <div class="mock-app">
            <div class="mock-app-bar">📦 ${lang==='es'?'Detalle de Producto':'Product Detail'} — ?id=</div>
            <div class="mock-app-content">
              <div class="mock-label">id (${lang==='es'?'parámetro URL':'URL parameter'})</div>
              <input class="mock-input" id="b-id" placeholder="${lang==='es'?'Ej: 1 AND 1=1':'E.g.: 1 AND 1=1'}" oninput="updateBlindInput()" onkeydown="if(event.key==='Enter')doBlind()" autocomplete="off" spellcheck="false">
              <button class="mock-btn" onclick="doBlind()">${t().submit}</button>
              <div id="b-result"></div>
            </div>
          </div>
          <div class="live-sql" id="b-live"></div>
          <div class="answer-box">
            <div class="mock-label">${lang==='es'?'¿Cómo se llama la base de datos?':'What is the database name?'}</div>
            <div class="answer-row">
              <input class="mock-input" id="b-answer" placeholder="${lang==='es'?'Tu respuesta':'Your answer'}" onkeydown="if(event.key==='Enter')checkBlindAnswer()" autocomplete="off" spellcheck="false">
              <button class="mock-btn" onclick="checkBlindAnswer()">${lang==='es'?'Comprobar':'Check'}</button>
            </div>
            <div id="b-answer-result"></div>
          </div>

          <div style="background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);padding:12px;margin-top:8px;font-size:12px;color:var(--text2)">
            ${lang==='es'
              ? '<strong>Lo que VE el usuario:</strong> solo "Producto encontrado" o "No encontrado". Sin datos de la BD.'
              : '<strong>What the user SEES:</strong> only "Product found" or "Not found". No database data.'}
          </div>

          <button class="hint-btn" onclick="showBlindHint(1)">
            ${t().hint} — <span>${lang==='es'?'¿Qué función usar?':'What function to use?'}</span>
          </button>
          <div class="hint-box" id="hint-b1">
            <div class="hint-level">${t().hintLabel(1)}</div>
            ${lang==='es'
              ? 'Primero comprueba que la inyección funciona: <code>1 AND 1=1</code> debe encontrar el producto y <code>1 AND 1=2</code> no. Después: <code>database()</code> devuelve el nombre de la BD, <code>LENGTH(database())=N</code> su longitud y <code>SUBSTRING(database(),N,1)</code> su carácter N.'
              : 'First check the injection works: <code>1 AND 1=1</code> must find the product and <code>1 AND 1=2</code> must not. Then: <code>database()</code> returns the DB name, <code>LENGTH(database())=N</code> its length and <code>SUBSTRING(database(),N,1)</code> its Nth character.'}
          </div>
          <button class="hint-btn" id="hint-btn-b2" style="display:none" onclick="showBlindHint(2)">
            ${t().nextHint} — <span>${lang==='es'?'¿Cuál es el primer carácter?':'What is the first character?'}</span>
          </button>
          <div class="hint-box" id="hint-b2">
            <div class="hint-level">${t().hintLabel(2)}</div>
            ${lang==='es'
              ? 'Mide la longitud con <code>1 AND LENGTH(database())=7</code>. Para no probar letra a letra, busca cada carácter por mitades con su código ASCII: <code>1 AND ASCII(SUBSTRING(database(),1,1))&gt;109</code> y ve acotando. La primera letra es <code>s</code>.'
              : 'Measure the length with <code>1 AND LENGTH(database())=7</code>. To avoid testing letter by letter, binary-search each character by its ASCII code: <code>1 AND ASCII(SUBSTRING(database(),1,1))&gt;109</code> and narrow it down. The first letter is <code>s</code>.'}
          </div>
        </div>
      </div>

      <div>${serverWin('server-blind','status-blind')}</div>
    </div>

    <div class="completion-panel" id="comp-blind">
      <div class="completion-icon">🕵️</div>
      <div class="completion-title">${t().complete}</div>
      <div class="completion-text">${t().completeText}</div>
      <button class="next-btn" onclick="showLesson(${idx+1})">${t().goNext}</button>
    </div>

    ${footerNav(idx)}
  `;
}

function showBlindHint(level) {
  if (level >= 1) { document.getElementById('hint-b1').classList.add('visible'); document.getElementById('hint-btn-b2').style.display = 'flex'; }
  if (level >= 2) { document.getElementById('hint-b2').classList.add('visible'); }
}
// ── RENDER LESSON 5: ERROR-BASED ──
function renderError(main, idx) {
  main.innerHTML = `
    <div class="lesson-header">
      <div class="lesson-header-top">
        <div class="lesson-title">${lang === 'es' ? 'Error-Based Injection' : 'Error-Based Injection'}</div>
      </div>
      <div class="lesson-progress">
        <span>${t().progress}</span>
        <div class="progress-bar"><div class="progress-fill" style="width:83%"></div></div>
        <span>5/6</span>
      </div>
    </div>

    <div class="theory-panel">
      <div class="panel-label">${t().theory}</div>
      <div class="theory-text">
        ${lang === 'es' ? `
        Cuando la aplicación <strong>muestra los mensajes de error de la base de datos</strong> en pantalla, es posible forzar errores que <em>contengan datos reales</em>.<br><br>
        En MySQL, la función <code>EXTRACTVALUE()</code> y <code>UPDATEXML()</code> lanzan errores que pueden incluir el resultado de una subquery. Así el error <em>se convierte en un canal de exfiltración</em>.
        ` : `
        When the application <strong>displays database error messages</strong> on screen, it's possible to force errors that <em>contain real data</em>.<br><br>
        In MySQL, functions like <code>EXTRACTVALUE()</code> and <code>UPDATEXML()</code> throw errors that can include a subquery result. So the error <em>becomes an exfiltration channel</em>.
        `}
      </div>
      ${sqlBlock(`
<span class="sq-c">-- Forzamos un error que contiene el usuario actual de la BD</span>
<span class="sq-k">SELECT</span> <span class="sq-v">*</span> <span class="sq-k">FROM</span> productos
<span class="sq-k">WHERE</span> id <span class="sq-op">=</span> <span class="sq-inj">EXTRACTVALUE(1,CONCAT(0x7e,(SELECT user()),0x7e))</span>
<span class="sq-c">-- El error mostrará: XPATH syntax error: '~webapp@localhost~'</span>
      `)}
      <div class="concept-box">
        <div class="concept-title">${lang === 'es' ? '🎯 Objetivo' : '🎯 Goal'}</div>
        ${lang === 'es'
          ? 'Usa <code>EXTRACTVALUE</code> (o <code>UPDATEXML</code>) con <code>CONCAT(0x7e, …)</code> para forzar un error que muestre el resultado de <code>database()</code>. Empieza reproduciendo el ejemplo de arriba con <code>user()</code>.'
          : 'Use <code>EXTRACTVALUE</code> (or <code>UPDATEXML</code>) with <code>CONCAT(0x7e, …)</code> to force an error that shows the result of <code>database()</code>. Start by reproducing the example above with <code>user()</code>.'}
      </div>
    </div>

    <div class="lab-grid">
      <div class="sim-panel">
        <div class="sim-topbar">
          <div class="sim-dot" style="background:#ff5f57"></div>
          <div class="sim-dot" style="background:#ffbd2e"></div>
          <div class="sim-dot" style="background:#28c840"></div>
          <div class="sim-title">🌐 shop.empresa.com/producto?id=</div>
        </div>
        <div class="sim-body">
          <div class="mock-app">
            <div class="mock-app-bar">📦 ${lang==='es'?'Detalle de Producto':'Product Detail'} — ?id= <span style="color:var(--red);font-size:10px">${lang==='es'?'[errores visibles]':'[errors visible]'}</span></div>
            <div class="mock-app-content">
              <div class="mock-label">id</div>
              <input class="mock-input" id="e-id" placeholder="${lang==='es'?'Ej: 1':'E.g.: 1'}" oninput="updateErrInput()" onkeydown="if(event.key==='Enter')doError()" autocomplete="off" spellcheck="false">
              <button class="mock-btn" onclick="doError()">${t().submit}</button>
              <div id="e-result"></div>
            </div>
          </div>
          <div class="live-sql" id="e-live"></div>

          <button class="hint-btn" onclick="showErrHint(1)">
            ${t().hint} — <span>${lang==='es'?'¿Por qué se usa 0x7e?':'Why is 0x7e used?'}</span>
          </button>
          <div class="hint-box" id="hint-e1">
            <div class="hint-level">${t().hintLabel(1)}</div>
            ${lang==='es'
              ? '<code>0x7e</code> es el código hexadecimal del carácter <code>~</code>. Lo usamos como separador para que el resultado sea fácil de leer en el mensaje de error: <code>~shop_db~</code>'
              : '<code>0x7e</code> is the hex code for <code>~</code>. We use it as a separator so the result is easy to read in the error message: <code>~shop_db~</code>'}
          </div>
          <button class="hint-btn" id="hint-btn-e2" style="display:none" onclick="showErrHint(2)">
            ${t().nextHint} — <span>${lang==='es'?'Dame el payload completo':'Give me the full payload'}</span>
          </button>
          <div class="hint-box" id="hint-e2">
            <div class="hint-level">${t().hintLabel(2)}</div>
            ${lang==='es'
              ? '✅ Escribe: <code>EXTRACTVALUE(1,CONCAT(0x7e,(SELECT database()),0x7e))</code>'
              : '✅ Type: <code>EXTRACTVALUE(1,CONCAT(0x7e,(SELECT database()),0x7e))</code>'}
          </div>
        </div>
      </div>

      <div>${serverWin('server-error','status-error')}</div>
    </div>

    <div class="completion-panel" id="comp-error">
      <div class="completion-icon">💥</div>
      <div class="completion-title">${t().complete}</div>
      <div class="completion-text">${t().completeText}</div>
      <button class="next-btn" onclick="showLesson(${idx+1})">${t().goNext}</button>
    </div>

    ${footerNav(idx)}
  `;
}

function showErrHint(level) {
  if (level >= 1) { document.getElementById('hint-e1').classList.add('visible'); document.getElementById('hint-btn-e2').style.display = 'flex'; }
  if (level >= 2) { document.getElementById('hint-e2').classList.add('visible'); }
}
// ── RENDER LESSON 6: DEFENSE ──
function renderDefense(main, idx) {
  main.innerHTML = `
    <div class="lesson-header">
      <div class="lesson-header-top">
        <div class="lesson-title">${lang === 'es' ? '🛡 Cómo Defenderse de SQLi' : '🛡 How to Defend Against SQLi'}</div>
      </div>
      <div class="lesson-progress">
        <span>${t().progress}</span>
        <div class="progress-bar"><div class="progress-fill" style="width:100%"></div></div>
        <span>6/6</span>
      </div>
    </div>

    <div class="theory-panel">
      <div class="panel-label">${lang==='es'?'LA DEFENSA MÁS IMPORTANTE':'THE MOST IMPORTANT DEFENSE'}</div>
      <div class="theory-text" style="margin-bottom:1rem">
        ${lang === 'es'
          ? '<strong>Consultas parametrizadas (Prepared Statements)</strong> — La solución definitiva. Separan el código SQL de los datos, haciendo imposible la inyección.'
          : '<strong>Parameterized queries (Prepared Statements)</strong> — The definitive solution. They separate SQL code from data, making injection impossible.'}
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem">
        <div>
          <div style="font-size:11px;font-weight:700;letter-spacing:0.1em;color:var(--red);margin-bottom:8px">❌ ${lang==='es'?'CÓDIGO VULNERABLE':'VULNERABLE CODE'}</div>
          <div class="defense-code">
<span class="dc-comment">// PHP — VULNERABLE</span>
<span class="dc-var">$user</span> = <span class="dc-var">$_POST</span>[<span class="dc-str">'usuario'</span>];
<span class="dc-var">$pass</span> = <span class="dc-var">$_POST</span>[<span class="dc-str">'clave'</span>];

<span class="dc-var">$sql</span> = <span class="dc-str">"SELECT * FROM users
  WHERE user='<span class="dc-var">$user</span>'
  AND pass='<span class="dc-var">$pass</span>'"</span>;

<span class="dc-var">$result</span> = <span class="dc-fn">mysqli_query</span>(<span class="dc-var">$con</span>, <span class="dc-var">$sql</span>);
<span class="dc-comment">// ⚠ Concatenación directa → SQLi</span>
          </div>
        </div>
        <div>
          <div style="font-size:11px;font-weight:700;letter-spacing:0.1em;color:var(--green);margin-bottom:8px">✅ ${lang==='es'?'CÓDIGO SEGURO':'SAFE CODE'}</div>
          <div class="defense-code">
<span class="dc-comment">// PHP — SEGURO (PDO)</span>
<span class="dc-var">$sql</span> = <span class="dc-str">"SELECT * FROM users
  WHERE user=? AND pass=?"</span>;

<span class="dc-var">$stmt</span> = <span class="dc-var">$pdo</span>-><span class="dc-fn">prepare</span>(<span class="dc-var">$sql</span>);

<span class="dc-var">$stmt</span>-><span class="dc-fn">execute</span>([
  <span class="dc-var">$_POST</span>[<span class="dc-str">'usuario'</span>],
  <span class="dc-var">$_POST</span>[<span class="dc-str">'clave'</span>]
]);
<span class="dc-comment">// ✔ Datos separados → imposible SQLi</span>
          </div>
        </div>
      </div>
    </div>

    <div class="theory-panel">
      <div class="panel-label">${lang==='es'?'OTRAS DEFENSAS ESENCIALES':'OTHER ESSENTIAL DEFENSES'}</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:1rem;margin-top:0.5rem">
        ${[
          ['🔡', lang==='es'?'Validación de entrada':'Input Validation', lang==='es'?'Verifica tipo y formato antes de usar el dato. Un campo numérico solo debe aceptar números.':'Verify type and format before using data. A numeric field should only accept numbers.'],
          ['🔐', lang==='es'?'Mínimos privilegios':'Least Privilege', lang==='es'?'El usuario de BD de la app solo debe tener permiso SELECT. Nunca DROP, nunca admin.':'The app\'s DB user should only have SELECT permission. Never DROP, never admin.'],
          ['🚫', lang==='es'?'No mostrar errores':'Hide Error Messages', lang==='es'?'Desactiva los mensajes de error de BD en producción. Son un mapa para el atacante.':'Disable DB error messages in production. They\'re a roadmap for attackers.'],
          ['🔍', lang==='es'?'WAF (Web Application Firewall)':'WAF (Web Application Firewall)', lang==='es'?'Un WAF puede detectar y bloquear payloads SQLi comunes antes de que lleguen al servidor.':'A WAF can detect and block common SQLi payloads before they reach the server.'],
          ['📦', lang==='es'?'ORM modernos':'Modern ORMs', lang==='es'?'Frameworks como Django, Laravel, Spring usan consultas parametrizadas automáticamente.':'Frameworks like Django, Laravel, Spring use parameterized queries automatically.'],
          ['🧪', lang==='es'?'Tests de seguridad':'Security Testing', lang==='es'?'Herramientas como sqlmap, Burp Suite y OWASP ZAP para auditar tus propias apps.':'Tools like sqlmap, Burp Suite and OWASP ZAP to audit your own apps.'],
        ].map(([icon, name, desc]) => `
          <div style="background:var(--bg3);border:1px solid var(--success-border);border-radius:var(--radius);padding:1rem">
            <div style="font-size:18px;margin-bottom:6px">${icon}</div>
            <div style="font-weight:700;font-size:13px;margin-bottom:4px;color:var(--green)">${name}</div>
            <div style="font-size:12px;color:var(--text2);line-height:1.5">${desc}</div>
          </div>
        `).join('')}
      </div>
    </div>

    <div class="theory-panel">
      <div class="panel-label">${lang==='es'?'SIMULADOR: CONSULTA SEGURA VS VULNERABLE':'SIMULATOR: SAFE VS VULNERABLE QUERY'}</div>
      <div style="margin-bottom:1rem">
        <div class="mock-label">${lang==='es'?'Introduce un payload malicioso y observa la diferencia:':'Enter a malicious payload and observe the difference:'}</div>
        <input class="mock-input" id="d-input" placeholder="' OR '1'='1' -- -" value="' OR '1'='1' -- -" style="max-width:400px" onkeydown="if(event.key==='Enter')doDefense()" autocomplete="off" spellcheck="false">
        <button class="mock-btn" onclick="doDefense()" style="margin-left:8px">${lang==='es'?'Comparar':'Compare'}</button>
      </div>
      <div class="lab-grid">
        <div>
          <div style="font-size:11px;font-weight:700;letter-spacing:0.08em;color:var(--red);margin-bottom:8px">❌ ${lang==='es'?'Sin protección':'Without protection'}</div>
          <div class="server-win"><div class="server-topbar"><div class="server-title">vulnerable_app.php</div><span class="server-status status-idle" id="def-status1">IDLE</span></div><div class="server-body" id="def-srv1">${logLine('info','SRV',lang==='es'?'Esperando...':'Waiting...')}</div></div>
        </div>
        <div>
          <div style="font-size:11px;font-weight:700;letter-spacing:0.08em;color:var(--green);margin-bottom:8px">✅ ${lang==='es'?'Con Prepared Statements':'With Prepared Statements'}</div>
          <div class="server-win"><div class="server-topbar"><div class="server-title">secure_app.php (PDO)</div><span class="server-status status-idle" id="def-status2">IDLE</span></div><div class="server-body" id="def-srv2">${logLine('info','SRV',lang==='es'?'Esperando...':'Waiting...')}</div></div>
        </div>
      </div>
    </div>

    <div class="completion-panel" id="comp-defense" style="display:block;background:var(--success-bg);border-color:var(--success-border)">
      <div class="completion-icon">🎓</div>
      <div class="completion-title" style="color:var(--accent)">${lang==='es'?'¡Laboratorio completado!':'Lab complete!'}</div>
      <div class="completion-text">${lang==='es'
        ? 'Has aprendido qué es SQL Injection, cómo funciona, sus variantes y cómo prevenirlo. Ahora tienes las bases para hacer auditorías responsables y escribir código seguro.'
        : 'You\'ve learned what SQL Injection is, how it works, its variants and how to prevent it. Now you have the foundations for responsible audits and writing secure code.'}</div>
      <div style="margin-top:1rem;display:flex;gap:1rem;justify-content:center;flex-wrap:wrap">
        <button class="next-btn" onclick="showLesson(0)" style="background:var(--bg3);color:var(--text);border:1px solid var(--border)">${lang==='es'?'🏠 Inicio':'🏠 Home'}</button>
        <a href="https://www.unfantasmaenelsistema.com" target="_blank" style="text-decoration:none"><button class="next-btn">🌐 ${lang==='es'?'Más recursos':'More resources'}</button></a>
      </div>
    </div>

    ${footerNav(idx)}
  `;
  markComplete(6);
}

// ── MOTOR: consultas reales contra la base simulada ──
const LOGIN_SQL = "SELECT * FROM usuarios WHERE usuario = '{0}' AND clave = '{1}'";
const UNION_SQL = "SELECT nombre, precio FROM productos WHERE nombre LIKE '%{0}%'";
const ID_SQL = 'SELECT * FROM productos WHERE id = {0}';
const DEFENSE_SQL = "SELECT * FROM usuarios WHERE usuario = '{0}'";
const esc = (s) => SqlEngine.escapeHtml(s);
const val = (id) => document.getElementById(id)?.value || '';

// Sustituye {0}, {1}... por lo que escribió el usuario y recuerda dónde quedó cada parte
function buildQuery(template, inputs) {
  let sql = '';
  let last = 0;
  const ranges = [];
  template.replace(/\{(\d)\}/g, (m, i, offset) => {
    sql += template.slice(last, offset);
    const v = inputs[Number(i)];
    ranges.push([sql.length, sql.length + v.length]);
    sql += v;
    last = offset + m.length;
    return m;
  });
  sql += template.slice(last);
  return { sql, ranges };
}

// benign: valor inocente del mismo tipo (texto 'x' o número '1') para saber si la entrada cambió la estructura
function runQuery(template, inputs, benign = 'x') {
  const { sql, ranges } = buildQuery(template, inputs);
  const injected = inputs.some((v, i) =>
    SqlEngine.isInjection(template.replace(`{${i}}`, '{INPUT}').replace(/\{\d\}/g, benign), v, benign));
  return { sql, ranges, injected, res: SqlEngine.execute(sql) };
}

function livePreview(id, template, inputs) {
  const el = document.getElementById(id);
  if (!el) return;
  const { sql, ranges } = buildQuery(template, inputs);
  el.innerHTML = `<span class="live-lbl">${lang === 'es' ? 'Consulta que se enviará' : 'Query to be sent'}</span>${SqlEngine.highlight(sql, ranges)}`;
}

function markInput(id, template, inputs, idx, benign = 'x') {
  const el = document.getElementById(id);
  if (!el) return;
  const v = inputs[idx];
  const inj = v !== '' && SqlEngine.isInjection(template.replace(`{${idx}}`, '{INPUT}').replace(/\{\d\}/g, benign), v, benign);
  el.className = 'mock-input' + (inj ? ' injected' : '');
}

function queryLog(q) {
  return logLine('sql', 'SQL', lang === 'es' ? 'Consulta construida y ejecutada:' : 'Query built and executed:') + sqlBlock(SqlEngine.highlight(q.sql, q.ranges));
}

function dashTip(res) {
  if (!res.dashNoSpace) return '';
  return logLine('warn', 'TIP', lang === 'es'
    ? 'En MySQL «--» solo abre un comentario si va seguido de un espacio: usa «-- -» o «#».'
    : 'In MySQL "--" only starts a comment when followed by a space: use "-- -" or "#".');
}

function errorLog(res) {
  return logLine('err', 'ERR', esc(res.error.message)) + dashTip(res);
}

function timeLog(res) {
  const secs = (0.003 + res.delay).toFixed(3);
  return logLine(res.delay ? 'warn' : 'info', 'TIME', (lang === 'es' ? 'Tiempo de respuesta: ' : 'Response time: ') + secs + ' s' +
    (res.delay ? (lang === 'es' ? ' ← SLEEP() retrasó la respuesta' : ' ← SLEEP() delayed the response') : ''));
}

function rowsLog(n) {
  return logLine(n ? 'ok' : 'info', 'RES', (lang === 'es' ? 'Filas devueltas: ' : 'Rows returned: ') + n);
}

function resultTable(res, exposed = []) {
  if (!res.rows.length) return '';
  return dbTable(res.columns, res.rows.map((r) => r.map((v) => (v === null ? 'NULL' : SqlEngine.toStr(v)))), exposed);
}

// SLEEP() se nota de verdad: la respuesta tarda (hasta 4 s para no eternizarse)
const waitFor = (res) => 700 + Math.min(res.delay || 0, 4) * 1000;

function setStatus(el, kind) {
  const map = { query: ['querying', 'status-query'], ok: ['success', 'status-ok'], pwned: ['pwned', 'status-pwned'], idle: ['idle', 'status-idle'], err: ['error', 'status-err'] };
  const [key, cls] = map[kind];
  el.textContent = key === 'error' ? 'ERROR' : t()[key];
  el.className = 'server-status ' + cls;
}

function mockMsg(kind, html) {
  return `<div class="mock-result mock-${kind}">${html}</div>`;
}

const PASSWORDS = SqlEngine.TABLES.usuarios.rows.map((r) => r[2]);
const leaksPassword = (rows) => rows.some((r) => r.some((v) => v !== null && PASSWORDS.some((p) => SqlEngine.toStr(v).includes(p))));

// ── LECCIÓN 2: LOGIN ──
function updateLoginQuery() {
  const inputs = [val('l-user'), val('l-pass')];
  markInput('l-user', LOGIN_SQL, inputs, 0);
  markInput('l-pass', LOGIN_SQL, inputs, 1);
  livePreview('l-live', LOGIN_SQL, inputs);
}

function doLogin() {
  const user = val('l-user');
  const pass = val('l-pass');
  const srv = document.getElementById('server-login');
  const status = document.getElementById('status-login');
  const page = document.getElementById('l-result');
  if (!srv) return;
  if (!user && !pass) {
    srv.innerHTML = logLine('err', 'AUTH', lang === 'es' ? 'Campos vacíos: no se ejecuta la consulta' : 'Empty fields: query not executed');
    return;
  }
  setStatus(status, 'query');
  const q = runQuery(LOGIN_SQL, [user, pass]);
  let logs = queryLog(q);
  let pageHtml;

  setTimeout(() => {
    if (!q.res.ok) {
      logs += errorLog(q.res);
      pageHtml = mockMsg('err', lang === 'es' ? '⚠ Error interno del servidor (500)' : '⚠ Internal server error (500)');
      setStatus(status, 'err');
    } else if (q.res.rows.length) {
      const [, name, , , rol] = q.res.rows[0];
      logs += rowsLog(q.res.rows.length) + resultTable(q.res, [0]);
      logs += logLine('ok', 'AUTH', lang === 'es'
        ? `La aplicación toma la primera fila → sesión iniciada como ${esc(name)} (${esc(rol)})`
        : `The app takes the first row → logged in as ${esc(name)} (${esc(rol)})`);
      pageHtml = mockMsg('ok', `✔ ${lang === 'es' ? 'Bienvenido' : 'Welcome'}, <b>${esc(name)}</b> · ${esc(rol)}`);
      if (q.injected) {
        logs += resultBadge('danger', '⚠ ' + t().injected + ' — ' + (lang === 'es' ? 'login saltado' : 'login bypassed'));
        setStatus(status, 'pwned');
        document.getElementById('comp-login').classList.add('visible');
        markComplete(2);
      } else {
        logs += logLine('info', 'TIP', lang === 'es'
          ? 'Has entrado con la contraseña correcta: eso no es un ataque. El reto es entrar sin conocerla.'
          : 'You used the correct password: that is not an attack. The challenge is to get in without knowing it.');
        setStatus(status, 'ok');
      }
    } else {
      logs += rowsLog(0) + logLine('err', 'AUTH', t().loginFail);
      if (q.injected) {
        logs += logLine('info', 'TIP', lang === 'es'
          ? 'Has cambiado la consulta, pero la condición no devuelve ninguna fila: haz que sea siempre verdadera o que apunte a un usuario que exista.'
          : 'You changed the query, but the condition returns no rows: make it always true or point it at an existing user.');
      }
      pageHtml = mockMsg('err', '✘ ' + (lang === 'es' ? 'Usuario o contraseña incorrectos' : 'Invalid username or password'));
      setStatus(status, 'idle');
    }
    logs += timeLog(q.res);
    srv.innerHTML = logs;
    page.innerHTML = pageHtml;
  }, waitFor(q.res));
}

// ── LECCIÓN 3: UNION ──
function updateUnionInput() {
  const inputs = [val('u-search')];
  markInput('u-search', UNION_SQL, inputs, 0);
  livePreview('u-live', UNION_SQL, inputs);
}

function doUnion() {
  const s = val('u-search');
  const srv = document.getElementById('server-union');
  const status = document.getElementById('status-union');
  const page = document.getElementById('u-result');
  if (!srv) return;
  setStatus(status, 'query');
  const q = runQuery(UNION_SQL, [s]);
  let logs = queryLog(q);
  let pageHtml;

  setTimeout(() => {
    if (!q.res.ok) {
      logs += errorLog(q.res);
      if (q.res.error.code === 1222) {
        logs += logLine('info', 'TIP', lang === 'es'
          ? 'La consulta original devuelve 2 columnas: tu SELECT también debe tener 2 (rellena con NULL si sobra alguna).'
          : 'The original query returns 2 columns: your SELECT must have 2 as well (pad with NULL if needed).');
      }
      pageHtml = mockMsg('err', lang === 'es' ? '⚠ No se pudo completar la búsqueda' : '⚠ The search could not be completed');
      setStatus(status, 'err');
    } else {
      const leaked = leaksPassword(q.res.rows);
      const productCount = SqlEngine.TABLES.productos.rows.length;
      const exposed = q.res.rows.map((r, i) => (r.some((v) => v !== null && PASSWORDS.some((p) => SqlEngine.toStr(v).includes(p))) ? i : -1)).filter((i) => i >= 0);
      logs += rowsLog(q.res.rows.length) + resultTable(q.res, exposed);
      pageHtml = q.res.rows.length
        ? `<div class="mock-list">${q.res.rows.map((r) => `<div class="mock-item"><span>${esc(r[0] === null ? 'NULL' : SqlEngine.toStr(r[0]))}</span><b>${esc(r[1] === null ? 'NULL' : SqlEngine.toStr(r[1]))}${typeof r[1] === 'number' ? ' €' : ''}</b></div>`).join('')}</div>`
        : mockMsg('info', lang === 'es' ? 'No hay productos que coincidan' : 'No matching products');
      if (leaked) {
        logs += logLine('ok', 'EXF', lang === 'es' ? 'Contraseñas de la tabla usuarios mostradas como si fueran productos' : 'Passwords from the usuarios table shown as if they were products');
        logs += resultBadge('danger', '⚠ ' + t().unionSuccess);
        setStatus(status, 'pwned');
        document.getElementById('comp-union').classList.add('visible');
        markComplete(3);
      } else if (q.injected && q.res.rows.length > 0 && !q.res.rows.every((r, i) => i < productCount)) {
        logs += logLine('warn', 'INFO', lang === 'es' ? 'Tu UNION funciona: ahora apunta a la tabla de usuarios y a sus columnas.' : 'Your UNION works: now aim it at the users table and its columns.');
        setStatus(status, 'ok');
      } else {
        setStatus(status, 'ok');
      }
    }
    logs += timeLog(q.res);
    srv.innerHTML = logs;
    page.innerHTML = pageHtml;
  }, waitFor(q.res));
}

// ── LECCIÓN 4: BLIND ──
let blindRequests = 0;
function updateBlindInput() {
  const inputs = [val('b-id')];
  markInput('b-id', ID_SQL, inputs, 0, '1');
  livePreview('b-live', ID_SQL, inputs);
}

function doBlind() {
  const s = val('b-id');
  const srv = document.getElementById('server-blind');
  const status = document.getElementById('status-blind');
  const page = document.getElementById('b-result');
  if (!srv || !s.trim()) return;
  setStatus(status, 'query');
  blindRequests++;
  const q = runQuery(ID_SQL, [s], '1');
  // En una inyección ciega el servidor no enseña datos: solo si hubo filas y cuánto tardó
  let logs = queryLog(q);
  let pageHtml;
  setTimeout(() => {
    if (!q.res.ok) {
      logs += logLine('err', 'ERR', lang === 'es' ? 'Error de base de datos (oculto al usuario)' : 'Database error (hidden from the user)');
      logs += dashTip(q.res);
      pageHtml = mockMsg('err', lang === 'es' ? '⚠ Algo salió mal' : '⚠ Something went wrong');
      setStatus(status, 'err');
    } else {
      const found = q.res.rows.length > 0;
      logs += rowsLog(q.res.rows.length);
      logs += logLine(found ? 'ok' : 'info', 'EVAL', found
        ? (lang === 'es' ? 'Condición VERDADERA → la página muestra el producto' : 'Condition TRUE → the page shows the product')
        : (lang === 'es' ? 'Condición FALSA → la página dice «no encontrado»' : 'Condition FALSE → the page says "not found"'));
      pageHtml = found
        ? mockMsg('ok', '✔ ' + (lang === 'es' ? 'Producto encontrado' : 'Product found'))
        : mockMsg('info', '✘ ' + (lang === 'es' ? 'Producto no encontrado' : 'Product not found'));
      setStatus(status, found ? 'ok' : 'idle');
    }
    logs += timeLog(q.res);
    logs += logLine('info', 'REQ', (lang === 'es' ? 'Peticiones enviadas: ' : 'Requests sent: ') + blindRequests);
    srv.innerHTML = logs;
    page.innerHTML = pageHtml;
  }, waitFor(q.res));
}

function checkBlindAnswer() {
  const answer = val('b-answer').trim().toLowerCase();
  const out = document.getElementById('b-answer-result');
  if (!answer) return;
  if (answer === SqlEngine.DB_NAME) {
    out.innerHTML = mockMsg('ok', (lang === 'es' ? `✔ Correcto: la base de datos se llama <b>${SqlEngine.DB_NAME}</b>. Lo has deducido con ${blindRequests} peticiones sin ver ni un dato.` : `✔ Correct: the database is called <b>${SqlEngine.DB_NAME}</b>. You inferred it in ${blindRequests} requests without seeing any data.`));
    document.getElementById('comp-blind').classList.add('visible');
    markComplete(4);
  } else {
    out.innerHTML = mockMsg('err', lang === 'es' ? '✘ No es ese nombre. Sigue preguntando carácter a carácter.' : '✘ That is not the name. Keep asking character by character.');
  }
}

// ── LECCIÓN 5: ERROR-BASED ──
function updateErrInput() {
  const inputs = [val('e-id')];
  markInput('e-id', ID_SQL, inputs, 0, '1');
  livePreview('e-live', ID_SQL, inputs);
}

function doError() {
  const s = val('e-id');
  const srv = document.getElementById('server-error');
  const status = document.getElementById('status-error');
  const page = document.getElementById('e-result');
  if (!srv || !s.trim()) return;
  setStatus(status, 'query');
  const q = runQuery(ID_SQL, [s], '1');
  let logs = queryLog(q);
  let pageHtml;
  setTimeout(() => {
    if (!q.res.ok) {
      logs += errorLog(q.res);
      const leak = q.res.error.xpathLeak;
      // La aplicación muestra el error tal cual: ese es el fallo que se explota
      pageHtml = mockMsg('err', `<div class="mock-err-title">⚠ MySQL Error</div>${esc(q.res.error.mysqlMessage)}`);
      if (leak && leak.includes(SqlEngine.DB_NAME)) {
        logs += logLine('warn', 'RESP', lang === 'es' ? 'El mensaje de error, con el nombre de la base de datos dentro, llega al navegador' : 'The error message, with the database name inside, reaches the browser');
        logs += resultBadge('danger', '⚠ ' + t().errorLeak);
        setStatus(status, 'pwned');
        document.getElementById('comp-error').classList.add('visible');
        markComplete(5);
      } else {
        if (leak) {
          logs += logLine('warn', 'LEAK', (lang === 'es' ? 'El error filtra: ' : 'The error leaks: ') + esc(leak.replace(/^~|~$/g, '')) +
            (lang === 'es' ? ' — ahora haz que muestre database()' : ' — now make it show database()'));
        }
        setStatus(status, 'err');
      }
    } else {
      logs += rowsLog(q.res.rows.length) + resultTable(q.res);
      pageHtml = q.res.rows.length
        ? mockMsg('ok', `📦 ${esc(SqlEngine.toStr(q.res.rows[0][1]))} — ${esc(SqlEngine.toStr(q.res.rows[0][2]))} €`)
        : mockMsg('info', lang === 'es' ? 'Producto no encontrado' : 'Product not found');
      if (/extractvalue|updatexml/i.test(s)) {
        logs += logLine('info', 'TIP', lang === 'es'
          ? 'Sin error no hay fuga: la XPath debe empezar por un carácter no válido, por eso se antepone 0x7e (~).'
          : 'No error, no leak: the XPath must start with an invalid character, hence the leading 0x7e (~).');
      }
      setStatus(status, 'ok');
    }
    logs += timeLog(q.res);
    srv.innerHTML = logs;
    page.innerHTML = pageHtml;
  }, waitFor(q.res));
}

// ── LECCIÓN 6: DEFENSA ──
function doDefense() {
  const s = val('d-input');
  const srv1 = document.getElementById('def-srv1');
  const srv2 = document.getElementById('def-srv2');
  const st1 = document.getElementById('def-status1');
  const st2 = document.getElementById('def-status2');
  if (!srv1 || !srv2) return;
  setStatus(st1, 'query');
  setStatus(st2, 'query');
  const q = runQuery(DEFENSE_SQL, [s]);
  const safe = SqlEngine.executePrepared("SELECT * FROM usuarios WHERE usuario = ?", [s]);
  setTimeout(() => {
    let logs1 = logLine('sql', 'SQL', lang === 'es' ? 'Consulta concatenada:' : 'Concatenated query:') + sqlBlock(SqlEngine.highlight(q.sql, q.ranges));
    if (!q.res.ok) {
      logs1 += errorLog(q.res);
      setStatus(st1, 'err');
    } else {
      logs1 += rowsLog(q.res.rows.length) + resultTable(q.res);
      if (q.injected) {
        logs1 += resultBadge('danger', '⚠ VULNERABLE — ' + t().injected);
        setStatus(st1, 'pwned');
      } else {
        setStatus(st1, 'ok');
      }
    }
    if (q.injected && q.res.ok) logs1 += logLine('err', 'SEC', lang === 'es' ? 'La entrada se ha ejecutado como código SQL' : 'The input was executed as SQL code');
    srv1.innerHTML = logs1;

    let logs2 = logLine('info', 'PDO', lang === 'es' ? 'Prepared Statement — la consulta se compila sin el dato:' : 'Prepared statement — the query is compiled without the data:');
    logs2 += sqlBlock(SqlEngine.highlight('SELECT * FROM usuarios WHERE usuario = ?'));
    logs2 += logLine('info', 'BIND', (lang === 'es' ? 'Valor ligado como texto: ' : 'Value bound as text: ') + '"' + esc(s) + '"');
    logs2 += logLine('ok', 'SEC', lang === 'es' ? 'El valor se trata como dato, nunca como código SQL' : 'The value is treated as data, never as SQL code');
    logs2 += rowsLog(safe.ok ? safe.rows.length : 0) + (safe.ok ? resultTable(safe) : '');
    logs2 += resultBadge('success', '✅ ' + t().safe);
    setStatus(st2, 'ok');
    srv2.innerHTML = logs2;
  }, 700);
}

// ── INIT ──
applyTheme(theme);
setLang(lang);
