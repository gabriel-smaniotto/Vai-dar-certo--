(function () {
  const { SUPABASE_URL, SUPABASE_ANON_KEY, TABLE } = window.APP_CONFIG;
  const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  // ----- dados base -----
  const SCHOOLS = [
    { value: "cei_lkm", text: "CEI LKM" },
    { value: "em_epc",  text: "Escola Municipal EPC" },
    { value: "apae",    text: "APAE" }
  ];
  const LIKERT_1_4_NS = [
    { value: "1",  text: "Muito ruim" },
    { value: "2",  text: "Ruim" },
    { value: "3",  text: "Bom" },
    { value: "4",  text: "Muito bom" },
    { value: "NS", text: "NS/NA" }
  ];
  const SAT_1_4_NS = [
    { value: "1",  text: "Muito insatisfeito(a)" },
    { value: "2",  text: "Insatisfeito(a)" },
    { value: "3",  text: "Satisfeito(a)" },
    { value: "4",  text: "Muito satisfeito(a)" },
    { value: "NS", text: "NS/NA" }
  ];

  // ----- estado global -----
  const state = {
    idx: 0,                // índice do step atual
    steps: [],             // lista dinâmica de steps (1 pergunta por step)
    perfil: {},            // genero, idade, funcao
    escolasSel: [],        // ["cei_lkm", ...]
    respostas: {}          // A1_colegas: {"cei_lkm":"3",...}, gp_satisfSaude:"2", ...
  };

  // ----- helpers UI -----
  const elApp = document.getElementById("app");
  const elStatus = document.getElementById("status");
  const setStatus = (msg, isErr=false) => {
    elStatus.innerHTML = `<p class="${isErr?'error':''}">${msg}</p>`;
  };
  const html = (s) => { const t=document.createElement("template"); t.innerHTML=s.trim(); return t.content.firstChild; };

  // ----- definição dos steps -----
  function buildSteps() {
    const steps = [];

    // 0) TCLE (1 step)
    steps.push({
      type: "radio",
      key: "tcle",
      title: "TCLE & LGPD — Você concorda em participar?",
      required: true,
      options: ["Concordo", "Não concordo"]
    });

    // 1) Perfil (1 pergunta por tela)
    steps.push({ type: "radio", key: "genero", title: "Gênero", required: true,
      options: ["Feminino","Masculino","Outro","Prefiro não informar"] });

    steps.push({ type: "number", key: "idade", title: "Idade (18–80)", required: true,
      min: 18, max: 80, placeholder: "Ex.: 34" });

    steps.push({ type: "radio", key: "funcao", title: "Função atual na rede", required: true,
      options: ["Docente","Auxiliar/Assistente de professor","Função técnica/administrativa escolar"] });

    // 2) Escolas (um step)
    steps.push({
      type: "checkbox",
      key: "escolas_atuacao",
      title: "Em quais escolas você atua atualmente?",
      required: true,
      options: SCHOOLS.map(s => ({ value: s.value, text: s.text }))
    });

    // 3) Matrizes por escola — 1 escola por step (exemplo: só A1_colegas para ser curto)
    //    Você pode clonar estes steps para A2…E5 e RedFlags.
    const escolas = state.escolasSel.length ? state.escolasSel : [];
    escolas.forEach(escolaId => {
      const schoolLabel = SCHOOLS.find(s => s.value===escolaId)?.text || escolaId;
      steps.push({
        type: "matrix1",        // 1 pergunta (linha única) para a escola X
        key: `A1_colegas[${escolaId}]`,
        matrixKey: "A1_colegas",
        escolaId,
        title: `Clima — Relação com colegas (${schoolLabel})`,
        required: true,
        options: LIKERT_1_4_NS
      });
    });

    // 4) Gerais (1 pergunta por step)
    steps.push({
      type: "radio",
      key: "gp_satisfSaude",
      title: "Satisfação com a saúde",
      required: false,
      options: SAT_1_4_NS.map(o=>({value:o.value,text:o.text}))
    });
    steps.push({
      type: "radio",
      key: "gp_satisfRemun",
      title: "Satisfação com a remuneração",
      required: false,
      options: SAT_1_4_NS.map(o=>({value:o.value,text:o.text}))
    });
    steps.push({
      type: "textarea",
      key: "gp_motivoRemun",
      title: "Se está insatisfeito(a), qual o principal motivo? (opcional)",
      required: false,
      placeholder: "Sem nomes ou detalhes que identifiquem pessoas."
    });

    // 5) Revisão/Envio
    steps.push({ type: "review", key: "review", title: "Revisão & Envio" });

    state.steps = steps;
  }

  // ----- render único (1 step por vez) -----
  function render() {
    // Reconstroi os steps toda vez, pois dependem das escolhas (ex.: escolas)
    buildSteps();

    // bounds
    if (state.idx < 0) state.idx = 0;
    if (state.idx >= state.steps.length) state.idx = state.steps.length - 1;

    const step = state.steps[state.idx];
    elApp.innerHTML = ""; setStatus("");

    // progresso simples
    const progresso = html(`
      <div style="margin:6px 0 12px; font-size:14px; color:#555;">
        Passo ${state.idx+1} de ${state.steps.length}
      </div>
    `);
    elApp.appendChild(progresso);

    // desenha o step
    let node;
    switch (step.type) {
      case "radio":    node = renderRadioStep(step); break;
      case "number":   node = renderNumberStep(step); break;
      case "checkbox": node = renderCheckboxStep(step); break;
      case "matrix1":  node = renderMatrix1Step(step); break;
      case "textarea": node = renderTextareaStep(step); break;
      case "review":   node = renderReviewStep(step); break;
      default:         node = html(`<div>Tipo não suportado.</div>`);
    }
    elApp.appendChild(node);
  }

  // ----- componentes de step -----
  function renderRadioStep(step) {
    const opts = (Array.isArray(step.options) ? step.options : []).map(o => {
      const v = typeof o === "string" ? o : o.value;
      const t = typeof o === "string" ? o : o.text;
      return `<label style="display:block; margin:6px 0;"><input type="radio" name="${step.key}" value="${v}"> ${t}</label>`;
    }).join("");

    const v0 = readValue(step.key);
    const fs = html(`
      <fieldset>
        <legend>${step.title}${step.required ? " *" : ""}</legend>
        <div class="row">${opts}</div>
        <div class="actions">
          <button class="secondary" id="btnBack">Voltar</button>
          <button id="btnNext">Próximo</button>
        </div>
      </fieldset>
    `);
    if (v0) { const el = fs.querySelector(`input[value="${v0}"]`); if (el) el.checked = true; }

    fs.querySelector("#btnBack").onclick = onBack;
    fs.querySelector("#btnNext").onclick = () => {
      const v = valueOfRadio(fs, step.key);
      if (step.required && !v) return setStatus("Selecione uma opção.", true);
      saveValue(step.key, v || "");
      // regra de saída: se TCLE = Não concordo, encerra
      if (step.key === "tcle" && v === "Não concordo") {
        setStatus("Questionário encerrado. Obrigado pela leitura.");
        fs.querySelectorAll("button").forEach(b => b.disabled = true);
        return;
      }
      // se mudamos escolas/funcao, o fluxo recalcula próximo render()
      state.idx++; render();
    };
    return fs;
  }

  function renderNumberStep(step) {
    const fs = html(`
      <fieldset>
        <legend>${step.title}${step.required ? " *" : ""}</legend>
        <input type="number" id="num" min="${step.min||''}" max="${step.max||''}" placeholder="${step.placeholder||''}" style="margin:8px 0; width:160px;">
        <div class="actions">
          <button class="secondary" id="btnBack">Voltar</button>
          <button id="btnNext">Próximo</button>
        </div>
      </fieldset>
    `);
    fs.querySelector("#num").value = readValue(step.key) ?? "";

    fs.querySelector("#btnBack").onclick = onBack;
    fs.querySelector("#btnNext").onclick = () => {
      const raw = fs.querySelector("#num").value.trim();
      const n = Number(raw);
      if (step.required && !raw) return setStatus("Preencha este campo.", true);
      if (raw && (n < (step.min||-Infinity) || n > (step.max||Infinity))) {
        return setStatus(`Valor deve ser entre ${step.min} e ${step.max}.`, true);
      }
      saveValue(step.key, raw ? n : "");
      state.idx++; render();
    };
    return fs;
  }

  function renderCheckboxStep(step) {
    const opts = step.options.map(o =>
      `<label style="display:block; margin:6px 0;">
        <input type="checkbox" name="${step.key}" value="${o.value}"> ${o.text}
      </label>`
    ).join("");

    const fs = html(`
      <fieldset>
        <legend>${step.title}${step.required ? " *" : ""}</legend>
        <div class="row">${opts}</div>
        <div class="actions">
          <button class="secondary" id="btnBack">Voltar</button>
          <button id="btnNext">Próximo</button>
        </div>
      </fieldset>
    `);

    // restore
    const cur = readValue(step.key) || [];
    cur.forEach(v => { const cb=fs.querySelector(`input[value="${v}"]`); if (cb) cb.checked = true; });

    fs.querySelector("#btnBack").onclick = onBack;
    fs.querySelector("#btnNext").onclick = () => {
      const sel = checkedValues(fs, step.key);
      if (step.required && sel.length === 0) return setStatus("Selecione ao menos uma opção.", true);
      saveValue(step.key, sel);
      // atualizar state.escolasSel se for o step de escolas
      if (step.key === "escolas_atuacao") {
        state.escolasSel = sel;
      }
      state.idx++; render();
    };
    return fs;
  }

  // “matrix1”: uma pergunta por escola (um step por escola)
  function renderMatrix1Step(step) {
    const opts = step.options.map(o =>
      `<label style="display:block; margin:6px 0;">
        <input type="radio" name="${step.key}" value="${o.value}"> ${o.text}
      </label>`
    ).join("");

    const fs = html(`
      <fieldset>
        <legend>${step.title}${step.required ? " *" : ""}</legend>
        <div class="row">${opts}</div>
        <div class="actions">
          <button class="secondary" id="btnBack">Voltar</button>
          <button id="btnNext">Próximo</button>
        </div>
      </fieldset>
    `);

    // restore (usa state.respostas[matrixKey][escolaId])
    const curObj = state.respostas[step.matrixKey] || {};
    const curVal = curObj[step.escolaId] || "";
    if (curVal) {
      const el = fs.querySelector(`input[value="${curVal}"]`);
      if (el) el.checked = true;
    }

    fs.querySelector("#btnBack").onclick = onBack;
    fs.querySelector("#btnNext").onclick = () => {
      const v = valueOfRadio(fs, step.key);
      if (step.required && !v) return setStatus("Selecione uma opção.", true);
      // salva
      state.respostas[step.matrixKey] = state.respostas[step.matrixKey] || {};
      if (v) state.respostas[step.matrixKey][step.escolaId] = v;
      state.idx++; render();
    };

    return fs;
  }

  function renderTextareaStep(step) {
    const fs = html(`
      <fieldset>
        <legend>${step.title}${step.required ? " *" : ""}</legend>
        <textarea id="txt" rows="4" placeholder="${step.placeholder||''}" style="width:100%; max-width:640px;"></textarea>
        <div class="actions">
          <button class="secondary" id="btnBack">Voltar</button>
          <button id="btnNext">Próximo</button>
        </div>
      </fieldset>
    `);
    fs.querySelector("#txt").value = readValue(step.key) || "";

    fs.querySelector("#btnBack").onclick = onBack;
    fs.querySelector("#btnNext").onclick = () => {
      const val = fs.querySelector("#txt").value.trim();
      if (step.required && !val) return setStatus("Preencha este campo.", true);
      saveValue(step.key, val);
      state.idx++; render();
    };
    return fs;
  }

  function renderReviewStep(step) {
    const escolasTxt = (state.escolasSel||[]).map(id => SCHOOLS.find(s=>s.value===id)?.text||id).join(", ");
    const fs = html(`
      <fieldset>
        <legend>${step.title}</legend>
        <div class="row"><b>Gênero:</b> ${state.perfil.genero||"-"}</div>
        <div class="row"><b>Idade:</b> ${state.perfil.idade||"-"}</div>
        <div class="row"><b>Função:</b> ${state.perfil.funcao||"-"}</div>
        <div class="row"><b>Escolas:</b> ${escolasTxt||"-"}</div>
        <div class="actions">
          <button class="secondary" id="btnBack">Voltar</button>
          <button id="btnSend">Enviar respostas</button>
        </div>
      </fieldset>
    `);
    fs.querySelector("#btnBack").onclick = onBack;
    fs.querySelector("#btnSend").onclick = onSubmit;
    return fs;
  }

  // ----- navegação -----
  function onBack() {
    if (state.idx > 0) { state.idx--; render(); }
  }

  // ----- leitura/gravação de respostas -----
  function readValue(key) {
    // perfil
    if (key === "genero" || key === "idade" || key === "funcao") return state.perfil[key];
    if (key === "tcle") return state.tcle || "";
    if (key === "escolas_atuacao") return state.escolasSel;
    // gerais (ou outras)
    return state.respostas[key];
  }
  function saveValue(key, val) {
    if (key === "tcle") { state.tcle = val; return; }
    if (key === "genero" || key === "idade" || key === "funcao") { state.perfil[key] = val; return; }
    if (key === "escolas_atuacao") { state.escolasSel = Array.isArray(val) ? val : []; return; }
    state.respostas[key] = val;
  }

  // ----- envio -----
  async function onSubmit() {
    try {
      setStatus("Enviando…");
      const payload = {
        perfil: state.perfil,
        escolas: state.escolasSel,
        respostas: state.respostas,
        meta: { createdAt: new Date().toISOString(), version: "purejs-1q-por-pagina" }
      };
      const { error } = await db.from(TABLE).insert([{ dados: payload }]);
      if (error) throw error;
      setStatus("Obrigado! Respostas salvas.");
      elApp.querySelectorAll("input,textarea,button").forEach(x=>x.disabled=true);
    } catch (e) {
      console.error(e);
      setStatus("Erro ao salvar. Tente novamente.", true);
    }
  }

  // ----- util -----
  function valueOfRadio(root, name) {
    const el = root.querySelector(`input[name="${name}"]:checked`);
    return el ? el.value : "";
  }
  function checkedValues(root, name) {
    return Array.from(root.querySelectorAll(`input[name="${name}"]:checked`)).map(x => x.value);
  }

  // start
  document.addEventListener("DOMContentLoaded", render);
})();

(function () {
  const { SUPABASE_URL, SUPABASE_ANON_KEY, TABLE } = window.APP_CONFIG;
  const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  // ----- catálogos -----
  const SCHOOLS = [
    { value: "cei_lkm", text: "CEI LKM" },
    { value: "em_epc",  text: "Escola Municipal EPC" },
    { value: "apae",    text: "APAE" }
  ];
  const LIKERT_1_4_NS = [
    { value: "1",  text: "Muito ruim" },
    { value: "2",  text: "Ruim" },
    { value: "3",  text: "Bom" },
    { value: "4",  text: "Muito bom" },
    { value: "NS", text: "NS/NA" }
  ];
  const SAT_1_4_NS = [
    { value: "1",  text: "Muito insatisfeito(a)" },
    { value: "2",  text: "Insatisfeito(a)" },
    { value: "3",  text: "Satisfeito(a)" },
    { value: "4",  text: "Muito satisfeito(a)" },
    { value: "NS", text: "NS/NA" }
  ];
  const BIN_SIM_NAO_PNR = [
    { value: "Sim", text: "Sim" },
    { value: "Não", text: "Não" },
    { value: "PNR", text: "Prefiro não responder" }
  ];

  // ----- estado -----
  const state = {
    idx: 0,
    steps: [],
    tcle: "",
    perfil: { genero: "", idade: "", funcao: "" },
    escolasSel: [],
    respostas: {} // ex.: A1_colegas: { escolaId: "3", ... }, gp_satisfSaude: "2"
  };

  // ----- helpers de DOM -----
  const elApp = document.getElementById("app");
  const elStatus = document.getElementById("status");
  const setStatus = (msg, isErr=false) => { elStatus.innerHTML = `<p class="${isErr?'error':''}">${msg}</p>`; };
  const html = (s) => { const t=document.createElement("template"); t.innerHTML=s.trim(); return t.content.firstChild; };
  const labelSchool = (id) => SCHOOLS.find(s=>s.value===id)?.text || id;

  // ====== DEFINIÇÃO DO FLUXO (uma pergunta por página) ======
  function buildSteps() {
    const steps = [];

    // ---- TCLE (1 step) ----
    steps.push({
      type: "html",
      key: "tcle_txt",
      title: "Termo de Consentimento Livre e Esclarecido (TCLE) e LGPD",
      html: `
        <div class="row">
          <h3>Pesquisa de Bem-Estar dos Profissionais da Educação</h3>
          <p><b>Objetivo.</b> Levantar percepções sobre condições de trabalho, organização, infraestrutura, valorização, recursos pedagógicos, saúde e condições de vida.</p>
          <p><b>Procedimento.</b> Questionário on-line (~7–10 min). Se atua em mais de uma escola, você responderá por cada unidade.</p>
          <p><b>Voluntariedade.</b> Participação voluntária.</p>
          <p><b>Confidencialidade.</b> Não coletamos identificadores (nome, e-mail, IP...). Evite citar nomes nas respostas abertas.</p>
          <p><b>LGPD.</b> Dados anonimizados, análise apenas agregada.</p>
        </div>
      `
    });
    steps.push({
      type: "radio",
      key: "tcle",
      title: "Você concorda em participar?",
      required: true,
      options: ["Concordo", "Não concordo"]
    });

    // ---- Perfil (1 por tela) ----
    steps.push({ type: "radio", key: "genero", title: "Gênero", required: true,
      options: ["Feminino","Masculino","Outro","Prefiro não informar"] });
    steps.push({ type: "number", key: "idade", title: "Idade (18–80)", required: true,
      min: 18, max: 80, placeholder: "Ex.: 34" });
    steps.push({ type: "radio", key: "funcao", title: "Função atual na rede", required: true,
      options: ["Docente","Auxiliar/Assistente de professor","Função técnica/administrativa escolar"] });

    // ---- Escolas (1 step) ----
    steps.push({
      type: "checkbox",
      key: "escolas_atuacao",
      title: "Em quais escolas você atua atualmente?",
      required: true,
      options: SCHOOLS.map(s => ({ value: s.value, text: s.text }))
    });

    // ---- Matrizes por escola (A1–A4, B1–B4, C1–C4, D1–D3) ----
    const matriculas = [
      // Clima & Pertencimento
      ["A1_colegas",        "Clima — Relação com colegas"],
      ["A2_gestao",         "Clima — Relação com a gestão escolar"],
      ["A3_estudantes",     "Clima — Relação com estudantes (se aplicável)"],
      ["A4_autenticidade",  "Clima — Posso ser eu mesmo(a) nesta escola"],
      // Valorização & Feedback
      ["B1_habilidades",    "Valorização — Uso de habilidades e conhecimentos"],
      ["B2_metas",          "Valorização — Clareza sobre objetivos e metas"],
      ["B3_feedback",       "Valorização — Feedbacks úteis e regulares"],
      ["B4_reconhecimento", "Valorização — Reconhecimento pelo trabalho"],
      // Organização do Trabalho
      ["C1_papeis",         "Organização — Clareza de papéis e responsabilidades"],
      ["C2_planejamento",   "Organização — Planejamento/comunicação de rotinas"],
      ["C3_autonomia",      "Organização — Autonomia para executar o trabalho"],
      ["C4_burocracia",     "Organização — Processos burocráticos não atrapalham"],
      // Infraestrutura & Segurança
      ["D1_estrutura",      "Infraestrutura — Estrutura física (banheiros, pátio, etc.)"],
      ["D2_posto",          "Infraestrutura — Condições do meu posto de trabalho"],
      ["D3_seguranca",      "Infraestrutura — Sensação de segurança"]
    ];

    const escolas = state.escolasSel || [];
    const isDocente = state.perfil.funcao === "Docente";

    // Por cada dimensão/por cada escola: um step
    matriculas.forEach(([key, title]) => {
      escolas.forEach(id => {
        steps.push({
          type: "matrix1",
          key: `${key}[${id}]`,
          matrixKey: key,
          escolaId: id,
          title: `${title} — ${labelSchool(id)}`,
          required: true,
          options: LIKERT_1_4_NS
        });
      });
    });

    // Recursos Pedagógicos (Docentes) — E1–E5
    if (isDocente) {
      [
        ["E1_materiais", "Recursos (Docentes) — Materiais didáticos"],
        ["E2_tempo",     "Recursos (Docentes) — Tempo para planejamento/HA"],
        ["E3_equip",     "Recursos (Docentes) — Equipamentos tecnológicos"],
        ["E4_suporte",   "Recursos (Docentes) — Suporte pedagógico"],
        ["E5_nee",       "Recursos (Docentes) — Apoio para estudantes com NEE"]
      ].forEach(([key, title]) => {
        escolas.forEach(id => {
          steps.push({
            type: "matrix1",
            key: `${key}[${id}]`,
            matrixKey: key,
            escolaId: id,
            title: `${title} — ${labelSchool(id)}`,
            required: false,
            options: LIKERT_1_4_NS
          });
        });
      });
    }

    // Item global — satisfação geral por escola
    escolas.forEach(id => {
      steps.push({
        type: "matrix1",
        key: `S_satisfGeral[${id}]`,
        matrixKey: "S_satisfGeral",
        escolaId: id,
        title: `Satisfação geral em trabalhar na escola — ${labelSchool(id)}`,
        required: false,
        options: [
          { value: "1", text: "Muito insatisfeito(a)" },
          { value: "2", text: "Insatisfeito(a)" },
          { value: "3", text: "Satisfeito(a)" },
          { value: "4", text: "Muito satisfeito(a)" },
          { value: "NS", text: "NS/NA" }
        ]
      });
    });

    // Red Flags — 3 temas x (vivenciou e presenciou) por escola
    const redFlags = [
      ["RF_violencia_vivenciou",   "Violência/Agressão — Vivenciou? (com você)"],
      ["RF_violencia_presenciou",  "Violência/Agressão — Presenciou? (você viu)"],
      ["RF_assedio_vivenciou",     "Assédio (moral/sexual) — Vivenciou? (com você)"],
      ["RF_assedio_presenciou",    "Assédio (moral/sexual) — Presenciou? (você viu)"],
      ["RF_discriminacao_vivenciou","Discriminação — Vivenciou? (com você)"],
      ["RF_discriminacao_presenciou","Discriminação — Presenciou? (você viu)"]
    ];
    redFlags.forEach(([key, title]) => {
      escolas.forEach(id => {
        steps.push({
          type: "matrix1",
          key: `${key}[${id}]`,
          matrixKey: key,
          escolaId: id,
          title: `${title} — ${labelSchool(id)}`,
          required: false,
          options: BIN_SIM_NAO_PNR
        });
      });
    });

    // Gerais (não por escola)
    steps.push({
      type: "radio",
      key: "gp_acessoSaude",
      title: "Consigo acessar serviços de saúde quando preciso",
      required: false,
      options: LIKERT_1_4_NS
    });
    steps.push({
      type: "radio",
      key: "gp_satisfSaude",
      title: "Estou satisfeito(a) com minha saúde",
      required: false,
      options: LIKERT_1_4_NS
    });
    steps.push({
      type: "radio",
      key: "gp_atividadeFisica",
      title: "Prática de atividade física",
      required: false,
      options: [
        { value: "1", text: "Nunca" },
        { value: "2", text: "Raramente" },
        { value: "3", text: "Às vezes" },
        { value: "4", text: "Frequentemente" }
      ]
    });
    steps.push({
      type: "radio",
      key: "gp_condicoesVida",
      title: "Condições de vida (moradia, transporte e lazer) me satisfazem",
      required: false,
      options: LIKERT_1_4_NS
    });
    steps.push({
      type: "radio",
      key: "gp_satisfRemun",
      title: "Satisfação com a remuneração",
      required: false,
      options: SAT_1_4_NS
    });
    steps.push({
      type: "textarea",
      key: "gp_motivoRemun",
      title: "Se está insatisfeito(a), qual o principal motivo? (opcional)",
      required: false,
      placeholder: "Evite nomes ou detalhes que identifiquem pessoas."
    });
    steps.push({
      type: "radio",
      key: "gp_regularidadePgto",
      title: "Regularidade do pagamento (valores maiores = melhor)",
      required: false,
      options: [
        {value:"4", text:"Não atrasa"},
        {value:"3", text:"Raramente atrasa"},
        {value:"2", text:"Atrasos comuns"},
        {value:"1", text:"Sempre atrasa"}
      ]
    });

    // Revisão/Envio
    steps.push({ type: "review", key: "review", title: "Revisão & Envio" });

    state.steps = steps;
  }

  // ====== RENDER (mostra 1 step por vez) ======
  function render() {
    buildSteps();

    if (state.idx < 0) state.idx = 0;
    if (state.idx >= state.steps.length) state.idx = state.steps.length - 1;

    const step = state.steps[state.idx];
    elApp.innerHTML = "";
    setStatus("");

    // progresso
    const progresso = html(`<div style="margin:6px 0 12px; font-size:14px; color:#555;">Passo ${state.idx+1} de ${state.steps.length}</div>`);
    elApp.appendChild(progresso);

    let node;
    switch (step.type) {
      case "html":     node = renderHtmlStep(step); break;
      case "radio":    node = renderRadioStep(step); break;
      case "number":   node = renderNumberStep(step); break;
      case "checkbox": node = renderCheckboxStep(step); break;
      case "matrix1":  node = renderMatrix1Step(step); break;
      case "textarea": node = renderTextareaStep(step); break;
      case "review":   node = renderReviewStep(step); break;
      default:         node = html(`<div>Tipo não suportado.</div>`);
    }
    elApp.appendChild(node);
  }

  // ====== COMPONENTES ======
  function renderHtmlStep(step) {
    const fs = html(`
      <fieldset>
        <legend>${step.title}</legend>
        <div class="row">${step.html || ""}</div>
        <div class="actions">
          <button class="secondary" id="btnBack" ${state.idx===0?'disabled':''}>Voltar</button>
          <button id="btnNext">Continuar</button>
        </div>
      </fieldset>
    `);
    fs.querySelector("#btnBack").onclick = onBack;
    fs.querySelector("#btnNext").onclick = () => { state.idx++; render(); };
    return fs;
  }

  function renderRadioStep(step) {
    const opts = (Array.isArray(step.options) ? step.options : []).map(o => {
      const v = typeof o === "string" ? o : o.value;
      const t = typeof o === "string" ? o : o.text;
      return `<label style="display:block; margin:6px 0;"><input type="radio" name="${step.key}" value="${v}"> ${t}</label>`;
    }).join("");

    const v0 = readValue(step.key);
    const fs = html(`
      <fieldset>
        <legend>${step.title}${step.required ? " *" : ""}</legend>
        <div class="row">${opts}</div>
        <div class="actions">
          <button class="secondary" id="btnBack" ${state.idx===0?'disabled':''}>Voltar</button>
          <button id="btnNext">Próximo</button>
        </div>
      </fieldset>
    `);
    if (v0) { const el = fs.querySelector(`input[value="${v0}"]`); if (el) el.checked = true; }

    fs.querySelector("#btnBack").onclick = onBack;
    fs.querySelector("#btnNext").onclick = () => {
      const v = valueOfRadio(fs, step.key);
      if (step.required && !v) return setStatus("Selecione uma opção.", true);
      saveValue(step.key, v || "");
      if (step.key === "tcle" && v === "Não concordo") {
        setStatus("Questionário encerrado. Obrigado pela leitura.");
        fs.querySelectorAll("button").forEach(b => b.disabled = true);
        return;
      }
      state.idx++; render();
    };
    return fs;
  }

  function renderNumberStep(step) {
    const fs = html(`
      <fieldset>
        <legend>${step.title}${step.required ? " *" : ""}</legend>
        <input type="number" id="num" min="${step.min||''}" max="${step.max||''}" placeholder="${step.placeholder||''}" style="margin:8px 0; width:160px;">
        <div class="actions">
          <button class="secondary" id="btnBack">Voltar</button>
          <button id="btnNext">Próximo</button>
        </div>
      </fieldset>
    `);
    fs.querySelector("#num").value = readValue(step.key) ?? "";

    fs.querySelector("#btnBack").onclick = onBack;
    fs.querySelector("#btnNext").onclick = () => {
      const raw = fs.querySelector("#num").value.trim();
      const n = Number(raw);
      if (step.required && !raw) return setStatus("Preencha este campo.", true);
      if (raw && (n < (step.min||-Infinity) || n > (step.max||Infinity))) {
        return setStatus(`Valor deve ser entre ${step.min} e ${step.max}.`, true);
      }
      saveValue(step.key, raw ? n : "");
      state.idx++; render();
    };
    return fs;
  }

  function renderCheckboxStep(step) {
    const opts = step.options.map(o =>
      `<label style="display:block; margin:6px 0;">
        <input type="checkbox" name="${step.key}" value="${o.value}"> ${o.text}
      </label>`
    ).join("");

    const fs = html(`
      <fieldset>
        <legend>${step.title}${step.required ? " *" : ""}</legend>
        <div class="row">${opts}</div>
        <div class="actions">
          <button class="secondary" id="btnBack">Voltar</button>
          <button id="btnNext">Próximo</button>
        </div>
      </fieldset>
    `);

    const cur = readValue(step.key) || [];
    cur.forEach(v => { const cb=fs.querySelector(`input[value="${v}"]`); if (cb) cb.checked = true; });

    fs.querySelector("#btnBack").onclick = onBack;
    fs.querySelector("#btnNext").onclick = () => {
      const sel = checkedValues(fs, step.key);
      if (step.required && sel.length === 0) return setStatus("Selecione ao menos uma opção.", true);
      saveValue(step.key, sel);
      if (step.key === "escolas_atuacao") state.escolasSel = sel;
      state.idx++; render();
    };
    return fs;
  }

  function renderMatrix1Step(step) {
    const opts = step.options.map(o =>
      `<label style="display:block; margin:6px 0;">
        <input type="radio" name="${step.key}" value="${o.value}"> ${o.text}
      </label>`
    ).join("");

    const fs = html(`
      <fieldset>
        <legend>${step.title}${step.required ? " *" : ""}</legend>
        <div class="row">${opts}</div>
        <div class="actions">
          <button class="secondary" id="btnBack">Voltar</button>
          <button id="btnNext">Próximo</button>
        </div>
      </fieldset>
    `);

    // restore
    const curObj = state.respostas[step.matrixKey] || {};
    const curVal = curObj[step.escolaId] || "";
    if (curVal) {
      const el = fs.querySelector(`input[value="${curVal}"]`);
      if (el) el.checked = true;
    }

    fs.querySelector("#btnBack").onclick = onBack;
    fs.querySelector("#btnNext").onclick = () => {
      const v = valueOfRadio(fs, step.key);
      if (step.required && !v) return setStatus("Selecione uma opção.", true);
      state.respostas[step.matrixKey] = state.respostas[step.matrixKey] || {};
      if (v) state.respostas[step.matrixKey][step.escolaId] = v;
      state.idx++; render();
    };
    return fs;
  }

  function renderTextareaStep(step) {
    const fs = html(`
      <fieldset>
        <legend>${step.title}${step.required ? " *" : ""}</legend>
        <textarea id="txt" rows="4" placeholder="${step.placeholder||''}" style="width:100%; max-width:640px;"></textarea>
        <div class="actions">
          <button class="secondary" id="btnBack">Voltar</button>
          <button id="btnNext">Próximo</button>
        </div>
      </fieldset>
    `);
    fs.querySelector("#txt").value = readValue(step.key) || "";

    fs.querySelector("#btnBack").onclick = onBack;
    fs.querySelector("#btnNext").onclick = () => {
      const val = fs.querySelector("#txt").value.trim();
      if (step.required && !val) return setStatus("Preencha este campo.", true);
      saveValue(step.key, val);
      state.idx++; render();
    };
    return fs;
  }

  function renderReviewStep(step) {
    const escolasTxt = (state.escolasSel||[]).map(labelSchool).join(", ");
    const fs = html(`
      <fieldset>
        <legend>${step.title}</legend>
        <div class="row"><b>Gênero:</b> ${state.perfil.genero||"-"}</div>
        <div class="row"><b>Idade:</b> ${state.perfil.idade||"-"}</div>
        <div class="row"><b>Função:</b> ${state.perfil.funcao||"-"}</div>
        <div class="row"><b>Escolas:</b> ${escolasTxt||"-"}</div>
        <div class="actions">
          <button class="secondary" id="btnBack">Voltar</button>
          <button id="btnSend">Enviar respostas</button>
        </div>
      </fieldset>
    `);
    fs.querySelector("#btnBack").onclick = onBack;
    fs.querySelector("#btnSend").onclick = onSubmit;
    return fs;
  }

  // ====== navegação ======
  function onBack() {
    if (state.idx > 0) { state.idx--; render(); }
  }

  // ====== leitura/gravação ======
  function readValue(key) {
    if (key === "tcle") return state.tcle || "";
    if (key in state.perfil) return state.perfil[key];
    if (key === "escolas_atuacao") return state.escolasSel;
    return state.respostas[key];
  }
  function saveValue(key, val) {
    if (key === "tcle") { state.tcle = val; return; }
    if (key in state.perfil) { state.perfil[key] = val; return; }
    if (key === "escolas_atuacao") { state.escolasSel = Array.isArray(val) ? val : []; return; }
    state.respostas[key] = val;
  }

  // ====== envio ======
  async function onSubmit() {
    try {
      setStatus("Enviando…");
      const payload = {
        perfil: state.perfil,
        escolas: state.escolasSel,
        respostas: state.respostas,
        meta: { createdAt: new Date().toISOString(), version: "purejs-1q-per-page" }
      };
      const { error } = await db.from(TABLE).insert([{ dados: payload }]);
      if (error) throw error;
      setStatus("Obrigado! Respostas salvas.");
      elApp.querySelectorAll("input,textarea,button").forEach(x=>x.disabled=true);
    } catch (e) {
      console.error(e);
      setStatus("Erro ao salvar. Tente novamente.", true);
    }
  }

  // ====== util ======
  function valueOfRadio(root, name) {
    const el = root.querySelector(`input[name="${name}"]:checked`);
    return el ? el.value : "";
  }
  function checkedValues(root, name) {
    return Array.from(root.querySelectorAll(`input[name="${name}"]:checked`)).map(x => x.value);
  }

  // start
  document.addEventListener("DOMContentLoaded", render);
})();
