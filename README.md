<p align="center">
  <a href="https://www.unfantasmaenelsistema.com/" target="_blank" rel="noopener noreferrer">
    <img src="icono.png" alt="Un Fantasma en el Sistema" width="120" height="120" />
  </a>
</p>

<h1 align="center">SQLi Lab</h1>

<p align="center">
  <strong>Aprende SQL Injection paso a paso viendo lo que pasa dentro del servidor y de la base de datos.</strong><br>
  Seis lecciones con un motor SQL real (estilo MySQL 8) que corre en tu navegador. ES/EN y tema claro/oscuro.
</p>

<p align="center">
  <a href="https://unfantasmaenelsistema.github.io/sqli-Lab/"><strong>▶ Abrir SQLi Lab</strong></a>
  ·
  <a href="https://www.unfantasmaenelsistema.com/">Un Fantasma en el Sistema</a>
</p>

---

## 📚 Lecciones

| # | Lección | Qué practicas |
| :-: | :-- | :-- |
| 1 | ¿Qué es SQL Injection? | Cómo una entrada sin filtrar cambia una consulta |
| 2 | Bypass de login | `' OR '1'='1' -- -`, comentarios y por qué `--` necesita un espacio en MySQL |
| 3 | Extracción con UNION | Contar columnas con `ORDER BY`, `UNION SELECT` e `information_schema` |
| 4 | Blind SQL Injection | Preguntas verdadero/falso, `LENGTH`, `SUBSTRING`, `ASCII` y `SLEEP()` (time-based) |
| 5 | Error-based | `EXTRACTVALUE` / `UPDATEXML` con `CONCAT(0x7e, …)` |
| 6 | Defensa | La misma entrada contra una consulta concatenada y contra una parametrizada |

## ⚙️ Un motor SQL de verdad

Los laboratorios no comparan cadenas: cada envío se ejecuta en `sql-engine.js`, un intérprete de un subconjunto de MySQL contra una base simulada (`shop_db` con `usuarios` y `productos`). Por eso responde como un servidor real:

- Un payload solo funciona si es SQL válido: `admin'--` da error 1064 (en MySQL `--` exige un espacio), `nobody'#` no entra porque ese usuario no existe y la contraseña correcta no cuenta como ataque.
- Errores con su código: 1064 (sintaxis), 1222 (UNION con distinto número de columnas), 1054 (`ORDER BY` fuera de rango o columna desconocida), 1146 (tabla inexistente), 1242 (subconsulta con varias filas) y 1105 (XPATH).
- Comparaciones sin distinguir mayúsculas, conversión de texto a número (`'admin' = 0` es verdadero), precedencia `AND` antes que `OR`, `LIKE`, subconsultas, `GROUP_CONCAT`, `LIMIT` y `information_schema`.
- `SLEEP()` retrasa la respuesta de verdad para practicar la inyección por tiempo.
- No admite consultas apiladas (`; DROP TABLE …`), igual que `mysqli_query`.

Debajo de cada formulario se ve la consulta que se enviará, con tu parte resaltada; en la ventana del servidor, la consulta ejecutada, las filas, el error y el tiempo de respuesta. En la lección *blind* el servidor no muestra datos: tendrás que deducir el nombre de la base de datos.

## ⚖️ Uso responsable

Todo ocurre en tu navegador contra una base de datos inventada. Practica estas técnicas solo en laboratorios propios o con autorización por escrito: atacar sistemas ajenos es delito.

## 🚀 Uso local

Es una página estática: abre `index.html` o sírvela con cualquier servidor.

```bash
python -m http.server 8000
```

Pruebas del motor (Node 20+):

```bash
node --test tests/sql-engine.test.js
```

## 📁 Estructura

```text
├── index.html        # Estructura de la página
├── styles.css        # Estilos (tema oscuro y claro)
├── sql-engine.js     # Motor SQL estilo MySQL y base de datos simulada (también para Node)
├── app.js            # Lecciones, laboratorios, idioma y tema
├── icono.png         # Logo de Un Fantasma en el Sistema
└── tests/            # Pruebas del motor
```

## 📄 Licencia

[MIT](LICENSE) · Creado por [Un Fantasma en el Sistema](https://www.unfantasmaenelsistema.com/).
