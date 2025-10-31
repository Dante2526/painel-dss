// dss-panel.js
// Versão plug-and-play para colar no seu projeto.
// Requer elementos DOM com os ids usados no script (se alguns não existirem, o script tenta degradar graciosamente).

// --- IMPORTS FIREBASE (Módulo compatível com <script type="module">) ---
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import {
  getFirestore, doc, getDoc, addDoc, setDoc, updateDoc, deleteDoc,
  onSnapshot, collection, query, getDocs, writeBatch, Timestamp
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

(async () => {
  // ---------- CONFIGURAÇÃO FIREBASE ----------
  const firebaseConfig = {
      apiKey: "AIzaSyD2f5HOtfPSDYvadGYs42MPB7uedOSzO44",
      authDomain: "painel-dss.firebaseapp.com",
      projectId: "painel-dss",
      storageBucket: "painel-dss.firebasestorage.app",
      messagingSenderId: "977573548445",
      appId: "1:977573548445:web:d5bb8832dd6618bc801f74"
  };

  const employeesCollectionPath = 'employees'; // <--- coleção escolhida pelo usuário

  // ---------- VARIÁVEIS GLOBAIS ----------
  let app, db, auth;
  let isAdmin = false;
  let employeesData = [];
  let unsubscribe = null;
  const LAST_CLEAN_KEY = 'dssPanelLastClean';

  // ---------- SELETORES (tenta pegar, mas continua se faltar) ----------
  const headerLoader = document.getElementById('header-loader');
  const mainLoadingPlaceholder = document.getElementById('main-loading-placeholder');
  const specialLoadingPlaceholder = document.getElementById('special-loading-placeholder');
  const statBem = document.getElementById('stat-bem');
  const statMal = document.getElementById('stat-mal');
  const statAbsent = document.getElementById('stat-absent');
  const statTotal = document.getElementById('stat-total');
  const leftColumn = document.getElementById('left-column');
  const rightColumn = document.getElementById('right-column');
  const tableContainer = document.getElementById('table-container');
  const specialTeamList = document.getElementById('special-team-list');
  const registerPresenceBtn = document.getElementById('register-presence-btn');
  const dssSubjectInput = document.getElementById('dss-subject');
  const userMatriculaInput = document.getElementById('user-matricula');
  const registerPresenceBtnSpecial = document.getElementById('register-presence-btn-special');
  const dssSubjectSpecialInput = document.getElementById('dss-subject-special');
  const userMatriculaSpecialInput = document.getElementById('user-matricula-special');
  const adminAccessBtn = document.getElementById('admin-access-btn');
  const loginModal = document.getElementById('admin-login-modal');
  const optionsModal = document.getElementById('admin-options-modal');
  const addUserModal = document.getElementById('add-user-modal');
  const deleteConfirmModal = document.getElementById('delete-confirm-modal');
  const closeLoginBtn = document.getElementById('close-login-modal-btn');
  const closeOptionsBtn = document.getElementById('close-options-modal-btn');
  const closeAddUserBtn = document.getElementById('close-add-user-modal-btn');
  const closeDeleteModalBtn = document.getElementById('close-delete-modal-btn');
  const cancelDeleteBtn = document.getElementById('cancel-delete-btn');
  const confirmDeleteBtn = document.getElementById('confirm-delete-btn');
  const submitLoginBtn = document.getElementById('submit-login-btn');
  const submitAddUserBtn = document.getElementById('submit-add-user-btn');
  const adminEmailInput = document.getElementById('admin-email-input');
  const newUserNameInput = document.getElementById('new-user-name');
  const newUserMatriculaInput = document.getElementById('new-user-matricula');
  const deleteModalEmployeeName = document.getElementById('delete-modal-employee-name');
  const btnLimpar = document.getElementById('btn-limpar');
  const btnRelatorio = document.getElementById('btn-relatorio');
  const btnReorganizar = document.getElementById('btn-reorganizar');
  const btnNovoUsuario = document.getElementById('btn-novo-usuario');
  const darkModeToggle = document.getElementById('darkModeToggle');
  const notificationArea = document.getElementById('notification-area');

  // ---------- UTILS DE UI ----------
  function showNotification(message, type = 'success', duration = 3000) {
    if (!notificationArea) {
      // fallback: console + alert breve (não trava)
      console.log(`[${type}] ${message}`);
      return;
    }
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    notificationArea.appendChild(notification);
    // show animation
    setTimeout(() => notification.classList.add('show'), 10);
    setTimeout(() => {
      notification.classList.remove('show');
      setTimeout(() => notification.remove(), 400);
    }, duration);
  }

  function showLoadingMessage(message, isError = false) {
    const placeholders = [mainLoadingPlaceholder, specialLoadingPlaceholder];
    placeholders.forEach(p => {
      if (p) {
        p.textContent = message;
        p.style.color = isError ? 'var(--danger-color)' : 'var(--text-secondary)';
        p.classList.add('show');
      }
    });
    if (headerLoader) headerLoader.style.opacity = isError ? '1' : '1';
  }

  function hideLoadingPlaceholder() {
    [mainLoadingPlaceholder, specialLoadingPlaceholder].forEach(p => { if (p) p.classList.remove('show'); });
    if (headerLoader) headerLoader.style.opacity = '0';
  }

  function createRipple(event) {
    const button = event.currentTarget;
    if (!button) return;
    const old = button.querySelector('.ripple');
    if (old) old.remove();
    const ripple = document.createElement('span');
    ripple.className = 'ripple';
    const rect = button.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height);
    let clientX = event.clientX || (event.touches && event.touches[0]?.clientX) || rect.left + rect.width/2;
    let clientY = event.clientY || (event.touches && event.touches[0]?.clientY) || rect.top + rect.height/2;
    const x = clientX - rect.left - size/2;
    const y = clientY - rect.top - size/2;
    ripple.style.width = ripple.style.height = size + 'px';
    ripple.style.left = x + 'px';
    ripple.style.top = y + 'px';
    ripple.style.background = 'rgba(255,255,255,0.4)';
    button.appendChild(ripple);
    setTimeout(() => ripple.remove(), 600);
  }

  function formatFirestoreTime(timeValue) {
    if (!timeValue) return null;
    if (timeValue instanceof Timestamp) {
      const d = timeValue.toDate();
      const day = String(d.getDate()).padStart(2,'0');
      const month = String(d.getMonth()+1).padStart(2,'0');
      const year = d.getFullYear();
      const hh = String(d.getHours()).padStart(2,'0');
      const mm = String(d.getMinutes()).padStart(2,'0');
      return `${day}/${month}/${year} ${hh}:${mm}`;
    }
    // Se já foi formatado (string), retorna
    if (typeof timeValue === 'string') return timeValue;
    return null;
  }

  function updateAllStats(employees) {
    if (!statBem || !statMal || !statAbsent || !statTotal) return;
    const bem = employees.filter(e => e.bem).length;
    const mal = employees.filter(e => e.mal).length;
    const absent = employees.filter(e => e.absent).length;
    const total = employees.length;
    statBem.textContent = bem;
    statMal.textContent = mal;
    statAbsent.textContent = absent;
    statTotal.textContent = total;
  }

  function createEmployeeBlockHTML(emp) {
    const absentButtonClass = emp.absent ? "absent-button marked" : "absent-button";
    const turnoButtonClass = emp.inSpecialTeam ? "turno-button active" : "turno-button";
    let assDssClass = emp.assDss ? 'checked-ass-dss' : '';
    let bemClass = emp.bem ? 'checked-bem' : '';
    let malClass = emp.mal ? 'checked-mal' : '';
    const displayTime = emp.time || '--:--';
    let headerClass = '';
    if (emp.absent) headerClass = 'warning';
    else if (emp.mal) headerClass = 'negative';
    else if (emp.bem) headerClass = 'positive';
    else if (emp.assDss) headerClass = 'neutral';

    const deleteButtonHTML = isAdmin ? `
      <button class="delete-button" data-doc-id="${emp.docId}" data-employee-name="${emp.name}" aria-label="Remover Funcionário">
        <svg class="button-icon" viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
      </button>
    ` : '';

    return `
      <div class="employee-block" data-doc-id="${emp.docId}">
        <div class="employee-header ${headerClass}">
          <div class="employee-avatar">👤</div>
          <div class="employee-info">
            <div class="employee-name">${emp.name}</div>
            <div class="employee-matricula">Matrícula: ${emp.matricula || 'N/A'}</div>
          </div>
          <div class="employee-header-buttons">
            ${deleteButtonHTML}
            <button class="${turnoButtonClass}" data-doc-id="${emp.docId}" data-current-state="${emp.inSpecialTeam}">
              <div class="turno-button-content default-state">
                <svg class="button-icon" viewBox="0 0 24 24"><path d="M6 2h12v6h-1.5c0 1.5-1.3 2.8-3 2.9v2.2c1.7.1 3 1.4 3 2.9H18v6H6v-6h1.5c0-1.5 1.3-2.8 3-2.9v-2.2c-1.7-.1-3-1.4-3-2.9H6V2zm2 2v3.5h8V4H8zm0 13v3.5h8V17H8z"/></svg>
                <span>TURNO 6H</span>
              </div>
              <div class="turno-button-content loading-state">
                <span class="spinner"></span><span>MOVENDO...</span>
              </div>
            </button>
            <button class="${absentButtonClass}" data-doc-id="${emp.docId}" data-type="absent" data-current-state="${emp.absent}">
              <svg class="button-icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="8" cy="9" r="1.5" fill="currentColor"/><circle cx="16" cy="9" r="1.5" fill="currentColor"/><path d="M8 15 Q12 13 16 15" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/></svg>
              <span>AUSENTE</span>
            </button>
          </div>
        </div>
        <div class="checkboxes-row">
          <div class="checkbox-item ${assDssClass}" data-type="assDss" data-doc-id="${emp.docId}" data-current-state="${emp.assDss}">
            <label class="checkbox-label"><span class="checkbox-icon">📄</span><span class="checkbox-text">ASS. DSS</span><input type="checkbox" class="real-checkbox" ${emp.assDss ? 'checked' : ''} disabled><span class="custom-checkbox"></span></label>
          </div>
          <div class="checkbox-item ${bemClass}" data-type="bem" data-doc-id="${emp.docId}" data-current-state="${emp.bem}">
            <label class="checkbox-label"><span class="checkbox-icon">🙂</span><span class="checkbox-text">ESTOU BEM</span><input type="checkbox" class="real-checkbox" ${emp.bem ? 'checked' : ''} disabled><span class="custom-checkbox"></span></label>
          </div>
          <div class="checkbox-item ${malClass}" data-type="mal" data-doc-id="${emp.docId}" data-current-state="${emp.mal}">
            <label class="checkbox-label"><span class="checkbox-icon">😟</span><span class="checkbox-text">NÃO ESTOU BEM</span><input type="checkbox" class="real-checkbox" ${emp.mal ? 'checked' : ''} disabled><span class="custom-checkbox"></span></label>
          </div>
        </div>
        <div class="timestamp-row"><div class="timestamp ${emp.time ? 'has-time' : ''}">${displayTime}</div><div class="timestamp-label">DATA / HORA DA ASSINATURA</div></div>
      </div>
    `;
  }

  function renderEmployeeLists(employees) {
    if (!leftColumn || !rightColumn || !specialTeamList) {
      // fallback: log
      console.log('Render: elementos coluna ausentes, verificando console.');
    }

    // Ordena por nome
    employees.sort((a,b) => (a.name||'').localeCompare(b.name||''));
    const mainEmployees = employees.filter(emp => !emp.inSpecialTeam);
    const specialEmployees = employees.filter(emp => emp.inSpecialTeam);

    if (leftColumn) leftColumn.innerHTML = '';
    if (rightColumn) rightColumn.innerHTML = '';
    if (specialTeamList) specialTeamList.innerHTML = '';

    if (mainEmployees.length > 0) {
      const mid = Math.ceil(mainEmployees.length / 2);
      mainEmployees.forEach((emp, index) => {
        const block = createEmployeeBlockHTML(emp);
        if (index < mid) {
          if (leftColumn) leftColumn.innerHTML += block;
        } else {
          if (rightColumn) rightColumn.innerHTML += block;
        }
      });
      hideLoadingPlaceholder();
    } else if (specialEmployees.length > 0) {
      hideLoadingPlaceholder();
    }

    if (specialEmployees.length > 0 && specialTeamList) {
      specialEmployees.forEach(emp => {
        specialTeamList.innerHTML += createEmployeeBlockHTML(emp);
      });
      if (specialLoadingPlaceholder) specialLoadingPlaceholder.classList.remove('show');
    } else {
      if (specialLoadingPlaceholder) {
        specialLoadingPlaceholder.textContent = 'Nenhum funcionário na Turma 6H.';
        specialLoadingPlaceholder.classList.add('show');
      }
    }

    if (mainEmployees.length === 0 && specialEmployees.length === 0) {
      showLoadingMessage('Nenhum funcionário encontrado no banco de dados.');
    }

    updateAllStats(employees);
  }

  // ---------- FIRESTORE UPDATES ----------
  async function handleStatusChange(docId, type, currentState) {
    if (!docId || !type) return;
    const isChecking = !currentState;
    if (!isChecking && !isAdmin) {
      showNotification('Apenas administradores podem desmarcar um status.', 'error');
      return;
    }

    const docRef = doc(db, employeesCollectionPath, docId);
    const now = new Date();
    const timestamp = Timestamp.fromDate(now);

    let dataToUpdate = {
      [type]: isChecking,
      time: (isChecking || type === 'assDss') ? timestamp : null
    };

    if (isChecking) {
      dataToUpdate.absent = false;
      if (type === 'bem') {
        dataToUpdate.mal = false;
        dataToUpdate.assDss = true;
      } else if (type === 'mal') {
        dataToUpdate.bem = false;
        dataToUpdate.assDss = false;
      } else if (type === 'assDss') {
        // prevenção: se mal estiver marcado, não marca assDss
        const snap = await getDoc(docRef);
        if (snap.exists() && snap.data().mal === true) {
          dataToUpdate.assDss = false;
        }
      }
    } else {
      if (type === 'assDss') dataToUpdate.bem = false;
    }

    if (!dataToUpdate.assDss && !dataToUpdate.bem && !dataToUpdate.mal && !dataToUpdate.absent) {
      dataToUpdate.time = null;
    }

    try {
      await updateDoc(docRef, dataToUpdate);
    } catch (err) {
      console.error('Erro ao atualizar status:', err);
      showNotification(`Erro ao salvar: ${err.message}`, 'error');
    }
  }

  async function toggleSpecialTeamFirestore(docId, currentState, button) {
    if (!docId) return;
    if (button) { button.classList.add('loading'); button.disabled = true; }
    const isMovingToSpecial = !currentState;
    const docRef = doc(db, employeesCollectionPath, docId);
    try {
      await updateDoc(docRef, { inSpecialTeam: isMovingToSpecial });
    } catch (err) {
      console.error('Erro ao mover funcionário:', err);
      showNotification(`Erro ao mover: ${err.message}`, 'error');
      if (button) { button.classList.remove('loading'); button.disabled = false; }
    }
  }

  // ---------- ADMIN: Limpeza e Relatório ----------
  async function performManualClean() {
    showNotification('Iniciando limpeza manual...', 'success', 2500);
    try {
      const qSnap = await getDocs(collection(db, employeesCollectionPath));
      if (qSnap.empty) { showNotification('Nenhum funcionário para limpar.', 'neutral'); return; }
      const batch = writeBatch(db);
      qSnap.forEach(d => batch.update(d.ref, { assDss:false, bem:false, mal:false, absent:false, time:null }));
      await batch.commit();
      if (dssSubjectInput) dssSubjectInput.value = '';
      if (userMatriculaInput) userMatriculaInput.value = '';
      if (dssSubjectSpecialInput) dssSubjectSpecialInput.value = '';
      if (userMatriculaSpecialInput) userMatriculaSpecialInput.value = '';
      setTimeout(()=> showNotification('Limpeza manual realizada com sucesso!', 'success'), 800);
    } catch (err) {
      console.error('Erro na limpeza manual:', err);
      showNotification(`Erro ao limpar: ${err.message}`, 'error');
    }
  }

  async function performAutoClean() {
    try {
      const qSnap = await getDocs(collection(db, employeesCollectionPath));
      if (qSnap.empty) return;
      const batch = writeBatch(db);
      qSnap.forEach(d => batch.update(d.ref, { assDss:false, bem:false, mal:false, absent:false, time:null }));
      await batch.commit();
      if (dssSubjectInput) dssSubjectInput.value = '';
      if (userMatriculaInput) userMatriculaInput.value = '';
      if (dssSubjectSpecialInput) dssSubjectSpecialInput.value = '';
      if (userMatriculaSpecialInput) userMatriculaSpecialInput.value = '';
      showNotification('Limpeza automática executada com sucesso!', 'success');
      localStorage.setItem(LAST_CLEAN_KEY, new Date().toISOString().split('T')[0]);
    } catch (err) {
      console.error('Erro na limpeza automática:', err);
    }
  }

  function checkAndPerformAutoClean() {
    const today = new Date();
    const dayOfMonth = today.getDate();
    const todayStr = today.toISOString().split('T')[0];
    const lastCleanDate = localStorage.getItem(LAST_CLEAN_KEY);
    if (lastCleanDate === todayStr) return;
    const remainder = dayOfMonth % 4;
    const isCleanDay = (remainder === 2 || remainder === 3);
    if (isCleanDay) performAutoClean();
  }

  function generateDailyReport() {
    if (employeesData.length === 0) { showNotification("Não há funcionários para gerar relatório.", "error"); return; }
    const now = new Date();
    const timestamp = `${now.toLocaleDateString('pt-BR')} ${now.toLocaleTimeString('pt-BR')}`;
    const filename = `relatorio_dss_${now.toISOString().split('T')[0]}.txt`;
    const subject7H = (dssSubjectInput && dssSubjectInput.value) || "N/A";
    const subject6H = (dssSubjectSpecialInput && dssSubjectSpecialInput.value) || "N/A";
    const stats = {
      ok: employeesData.filter(e => e.bem && !e.absent).length,
      pending: employeesData.filter(e => !e.assDss && !e.bem && !e.mal && !e.absent).length,
      absent: employeesData.filter(e => e.absent).length,
      notOk: employeesData.filter(e => e.mal && !e.absent).length,
    };
    let content = `RELATÓRIO DSS - ${timestamp}\r\n-----------------------------------\r\n`;
    content += `Assunto (7H-19H): ${subject7H}\r\nAssunto (6H): ${subject6H}\r\n\r\nRESUMO:\r\n`;
    content += `Presentes OK: ${stats.ok}\r\nPendentes: ${stats.pending}\r\nNão Estou Bem: ${stats.notOk}\r\nAusentes: ${stats.absent}\r\nTotal: ${employeesData.length}\r\n-----------------------------------\r\n\r\n`;
    content += "PENDENTES (Não preencheram e não estão ausentes):\r\n";
    employeesData.filter(e => !e.assDss && !e.bem && !e.mal && !e.absent).forEach(e => {
      content += `- ${e.name} (${e.matricula||'N/A'})\r\n`;
    });
    if (stats.pending === 0) content += "Nenhum.\r\n";
    content += "\r\nNÃO ESTOU BEM:\r\n";
    employeesData.filter(e => e.mal && !e.absent).forEach(e => {
      content += `- ${e.name} (${e.matricula||'N/A'}) - (Registrado em: ${formatFirestoreTime(e.time) || 'N/A'})\r\n`;
    });
    if (stats.notOk === 0) content += "Nenhum.\r\n";
    content += "\r\nAUSENTES:\r\n";
    employeesData.filter(e => e.absent).forEach(e => {
      content += `- ${e.name} (${e.matricula||'N/A'})\r\n`;
    });
    if (stats.absent === 0) content += "Nenhum.\r\n";
    content += "\r\nPRESENTES E OK (Assinaram DSS e/ou 'Estou Bem'):\r\n";
    employeesData.filter(e => (e.assDss || e.bem) && !e.mal && !e.absent).forEach(e => {
      content += `- ${e.name} (${e.matricula||'N/A'}) - (Registrado em: ${formatFirestoreTime(e.time) || 'N/A'})\r\n`;
    });
    if (stats.ok === 0) content += "Nenhum.\r\n";
    // download
    const element = document.createElement('a');
    element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(content));
    element.setAttribute('download', filename);
    element.style.display = 'none';
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
    showNotification("Relatório baixado com sucesso!", "success");
  }

  // ---------- OUVINTE PRINCIPAL (onSnapshot) ----------
  function listenForEmployeeUpdates() {
    if (unsubscribe) unsubscribe();
    const q = query(collection(db, employeesCollectionPath));
    unsubscribe = onSnapshot(q, (querySnapshot) => {
      const fresh = [];
      querySnapshot.forEach(d => {
        const data = d.data();
        fresh.push({
          docId: d.id,
          name: data.name || "Nome Inválido",
          matricula: data.matricula || "",
          assDss: data.assDss || false,
          bem: data.bem || false,
          mal: data.mal || false,
          absent: data.absent || false,
          inSpecialTeam: data.inSpecialTeam || false,
          time: formatFirestoreTime(data.time)
        });
      });
      employeesData = fresh;
      renderEmployeeLists(employeesData);
      if (headerLoader) headerLoader.style.opacity = '0';
    }, (error) => {
      console.error("Erro ao buscar funcionários: ", error);
      showLoadingMessage(`Erro ao buscar dados: ${error.message}. Verifique as Regras de Segurança.`, true);
    });
  }

  // ---------- INICIALIZAÇÃO FIREBASE E AUTH ----------
  try {
    app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    auth = getAuth(app);
    showLoadingMessage("Autenticando...");
    try {
      await signInAnonymously(auth);
      console.log("Autenticado anonimamente.");
    } catch (authError) {
      console.error("Erro durante a autenticação anônima:", authError);
      if (authError.code === 'auth/configuration-not-found') {
        showLoadingMessage("Erro: Autenticação anônima não habilitada no Firebase. Verifique as 'Configurações de Autenticação' > 'Sign-in method' no Console do Firebase.", true);
      } else {
        showLoadingMessage(`Erro de autenticação: ${authError.message}`, true);
      }
      return;
    }
  } catch (e) {
    console.error('Erro ao inicializar o Firebase:', e);
    showLoadingMessage(`Falha ao conectar ao Firebase. Verifique a 'firebaseConfig'. Erro: ${e.message}`, true);
    return;
  }

  onAuthStateChanged(auth, (user) => {
    if (user) {
      console.log("Usuário autenticado (anônimo) UID:", user.uid);
      showLoadingMessage("Buscando funcionários...");
      listenForEmployeeUpdates();
      checkAndPerformAutoClean();
    } else {
      console.log("Usuário não está logado.");
      showLoadingMessage("Erro: Usuário não autenticado.", true);
      if (unsubscribe) unsubscribe();
    }
  });

  // ---------- DELEÇÃO E ADIÇÃO SIMPLES ----------
  function openDeleteConfirmation(docId, employeeName) {
    // Se houver modal no HTML, usa; se não, fallback para confirm()
    if (deleteConfirmModal && deleteModalEmployeeName && confirmDeleteBtn && cancelDeleteBtn) {
      deleteModalEmployeeName.textContent = employeeName || 'este funcionário';
      deleteConfirmModal.classList.add('visible');
      // atribui handlers temporários
      const onConfirm = async () => { await deleteEmployee(docId); closeModal(deleteConfirmModal); };
      confirmDeleteBtn.onclick = onConfirm;
      cancelDeleteBtn.onclick = () => { closeModal(deleteConfirmModal); };
    } else {
      const ok = confirm(`Remover ${employeeName || 'este funcionário'}?`);
      if (ok) deleteEmployee(docId);
    }
  }

  async function deleteEmployee(docId) {
    if (!docId) return;
    try {
      await deleteDoc(doc(db, employeesCollectionPath, docId));
      showNotification('Funcionário removido com sucesso.', 'success');
    } catch (err) {
      console.error('Erro ao deletar funcionário:', err);
      showNotification(`Erro ao deletar: ${err.message}`, 'error');
    }
  }

  async function addNewEmployee(name, matricula) {
    if (!name) { showNotification('Nome é obrigatório.', 'error'); return; }
    try {
      // tenta usar matricula como id (se fornecida), senão addDoc
      if (matricula) {
        const id = String(matricula).trim();
        await setDoc(doc(db, employeesCollectionPath, id), {
          name: name.trim(),
          matricula: matricula.trim(),
          assDss:false, bem:false, mal:false, absent:false, inSpecialTeam:false, time:null
        });
      } else {
        await addDoc(collection(db, employeesCollectionPath), {
          name: name.trim(),
          matricula: '',
          assDss:false, bem:false, mal:false, absent:false, inSpecialTeam:false, time:null
        });
      }
      showNotification('Funcionário adicionado com sucesso!', 'success');
      if (newUserNameInput) newUserNameInput.value = '';
      if (newUserMatriculaInput) newUserMatriculaInput.value = '';
      if (addUserModal) closeModal(addUserModal);
    } catch (err) {
      console.error('Erro ao adicionar usuário:', err);
      showNotification(`Erro ao adicionar usuário: ${err.message}`, 'error');
    }
  }

  // ---------- MODAIS SIMPLES ----------
  function openModal(modal) { if (modal) modal.classList.add('visible'); }
  function closeModal(modal) { if (modal) modal.classList.remove('visible'); }

  // ---------- EVENT DELEGAÇÃO PARA CLIQUES NOS CARTÕES ----------
  if (tableContainer) {
    tableContainer.addEventListener('click', (e) => {
      const target = e.target;
      const cardItem = target.closest('.checkbox-item');
      const absentButton = target.closest('.absent-button');
      const turnoButton = target.closest('.turno-button');
      const deleteButton = target.closest('.delete-button');

      if (cardItem) {
        e.preventDefault();
        const docId = cardItem.dataset.docId;
        const type = cardItem.dataset.type;
        const currentState = cardItem.dataset.currentState === 'true';
        handleStatusChange(docId, type, currentState);
        return;
      }
      if (absentButton) {
        e.preventDefault();
        createRipple(e);
        const docId = absentButton.dataset.docId;
        const currentState = absentButton.dataset.currentState === 'true';
        handleStatusChange(docId, 'absent', currentState);
        return;
      }
      if (turnoButton) {
        e.preventDefault();
        createRipple(e);
        const docId = turnoButton.dataset.docId;
        const currentState = turnoButton.dataset.currentState === 'true';
        toggleSpecialTeamFirestore(docId, currentState, turnoButton);
        return;
      }
      if (deleteButton) {
        e.preventDefault();
        createRipple(e);
        const docId = deleteButton.dataset.docId;
        const employeeName = deleteButton.dataset.employeeName || "este funcionário";
        openDeleteConfirmation(docId, employeeName);
        return;
      }
    });
  }

  if (specialTeamList) {
    specialTeamList.addEventListener('click', (e) => {
      const target = e.target;
      const cardItem = target.closest('.checkbox-item');
      const absentButton = target.closest('.absent-button');
      const turnoButton = target.closest('.turno-button');
      const deleteButton = target.closest('.delete-button');

      if (cardItem) {
        e.preventDefault();
        const docId = cardItem.dataset.docId;
        const type = cardItem.dataset.type;
        const currentState = cardItem.dataset.currentState === 'true';
        handleStatusChange(docId, type, currentState);
        return;
      }
      if (absentButton) {
        e.preventDefault();
        createRipple(e);
        const docId = absentButton.dataset.doc-id || absentButton.dataset.docId;
        const currentState = absentButton.dataset.currentState === 'true';
        handleStatusChange(docId, 'absent', currentState);
        return;
      }
      if (turnoButton) {
        e.preventDefault();
        createRipple(e);
        const docId = turnoButton.dataset.docId;
        const currentState = turnoButton.dataset.currentState === 'true';
        toggleSpecialTeamFirestore(docId, currentState, turnoButton);
        return;
      }
      if (deleteButton) {
        e.preventDefault();
        createRipple(e);
        const docId = deleteButton.dataset.docId;
        const employeeName = deleteButton.dataset.employeeName || "este funcionário";
        openDeleteConfirmation(docId, employeeName);
        return;
      }
    });
  }

  // ---------- BOTÕES DE REGISTRO (7H e 6H) - Simples sem link ao Firestore (mantive teu comportamento) ----------
  if (registerPresenceBtn) {
    registerPresenceBtn.addEventListener('click', (e) => {
      createRipple(e);
      const button = e.currentTarget;
      const subject = dssSubjectInput?.value;
      const matricula = userMatriculaInput?.value;
      if (!subject || !matricula) {
        showNotification('Preencha todos os campos (7H-19H).', 'error');
        return;
      }
      button.classList.add('loading');
      button.disabled = true;
      setTimeout(() => {
        button.classList.remove('loading');
        button.disabled = false;
        showNotification(`Dados (7H-19H) registrados: ${subject} | ${matricula}`, 'success');
        if (dssSubjectInput) dssSubjectInput.value = '';
        if (userMatriculaInput) userMatriculaInput.value = '';
      }, 1200);
    });
  }

  if (registerPresenceBtnSpecial) {
    registerPresenceBtnSpecial.addEventListener('click', (e) => {
      createRipple(e);
      const button = e.currentTarget;
      const subject = dssSubjectSpecialInput?.value;
      const matricula = userMatriculaSpecialInput?.value;
      if (!subject || !matricula) {
        showNotification('Preencha os campos da Turma Especial.', 'error');
        return;
      }
      button.classList.add('loading');
      button.disabled = true;
      setTimeout(() => {
        button.classList.remove('loading');
        button.disabled = false;
        showNotification(`DSS da Turma Especial (6H) registrado!`, 'success');
        if (dssSubjectSpecialInput) dssSubjectSpecialInput.value = '';
        if (userMatriculaSpecialInput) userMatriculaSpecialInput.value = '';
      }, 1200);
    });
  }

  // ---------- ADMIN: botões e modais (fallback para confirm se modal ausente) ----------
  if (btnLimpar) btnLimpar.addEventListener('click', (e)=> { createRipple(e); if (!isAdmin && !confirm('Você não é admin. Deseja continuar?')) return; performManualClean(); });
  if (btnRelatorio) btnRelatorio.addEventListener('click', (e)=> { createRipple(e); generateDailyReport(); });
  if (btnReorganizar) btnReorganizar.addEventListener('click', (e)=> { createRipple(e); renderEmployeeLists(employeesData); showNotification('Reorganizado localmente.', 'success'); });
  if (btnNovoUsuario) btnNovoUsuario.addEventListener('click', (e)=> { createRipple(e); if (addUserModal) openModal(addUserModal); else {
    const n = prompt('Nome do novo usuário:'); const m = prompt('Matrícula (opcional):'); if (n) addNewEmployee(n,m);
  }});

  if (submitAddUserBtn) submitAddUserBtn.addEventListener('click', (e) => {
    e.preventDefault();
    const name = newUserNameInput?.value;
    const matricula = newUserMatriculaInput?.value;
    addNewEmployee(name, matricula);
  });

  // admin access (simples): abre modal ou pede email via prompt
  if (adminAccessBtn) adminAccessBtn.addEventListener('click', (e) => {
    createRipple(e);
    if (loginModal) openModal(loginModal);
    else {
      const email = prompt('Email do admin (qualquer texto valida como admin nesta versão):');
      if (email) {
        isAdmin = true;
        showNotification('Acesso administrativo concedido (sessão).', 'success');
      }
    }
  });

  if (submitLoginBtn) submitLoginBtn.addEventListener('click', (e) => {
    e.preventDefault();
    const email = adminEmailInput?.value;
    if (!email) { showNotification('Informe um e-mail.', 'error'); return; }
    // Aqui você pode validar com Firestore ou lista; por enquanto liberamos qualquer email válido
    isAdmin = true;
    showNotification('Acesso administrativo concedido (sessão).', 'success');
    if (loginModal) closeModal(loginModal);
    if (optionsModal) openModal(optionsModal);
  });

  if (closeLoginBtn) closeLoginBtn.addEventListener('click', ()=> closeModal(loginModal));
  if (closeOptionsBtn) closeOptionsBtn.addEventListener('click', ()=> closeModal(optionsModal));
  if (closeAddUserBtn) closeAddUserBtn.addEventListener('click', ()=> closeModal(addUserModal));
  if (closeDeleteModalBtn) closeDeleteModalBtn.addEventListener('click', ()=> closeModal(deleteConfirmModal));

  // ---------- Dark mode toggle (simples) ----------
  if (darkModeToggle) {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark' || (!savedTheme && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      document.documentElement.classList.add('dark');
    }
    darkModeToggle.addEventListener('click', () => {
      document.documentElement.classList.toggle('dark');
      const now = document.documentElement.classList.contains('dark') ? 'dark' : 'light';
      localStorage.setItem('theme', now);
    });
  }

  // ---------- Função de reorganizar no Firestore (opcional / experimental) ----------
  // Observação: Por segurança, não mexe automaticamente nos documentos. Só uma função que poderia atribuir um campo "order".
  async function writeOrderToFirestore() {
    if (!isAdmin) { showNotification('Apenas admin pode reordenar no banco.', 'error'); return; }
    try {
      const qSnap = await getDocs(collection(db, employeesCollectionPath));
      if (qSnap.empty) { showNotification('Nada para reordenar.', 'neutral'); return; }
      const batch = writeBatch(db);
      const sorted = [...employeesData].sort((a,b) => (a.name||'').localeCompare(b.name||''));
      sorted.forEach((e, idx) => {
        const ref = doc(db, employeesCollectionPath, e.docId);
        batch.update(ref, { order: idx });
      });
      await batch.commit();
      showNotification('Ordem escrita no banco (campo order).', 'success');
    } catch (err) {
      console.error('Erro ao escrever ordem:', err);
      showNotification(`Erro: ${err.message}`, 'error');
    }
  }

  // ---------- Exposição de utilitários no console (ajuda debug) ----------
  window._dssPanel = {
    performManualClean,
    performAutoClean,
    generateDailyReport,
    addNewEmployee,
    deleteEmployee,
    writeOrderToFirestore,
    get employees(){ return employeesData; }
  };

  // ---------- FIM do IIFE ----------
})();