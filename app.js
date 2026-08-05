/* ==========================================================
   CONFIGURACIÓN
   ========================================================== */
const STATUS_OPTIONS = ["ACA","CEL","PEN LAN","LAN","DOM","NUEVO","LIDER"];
const STATUS_LABELS = {
  "ACA":"Aca", "CEL":"Cel", "PEN LAN":"Pen Lan", "LAN":"Lan",
  "DOM":"Dom", "NUEVO":"Nuevo", "LIDER":"Lider"
};
const LIMITS = { lideresPrincipales: 3, lideresCelula: 3, anfitrion: 2 };
const ADD_BTN_IDS = {
  lideresPrincipales: "btnAddLiderPrincipal",
  lideresCelula: "btnAddLiderCelula",
  anfitrion: "btnAddAnfitrion"
};
const LOCKABLE_CARD_IDS = ["cardAsistentes","cardNinos","cardInasistencias","cardOfrenda"];

/* ==========================================================
   ESTADO DEL FORMULARIO ACTUAL
   ========================================================== */
let formState = crearFormStateVacio();
let currentTag = null;      // null | "Nueva" | "Cerrada"
let editingUid = null;      // uid del reporte en edición, o null
let incluirResumen = false; // controla si "Copiar al portapapeles" incluye el encabezado de totalización
let uid = 0;
const nextId = () => ++uid;
let filtroEquipoActual = ""; // "" = sin filtro, o el nombre exacto del equipo seleccionado

const reportesSesion = [];  // array de snapshots (objetos planos, listos para JSON)
const STORAGE_KEY_SESION = "reportesSesion_autoguardado";
const expandedUids = new Set();

function crearFormStateVacio(){
  return {
    lideresPrincipales: [],
    lideresCelula: [],
    anfitrion: [],
    asistentes: [],
    ninos: [],
    inasistencias: []
  };
}

/* ==========================================================
   ETIQUETA NUEVA / CERRADA
   ========================================================== */
function toggleTag(tag){
  currentTag = (currentTag === tag) ? null : tag;
  renderTagButtons();
  applySectionLock();
}

function renderTagButtons(){
  document.querySelectorAll(".tag-btn").forEach(btn => {
    const isActive = btn.dataset.tag === currentTag;
    btn.classList.toggle("active", isActive);
  });
}

/* ==========================================================
   INTERRUPTOR "TOTALIZAR" — incluir o no el resumen general al copiar
   ========================================================== */
function toggleTotalizar(){
  incluirResumen = !incluirResumen;
  renderTotalizarButton();
}

function renderTotalizarButton(){
  const btn = document.getElementById("btnTotalizar");
  const hint = document.getElementById("totalizarHint");
  btn.classList.toggle("active", incluirResumen);
  btn.textContent = incluirResumen ? "✓ Totalizar (activo)" : "Totalizar";
  hint.textContent = incluirResumen
    ? "Totalizar está activado: al copiar se incluirá el resumen general al inicio."
    : "Totalizar está desactivado: al copiar solo se incluirán las células, sin el resumen general.";
}

/* ==========================================================
   FILTRO: OCULTAR NOMBRES (solo ver cantidades) — Asistencia, Niños, Inasistencias
   ========================================================== */
function toggleOcultarNombres(){
  const activo = document.getElementById("chkOcultarNombres").checked;
  document.body.classList.toggle("hide-names", activo);
}

function applySectionLock(){
  const locked = currentTag === "Cerrada";
  LOCKABLE_CARD_IDS.forEach(id => {
    document.getElementById(id).classList.toggle("locked", locked);
  });
  // Deshabilitar inputs/selects/botones dentro de esas secciones
  LOCKABLE_CARD_IDS.forEach(id => {
    const card = document.getElementById(id);
    card.querySelectorAll("input, select, button").forEach(el => { el.disabled = locked; });
  });
}

/* ==========================================================
   CAMPOS SIMPLES REPETIBLES (Líder principal / de célula / Anfitrión)
   ========================================================== */
function addSimpleField(key){
  const limit = LIMITS[key];
  if(limit && formState[key].length >= limit){
    mostrarToast(`Máximo ${limit} ${etiquetaCampoSimple(key)}`);
    return;
  }
  const id = nextId();
  formState[key].push({id, value:""});
  renderSimpleField(key);
}

function etiquetaCampoSimple(key){
  if(key === "lideresPrincipales") return "líderes principales";
  if(key === "lideresCelula") return "líderes de célula";
  if(key === "anfitrion") return "anfitriones";
  return "elementos";
}

function removeSimpleField(key, id){
  formState[key] = formState[key].filter(item => item.id !== id);
  renderSimpleField(key);
}

function renderSimpleField(key){
  const container = document.getElementById(key);
  container.innerHTML = "";
  formState[key].forEach(item => {
    const row = document.createElement("div");
    row.className = "repeat-row";
    row.innerHTML = `
      <input type="text" placeholder="Nombre" value="${escapeAttr(item.value)}"
        oninput="updateSimpleField('${key}', ${item.id}, this.value)">
      <button type="button" class="btn-remove" onclick="removeSimpleField('${key}', ${item.id})">✕</button>
    `;
    container.appendChild(row);
  });

  const btnId = ADD_BTN_IDS[key];
  if(btnId){
    const btn = document.getElementById(btnId);
    const limit = LIMITS[key];
    btn.disabled = limit ? formState[key].length >= limit : false;
  }
}

function updateSimpleField(key, id, value){
  const item = formState[key].find(i => i.id === id);
  if(item) item.value = value;
}

/* ==========================================================
   LISTAS DE PERSONAS (Asistentes / Niños / Inasistencias)
   ========================================================== */
function addPersonRow(key){
  const row = { id: nextId(), nombre: "" };
  if(key === "asistentes"){
    row.status = STATUS_OPTIONS[0];
    row.telefono = "";
  }
  formState[key].push(row);
  renderPersonList(key);
  updateCounts();
}

function removePersonRow(key, id){
  formState[key] = formState[key].filter(item => item.id !== id);
  renderPersonList(key);
  updateCounts();
}

function updatePersonField(key, id, field, value){
  const item = formState[key].find(i => i.id === id);
  if(item) item[field] = value;
  if(field === "status") updateCounts();
}

const LIST_CONFIG = {
  asistentes: { container: "listaAsistentes", hasStatus: true, hasTelefono: true },
  ninos: { container: "listaNinos", hasStatus: false },
  inasistencias: { container: "listaInasistencias", hasStatus: false }
};

function renderPersonList(key){
  const cfg = LIST_CONFIG[key];
  const container = document.getElementById(cfg.container);
  container.innerHTML = "";
  formState[key].forEach(item => {
    const row = document.createElement("div");
    row.className = "list-row" + (cfg.hasTelefono ? " con-telefono" : (cfg.hasStatus ? "" : " no-status"));

    let statusHtml = "";
    if(cfg.hasStatus){
      const options = STATUS_OPTIONS.map(opt =>
        `<option value="${opt}" ${item.status===opt?"selected":""}>${opt}</option>`
      ).join("");
      statusHtml = `<select onchange="updatePersonField('${key}', ${item.id}, 'status', this.value)">${options}</select>`;
    }

    let telefonoHtml = "";
    if(cfg.hasTelefono){
      telefonoHtml = `<input type="text" placeholder="N° Telefónico" value="${escapeAttr(item.telefono || "")}"
        oninput="updatePersonField('${key}', ${item.id}, 'telefono', this.value)">`;
    }

    row.innerHTML = `
      <input type="text" placeholder="Nombre" value="${escapeAttr(item.nombre)}"
        oninput="updatePersonField('${key}', ${item.id}, 'nombre', this.value)">
      ${telefonoHtml}
      ${statusHtml}
      <button type="button" class="btn-remove" onclick="removePersonRow('${key}', ${item.id})">✕</button>
    `;
    container.appendChild(row);
  });
  applySectionLock();
}

function renderAllLists(){
  renderSimpleField("lideresPrincipales");
  renderSimpleField("lideresCelula");
  renderSimpleField("anfitrion");
  renderPersonList("asistentes");
  renderPersonList("ninos");
  renderPersonList("inasistencias");
}

/* ==========================================================
   AUTOCONTEO (formulario actual, vista en pantalla)
   ========================================================== */
function contarPorStatus(asistentesArr){
  const counts = {};
  STATUS_OPTIONS.forEach(s => counts[s] = 0);
  asistentesArr.forEach(a => {
    if(counts[a.status] !== undefined) counts[a.status]++;
  });
  return counts;
}

function updateCounts(){
  document.getElementById("badgeAsistentes").textContent = formState.asistentes.length;
  document.getElementById("badgeNinos").textContent = formState.ninos.length;
  document.getElementById("badgeInasistencias").textContent = formState.inasistencias.length;

  const countsByStatus = contarPorStatus(formState.asistentes);

  const countsContainer = document.getElementById("countsAsistentes");
  countsContainer.innerHTML = "";

  const totalChip = document.createElement("span");
  totalChip.className = "count-chip total";
  totalChip.textContent = `Total: ${formState.asistentes.length}`;
  countsContainer.appendChild(totalChip);

  STATUS_OPTIONS.forEach(status => {
    const chip = document.createElement("span");
    chip.className = "count-chip";
    chip.textContent = `${status}: ${countsByStatus[status]}`;
    countsContainer.appendChild(chip);
  });
}

/* ==========================================================
   OFRENDA
   ========================================================== */
function updateOfferingTotal(){
  const efectivo = parseFloat(document.getElementById("efectivo").value) || 0;
  const transferencia = parseFloat(document.getElementById("transferencia").value) || 0;
  const dolares = parseFloat(document.getElementById("dolares").value) || 0;
  const total = efectivo + transferencia;
  document.getElementById("totalVES").textContent = `Bs ${total.toFixed(2)}`;
  document.getElementById("totalUSD").textContent = `$ ${dolares.toFixed(2)}`;
}

/* ==========================================================
   DATOS GENERALES DEL FORMULARIO ACTUAL (valores en crudo)
   ========================================================== */
function getGeneralDataRaw(){
  return {
    nombreCelula: document.getElementById("nombreCelula").value.trim(),
    equipo: document.getElementById("equipo").value,
    fecha: document.getElementById("fecha").value,
    ubicacion: document.getElementById("ubicacion").value.trim(),
    tema: document.getElementById("tema").value.trim(),
    cita: document.getElementById("cita").value.trim(),
    efectivo: parseFloat(document.getElementById("efectivo").value) || 0,
    transferencia: parseFloat(document.getElementById("transferencia").value) || 0,
    dolares: parseFloat(document.getElementById("dolares").value) || 0,
    nota: document.getElementById("nota").value.trim()
  };
}

/* ==========================================================
   AÑADIR CÉLULA / GUARDAR CAMBIOS (edición)
   ========================================================== */
function anadirCelula(){
  const general = getGeneralDataRaw();

  if(!general.nombreCelula && formState.asistentes.length === 0){
    mostrarToast("Completa al menos el nombre de la célula o los asistentes");
    return;
  }

  const snapshot = {
    _uid: editingUid !== null ? editingUid : nextId(),
    tag: currentTag,
    general,
    lideresPrincipales: formState.lideresPrincipales.map(l => l.value.trim()).filter(Boolean),
    lideresCelula: formState.lideresCelula.map(l => l.value.trim()).filter(Boolean),
    anfitrion: formState.anfitrion.map(l => l.value.trim()).filter(Boolean),
    asistentes: formState.asistentes.map(a => ({ nombre: a.nombre.trim() || "(sin nombre)", status: a.status, telefono: (a.telefono || "").trim() })),
    ninos: formState.ninos.map(n => ({ nombre: n.nombre.trim() || "(sin nombre)" })),
    inasistencias: formState.inasistencias.map(i => ({ nombre: i.nombre.trim() || "(sin nombre)" }))
  };

  if(editingUid !== null){
    const idx = reportesSesion.findIndex(r => r._uid === editingUid);
    if(idx !== -1) reportesSesion[idx] = snapshot;
    mostrarToast(`Cambios guardados en "${snapshot.general.nombreCelula || "(sin nombre)"}" ✓`);
  } else {
    reportesSesion.push(snapshot);
    mostrarToast(`Célula "${snapshot.general.nombreCelula || "(sin nombre)"}" añadida ✓`);
  }

  editingUid = null;
  renderSavedReports();
  guardarProgreso();
  limpiarFormulario();
}

function eliminarReporteSesion(uidToRemove){
  reportesSesion.splice(reportesSesion.findIndex(r => r._uid === uidToRemove), 1);
  expandedUids.delete(uidToRemove);
  if(editingUid === uidToRemove){
    editingUid = null;
    limpiarFormulario();
  }
  renderSavedReports();
  guardarProgreso();
}

function toggleDetalle(uidToggle){
  if(expandedUids.has(uidToggle)) expandedUids.delete(uidToggle);
  else expandedUids.add(uidToggle);
  renderSavedReports();
}

function editarReporte(uidToEdit){
  const r = reportesSesion.find(x => x._uid === uidToEdit);
  if(!r) return;

  editingUid = uidToEdit;

  document.getElementById("nombreCelula").value = r.general.nombreCelula;
  document.getElementById("equipo").value = r.general.equipo || "";
  document.getElementById("fecha").value = r.general.fecha;
  document.getElementById("ubicacion").value = r.general.ubicacion || "";
  document.getElementById("tema").value = r.general.tema;
  document.getElementById("cita").value = r.general.cita;
  document.getElementById("efectivo").value = r.general.efectivo;
  document.getElementById("transferencia").value = r.general.transferencia;
  document.getElementById("dolares").value = r.general.dolares;
  document.getElementById("nota").value = r.general.nota || "";

  currentTag = r.tag || null;
  renderTagButtons();

  formState = crearFormStateVacio();
  r.lideresPrincipales.forEach(v => formState.lideresPrincipales.push({id: nextId(), value: v}));
  r.lideresCelula.forEach(v => formState.lideresCelula.push({id: nextId(), value: v}));
  r.anfitrion.forEach(v => formState.anfitrion.push({id: nextId(), value: v}));
  r.asistentes.forEach(a => formState.asistentes.push({id: nextId(), nombre: a.nombre, status: a.status, telefono: a.telefono || ""}));
  r.ninos.forEach(n => formState.ninos.push({id: nextId(), nombre: n.nombre}));
  r.inasistencias.forEach(i => formState.inasistencias.push({id: nextId(), nombre: i.nombre}));

  renderAllLists();
  updateCounts();
  updateOfferingTotal();
  applySectionLock();

  document.getElementById("editingFlag").style.display = "inline-block";
  document.getElementById("btnAnadir").textContent = "Guardar cambios";
  renderSavedReports();
  window.scrollTo({ top: 0, behavior: "smooth" });
  mostrarToast("Editando célula — realiza tus cambios y presiona 'Guardar cambios'");
}

/* ==========================================================
   AUTOGUARDADO DE PROGRESO (localStorage)
   ========================================================== */
function guardarProgreso(){
  try{
    localStorage.setItem(STORAGE_KEY_SESION, JSON.stringify(reportesSesion));
  } catch(err){
    console.warn("No se pudo guardar el progreso en localStorage:", err);
  }
}

function borrarProgresoGuardado(){
  if(!confirm("¿Seguro que quieres borrar el progreso guardado? Esto eliminará todas las células añadidas en esta sesión y no se puede deshacer.")) return;
  try{
    localStorage.removeItem(STORAGE_KEY_SESION);
  } catch(err){
    console.warn("No se pudo borrar el progreso guardado de localStorage:", err);
  }
  reportesSesion.length = 0;
  expandedUids.clear();
  editingUid = null;
  renderSavedReports();
  mostrarToast("Progreso guardado borrado ✓");
}

function filtrarPorEquipo(valor){
  filtroEquipoActual = valor;
  renderSavedReports();
}

function renderSavedReports(){
  const container = document.getElementById("savedReportsList");
  const badge = document.getElementById("badgeSesion");
  const sessionCount = document.getElementById("sessionCount");
  const btnCopiar = document.getElementById("btnCopiar");
  const btnTotalizar = document.getElementById("btnTotalizar");
  const filtroConteo = document.getElementById("filtroConteo");

  badge.textContent = reportesSesion.length;
  sessionCount.textContent = `${reportesSesion.length} célula${reportesSesion.length === 1 ? "" : "s"} añadida${reportesSesion.length === 1 ? "" : "s"}`;
  btnCopiar.disabled = reportesSesion.length === 0;
  btnTotalizar.disabled = reportesSesion.length === 0;

  container.innerHTML = "";
  if(reportesSesion.length === 0){
    container.innerHTML = `<div class="empty-state">Aún no has añadido ninguna célula. Completa el formulario y presiona "Añadir célula".</div>`;
    if(filtroConteo) filtroConteo.textContent = "";
    return;
  }

  const total = reportesSesion.length;

  // Con filtro activo, los reportes que no coincidan con el equipo se ocultan
  // por completo (no solo se reordenan) para evitar confusiones.
  const conCoincidencia = (r) => filtroEquipoActual && r.general.equipo === filtroEquipoActual;
  const listaParaMostrar = reportesSesion
    .map((r, index) => ({ r, index }))
    .filter(({ r }) => !filtroEquipoActual || conCoincidencia(r));

  if(filtroConteo){
    if(filtroEquipoActual){
      const cantidad = listaParaMostrar.length;
      filtroConteo.textContent = `${cantidad} de ${total} con este equipo`;
    } else {
      filtroConteo.textContent = "";
    }
  }

  if(filtroEquipoActual && listaParaMostrar.length === 0){
    container.innerHTML = `<div class="empty-state">Ninguna célula añadida tiene el equipo "${escapeHtml(filtroEquipoActual)}".</div>`;
    return;
  }

  listaParaMostrar.forEach(({ r, index }) => {
    const isExpanded = expandedUids.has(r._uid);
    const isEditing = editingUid === r._uid;
    const esCoincidencia = conCoincidencia(r);

    const item = document.createElement("div");
    item.className = "saved-report-item" + (isEditing ? " editing" : "") + (esCoincidencia ? " filtro-match" : "");

    const tagHtml = r.tag
      ? `<span class="mini-tag ${r.tag}">${r.tag}</span>`
      : "";
    const editingHtml = isEditing ? `<span class="mini-tag editing-tag">Editando</span>` : "";

    const nombreMostrado = r.general.nombreCelula || "(sin nombre)";
    const fechaMostrada = r.general.fecha || "(sin fecha)";
    const equipoMostrado = r.general.equipo || "";

    item.innerHTML = `
      <div class="saved-report-header">
        <div class="info">
          <strong>${escapeHtml(nombreMostrado)} ${tagHtml} ${editingHtml}</strong>
          <span>${escapeHtml(fechaMostrada)} · Asistentes: ${r.asistentes.length} · Niños: ${r.ninos.length} · Inasist.: ${r.inasistencias.length}</span>
          ${equipoMostrado ? `<span style="color:var(--accent); font-weight:600;">${escapeHtml(equipoMostrado)}</span>` : ""}
        </div>
        <div class="btns">
          <button type="button" class="btn-view-outline" onclick="toggleDetalle(${r._uid})">${isExpanded ? "Ocultar" : "Ver detalles"}</button>
          <button type="button" class="btn-edit-outline" onclick="editarReporte(${r._uid})">Editar</button>
          <button type="button" class="btn-danger-outline" onclick="eliminarReporteSesion(${r._uid})">Quitar</button>
        </div>
      </div>
      ${isExpanded ? `<div class="saved-report-detail"><pre>${escapeHtml(buildReporteIndividualText(r, index, total))}</pre></div>` : ""}
    `;
    container.appendChild(item);
  });
}

/* ==========================================================
   LIMPIAR FORMULARIO / CANCELAR EDICIÓN
   ========================================================== */
function limpiarFormulario(){
  document.getElementById("nombreCelula").value = "";
  document.getElementById("equipo").value = "";
  document.getElementById("fecha").value = "";
  document.getElementById("ubicacion").value = "";
  document.getElementById("tema").value = "";
  document.getElementById("cita").value = "";
  document.getElementById("efectivo").value = "0";
  document.getElementById("transferencia").value = "0";
  document.getElementById("dolares").value = "0";
  document.getElementById("nota").value = "";

  currentTag = null;
  editingUid = null;
  renderTagButtons();

  document.getElementById("editingFlag").style.display = "none";
  document.getElementById("btnAnadir").textContent = "+ Añadir célula";

  formState = crearFormStateVacio();
  renderAllLists();
  updateCounts();
  updateOfferingTotal();
  applySectionLock();

  addPersonRow("asistentes");
  renderSavedReports();
}

/* ==========================================================
   CONSTRUCCIÓN DE TEXTO — desglose apilado y reordenado
   ========================================================== */
function buildDesgloseApilado(asistentesArr){
  const counts = contarPorStatus(asistentesArr);
  return STATUS_OPTIONS.map(s => `  Total ${STATUS_LABELS[s]}: ${counts[s]}`).join("\n");
}

function buildReporteIndividualText(r, index, total, ocultarNombres){
  const totalVES = r.general.efectivo + r.general.transferencia;

  const asistentesList = r.asistentes.map(a => `  - ${a.nombre} [${a.status}]${a.telefono && a.telefono.trim() ? ` (Tel: ${a.telefono.trim()})` : ""}`);
  const ninosList = r.ninos.map(n => `  - ${n.nombre}`);
  const inasistenciasList = r.inasistencias.map(i => `  - ${i.nombre}`);

  let lines = [];
  lines.push(`CÉLULA ${index + 1} de ${total}${r.tag ? ` [${r.tag.toUpperCase()}]` : ""}`);
  lines.push("=".repeat(40));
  lines.push(`Célula: ${r.general.nombreCelula || "(sin especificar)"}`);
  lines.push(`Equipo: ${r.general.equipo || "(sin especificar)"}`);
  lines.push(`Fecha: ${r.general.fecha || "(sin especificar)"}`);
  lines.push(`Ubicación: ${r.general.ubicacion || "(sin especificar)"}`);
  lines.push(`Tema: ${r.general.tema || "(sin especificar)"}`);
  lines.push(`Cita bíblica: ${r.general.cita || "(sin especificar)"}`);
  lines.push("");
  lines.push(`Líder principal: ${r.lideresPrincipales.join(", ") || "(ninguno)"}`);
  lines.push(`Líder de célula: ${r.lideresCelula.join(", ") || "(ninguno)"}`);
  lines.push(`Anfitrión: ${r.anfitrion.join(", ") || "(ninguno)"}`);
  lines.push("");

  if(ocultarNombres){
    lines.push(`ASISTENTES: ${r.asistentes.length}`);
    lines.push(`NIÑOS: ${r.ninos.length}`);
    lines.push(`INASISTENCIAS: ${r.inasistencias.length}`);
  } else {
    lines.push(`ASISTENTES (Total: ${r.asistentes.length})`);
    lines.push("-".repeat(40));
    lines.push(asistentesList.join("\n") || "  (sin registros)");
    lines.push("");
    lines.push(`NIÑOS (Total: ${r.ninos.length})`);
    lines.push("-".repeat(40));
    lines.push(ninosList.join("\n") || "  (sin registros)");
    lines.push("");
    lines.push(`INASISTENCIAS (Total: ${r.inasistencias.length})`);
    lines.push("-".repeat(40));
    lines.push(inasistenciasList.join("\n") || "  (sin registros)");
  }
  lines.push("");
  lines.push("TOTALES");
  lines.push("-".repeat(40));
  lines.push(`  Total Asistentes: ${r.asistentes.length}`);
  lines.push(`  Total Niños: ${r.ninos.length}`);
  lines.push(`  Total Inasistencias: ${r.inasistencias.length}`);
  lines.push(buildDesgloseApilado(r.asistentes));
  lines.push("");
  lines.push("OFRENDA");
  lines.push("-".repeat(40));
  lines.push(`  Efectivo:      Bs ${r.general.efectivo.toFixed(2)}`);
  lines.push(`  Transferencia: Bs ${r.general.transferencia.toFixed(2)}`);
  lines.push(`  Total VES:     Bs ${totalVES.toFixed(2)}`);
  lines.push(`  Dólares:       $ ${r.general.dolares.toFixed(2)}`);
  lines.push("");
  lines.push(`Nota: ${r.general.nota || "(ninguna)"}`);

  return lines.join("\n");
}

function buildFullSessionText(){
  if(reportesSesion.length === 0) return "No hay células añadidas todavía.";

  const ocultarNombres = document.getElementById("chkOcultarNombres").checked;
  const total = reportesSesion.length;
  const bloques = reportesSesion.map((r, i) => buildReporteIndividualText(r, i, total, ocultarNombres));

  // Si "Totalizar" está desactivado, se copian solo las células, sin encabezado de resumen
  if(!incluirResumen){
    return bloques.join("\n\n" + "#".repeat(40) + "\n\n");
  }

  let totalAsistentes = 0, totalNinos = 0, totalInasistencias = 0;
  let totalEfectivo = 0, totalTransferencia = 0, totalDolares = 0;
  let totalNuevas = 0, totalCerradas = 0;
  const todosAsistentes = [];

  reportesSesion.forEach(r => {
    totalAsistentes += r.asistentes.length;
    totalNinos += r.ninos.length;
    totalInasistencias += r.inasistencias.length;
    totalEfectivo += r.general.efectivo;
    totalTransferencia += r.general.transferencia;
    totalDolares += r.general.dolares;
    if(r.tag === "Nueva") totalNuevas++;
    if(r.tag === "Cerrada") totalCerradas++;
    todosAsistentes.push(...r.asistentes);
  });

  const resumen = [];
  resumen.push("RESUMEN GENERAL DE LAS CÉLULAS");
  resumen.push("=".repeat(40));
  resumen.push(`Total de células reportadas: ${total}`);
  resumen.push(`Total células nuevas: ${totalNuevas}`);
  resumen.push(`Total células cerradas: ${totalCerradas}`);
  resumen.push("");
  resumen.push("TOTALES");
  resumen.push("-".repeat(40));
  resumen.push(`  Total Asistentes: ${totalAsistentes}`);
  resumen.push(`  Total Niños: ${totalNinos}`);
  resumen.push(`  Total Inasistencias: ${totalInasistencias}`);
  resumen.push(buildDesgloseApilado(todosAsistentes));
  resumen.push("");
  resumen.push("OFRENDA TOTAL");
  resumen.push("-".repeat(40));
  resumen.push(`  Total Efectivo:      Bs ${totalEfectivo.toFixed(2)}`);
  resumen.push(`  Total Transferencia: Bs ${totalTransferencia.toFixed(2)}`);
  resumen.push(`  Total VES:           Bs ${(totalEfectivo + totalTransferencia).toFixed(2)}`);
  resumen.push(`  Total Dólares:       $ ${totalDolares.toFixed(2)}`);

  return resumen.join("\n") + "\n\n" + bloques.join("\n\n" + "#".repeat(40) + "\n\n");
}

/* ==========================================================
   COPIAR AL PORTAPAPELES (con niveles de respaldo)
   ========================================================== */
async function copiarAlPortapapeles(event){
  const text = buildFullSessionText();
  const btn = event.currentTarget;
  const originalLabel = btn.textContent;

  const showFeedback = (label) => {
    btn.textContent = label;
    setTimeout(() => { btn.textContent = originalLabel; }, 2000);
  };

  // Intento 1: Clipboard API moderna (requiere contexto seguro: https o localhost)
  try{
    if(window.isSecureContext && navigator.clipboard && navigator.clipboard.writeText){
      await navigator.clipboard.writeText(text);
      showFeedback("✓ Copiado");
      return;
    }
  } catch(err){
    console.warn("Clipboard API no disponible o rechazada, probando método alternativo:", err);
  }

  // Intento 2: execCommand clásico (funciona en más contextos, aunque esté deprecado)
  try{
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.top = "0";
    textarea.style.left = "0";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    textarea.setSelectionRange(0, text.length);
    const exito = document.execCommand("copy");
    document.body.removeChild(textarea);
    if(exito){
      showFeedback("✓ Copiado");
      return;
    }
  } catch(err){
    console.warn("execCommand('copy') también falló:", err);
  }

  // Intento 3: mostrar ventana con el texto ya seleccionado para copiar a mano (Ctrl+C)
  mostrarModalCopiaManual(text);
  showFeedback("Copia manual");
}

function mostrarModalCopiaManual(text){
  const overlay = document.createElement("div");
  overlay.className = "copy-modal-overlay";
  overlay.innerHTML = `
    <div class="copy-modal">
      <h3>Copia el texto manualmente</h3>
      <p>Tu navegador bloqueó el acceso automático al portapapeles. El texto ya está seleccionado abajo: presiona <strong>Ctrl+C</strong> (o Cmd+C en Mac) y luego cierra esta ventana.</p>
      <textarea id="modalCopyTextarea" readonly></textarea>
      <div class="modal-actions">
        <button type="button" class="btn-secondary" onclick="cerrarModalCopiaManual()">Cerrar</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const textarea = overlay.querySelector("#modalCopyTextarea");
  textarea.value = text;
  textarea.focus();
  textarea.select();
  textarea.setSelectionRange(0, text.length);

  overlay.addEventListener("click", (e) => { if(e.target === overlay) cerrarModalCopiaManual(); });
}

function cerrarModalCopiaManual(){
  const overlay = document.querySelector(".copy-modal-overlay");
  if(overlay) overlay.remove();
}

/* ==========================================================
   IMPORTAR DATOS DESDE TEXTO
   ========================================================== */

// Alias reconocidos para las etiquetas de asistencia (minúsculas, sin espacios extra)
const STATUS_ALIASES = {
  "aca": "ACA", "a": "ACA",
  "cel": "CEL", "c": "CEL",
  "pen lan": "PEN LAN", "penlan": "PEN LAN", "pl": "PEN LAN",
  "lan": "LAN",
  "dom": "DOM",
  "nuevo": "NUEVO", "nvo": "NUEVO",
  "lider": "LIDER", "líder": "LIDER", "lid": "LIDER"
};
// Alias de 1-2 letras son ambiguos con el final de nombres comunes (ej. "a" al final de
// "Antonella"), así que para esos exigimos paréntesis obligatorios. Los de 3+ letras
// pueden ir con o sin paréntesis (para tolerar el paréntesis de apertura olvidado).
const SHORT_ALIAS_KEYS = Object.keys(STATUS_ALIASES).filter(k => k.replace(/\s+/g,"").length <= 2);
const LONG_ALIAS_KEYS = Object.keys(STATUS_ALIASES).filter(k => k.replace(/\s+/g,"").length > 2)
  .sort((a,b) => b.length - a.length);

const toFlexPattern = k => k.replace(/\s+/g, "\\s*");
const STATUS_ALIAS_REGEX = new RegExp(
  "(?:\\((" + SHORT_ALIAS_KEYS.map(toFlexPattern).join("|") + ")\\)" +
  "|\\(?\\s*(" + LONG_ALIAS_KEYS.map(toFlexPattern).join("|") + ")\\s*\\)?)\\s*$",
  "i"
);

function abrirModalImportar(){
  const overlay = document.createElement("div");
  overlay.className = "copy-modal-overlay";
  overlay.innerHTML = `
    <div class="copy-modal import-modal">
      <h3>Importar datos de una célula</h3>
      <p>Pega aquí el reporte tal como lo recibiste (WhatsApp u otro formato similar). Reconozco encabezados como "Líderes Principales", "Anfitrión", "Líderes de Célula", "Asistencia", "Niños" e "Inasistencia", con nombres numerados y una etiqueta entre paréntesis, ej: <em>1) Juan Pérez (cel)</em>. Lo que no reconozca te lo mostraré, sin bloquear la importación.</p>
      <textarea id="importTextarea" placeholder="Pega aquí el texto a importar..."></textarea>
      <div class="modal-actions">
        <button type="button" class="btn-secondary" onclick="cerrarModalImportar()">Cancelar</button>
        <button type="button" class="btn-primary" onclick="procesarImportacion()">Analizar e importar</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.addEventListener("click", (e) => { if(e.target === overlay) cerrarModalImportar(); });
  document.getElementById("importTextarea").focus();
}

function cerrarModalImportar(){
  const overlay = document.querySelector(".copy-modal-overlay");
  if(overlay) overlay.remove();
}

function limpiarLineaEmojis(line){
  // Quita símbolos/emoji al inicio de la línea (✅, 🏠, 🙋🏻‍♀️, ❎, 🗓️, 📖, 👭, etc.), conserva letras/números/acentos/asterisco/símbolo $
  return line.replace(/^[^\p{L}\p{N}*$]+/u, "").trim();
}

function quitarNumeracion(line){
  return line.replace(/^\d+[\).\-]?\s*/, "").trim();
}

function esLineaTally(line){
  // Ej: "CEL: 06", "ACA: 0.", "Niños: 02", "Asistencia: 14 Adultos", "Inasis: 03 Adultos"
  // -> línea informativa de conteo, se ignora (puede traer una palabra suelta al final)
  return /^[A-Za-zÀ-ÿ\s]+:\s*\d+\.?\s*[A-Za-zÀ-ÿ]*\.?\s*$/.test(line);
}

function parseFechaAISO(token){
  // Acepta DD/MM/AA o DD/MM/AAAA -> devuelve YYYY-MM-DD, o null si no se puede interpretar
  const m = token.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if(!m) return null;
  let [, d, mo, y] = m;
  if(y.length === 2) y = "20" + y;
  d = d.padStart(2, "0");
  mo = mo.padStart(2, "0");
  if(Number(mo) < 1 || Number(mo) > 12 || Number(d) < 1 || Number(d) > 31) return null;
  return `${y}-${mo}-${d}`;
}

function extraerNombreYEtiqueta(line){
  const match = line.match(STATUS_ALIAS_REGEX);
  if(match){
    const aliasRaw = (match[1] || match[2] || "").toLowerCase().replace(/\s+/g, " ").trim();
    const status = STATUS_ALIASES[aliasRaw] || STATUS_ALIASES[aliasRaw.replace(/\s+/g,"")];
    const nombre = line.slice(0, match.index).replace(/\(\s*$/,"").trim();
    return { nombre: nombre || line.trim(), status: status || null };
  }
  return { nombre: line.trim(), status: null };
}

function parseImportText(text){
  const resultado = {
    general: { nombreCelula:"", fecha:"", ubicacion:"", tema:"", cita:"", efectivo: null, dolares: null, nota: null },
    lideresPrincipales: [],
    lideresCelula: [],
    anfitrion: [],
    asistentes: [],
    ninos: [],
    inasistencias: [],
    noReconocido: []
  };

  const HEADER_TESTS = [
    { key: "liderPrincipal", test: l => /^l[ií]deres?\s+principal(es)?\s*:?$/i.test(l) },
    { key: "anfitrion", test: l => /^anfitri[oó]n(a)?\s*:?$/i.test(l) },
    { key: "liderCelula", test: l => /^l[ií]deres?\s+de\s+c[eé]lula\s*:?$/i.test(l) },
    { key: "asistentes", test: l => /^asistenc(ia|ias)\s*:?$/i.test(l) },
    { key: "ninos", test: l => /^ni[ñn]os\s*:?$/i.test(l) },
    { key: "inasistencias", test: l => /^inasistenc(ia|ias)\s*:?$/i.test(l) }
  ];

  // Campos de texto que pueden venir en la misma línea ("Tema: X") o en líneas
  // siguientes cuando el encabezado no trae contenido ("Tema o Palabra Impartida:" solo)
  const TEXT_FIELD_TESTS = [
    { key: "nombreCelula", regex: /^(c[eé]lula|nombre\s*(de\s*c[eé]lula)?)\s*:\s*(.*)$/i },
    { key: "ubicacion", regex: /^ubicaci[oó]n\s*:\s*(.*)$/i },
    { key: "tema", regex: /^tema(\s*o\s*palabra\s*impartida)?\s*:\s*(.*)$/i },
    { key: "cita", regex: /^cita(\s*b[ií]blica)?\s*:\s*(.*)$/i },
    { key: "nota", regex: /^nota(\s*general|\s*adicional)?\s*:\s*(.*)$/i }
  ];

  let currentSection = null;
  let currentTextField = null; // campo general en espera de contenido en próximas líneas
  let primeraLineaUtil = true;
  const rawLines = text.split(/\r?\n/);

  for(let raw of rawLines){
    const trimmedRaw = raw.trim();
    if(trimmedRaw === "") continue;

    const clean = limpiarLineaEmojis(trimmedRaw);
    if(clean === "") continue;

    // 0) Primera línea útil entre *asteriscos* -> nombre de célula (ej: *Guerreros de Cristo*)
    if(primeraLineaUtil){
      primeraLineaUtil = false;
      const asterisco = clean.match(/^\*(.+)\*$/);
      if(asterisco){
        resultado.general.nombreCelula = asterisco[1].trim();
        continue;
      }
    }

    // 1) Fecha (y opcionalmente Hora, que se ignora, en la misma línea)
    const fechaMatch = clean.match(/^fecha\s*:\s*(\S+)/i);
    if(fechaMatch){
      const iso = parseFechaAISO(fechaMatch[1]);
      if(iso){
        resultado.general.fecha = iso;
      } else {
        resultado.noReconocido.push(`No se pudo interpretar la fecha: "${fechaMatch[1]}" (usa DD/MM/AA)`);
      }
      currentSection = null;
      currentTextField = null;
      continue;
    }

    // 2) Ofrenda (ej: "Ofrenda: 700bs") -> se toma como Efectivo
    const ofrendaMatch = clean.match(/^ofrenda\s*:\s*([\d.,]+)/i);
    if(ofrendaMatch){
      const monto = parseFloat(ofrendaMatch[1].replace(",", "."));
      if(!isNaN(monto)) resultado.general.efectivo = monto;
      currentSection = null;
      currentTextField = null;
      continue;
    }

    // 2b) Dólares (ej: "$: 50", "Dólares: 50", "USD 50") -> se toma como Dólares
    const dolaresMatch = clean.match(/^(\$|d[oó]lares|usd)\s*[:\$]?\s*([\d.,]+)/i);
    if(dolaresMatch){
      const montoUsd = parseFloat(dolaresMatch[2].replace(",", "."));
      if(!isNaN(montoUsd)) resultado.general.dolares = montoUsd;
      currentSection = null;
      currentTextField = null;
      continue;
    }

    // 3) Campos de texto (posible contenido en la misma línea, o continúan en las siguientes)
    let matchedTextField = false;
    for(const f of TEXT_FIELD_TESTS){
      const m = clean.match(f.regex);
      if(m){
        const contenido = m[m.length - 1].trim();
        currentSection = null;
        if(contenido){
          resultado.general[f.key] = contenido;
          currentTextField = null;
        } else {
          currentTextField = f.key; // esperar contenido en las próximas líneas
        }
        matchedTextField = true;
        break;
      }
    }
    if(matchedTextField) continue;

    // 4) Líneas de conteo (tally), se ignoran sin generar aviso
    if(esLineaTally(clean)){
      currentTextField = null;
      continue;
    }

    // 5) Encabezados de sección (listas)
    let matchedHeader = false;
    for(const h of HEADER_TESTS){
      if(h.test(clean)){
        currentSection = h.key;
        currentTextField = null;
        matchedHeader = true;
        break;
      }
    }
    if(matchedHeader) continue;

    // 6) Continuación de un campo de texto en espera (ej. el Tema en la línea siguiente)
    if(currentTextField){
      resultado.general[currentTextField] = (resultado.general[currentTextField] ? resultado.general[currentTextField] + " " : "") + clean;
      continue;
    }

    // 7) Contenido de la sección de lista actual
    if(currentSection === "liderPrincipal"){
      resultado.lideresPrincipales.push(clean);
    } else if(currentSection === "anfitrion"){
      resultado.anfitrion.push(clean);
    } else if(currentSection === "liderCelula"){
      resultado.lideresCelula.push(clean);
    } else if(currentSection === "asistentes"){
      let sinNumero = quitarNumeracion(clean);
      let telefonoExtraido = "";
      const telefonoMatch = sinNumero.match(/(\+?\d[\d\s\-]{7,}\d)/);
      if(telefonoMatch){
        telefonoExtraido = telefonoMatch[1].trim();
        sinNumero = sinNumero.replace(telefonoMatch[0], "").trim();
      }
      const { nombre, status } = extraerNombreYEtiqueta(sinNumero);
      resultado.asistentes.push({ nombre, status: status || "ACA", telefono: telefonoExtraido || "" });
      if(!status){
        resultado.noReconocido.push(`Asistente sin etiqueta reconocida (se asignó ACA por defecto): "${sinNumero}"`);
      }
    } else if(currentSection === "ninos"){
      const sinNumero = quitarNumeracion(clean);
      const { nombre } = extraerNombreYEtiqueta(sinNumero);
      resultado.ninos.push(nombre);
    } else if(currentSection === "inasistencias"){
      const sinNumero = quitarNumeracion(clean);
      const { nombre } = extraerNombreYEtiqueta(sinNumero);
      resultado.inasistencias.push(nombre);
    } else {
      // No hay sección activa y la línea no encajó en nada conocido
      resultado.noReconocido.push(`Línea no reconocida (se ignoró): "${clean}"`);
    }
  }

  // Aplicar límites de líderes/anfitrión, avisando si sobran
  const aplicarLimite = (arr, limite, etiqueta) => {
    if(arr.length > limite){
      resultado.noReconocido.push(`Se encontraron ${arr.length} ${etiqueta}, solo se importaron los primeros ${limite}.`);
      return arr.slice(0, limite);
    }
    return arr;
  };
  resultado.lideresPrincipales = aplicarLimite(resultado.lideresPrincipales, LIMITS.lideresPrincipales, "líderes principales");
  resultado.lideresCelula = aplicarLimite(resultado.lideresCelula, LIMITS.lideresCelula, "líderes de célula");
  resultado.anfitrion = aplicarLimite(resultado.anfitrion, LIMITS.anfitrion, "anfitriones");

  return resultado;
}

function aplicarImportacionAlFormulario(data){
  document.getElementById("nombreCelula").value = data.general.nombreCelula;
  document.getElementById("fecha").value = data.general.fecha; // solo se llena si viene en formato YYYY-MM-DD
  document.getElementById("ubicacion").value = data.general.ubicacion;
  document.getElementById("tema").value = data.general.tema;
  document.getElementById("cita").value = data.general.cita;
  if(data.general.efectivo !== null){
    document.getElementById("efectivo").value = data.general.efectivo;
  }
  if(data.general.dolares !== null){
    document.getElementById("dolares").value = data.general.dolares;
  }
  if(data.general.nota !== null) document.getElementById("nota").value = data.general.nota;

  formState = crearFormStateVacio();
  data.lideresPrincipales.forEach(v => formState.lideresPrincipales.push({id: nextId(), value: v}));
  data.lideresCelula.forEach(v => formState.lideresCelula.push({id: nextId(), value: v}));
  data.anfitrion.forEach(v => formState.anfitrion.push({id: nextId(), value: v}));
  data.asistentes.forEach(a => formState.asistentes.push({id: nextId(), nombre: a.nombre, status: a.status, telefono: a.telefono || ""}));
  data.ninos.forEach(n => formState.ninos.push({id: nextId(), nombre: n}));
  data.inasistencias.forEach(i => formState.inasistencias.push({id: nextId(), nombre: i}));

  renderAllLists();
  updateCounts();
  updateOfferingTotal();
  applySectionLock();
}

function procesarImportacion(){
  const texto = document.getElementById("importTextarea").value;
  if(!texto || !texto.trim()){
    mostrarToast("Pega el texto a importar antes de continuar");
    return;
  }

  const data = parseImportText(texto);
  aplicarImportacionAlFormulario(data);

  const overlay = document.querySelector(".copy-modal-overlay .import-modal");
  if(!overlay) return;

  const resumenHtml = `
    <h4>Se importó correctamente:</h4>
    <ul>
      <li>Líderes principales: ${data.lideresPrincipales.length}</li>
      <li>Líderes de célula: ${data.lideresCelula.length}</li>
      <li>Anfitrión: ${data.anfitrion.length}</li>
      <li>Asistentes: ${data.asistentes.length}</li>
      <li>Niños: ${data.ninos.length}</li>
      <li>Inasistencias: ${data.inasistencias.length}</li>
    </ul>
    ${data.noReconocido.length > 0 ? `
      <div class="unrecognized-box">
        <h4>⚠ No se reconoció (revisa manualmente, no es un error):</h4>
        <ul>${data.noReconocido.map(n => `<li>${escapeHtml(n)}</li>`).join("")}</ul>
      </div>
    ` : `<p style="color:var(--accent); font-weight:600;">✓ Todo el contenido fue reconocido.</p>`}
  `;

  overlay.innerHTML = `
    <h3>Importación completada</h3>
    <div class="import-summary">${resumenHtml}</div>
    <div class="modal-actions">
      <button type="button" class="btn-primary" onclick="cerrarModalImportar()">Cerrar y revisar formulario</button>
    </div>
  `;

  mostrarToast("Datos importados al formulario ✓");
}

/* ==========================================================
   UTILIDADES
   ========================================================== */
function escapeAttr(str){
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
function escapeHtml(str){ return escapeAttr(str); }

let toastTimeout;
function mostrarToast(msg){
  const toast = document.getElementById("toast");
  toast.textContent = msg;
  toast.classList.add("show");
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => toast.classList.remove("show"), 2500);
}

/* ==========================================================
   INIT
   ========================================================== */
function cargarProgresoGuardado(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY_SESION);
    if(!raw) return;
    const datos = JSON.parse(raw);
    if(!Array.isArray(datos) || datos.length === 0) return;

    reportesSesion.push(...datos);

    // Evitar choques de IDs: el próximo uid debe ser mayor que cualquier _uid ya guardado
    const maxUid = datos.reduce((max, r) => Math.max(max, r._uid || 0), 0);
    if(maxUid > uid) uid = maxUid;

    mostrarToast(`Se recuperaron ${datos.length} célula${datos.length === 1 ? "" : "s"} de tu progreso anterior`);
  } catch(err){
    console.warn("No se pudo recuperar el progreso guardado de localStorage:", err);
  }
}

function init(){
  addSimpleField("lideresPrincipales");
  addSimpleField("lideresCelula");
  addSimpleField("anfitrion");
  addPersonRow("asistentes");
  renderTagButtons();
  renderTotalizarButton();
  updateCounts();
  updateOfferingTotal();
  cargarProgresoGuardado();
  renderSavedReports();
}
init();
