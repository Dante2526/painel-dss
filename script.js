
// --- 1. IMPORTAÇÕES DO FIREBASE ---
// Importe as funções necessárias dos SDKs que você precisa
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { 
    getFirestore, doc, getDoc, addDoc, setDoc, updateDoc, deleteDoc, 
    onSnapshot, collection, query, where, getDocs, writeBatch, Timestamp, serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- 2. COLE SUA CONFIGURAÇÃO DO FIREBASE SDK AQUI ---
// (Como não estamos usando o __firebase_config, usamos esta config manual)
const firebaseConfig = {
    apiKey: "AIzaSyD2f5HOtfPSDYvadGYs42MPB7uedOSzO44",
    authDomain: "painel-dss.firebaseapp.com",
    projectId: "painel-dss",
    storageBucket: "painel-dss.firebasestorage.app",
    messagingSenderId: "977573548445",
    appId: "1:977573548445:web:d5bb8832dd6618bc801f74"
};

// --- 3. VARIÁVEIS GLOBAIS E INICIALIZAÇÃO ---
let app;
let db;
let auth;
let currentUserId = null;
let isAdmin = false; // Controla o status de administrador
let employeesData = []; // Cache local dos dados dos funcionários
let unsubscribeEmployees = null; // Função para parar de ouvir o onSnapshot
// --- 4. FUNÇÃO PRINCIPAL AUTO-EXECUTÁVEL ---
// (Envolve todo o script para evitar erros de escopo e 'await' global)
(async () => {

    // Chave para o localStorage da limpeza automática
    const LAST_CLEAN_KEY = 'dssPanelLastClean';

    // --- 5. SELETORES DE DOM ---
    // (Pega todos os elementos HTML que vamos usar)
    const headerLoader = document.getElementById('header-loader');
    const mainLoadingPlaceholder = document.getElementById('main-loading-placeholder');
    const specialLoadingPlaceholder = document.getElementById('special-loading-placeholder');
    
    // Contadores
    const statBem = document.getElementById('stat-bem');
    const statMal = document.getElementById('stat-mal');
    const statAbsent = document.getElementById('stat-absent');
    const statTotal = document.getElementById('stat-total');

    // Colunas
    const leftColumn = document.getElementById('left-column');
    const rightColumn = document.getElementById('right-column');
    const tableContainer = document.getElementById('table-container');
    const specialTeamList = document.getElementById('special-team-list');

    // Formulários de Registro
    const registerPresenceBtn = document.getElementById('register-presence-btn');
    const dssSubjectInput = document.getElementById('dss-subject');
    const userMatriculaInput = document.getElementById('user-matricula');
    const registerPresenceBtnSpecial = document.getElementById('register-presence-btn-special');
    const dssSubjectSpecialInput = document.getElementById('dss-subject-special');
    const userMatriculaSpecialInput = document.getElementById('user-matricula-special');

    // Modais
    const adminAccessBtn = document.getElementById('admin-access-btn');
    const loginModal = document.getElementById('admin-login-modal');
    const optionsModal = document.getElementById('admin-options-modal');
    const addUserModal = document.getElementById('add-user-modal');
    const deleteConfirmModal = document.getElementById('delete-confirm-modal');

    // Botões Modais
    const closeLoginBtn = document.getElementById('close-login-modal-btn');
    const closeOptionsBtn = document.getElementById('close-options-modal-btn');
    const closeAddUserBtn = document.getElementById('close-add-user-modal-btn');
    const closeDeleteModalBtn = document.getElementById('close-delete-modal-btn');
    const cancelDeleteBtn = document.getElementById('cancel-delete-btn');
    const confirmDeleteBtn = document.getElementById('confirm-delete-btn');
    const submitLoginBtn = document.getElementById('submit-login-btn');
    const submitAddUserBtn = document.getElementById('submit-add-user-btn');

    // Inputs Modais
    const adminEmailInput = document.getElementById('admin-email-input');
    const newUserNameInput = document.getElementById('new-user-name');
    const newUserMatriculaInput = document.getElementById('new-user-matricula');
    const deleteModalEmployeeName = document.getElementById('delete-modal-employee-name');

    // Botões Opções ADM
    const btnLimpar = document.getElementById('btn-limpar');
    const btnRelatorio = document.getElementById('btn-relatorio');
    const btnReorganizar = document.getElementById('btn-reorganizar');
    const btnNovoUsuario = document.getElementById('btn-novo-usuario');

    // Outros
    const darkModeToggle = document.getElementById('darkModeToggle');
    const viewport = document.getElementById('viewport');
    const scalableContainer = document.getElementById('scalable-container');
    const notificationArea = document.getElementById('notification-area');
    

    // --- 6. FUNÇÕES DE UTILIDADE ---

    /**
     * Exibe uma notificação flutuante na tela.
     * @param {string} message - A mensagem a ser exibida.
     * @param {string} type - 'success' (verde) ou 'error' (vermelho).
     * @param {number} [duration=3000] - Duração em milissegundos.
     */
    function showNotification(message, type = 'success', duration = 3000) {
        if (!notificationArea) return;
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        notificationArea.appendChild(notification);

        setTimeout(() => {
            notification.classList.add('show');
        }, 10);

        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => {
                notification.remove();
            }, 500);
        }, duration);
    }
    /**
     * Mostra uma mensagem de carregamento ou erro nos placeholders.
     * @param {string} message - A mensagem a ser exibida.
     * @param {boolean} [isError=false] - Se true, estiliza como erro.
     */
    function showLoadingMessage(message, isError = false) {
        const placeholders = [mainLoadingPlaceholder, specialLoadingPlaceholder];
        placeholders.forEach(p => {
            if (p) {
                p.textContent = message;
                p.style.color = isError ? 'var(--danger-color)' : 'var(--text-secondary)';
                p.classList.add('show');
            }
        });
        if (headerLoader) headerLoader.style.opacity = '1';
    }

    /**
     * Esconde os placeholders de carregamento.
     */
    function hideLoadingPlaceholder() {
        const placeholders = [mainLoadingPlaceholder, specialLoadingPlaceholder];
        placeholders.forEach(p => {
            if (p) p.classList.remove('show');
        });
        if (headerLoader) headerLoader.style.opacity = '0';
    }

    /**
     * Abre um modal.
     * @param {HTMLElement} modal - O elemento do modal a ser aberto.
     */
    function openModal(modal) {
        if (modal) modal.classList.add('visible');
    }

    /**
     * Fecha um modal.
     * @param {HTMLElement} modal - O elemento do modal a ser fechado.
     */
    function closeModal(modal) {
        if (modal) modal.classList.remove('visible');
    }

    /**
     * Cria um efeito de "ripple" (onda) em um botão.
     * @param {Event} event - O evento de clique ou toque.
     */
    function createRipple(event) {
        const button = event.currentTarget;
        
        // Remove qualquer ripple existente
        const oldRipple = button.querySelector('.ripple');
        if(oldRipple) {
            oldRipple.remove();
        }

        const ripple = document.createElement('span');
        const rect = button.getBoundingClientRect();
        const size = Math.max(rect.width, rect.height);
        
        let clientX = event.clientX;
        let clientY = event.clientY;

        if (event.touches && event.touches.length > 0) {
            clientX = event.touches[0].clientX;
            clientY = event.touches[0].clientY;
        }
        
        const x = clientX - rect.left - size / 2;
        const y = clientY - rect.top - size / 2;

        ripple.style.width = ripple.style.height = size + 'px';
        ripple.style.left = x + 'px';
        ripple.style.top = y + 'px';
        
        ripple.classList.add('ripple');
        
        // Estilo padrão do ripple
        ripple.style.background = 'rgba(255, 255, 255, 0.5)';

        button.appendChild(ripple);

        setTimeout(() => {
            if (ripple.parentElement) {
                ripple.remove();
            }
        }, 600);
    }

    /**
     * Formata um objeto Timestamp do Firebase ou uma String de data.
     * @param {object|string|null} timeValue - O valor do Firestore (Timestamp, string ou null).
     * @returns {string|null} - A data formatada como "DD/MM/YYYY HH:MM" ou null.
     */
    function formatFirestoreTime(timeValue) {
        if (!timeValue) {
            return null;
        }

        let date;
        if (timeValue instanceof Timestamp) {
            date = timeValue.toDate();
        } else if (typeof timeValue === 'string') {
            // Tenta converter string para Data (embora o ideal seja salvar como Timestamp)
            date = new Date(timeValue);
            if (isNaN(date.getTime())) {
                // Se a string não for válida, retorna a string original ou null
                return timeValue.includes('/') ? timeValue : null; 
            }
        } else {
            console.warn("Tipo de 'time' inesperado:", timeValue);
            return null;
        }

        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        return `${day}/${month}/${year} ${hours}:${minutes}`;
    }

    /**
     * Atualiza os contadores de estatísticas no cabeçalho.
     * @param {Array} employees - A lista de todos os funcionários.
     */
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

    /**
     * Cria o HTML para um único cartão de funcionário.
     * @param {object} emp - O objeto do funcionário (com docId, name, matricula, etc.).
     * @returns {string} - O HTML do cartão.
     */
    function createEmployeeBlockHTML(emp) {
        const absentButtonClass = emp.absent ? "absent-button marked" : "absent-button";
        const turnoButtonClass = emp.inSpecialTeam ? "turno-button active" : "turno-button";

        // Determinar classes CSS baseadas no estado atual
        let assDssClass = emp.assDss ? 'checked-ass-dss' : '';
        let bemClass = emp.bem ? 'checked-bem' : '';
        let malClass = emp.mal ? 'checked-mal' : '';

        // Formatar o horário
        const displayTime = emp.time || '--:--';

        // Classe de cabeçalho
        let headerClass = '';
        if (emp.absent) {
            headerClass = 'warning';
        } else if (emp.mal) {
            headerClass = 'negative';
        } else if (emp.bem) {
            headerClass = 'positive';
        } else if (emp.assDss) {
            headerClass = 'neutral';
        }

        // Gera o HTML do botão de deletar (será controlado por CSS se o admin está logado)
        const deleteButtonHTML = `
            <button class="delete-button" data-doc-id="${emp.docId}" data-employee-name="${emp.name}" aria-label="Remover Funcionário">
                <svg class="button-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" fill="currentColor"/>
                </svg>
            </button>
        `;

        return `
            <div class="employee-block" data-doc-id="${emp.docId}">
                <div class="employee-header ${headerClass}">
                    <div class="employee-avatar">👤</div>
                    <div class="employee-info">
                        <div class="employee-name">${emp.name}</div>
                        <div class="employee-matricula">Matrícula: ${emp.matricula || 'N/A'}</div>
                    </div>
                    <div class="employee-header-buttons">
                        ${deleteButtonHTML} <!-- Botão de deletar adicionado -->
                        <button class="${turnoButtonClass}" data-doc-id="${emp.docId}" data-current-state="${emp.inSpecialTeam}">
                            <div class="turno-button-content default-state">
                                <svg class="button-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                    <path d="M6 2h12v6h-1.5c0 1.5-1.3 2.8-3 2.9v2.2c1.7.1 3 1.4 3 2.9H18v6H6v-6h1.5c0-1.5 1.3-2.8 3-2.9v-2.2c-1.7-.1-3-1.4-3-2.9H6V2zm2 2v3.5h8V4H8zm0 13v3.5h8V17H8z" fill="currentColor"/>
                                </svg>
                                <span>TURNO 6H</span>
                            </div>
                            <div class="turno-button-content loading-state">
                                <span class="spinner"></span>
                                <span>MOVENDO...</span>
                            </div>
                        </button>
                        <button class="${absentButtonClass}" data-doc-id="${emp.docId}" data-type="absent" data-current-state="${emp.absent}">
                            <svg class="button-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="8" cy="9" r="1.5" fill="currentColor"/><circle cx="16" cy="9" r="1.5" fill="currentColor"/><path d="M8 15 Q12 13 16 15" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/></svg>
                            <span>AUSENTE</span>
                        </button>
                    </div>
                </div>
                <div class="checkboxes-row">
                    <div class="checkbox-item ${assDssClass}" data-type="assDss" data-doc-id="${emp.docId}" data-current-state="${emp.assDss}">
                        <label class="checkbox-label">
                            <span class="checkbox-icon">📄</span>
                            <span class="checkbox-text">ASS. DSS</span>
                            <input type="checkbox" class="real-checkbox" ${emp.assDss ? 'checked' : ''} disabled>
                            <span class="custom-checkbox"></span>
                        </label>
                    </div>
                    <div class="checkbox-item ${bemClass}" data-type="bem" data-doc-id="${emp.docId}" data-current-state="${emp.bem}">
                        <label class="checkbox-label">
                            <span class="checkbox-icon">🙂</span>
                            <span class="checkbox-text">ESTOU BEM</span>
                            <input type="checkbox" class="real-checkbox" ${emp.bem ? 'checked' : ''} disabled>
                            <span class="custom-checkbox"></span>
                        </label>
                    </div>
                    <div class="checkbox-item ${malClass}" data-type="mal" data-doc-id="${emp.docId}" data-current-state="${emp.mal}">
                        <label class="checkbox-label">
                            <span class="checkbox-icon">😟</span>
                            <span class="checkbox-text">NÃO ESTOU BEM</span>
                            <input type="checkbox" class="real-checkbox" ${emp.mal ? 'checked' : ''} disabled>
                            <span class="custom-checkbox"></span>
                        </label>
                    </div>
                </div>
                <div class="timestamp-row">
                    <div class="timestamp ${emp.time ? 'has-time' : ''}">${displayTime}</div>
                    <div class="timestamp-label">DATA / HORA DA ASSINATURA</div>
                </div>
            </div>
        `;
    }

    /**
     * Renderiza as listas de funcionários nas colunas corretas.
     * @param {Array} employees - A lista de todos os funcionários.
     */
    function renderEmployeeLists(employees) {
        if (!leftColumn || !rightColumn || !specialTeamList) return;

        // Ordenar alfabeticamente
        employees.sort((a, b) => a.name.localeCompare(b.name));

        const mainEmployees = employees.filter(emp => !emp.inSpecialTeam);
        const specialEmployees = employees.filter(emp => emp.inSpecialTeam);

        leftColumn.innerHTML = '';
        rightColumn.innerHTML = '';
        specialTeamList.innerHTML = '';

        // Renderizar Colunas Principais (1 e 2)
        if (mainEmployees.length > 0) {
            const mid = Math.ceil(mainEmployees.length / 2);
            mainEmployees.forEach((emp, index) => {
                const blockHTML = createEmployeeBlockHTML(emp);
                if (index < mid) {
                    leftColumn.innerHTML += blockHTML;
                } else {
                    rightColumn.innerHTML += blockHTML;
                }
            });
            hideLoadingPlaceholder(); // Esconde a msg principal
        } else if (specialEmployees.length > 0) {
            // Se a lista principal está vazia, mas a especial não, esconde a msg principal
            hideLoadingPlaceholder();
        }

        // Renderizar Coluna Turma 6H (3)
        if (specialEmployees.length > 0) {
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
        
        // Se ambas as listas estiverem vazias, mostrar msg principal
        if (mainEmployees.length === 0 && specialEmployees.length === 0) {
             showLoadingMessage('Nenhum funcionário encontrado no banco de dados.');
        }

        updateAllStats(employees);
    }
    // --- 7. LÓGICA DE ATUALIZAÇÃO DO FIREBASE ---

    /**
     * Lida com a mudança de status (assDss, bem, mal, absent).
     * @param {string} docId - ID do documento no Firestore.
     * @param {string} type - 'assDss', 'bem', 'mal', ou 'absent'.
     * @param {boolean} currentState - O estado atual (true/false) antes do clique.
     */
    async function handleStatusChange(docId, type, currentState) {
        if (!docId || !type) return;

        const isChecking = !currentState;
        
        // Regra de Permissão: Só permite DESMARCAR se for admin
        if (!isChecking && !isAdmin) {
            showNotification('Apenas administradores podem desmarcar um status.', 'error');
            return;
        }

        const docRef = doc(db, employeesCollectionPath, docId);
        const now = new Date();
        const timestamp = Timestamp.fromDate(now);

        // Define os dados a serem atualizados
        let dataToUpdate = {
            [type]: isChecking,
            time: isChecking || type === 'assDss' ? timestamp : null // Adiciona hora se marcar, remove se desmarcar (exceto assDss)
        };

        // Regras de negócio
        if (isChecking) {
            dataToUpdate.absent = false; // Se marcar qualquer coisa, não está ausente

            if (type === 'bem') {
                dataToUpdate.mal = false;
                dataToUpdate.assDss = true; // Marcar 'bem' marca 'assDss'
            } else if (type === 'mal') {
                dataToUpdate.bem = false;
                dataToUpdate.assDss = false; // Marcar 'mal' desmarca 'assDss'
            } else if (type === 'assDss' && (dataToUpdate.mal === true || (await getDoc(docRef)).data().mal === true)) {
                // Prevenção: Não pode marcar 'assDss' se 'mal' estiver marcado
                dataToUpdate.assDss = false;
            }
        } else {
            // Se estiver desmarcando 'assDss', também desmarca 'bem'
            if (type === 'assDss') {
                dataToUpdate.bem = false;
            }
        }
        
        // Se todos os status forem falsos, zera a hora
        if (!dataToUpdate.assDss && !dataToUpdate.bem && !dataToUpdate.mal && !dataToUpdate.absent) {
             dataToUpdate.time = null;
        }

        try {
            await updateDoc(docRef, dataToUpdate);
            // A UI será atualizada automaticamente pelo onSnapshot
        } catch (error) {
            console.error("Erro ao atualizar status: ", error);
            showNotification(`Erro ao salvar: ${error.message}`, 'error');
        }
    }

    /**
     * Alterna o status 'inSpecialTeam' de um funcionário no Firestore.
     * @param {string} docId - ID do documento no Firestore.
     * @param {boolean} currentState - O estado atual (true/false) antes do clique.
     */
    async function toggleSpecialTeamFirestore(docId, currentState, button) {
        if (!docId) return;
        if (button) {
            button.classList.add('loading');
            button.disabled = true;
        }

        const isMovingToSpecial = !currentState;
        const docRef = doc(db, employeesCollectionPath, docId);

        try {
            await updateDoc(docRef, {
                inSpecialTeam: isMovingToSpecial
            });
            // O onSnapshot cuidará da atualização da UI.
            // O estado de loading/disabled será removido quando o onSnapshot redesenhar o botão.
        } catch (error) {
            console.error("Erro ao mover funcionário: ", error);
            showNotification(`Erro ao mover: ${error.message}`, 'error');
            if (button) {
                button.classList.remove('loading');
                button.disabled = false;
            }
        }
    }


    // --- 8. FUNÇÕES DE ADMINISTRADOR ---

    /**
     * Executa a limpeza MANUAL de todos os status (não mexe no inSpecialTeam).
     */
    async function performManualClean() {
        showNotification('Iniciando limpeza manual...', 'success', 5000);
        
        try {
            const querySnapshot = await getDocs(collection(db, employeesCollectionPath));
            if (querySnapshot.empty) {
                showNotification('Nenhum funcionário para limpar.', 'neutral');
                return;
            }

            const batch = writeBatch(db);
            querySnapshot.forEach(doc => {
                batch.update(doc.ref, {
                    assDss: false,
                    bem: false,
                    mal: false,
                    absent: false,
                    time: null
                });
            });

            await batch.commit();
            
            // A UI atualizará via onSnapshot, mas forçamos a limpeza dos campos de texto
            if(dssSubjectInput) dssSubjectInput.value = '';
            if(userMatriculaInput) userMatriculaInput.value = '';
            if(dssSubjectSpecialInput) dssSubjectSpecialInput.value = '';
            if(userMatriculaSpecialInput) userMatriculaSpecialInput.value = '';

            // A notificação de sucesso será mostrada pelo onSnapshot (ou podemos forçar aqui)
            // Para garantir a ordem, esperamos um pouco
            setTimeout(() => {
                showNotification('Limpeza manual realizada com sucesso!', 'success');
            }, 1000); 

        } catch (error) {
            console.error("Erro na limpeza manual: ", error);
            showNotification(`Erro ao limpar: ${error.message}`, 'error');
        }
    }

    /**
     * Executa a limpeza AUTOMÁTICA (a mesma lógica da manual).
     */
    async function performAutoClean() {
        try {
            const querySnapshot = await getDocs(collection(db, employeesCollectionPath));
            if (querySnapshot.empty) return; // Silencioso se vazio

            const batch = writeBatch(db);
            querySnapshot.forEach(doc => {
                batch.update(doc.ref, {
                    assDss: false,
                    bem: false,
                    mal: false,
                    absent: false,
                    time: null
                });
            });

            await batch.commit();
            
            // Limpa campos de texto
            if(dssSubjectInput) dssSubjectInput.value = '';
            if(userMatriculaInput) userMatriculaInput.value = '';
            if(dssSubjectSpecialInput) dssSubjectSpecialInput.value = '';
            if(userMatriculaSpecialInput) userMatriculaSpecialInput.value = '';

            showNotification('Limpeza automática executada com sucesso!', 'success');
            
            // Salva a data da limpeza
            localStorage.setItem(LAST_CLEAN_KEY, new Date().toISOString().split('T')[0]);

        } catch (error) {
            console.error("Erro na limpeza automática: ", error);
            // Não notifica o usuário sobre falha na limpeza automática (evita spam)
        }
    }

    /**
     * Verifica se a limpeza automática deve ser executada.
     * Regra: Roda se (diaDoMes % 4) for 2 ou 3.
     */
    function checkAndPerformAutoClean() {
        const today = new Date();
        const dayOfMonth = today.getDate();
        const todayStr = today.toISOString().split('T')[0];
        const lastCleanDate = localStorage.getItem(LAST_CLEAN_KEY);

        // Verifica se a limpeza já foi feita hoje
        if (lastCleanDate === todayStr) {
            console.log("Limpeza automática já realizada hoje.");
            return;
        }

        // Verifica a regra do dia
        const remainder = dayOfMonth % 4;
        const isCleanDay = (remainder === 2 || remainder === 3);

        if (isCleanDay) {
            console.log("Dia de limpeza automática. Executando...");
            performAutoClean();
        } else {
            console.log("Hoje não é dia de limpeza automática.");
        }
    }

    /**
     * Gera e baixa um relatório .txt do status atual.
     */
    function generateDailyReport() {
        if (employeesData.length === 0) {
            showNotification("Não há funcionários para gerar relatório.", "error");
            return;
        }

        const now = new Date();
        const timestamp = `${now.toLocaleDateString('pt-BR')} ${now.toLocaleTimeString('pt-BR')}`;
        const filename = `relatorio_dss_${now.toISOString().split('T')[0]}.txt`;
        
        const subject7H = dssSubjectInput.value || "N/A";
        const subject6H = dssSubjectSpecialInput.value || "N/A";

        const stats = {
            ok: employeesData.filter(e => e.bem && !e.absent).length,
            pending: employeesData.filter(e => !e.assDss && !e.bem && !e.mal && !e.absent).length,
            absent: employeesData.filter(e => e.absent).length,
            notOk: employeesData.filter(e => e.mal && !e.absent).length,
        };

        let content = `RELATÓRIO DSS - ${timestamp}\r\n`;
        content += `-----------------------------------\r\n`;
        content += `Assunto (7H-19H): ${subject7H}\r\n`;
        content += `Assunto (6H): ${subject6H}\r\n`;
        content += `\r\nRESUMO:\r\n`;
        content += `Presentes OK: ${stats.ok}\r\n`;
        content += `Pendentes: ${stats.pending}\r\n`;
        content += `Não Estou Bem: ${stats.notOk}\r\n`;
        content += `Ausentes: ${stats.absent}\r\n`;
        content += `Total: ${employeesData.length}\r\n`;
        content += `-----------------------------------\r\n\r\n`;

        content += "PENDENTES (Não preencheram e não estão ausentes):\r\n";
        employeesData.filter(e => !e.assDss && !e.bem && !e.mal && !e.absent).forEach(e => {
            content += `- ${e.name} (${e.matricula || 'N/A'})\r\n`;
        });
        if (stats.pending === 0) content += "Nenhum.\r\n";

        content += "\r\nNÃO ESTOU BEM:\r\n";
        employeesData.filter(e => e.mal && !e.absent).forEach(e => {
            content += `- ${e.name} (${e.matricula || 'N/A'}) - (Registrado em: ${formatFirestoreTime(e.time) || 'N/A'})\r\n`;
        });
        if (stats.notOk === 0) content += "Nenhum.\r\n";
        
        content += "\r\nAUSENTES:\r\n";
        employeesData.filter(e => e.absent).forEach(e => {
            content += `- ${e.name} (${e.matricula || 'N/A'})\r\n`;
        });
        if (stats.absent === 0) content += "Nenhum.\r\n";

        content += "\r\nPRESENTES E OK (Assinaram DSS e/ou 'Estou Bem'):\r\n";
        employeesData.filter(e => (e.assDss || e.bem) && !e.mal && !e.absent).forEach(e => {
            content += `- ${e.name} (${e.matricula || 'N/A'}) - (Registrado em: ${formatFirestoreTime(e.time) || 'N/A'})\r\n`;
        });
        if (stats.ok === 0) content += "Nenhum.\r\n";

        // Cria um link para download
        const element = document.createElement('a');
        element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(content));
        element.setAttribute('download', filename);
        element.style.display = 'none';
        document.body.appendChild(element);
        element.click();
        document.body.removeChild(element);

        showNotification("Relatório baixado com sucesso!", "success");
    }

    
    // --- 9. LISTENER PRINCIPAL DO FIREBASE (onSnapshot) ---
    
    let unsubscribe = null; // Variável para guardar a função de "parar de ouvir"

    /**
     * Inicia o "ouvinte" em tempo real da coleção de funcionários.
     */
    function listenForEmployeeUpdates() {
        if (unsubscribe) {
            unsubscribe(); // Para o ouvinte anterior, se existir
        }

        const q = query(collection(db, employeesCollectionPath));

        unsubscribe = onSnapshot(q, (querySnapshot) => {
            let freshEmployeesData = [];
            querySnapshot.forEach((doc) => {
                const data = doc.data();
                freshEmployeesData.push({
                    docId: doc.id,
                    name: data.name || "Nome Inválido",
                    matricula: data.matricula || "",
                    assDss: data.assDss || false,
                    bem: data.bem || false,
                    mal: data.mal || false,
                    absent: data.absent || false,
                    inSpecialTeam: data.inSpecialTeam || false,
                    time: formatFirestoreTime(data.time) // Formata o timestamp aqui
                });
            });

            employeesData = freshEmployeesData; // Atualiza a variável global
            renderEmployeeLists(employeesData); // Redesenha a tela
            
            if (headerLoader) headerLoader.style.opacity = '0';

        }, (error) => {
            console.error("Erro ao buscar funcionários: ", error);
            showLoadingMessage(`Erro ao buscar dados: ${error.message}. Verifique as Regras de Segurança.`, true);
        });
    }


    // --- 10. INICIALIZAÇÃO E EVENT LISTENERS ---

    // Inicializar Firebase
    try {
        app = initializeApp(firebaseConfig);
        db = getFirestore(app);
        auth = getAuth(app);
        
        showLoadingMessage("Autenticando...");

        // Fazer login anônimo
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
            return; // Interrompe o script se a autenticação falhar
        }

    } catch (e) {
        console.error('Erro ao inicializar o Firebase:', e);
        showLoadingMessage(`Falha ao conectar ao Firebase. Verifique a 'firebaseConfig'. Erro: ${e.message}`, true);
        return; // Interrompe o script se a inicialização falhar
    }

    // Ouvinte do estado de autenticação
    onAuthStateChanged(auth, (user) => {
        if (user) {
            console.log("Usuário está logado, UID:", user.uid);
            showLoadingMessage("Buscando funcionários...");
            
            // Inicia o ouvinte do banco de dados
            listenForEmployeeUpdates(); 
            
            // Verifica se precisa fazer a limpeza automática
            checkAndPerformAutoClean();

        } else {
            console.log("Usuário não está logado.");
            showLoadingMessage("Erro: Usuário não autenticado.", true);
            if (unsubscribe) {
                unsubscribe(); // Para de ouvir se o usuário deslogar
            }
        }
    });

    // --- 11. EVENT LISTENERS GLOBAIS (Delegação de Eventos) ---

    // Ouvinte principal para cliques nos cartões (checkboxes e botões)
    if (tableContainer) {
        tableContainer.addEventListener('click', (e) => {
            const target = e.target;
            const cardItem = target.closest('.checkbox-item');
            const absentButton = target.closest('.absent-button');
            const turnoButton = target.closest('.turno-button');
            const deleteButton = target.closest('.delete-button');

            if (cardItem) {
                e.preventDefault(); // Prevenir comportamento padrão
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
                const type = absentButton.dataset.type;
                const currentState = absentButton.dataset.currentState === 'true';
                handleStatusChange(docId, type, currentState);
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

    // Ouvinte separado para a lista da Turma 6H
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
                const docId = absentButton.dataset.docId;
                const type = absentButton.dataset.type;
                const currentState = absentButton.dataset.currentState === 'true';
                handleStatusChange(docId, type, currentState);
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

    // --- 12. LISTENERS DE BOTÕES E MODAIS ---

    // Formulários de Registro (não-Firebase)
    if (registerPresenceBtn) {
        registerPresenceBtn.addEventListener('click', (e) => {
            createRipple(e);
            const button = e.currentTarget;
            let progressBar = button.querySelector('.progress-bar');
            if (!progressBar) { /* ... (código do progress bar) ... */ }

            const subject = dssSubjectInput.value;
            const matricula = userMatriculaInput.value;

            if (!subject || !matricula) {
                showNotification('Preencha todos os campos (7H-19H).', 'error');
                return;
            }
            
            button.classList.add('loading');
            button.disabled = true;
            
            setTimeout(() => {
                button.classList.remove('loading');
                button.disabled = false;
                showNotification(`Dados (7H-19H) registrados: ${subject} | ${matricula}`);
                dssSubjectInput.value = '';
                userMatriculaInput.value = '';
            }, 2000);
        });
    }

    if (registerSpecialBtn) {
        registerSpecialBtn.addEventListener('click', (e) => {
            createRipple(e);
            const button = e.currentTarget;
            let progressBar = button.querySelector('.progress-bar');
            if (!progressBar) { /* ... (código do progress bar) ... */ }

            const subject = dssSubjectSpecialInput.value;
            const matricula = userMatriculaSpecialInput.value;

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
                dssSubjectSpecialInput.value = '';
                userMatriculaSpecialInput.value = '';
            }, 2000);
        });
    }

    // Dark Mode
    if (darkModeToggle) {
        const body = document.body;
        const savedTheme = localStorage.getItem('theme');
        if (savedTheme === 'dark' || (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
    