import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as THREE from "https://esm.sh/three@0.170.0";

/* =========================================
   CONFIGURAÇÃO DO SUPABASE
========================================= */

const SUPABASE_URL = "https://gkdcdbirhqicvepihqgj.supabase.co";
const SUPABASE_KEY = "sb_publishable_KD2TjfK0HMZgOpa65Fv2Bg_r6H7WJBm";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

/* =========================================
   ELEMENTOS E ESTADO
========================================= */

const $ = (selector) => document.querySelector(selector);

const authScreen = $("#auth-screen");
const app = $("#app");
const authMessage = $("#auth-message");

let currentUser = null;
let profile = null;

let progress = {
  xp: 0,
  credits: 0,
  anomalies: 0,
  missions: 0
};

let selectedCharacter = "Edward";
let isCorrupted = false;
let completedMissions = new Set();
let completedAnomalies = new Set();

let authReady = false;
let recoveryMode = false;

const characters = [
  {
    id: "Edward",
    description: "Um pesquisador ligado aos mistérios do VOX."
  },
  {
    id: "Rosemary",
    description: "Uma presença importante nos registros do projeto."
  },
  {
    id: "Madalena",
    description: "Uma personagem conectada aos acontecimentos."
  },
  {
    id: "Theo",
    description: "Um explorador das dimensões desconhecidas."
  },
  {
    id: "Summer",
    description: "Uma personalidade registrada nos arquivos."
  },
  {
    id: "Katheryne",
    description: "Uma pesquisadora ligada aos fenômenos."
  }
];

const missionRewards = {
  first: { xp: 30, credits: 15, name: "Primeiro contato" },
  signal: { xp: 50, credits: 25, name: "Sinal desconhecido" },
  anomaly: { xp: 70, credits: 35, name: "Registro anômalo" }
};

const anomalyNames = {
  observer: "O Observador",
  signal: "Sinal Perdido",
  fragment: "Fragmento"
};

/* =========================================
   UTILITÁRIOS
========================================= */

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("show");

  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => {
    toast.classList.remove("show");
  }, 3200);
}

function showAuthMessage(message, isError = false) {
  authMessage.textContent = message;
  authMessage.style.color = isError ? "#ff8d9c" : "#c3a9ff";
}

function showForm(formId) {
  const forms = [
    "#login-form",
    "#register-form",
    "#recovery-form",
    "#new-password-form"
  ];

  forms.forEach((id) => $(id).classList.toggle("hidden", id !== formId));

  $("#show-register").classList.toggle("hidden", formId !== "#login-form");
  $("#show-recovery").classList.toggle("hidden", formId !== "#login-form");
  $("#show-login").classList.toggle("hidden", formId === "#login-form");

  showAuthMessage("");
}

function showApplication() {
  authScreen.classList.add("hidden");
  app.classList.remove("hidden");
}

function showAuthentication() {
  app.classList.add("hidden");
  authScreen.classList.remove("hidden");
  showForm("#login-form");
}

/* =========================================
   AUTENTICAÇÃO
========================================= */

$("#show-register").addEventListener("click", () => {
  showForm("#register-form");
});

$("#show-login").addEventListener("click", () => {
  showForm("#login-form");
});

$("#show-recovery").addEventListener("click", () => {
  showForm("#recovery-form");
});

$("#login-form").addEventListener("submit", async (event) => {
  event.preventDefault();

  const email = $("#login-email").value.trim();
  const password = $("#login-password").value;

  const button = $("#login-form button[type='submit']");
  button.disabled = true;
  button.textContent = "CONECTANDO...";

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password
  });

  button.disabled = false;
  button.textContent = "ENTRAR NO SISTEMA";

  if (error) {
    showAuthMessage(error.message, true);
  }
});

$("#register-form").addEventListener("submit", async (event) => {
  event.preventDefault();

  const username = $("#register-username").value.trim();
  const email = $("#register-email").value.trim();
  const password = $("#register-password").value;

  if (username.length < 3) {
    showAuthMessage("O nome precisa ter pelo menos 3 caracteres.", true);
    return;
  }

  const button = $("#register-form button[type='submit']");
  button.disabled = true;
  button.textContent = "CRIANDO CONTA...";

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { username }
    }
  });

  button.disabled = false;
  button.textContent = "CRIAR CONTA";

  if (error) {
    showAuthMessage(error.message, true);
    return;
  }

  if (data.session) {
    await loadAccount(data.session.user);
  } else {
    showAuthMessage(
      "Conta criada! Verifique seu e-mail, confirme o cadastro e depois entre no VOX."
    );
    showForm("#login-form");
  }
});

$("#recovery-form").addEventListener("submit", async (event) => {
  event.preventDefault();

  const email = $("#recovery-email").value.trim();

  const redirectTo = window.location.origin + window.location.pathname;

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo
  });

  if (error) {
    showAuthMessage(error.message, true);
    return;
  }

  showAuthMessage("Se o endereço estiver cadastrado, você receberá um e-mail para redefinir a senha.");
});

$("#new-password-form").addEventListener("submit", async (event) => {
  event.preventDefault();

  const password = $("#new-password").value;

  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    showAuthMessage(error.message, true);
    return;
  }

  recoveryMode = false;
  showAuthMessage("Senha atualizada! Você já pode entrar.");
  showForm("#login-form");
});

/* =========================================
   CARREGAMENTO DA CONTA
========================================= */

async function loadAccount(user) {
  currentUser = user;

  const username =
    user.user_metadata?.username ||
    user.email?.split("@")[0] ||
    "Pesquisador";

  // Cria o perfil caso ainda não exista.
  const { error: profileUpsertError } = await supabase
    .from("vox_profiles")
    .upsert({
      id: user.id,
      username,
      character_id: "Edward",
      corrupted: false
    }, {
      onConflict: "id",
      ignoreDuplicates: true
    });

  if (profileUpsertError) {
    showAuthMessage("Erro ao preparar perfil: " + profileUpsertError.message, true);
    return;
  }

  // Cria o progresso inicial caso ainda não exista.
  const { error: progressUpsertError } = await supabase
    .from("vox_progress")
    .upsert({
      user_id: user.id,
      xp: 0,
      credits: 0,
      anomalies: 0,
      missions: 0
    }, {
      onConflict: "user_id",
      ignoreDuplicates: true
    });

  if (progressUpsertError) {
    showAuthMessage("Erro ao preparar progresso: " + progressUpsertError.message, true);
    return;
  }

  const { data: profileData, error: profileError } = await supabase
    .from("vox_profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (profileError) {
    showAuthMessage("Não foi possível carregar o perfil: " + profileError.message, true);
    return;
  }

  const { data: progressData, error: progressError } = await supabase
    .from("vox_progress")
    .select("*")
    .eq("user_id", user.id)
    .single();

  if (progressError) {
    showAuthMessage("Não foi possível carregar o progresso: " + progressError.message, true);
    return;
  }

  profile = profileData;
  progress = {
    xp: Number(progressData.xp) || 0,
    credits: Number(progressData.credits) || 0,
    anomalies: Number(progressData.anomalies) || 0,
    missions: Number(progressData.missions) || 0
  };

  selectedCharacter = characters.some(
    character => character.id === profile.character_id
  ) ? profile.character_id : "Edward";

  isCorrupted = Boolean(profile.corrupted);

  $("#username-display").textContent = profile.username || username;
  $("#settings-username").textContent = profile.username || username;
  $("#settings-email").textContent = user.email || "—";
  $("#settings-character").textContent = selectedCharacter;

  $("#corrupted-toggle").checked = isCorrupted;

  renderCharacters();
  renderStats();
  showApplication();

  initScenes();
  initEarthMap();

  if (!authReady) {
    authReady = true;
    showToast("Conexão estabelecida. Bem-vindo ao VOX.");
  }
}

/* =========================================
   SALVAMENTO DE PROGRESSO
========================================= */

async function saveProgress() {
  if (!currentUser) return;

  const { error } = await supabase
    .from("vox_progress")
    .update({
      xp: progress.xp,
      credits: progress.credits,
      anomalies: progress.anomalies,
      missions: progress.missions,
      updated_at: new Date().toISOString()
    })
    .eq("user_id", currentUser.id);

  if (error) {
    showToast("Não foi possível salvar: " + error.message);
  }
}

async function saveCharacter() {
  if (!currentUser) return;

  const { error } = await supabase
    .from("vox_profiles")
    .update({
      character_id: selectedCharacter,
      corrupted: isCorrupted
    })
    .eq("id", currentUser.id);

  if (error) {
    showToast("Erro ao salvar personagem: " + error.message);
    return;
  }

  profile.character_id = selectedCharacter;
  profile.corrupted = isCorrupted;

  $("#settings-character").textContent =
    selectedCharacter + (isCorrupted ? " (Corrompido)" : "");

  showToast("Personagem atualizado.");
}

/* =========================================
   PROGRESSÃO
========================================= */

function getLevel(xp) {
  return Math.floor(xp / 100) + 1;
}

function renderStats() {
  const level = getLevel(progress.xp);
  const currentLevelXP = progress.xp % 100;

  $("#xpValue").textContent = progress.xp + " XP";
  $("#creditsValue").textContent = progress.credits;
  $("#anomalyValue").textContent = progress.anomalies;
  $("#missionValue").textContent = progress.missions;
  $("#levelValue").textContent = "NÍVEL " + level;
  $("#xpBar").style.width = currentLevelXP + "%";

  $("#xpDescription").textContent =
    currentLevelXP + " / 100 XP para o próximo nível";
}

async function addRewards(xp, credits) {
  const previousLevel = getLevel(progress.xp);

  progress.xp += xp;
  progress.credits += credits;

  renderStats();
  await saveProgress();

  const newLevel = getLevel(progress.xp);

  if (newLevel > previousLevel) {
    showToast("NÍVEL " + newLevel + " ALCANÇADO! ✦");
  }
}

/* =========================================
   MISSÕES
========================================= */

document.querySelectorAll(".mission-button").forEach((button) => {
  button.addEventListener("click", async () => {
    const id = button.dataset.mission;
    const mission = missionRewards[id];

    if (!mission || completedMissions.has(id)) return;

    completedMissions.add(id);
    progress.missions++;

    button.disabled = true;
    button.textContent = "CONCLUÍDA";

    await addRewards(mission.xp, mission.credits);

    showToast("Missão concluída: " + mission.name);
  });
});

/* =========================================
   ANOMALIAS
========================================= */

document.querySelectorAll(".inspect-button").forEach((button) => {
  button.addEventListener("click", async () => {
    const id = button.dataset.anomaly;

    if (completedAnomalies.has(id)) {
      showToast("Esta anomalia já foi registrada nesta sessão.");
      return;
    }

    completedAnomalies.add(id);
    progress.anomalies++;

    button.textContent = "REGISTRADA";
    button.disabled = true;

    await addRewards(20, 10);

    showToast("Anomalia registrada: " + anomalyNames[id]);
  });
});

/* =========================================
   PERSONAGENS
========================================= */

function renderCharacters() {
  const container = $("#character-list");
  container.innerHTML = "";

  characters.forEach((character) => {
    const button = document.createElement("button");

    button.className =
      "character-option" +
      (character.id === selectedCharacter ? " selected" : "");

    button.innerHTML = `
      <strong>${character.id}</strong>
      <small>Selecionar personagem</small>
    `;

    button.addEventListener("click", async () => {
      selectedCharacter = character.id;
      renderCharacters();
      updateCharacterDescription();
      await saveCharacter();
      updateCharacterScene();
    });

    container.appendChild(button);
  });

  updateCharacterDescription();
}

function updateCharacterDescription() {
  const character = characters.find(
    item => item.id === selectedCharacter
  );

  $("#character-description").textContent =
    character ? character.description : "";
}

$("#corrupted-toggle").addEventListener("change", async (event) => {
  isCorrupted = event.target.checked;
  await saveCharacter();
  updateCharacterScene();
});

/* =========================================
   MAPA INTERATIVO DA TERRA — LEAFLET
   Pontos de anomalia são ficcionais dentro do VOX.
========================================= */

let earthMap = null;
const earthMarkers = new Map();

const fictionalAnomalies = [
  {
    id: "iceland-signal",
    name: "Sinal de Reykjavík",
    place: "Islândia",
    coords: [64.1466, -21.9426],
    description: "Uma interferência violeta aparece nos registros do VOX. Fenômeno fictício do jogo.",
    rewardXP: 20,
    rewardCredits: 10
  },
  {
    id: "sahara-fragment",
    name: "Fragmento do Saara",
    place: "Deserto do Saara",
    coords: [23.4162, 25.6628],
    description: "Um fragmento de energia foi detectado nesta região. Anomalia fictícia do VOX.",
    rewardXP: 25,
    rewardCredits: 12
  },
  {
    id: "pacific-observer",
    name: "O Observador",
    place: "Oceano Pacífico",
    coords: [0, -150],
    description: "Um sinal desconhecido parece surgir do oceano. Evento fictício do VOX.",
    rewardXP: 30,
    rewardCredits: 15
  }
];

function initEarthMap() {
  const mapElement = $("#earth-map");

  if (!mapElement || typeof L === "undefined") return;

  if (earthMap) {
    earthMap.invalidateSize();
    return;
  }

  earthMap = L.map(mapElement, {
    worldCopyJump: true,
    minZoom: 2,
    maxZoom: 9
  }).setView([20, 0], 2);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>'
  }).addTo(earthMap);

  fictionalAnomalies.forEach((anomaly) => {
    const icon = L.divIcon({
      className: "",
      html: '<div class="anomaly-marker">✦</div>',
      iconSize: [24, 24],
      iconAnchor: [12, 12]
    });

    const marker = L.marker(anomaly.coords, { icon }).addTo(earthMap);

    marker.bindPopup(
      `<strong>${anomaly.name}</strong><br>${anomaly.place}<br><small>ANOMALIA FICCIONAL DO VOX</small>`
    );

    marker.on("click", () => {
      showMapAnomaly(anomaly);
    });

    earthMarkers.set(anomaly.id, marker);
  });

  const info = $("#map-info");
  if (info) {
    info.innerHTML =
      "<strong>MAPA CONECTADO</strong><br>" +
      "Explore a Terra com zoom e movimentação. Selecione um marcador violeta para investigar uma anomalia fictícia do VOX.";
  }

  window.setTimeout(() => earthMap?.invalidateSize(), 150);
}

function showMapAnomaly(anomaly) {
  const info = $("#map-info");
  if (!info) return;

  const alreadyFound = completedAnomalies.has(anomaly.id);

  info.innerHTML = `
    <strong>${anomaly.name}</strong> — ${anomaly.place}<br>
    ${anomaly.description}<br>
    <span>Recompensa: ${anomaly.rewardXP} XP · ${anomaly.rewardCredits} créditos</span><br>
    <button class="primary-button compact" id="investigate-map-anomaly" ${alreadyFound ? "disabled" : ""}>
      ${alreadyFound ? "ANOMALIA REGISTRADA" : "INVESTIGAR ANOMALIA"}
    </button>
  `;

  const button = $("#investigate-map-anomaly");
  if (!button || alreadyFound) return;

  button.addEventListener("click", async () => {
    if (completedAnomalies.has(anomaly.id)) return;

    completedAnomalies.add(anomaly.id);
    progress.anomalies += 1;

    button.disabled = true;
    button.textContent = "REGISTRADA";

    await addRewards(anomaly.rewardXP, anomaly.rewardCredits);

    info.innerHTML = `
      <strong>REGISTRO CONCLUÍDO: ${anomaly.name}</strong><br>
      ${anomaly.description}<br>
      Recompensa adicionada ao seu progresso.
    `;

    showToast("Anomalia investigada! Recompensas recebidas.");
  });
}

/* =========================================
   NAVEGAÇÃO
========================================= */

const pageTitles = {
  home: "Visão geral",
  character: "Personagem",
  missions: "Missões",
  anomalies: "Anomalias",
  universe: "Universo",
  laboratory: "Laboratório",
  comics: "Histórias",
  settings: "Configurações"
};

function navigateTo(pageName) {
  const target = $("#page-" + pageName);

  if (!target) return;

  document.querySelectorAll(".page").forEach((page) => {
    page.classList.remove("active");
  });

  target.classList.add("active");

  document.querySelectorAll(".nav-button").forEach((button) => {
    button.classList.toggle(
      "active",
      button.dataset.page === pageName
    );
  });

  $("#page-heading").textContent = pageTitles[pageName] || "VOX V2";

  window.dispatchEvent(new Event("resize"));

  if (pageName === "universe") {
    initEarthMap();
    window.setTimeout(() => earthMap?.invalidateSize(), 180);
  }
}

document.querySelectorAll(".nav-button").forEach((button) => {
  button.addEventListener("click", () => {
    navigateTo(button.dataset.page);
  });
});

document.querySelectorAll("[data-go]").forEach((button) => {
  button.addEventListener("click", () => {
    navigateTo(button.dataset.go);
  });
});

/* =========================================
   LABORATÓRIO
========================================= */

$("#analyze-button").addEventListener("click", async () => {
  const button = $("#analyze-button");
  const result = $("#analysis-result");

  button.disabled = true;
  button.textContent = "ANALISANDO...";

  result.textContent = "Iniciando varredura...";

  await new Promise(resolve => setTimeout(resolve, 900));

  result.textContent =
    "VARREDURA CONCLUÍDA — Sinal detectado. " +
    "Origem desconhecida. Dados adicionados ao registro experimental.";

  button.disabled = false;
  button.textContent = "INICIAR NOVA ANÁLISE";

  showToast("Análise concluída.");
});

/* =========================================
   SAIR DA CONTA
========================================= */

async function logout() {
  const { error } = await supabase.auth.signOut();

  if (error) {
    showToast("Erro ao sair: " + error.message);
    return;
  }

  currentUser = null;
  profile = null;
  completedMissions.clear();
  completedAnomalies.clear();

  showAuthentication();
}

$("#logout-button").addEventListener("click", logout);
$("#settings-logout").addEventListener("click", logout);

/* =========================================
   THREE.JS — CENAS 3D
========================================= */

const scenes = new Map();

function createScene(containerId, type = "character") {
  const container = $("#" + containerId);

  if (!container) return;

  if (scenes.has(containerId)) {
    scenes.get(containerId).dispose();
    scenes.delete(containerId);
  }

  const scene = new THREE.Scene();

  scene.background = new THREE.Color(0x0b0a15);

  const camera = new THREE.PerspectiveCamera(
    45,
    container.clientWidth / container.clientHeight,
    0.1,
    100
  );

  camera.position.set(0, 1.2, 5);

  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: false
  });

  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(container.clientWidth, container.clientHeight);

  container.innerHTML = "";
  container.appendChild(renderer.domElement);

  const ambient = new THREE.AmbientLight(0xffffff, 1.5);
  scene.add(ambient);

  const purpleLight = new THREE.PointLight(0x9b72ff, 30, 15);
  purpleLight.position.set(2, 2, 3);
  scene.add(purpleLight);

  const blueLight = new THREE.PointLight(0x425cff, 18, 12);
  blueLight.position.set(-3, 1, -2);
  scene.add(blueLight);

  const group = new THREE.Group();
  scene.add(group);

  if (type === "universe") {
    createUniverse(group);
  } else {
    createHumanoid(group, type);
  }

  let animationFrame = 0;
  let disposed = false;

  function animate() {
    if (disposed) return;

    animationFrame = requestAnimationFrame(animate);

    group.rotation.y += 0.003;

    renderer.render(scene, camera);
  }

  animate();

  function resize() {
    if (disposed) return;

    const width = container.clientWidth;
    const height = container.clientHeight;

    if (!width || !height) return;

    camera.aspect = width / height;
    camera.updateProjectionMatrix();

    renderer.setSize(width, height);
  }

  const observer = new ResizeObserver(resize);
  observer.observe(container);

  scenes.set(containerId, {
    dispose() {
      disposed = true;
      cancelAnimationFrame(animationFrame);
      observer.disconnect();
      renderer.dispose();
      scene.traverse(object => {
        if (object.geometry) object.geometry.dispose();

        if (object.material) {
          const materials = Array.isArray(object.material)
            ? object.material
            : [object.material];

          materials.forEach(material => material.dispose());
        }
      });
    }
  });
}

function createHumanoid(group, type) {
  const corrupted = type === "corrupted";
  const color = corrupted ? 0x641e88 : 0x9b72ff;

  const material = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.55,
    metalness: 0.35,
    emissive: corrupted ? 0x39004d : 0x24104c,
    emissiveIntensity: 0.5
  });

  const darkMaterial = new THREE.MeshStandardMaterial({
    color: 0x171522,
    roughness: 0.8
  });

  function part(geometry, mat, x, y, z) {
    const mesh = new THREE.Mesh(geometry, mat);
    mesh.position.set(x, y, z);
    group.add(mesh);
    return mesh;
  }

  // Corpo
  part(new THREE.BoxGeometry(1, 1.25, 0.48), material, 0, 0.55, 0);

  // Cabeça
  part(new THREE.SphereGeometry(0.38, 24, 24), darkMaterial, 0, 1.48, 0);

  // Olhos
  const eyeMaterial = new THREE.MeshBasicMaterial({
    color: corrupted ? 0xff315c : 0xd6c4ff
  });

  part(new THREE.SphereGeometry(0.055, 12, 12), eyeMaterial, -0.13, 1.52, 0.33);
  part(new THREE.SphereGeometry(0.055, 12, 12), eyeMaterial, 0.13, 1.52, 0.33);

  // Braços
  part(new THREE.BoxGeometry(0.23, 0.95, 0.25), darkMaterial, -0.68, 0.55, 0);
  part(new THREE.BoxGeometry(0.23, 0.95, 0.25), darkMaterial, 0.68, 0.55, 0);

  // Pernas
  part(new THREE.BoxGeometry(0.34, 0.8, 0.36), darkMaterial, -0.25, -0.45, 0);
  part(new THREE.BoxGeometry(0.34, 0.8, 0.36), darkMaterial, 0.25, -0.45, 0);

  // Base
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(1.2, 0.015, 8, 80),
    new THREE.MeshBasicMaterial({ color: 0x9b72ff })
  );

  ring.rotation.x = Math.PI / 2;
  ring.position.y = -0.95;
  group.add(ring);

  group.position.y = 0.1;
}

function createUniverse(group) {
  const starMaterial = new THREE.MeshBasicMaterial({
    color: 0xc3a9ff
  });

  for (let i = 0; i < 90; i++) {
    const star = new THREE.Mesh(
      new THREE.SphereGeometry(0.025, 6, 6),
      starMaterial
    );

    star.position.set(
      (Math.random() - 0.5) * 8,
      (Math.random() - 0.5) * 4,
      (Math.random() - 0.5) * 5
    );

    group.add(star);
  }

  const portalColors = [
    0x9b72ff,
    0x35c9ff,
    0xff66c4,
    0x7af0b5,
    0x5266ff
  ];

  portalColors.forEach((color, index) => {
    const portal = new THREE.Mesh(
      new THREE.TorusGeometry(0.48, 0.045, 12, 48),
      new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: 1.5
      })
    );

    const angle = (index / portalColors.length) * Math.PI * 2;

    portal.position.set(
      Math.cos(angle) * 1.7,
      Math.sin(angle) * 0.8,
      0
    );

    group.add(portal);
  });
}

function initScenes() {
  createScene("eddward-stage", "character");
  createScene("character-stage", isCorrupted ? "corrupted" : "character");
}

function updateCharacterScene() {
  createScene(
    "character-stage",
    isCorrupted ? "corrupted" : "character"
  );
}

/* =========================================
   INICIALIZAÇÃO E SESSÃO
========================================= */

supabase.auth.onAuthStateChange(async (event, session) => {
  if (event === "PASSWORD_RECOVERY") {
    recoveryMode = true;
    showAuthentication();
    showForm("#new-password-form");
    showAuthMessage("Crie sua nova senha.");
    return;
  }

  if (session?.user) {
    if (!currentUser || currentUser.id !== session.user.id) {
      await loadAccount(session.user);
    }
  } else if (event === "SIGNED_OUT") {
    currentUser = null;
    profile = null;
    showAuthentication();
  }
});

async function initialize() {
  showAuthentication();

  const { data, error } = await supabase.auth.getSession();

  if (error) {
    showAuthMessage("Erro ao verificar sessão: " + error.message, true);
    return;
  }

  if (data.session?.user) {
    await loadAccount(data.session.user);
  }
}

initialize();
