
import React, { useState, useEffect, useLayoutEffect, useCallback, useMemo, useRef, Suspense, lazy } from 'react';
import { flushSync } from 'react-dom';
import Header from './components/Header';
import EmployeeCard from './components/EmployeeCard';
import SpecialTeamPanel from './components/SpecialTeamPanel';
import Modal from './components/Modal';
import Notification from './components/Notification';
import Footer from './components/Footer';
import type { TutorialStep } from './components/InteractiveTutorial';
import ThemeSelectionScreen from './components/ThemeSelectionScreen';
import TurmaSelectionScreen from './components/TurmaSelectionScreen';
import LayoutSelectionScreen from './components/LayoutSelectionScreen';

import { SubjectIcon, UserIcon, EraserIcon, FileTextIcon, SortIcon, UserPlusIcon, ShiftIcon, AusenteIcon, TrashIcon, ExchangeIcon, MousePointerIcon, InfoIcon, HelpIcon, HistoryIcon } from './components/icons';
import { Employee, StatusType, ModalType, ManualRegistration, Administrator, HistoryRecord, HistoryEmployee, HistoryStatus, PdfReportData, AuditRecord } from './types';
import type { NotificationData } from './components/Notification';
import { db, auth, isConfigured } from './firebase';
import { FALLBACK_LOGO } from './components/logoConstants';
import {
    collection,
    query,
    orderBy,
    onSnapshot,
    doc,
    updateDoc,
    addDoc,
    writeBatch,
    serverTimestamp,
    Timestamp,
    where,
    getDocs,
    deleteDoc,
    setDoc,
    getDoc,
    limit,
    disableNetwork,
    enableNetwork
} from 'firebase/firestore';
import { signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import emailjs from '@emailjs/browser';
import './styles.css';
import { formatTimestamp } from './services/employeeService';
import { logAuditEvent } from './services/auditService';
import { 
    isMobileCellularWithBiometrics, 
    hasRegisteredBiometrics, 
    registerBiometricAdmin, 
    authenticateBiometricAdmin,
    clearBiometricData
} from './services/biometricService';

import {
    EMAILJS_SERVICE_ID,
    EMAILJS_TEMPLATE_ID,
    EMAILJS_PUBLIC_KEY,
    TurmaType,
    ALL_TURMAS,
    TURMA_DISPLAY_NAMES,
    getTurmaCollectionName,
    getTurmaRegistrationName,
    isValidTurma,
    getShiftLabel,
    getMainShiftLabel,
    getDisplayModeFromPath,
    isCargaGeralTurma,
    isMinerioTurma
} from './utils/turmaUtils';
import { getTutorialSteps, adminTutorialSteps } from './utils/tutorialSteps';
import { generateHealthAlertEmail } from './utils/emailTemplates';

import { ManualRegisterSection } from './components/ManualRegisterSection';
const InteractiveTutorial = lazy(() => import('./components/InteractiveTutorial'));
const HistoryModal = lazy(() => import('./components/HistoryModal'));

// Lazy load Modals
import AdminOptionsModal from './components/modals/AdminOptionsModal';
import AddUserModal from './components/modals/AddUserModal';
import AdminLoginModal from './components/modals/AdminLoginModal';
import ConfirmBiometricModal from './components/modals/ConfirmBiometricModal';
import ImportEmployeeModal from './components/modals/ImportEmployeeModal';
import SignaturePasswordModal from './components/modals/SignaturePasswordModal';
import AdminPasswordModal from './components/modals/AdminPasswordModal';
import ManageAdminsModal from './components/modals/ManageAdminsModal';
import AddAdminModal from './components/modals/AddAdminModal';
import EditAdminModal from './components/modals/EditAdminModal';
import AuditLogModal from './components/modals/AuditLogModal';
import DssRaffleModal from './components/modals/DssRaffleModal';

const ReportModal = lazy(() => import('./components/modals/ReportModal').then(module => ({ default: module.ReportModal })));
// Remover AutomationPasswordModal
import {
    UserExistsWarningModal,
    InvalidMatriculaModal,
    ConfirmMalModal,
    ConfirmTurnoModal,
    ConfirmAusenteModal,
    ConfirmDeleteModal,
    ConfirmDeactivate6HModal,
    TutorialChoiceModal,
    TutorialVideoModal,
    ConnectionErrorModal,
    AdminUpdateNoticeModal
} from './components/modals/ActionModals';

import { isInternetFastAndStable } from './utils/network';



const App: React.FC = () => {
    const [selectedTurma, setSelectedTurma] = useState<TurmaType | null>(() => {
        const savedTurma = localStorage.getItem('selectedTurma');
        if (savedTurma && isValidTurma(savedTurma)) {
            const displayMode = getDisplayModeFromPath();
            const isCgTurma = isCargaGeralTurma(savedTurma);
            const isMinerioTurmaSaved = isMinerioTurma(savedTurma);
            
            let isValidRoute = true;
            if (displayMode === 'CG' && !isCgTurma) isValidRoute = false;
            else if (displayMode === 'MINERIO' && !isMinerioTurmaSaved) isValidRoute = false;
            else if (displayMode === 'NORMAL' && (isCgTurma || isMinerioTurmaSaved)) isValidRoute = false;
            
            if (!isValidRoute) {
                localStorage.removeItem('selectedTurma');
                localStorage.removeItem('selectedLayout');
                return null;
            }
            return savedTurma;
        }
        return null;
    });

    const [selectedLayout, setSelectedLayout] = useState<'standard' | 'custom' | null>(() => {
        const savedLayout = localStorage.getItem('selectedLayout');
        if (savedLayout === 'standard' || savedLayout === 'custom') {
            return savedLayout as 'standard' | 'custom';
        }
        return null;
    });

    const [employees, setEmployees] = useState<Employee[]>([]);
    const [administrators, setAdministrators] = useState<Administrator[]>([]);
    const [loading, setLoading] = useState(true);
    const [isAuthReady, setIsAuthReady] = useState(false);
    const [activeModal, setActiveModal] = useState<ModalType>(ModalType.None);
    const [historyOriginModal, setHistoryOriginModal] = useState<ModalType>(ModalType.AdminOptions);
    const [notifications, setNotifications] = useState<NotificationData[]>([]);
    const [editingAdminId, setEditingAdminId] = useState<string | null>(null);
    const [togglingSpecialTeamId, setTogglingSpecialTeamId] = useState<string | null>(null);
    const [isAdmin, setIsAdmin] = useState(false);
    const [adminEmail, setAdminEmail] = useState('');
    const [adminNivel, setAdminNivel] = useState<string>('1');
    const [activeLetter, setActiveLetter] = useState<string>('');
    const viewportRef = useRef<HTMLDivElement>(null);
    const contentWrapperRef = useRef<HTMLDivElement>(null); // New wrapper ref
    const scalableContainerRef = useRef<HTMLDivElement>(null);
    const scaleStateRef = useRef({ currentScale: 1 });
    const dragScrollRef = useRef({
        isDragging: false,
        startX: 0,
        startY: 0,
        scrollLeft: 0,
        scrollTop: 0,
        moved: false
    });
    const [modalScale, setModalScale] = useState(1);
    
    const hiddenTimestampRef = useRef<number>(0);
    const visibilityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const selectedTurmaRef = useRef<TurmaType | null>(selectedTurma);
    useEffect(() => { selectedTurmaRef.current = selectedTurma; }, [selectedTurma]);

    // Pausar/Retomar Firebase com base na visibilidade da aba para economizar leituras e bateria
    useEffect(() => {
        if (!db) return;

        const handleVisibilityChange = () => {
            if (document.visibilityState === 'hidden') {
                hiddenTimestampRef.current = Date.now();
                if (visibilityTimerRef.current) clearTimeout(visibilityTimerRef.current);
                disableNetwork(db!).catch(error => console.error("Erro ao suspender rede:", error));
            } else if (document.visibilityState === 'visible') {
                enableNetwork(db!).catch(error => console.error("Erro ao retomar rede:", error));

                const lastHidden = hiddenTimestampRef.current;
                if (lastHidden > 0 && selectedTurmaRef.current) {
                    const elapsedMinutes = (Date.now() - lastHidden) / (1000 * 60);
                    const hasDateChanged = new Date(lastHidden).getDate() !== new Date().getDate();

                    // Se a aba ficou em segundo plano por tempo prolongado ou virou o dia (rotina de limpeza da madrugada),
                    // reativa o blur temporariamente até o Firebase reconectar e confirmar os dados do servidor.
                    if (hasDateChanged || elapsedMinutes >= 10) {
                        setLoading(true);
                        initialEmpLoadDoneRef.current = false;
                        initialRegLoadDoneRef.current = false;
                        initialLoadDoneRef.current = false;
                        if (visibilityTimerRef.current) clearTimeout(visibilityTimerRef.current);
                        visibilityTimerRef.current = setTimeout(() => {
                            if (!initialLoadDoneRef.current) {
                                // Mantém o blur e avisa que a internet está lenta/caiu, sem liberar dados do dia anterior
                                setActiveModal(ModalType.ConnectionError);
                            }
                        }, 8000);
                    }
                }
                hiddenTimestampRef.current = 0;
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            if (visibilityTimerRef.current) clearTimeout(visibilityTimerRef.current);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, []);

    const [isTransitioning, setIsTransitioning] = useState(false);

    useEffect(() => {
        if (!loading) {
            setIsTransitioning(false);
        }
    }, [loading]);

    // Refs para estabilizar callbacks sem dependência de state mutável
    const employeesRef = useRef<Employee[]>([]);
    const isAdminRef = useRef(false);
    const adminEmailRef = useRef('');

    // State for manual registration inputs
    const [mainSubject, setMainSubject] = useState('');
    const [mainMatricula, setMainMatricula] = useState('');
    const [mainResponsible, setMainResponsible] = useState('');

    const [specialSubject, setSpecialSubject] = useState('');
    const [specialMatricula, setSpecialMatricula] = useState('');
    const [specialResponsible, setSpecialResponsible] = useState('');
    const [mainRegisterTime, setMainRegisterTime] = useState('');
    const [specialRegisterTime, setSpecialRegisterTime] = useState('');

    const lastDbMainSubject = useRef('');
    const lastDbMainMatricula = useRef('');
    const lastDbSpecialSubject = useRef('');
    const lastDbSpecialMatricula = useRef('');

    const [pendingEmployeeId, setPendingEmployeeId] = useState<string | null>(null);
    const [existingUserInfo, setExistingUserInfo] = useState<{ name: string; turma: string } | null>(null);
    const [pendingRaffleId, setPendingRaffleId] = useState<string | null>(null);
    const pendingRaffleTypeRef = useRef<StatusType>('assDss');
    
    // Refs for Raffle
    const drawn7HRef = useRef<string[]>([]);
    const drawn6HRef = useRef<string[]>([]);

    const [is6HActive, setIs6HActive] = useState(() => {
        const savedTurma = localStorage.getItem('selectedTurma');
        if (savedTurma && savedTurma.includes('_CCP_')) {
            return false;
        }
        return true;
    });
    const [isSignaturePasswordActive, setIsSignaturePasswordActive] = useState(false);
    const [isSorteioActive, setIsSorteioActive] = useState(false);
    const isSorteioActiveRef = useRef(false);

    const [isPularTelasActive, setIsPularTelasActive] = useState(false);
    const isPularTelasActiveRef = useRef(false);

    useEffect(() => {
        isSorteioActiveRef.current = isSorteioActive;
    }, [isSorteioActive]);

    useEffect(() => {
        isPularTelasActiveRef.current = isPularTelasActive;
    }, [isPularTelasActive]);

    const [isAdminOnlyTheme, setIsAdminOnlyTheme] = useState(false);
    const [isAutomationPaused, setIsAutomationPaused] = useState(false);

    const [isAdminTutorialOpen, setIsAdminTutorialOpen] = useState(false);
    const [auditRecords, setAuditRecords] = useState<AuditRecord[]>([]);

    // Demo Mode State
    const [isDemoMode, setIsDemoMode] = useState(false);
    const isDemoModeRef = useRef(false);

    const [isDarkMode, setIsDarkMode] = useState(() => {
        const savedTheme = localStorage.getItem('theme');
        if (savedTheme) return savedTheme === 'dark';
        return window.matchMedia('(prefers-color-scheme: dark)').matches;
    });

    const [hasSelectedTheme, setHasSelectedTheme] = useState(() => {
        return localStorage.getItem('themeSelected') === 'true';
    });

    // Ref to prevent double "loaded" notifications
    const initialLoadDoneRef = useRef(false);
    const initialEmpLoadDoneRef = useRef(false);
    const initialRegLoadDoneRef = useRef(false);

    // Manter refs sincronizados com o state
    useEffect(() => { employeesRef.current = employees; }, [employees]);
    useEffect(() => { isAdminRef.current = isAdmin; }, [isAdmin]);
    useEffect(() => { adminEmailRef.current = adminEmail; }, [adminEmail]);

    // Effect to set Favicon to the Shield Icon (FALLBACK_LOGO)
    useEffect(() => {
        const link = document.querySelector("link[rel~='icon']") as HTMLLinkElement;
        if (link) {
            link.href = FALLBACK_LOGO;
        } else {
            const newLink = document.createElement('link');
            newLink.rel = 'icon';
            newLink.href = FALLBACK_LOGO;
            document.head.appendChild(newLink);
        }
    }, []);

    useLayoutEffect(() => {
        const themeColorMeta = document.querySelector('meta[name="theme-color"]');
        if (isDarkMode) {
            document.documentElement.classList.add('dark');
            localStorage.setItem('theme', 'dark');
            // FIX: Set body background to match theme to prevent white flashes during overscroll/bounce
            document.body.style.backgroundColor = '#111217';
            // FIX: Update theme-color meta tag for mobile browsers (status bar color)
            if (themeColorMeta) themeColorMeta.setAttribute('content', '#111217');
        } else {
            document.documentElement.classList.remove('dark');
            localStorage.setItem('theme', 'light');
            // FIX: Set body background to match theme (light-bg-secondary color)
            document.body.style.backgroundColor = '#e8ecf1';
            // FIX: Update theme-color meta tag for mobile browsers (status bar color)
            if (themeColorMeta) themeColorMeta.setAttribute('content', '#e8ecf1');
        }
    }, [isDarkMode]);

    // modalScale é sempre 1 (definido como constante acima)

    useEffect(() => {
        // Wait for loading to finish so DOM elements are present
        let timeoutId: NodeJS.Timeout;
        if (!loading && selectedTurma && selectedLayout) {
            const hasSeenTutorial = localStorage.getItem('hasSeenTutorial');
            if (!hasSeenTutorial) {
                // Short delay to ensure rendering frames are complete
                timeoutId = setTimeout(() => {
                    if (!localStorage.getItem('hasSeenTutorial')) {
                        setActiveModal(ModalType.TutorialChoice);
                        localStorage.setItem('hasSeenTutorial', 'true');
                    }
                }, 1500);
            }
        }
        return () => {
            if (timeoutId) clearTimeout(timeoutId);
        };
    }, [loading, selectedTurma, selectedLayout]);

    const handleToggleDarkMode = useCallback((e?: any) => {
        if (!('startViewTransition' in document)) {
            setIsDarkMode(prev => !prev);
            return;
        }

        const isSwitchingToDark = !isDarkMode;

        let x = window.innerWidth / 2;
        let y = window.innerHeight / 2;
        
        if (e && e.nativeEvent && typeof e.nativeEvent.clientX === 'number' && e.nativeEvent.clientX > 0) {
            x = e.nativeEvent.clientX;
            y = e.nativeEvent.clientY;
        } else if (e && e.target instanceof Element) {
            const targetEl = e.target.closest('.bb8-toggle') || e.target;
            const rect = targetEl.getBoundingClientRect();
            x = rect.left + rect.width / 2;
            y = rect.top + rect.height / 2;
        }

        const endRadius = Math.hypot(
            Math.max(x, window.innerWidth - x),
            Math.max(y, window.innerHeight - y)
        );

        document.documentElement.style.setProperty('--toggle-x', `${x}px`);
        document.documentElement.style.setProperty('--toggle-y', `${y}px`);
        document.documentElement.style.setProperty('--toggle-r', `${endRadius}px`);

        const transitionClass = isSwitchingToDark ? 'dark-transition' : 'light-transition';
        document.documentElement.classList.add(transitionClass);

        const transition = (document as any).startViewTransition(() => {
            flushSync(() => {
                setIsDarkMode(prev => !prev);
            });
        });

        transition.finished.finally(() => {
            document.documentElement.classList.remove(transitionClass);
            document.documentElement.style.removeProperty('--toggle-x');
            document.documentElement.style.removeProperty('--toggle-y');
            document.documentElement.style.removeProperty('--toggle-r');
        });
    }, [isDarkMode]);

    const showNotification = useCallback((message: string, type: 'success' | 'error' | 'info' = 'success') => {
        const newNotification = { id: Date.now(), message, type };
        setNotifications(prev => [...prev, newNotification]);
    }, []);

    const dismissNotification = useCallback((id: number) => {
        setNotifications(prev => prev.filter(n => n.id !== id));
    }, []);

    // Função para enviar alerta por e-mail
    const sendAlertEmail = useCallback(async (name: string, matricula: string, turno: string) => {
        if (isDemoMode) {
            console.log(`[DEMO] Email alert triggered for ${name}`);
            return;
        }
        try {
            const { html: html_content, subject } = generateHealthAlertEmail(
                name,
                matricula,
                turno,
                selectedTurma!
            );

            const templateParams = {
                html_content,
                subject,
            };

            await emailjs.send(
                EMAILJS_SERVICE_ID,
                EMAILJS_TEMPLATE_ID,
                templateParams,
                EMAILJS_PUBLIC_KEY
            );

            showNotification('Alerta enviado por e-mail ao setor responsável.', 'success');
        } catch (error) {
            console.error("Erro ao enviar e-mail via EmailJS:", error);
        }
    }, [isDemoMode, selectedTurma, showNotification]);

    // Efetua login anônimo para acesso ao Firestore
    useEffect(() => {
        if (!auth) {
            setIsAuthReady(true);
            return;
        }

        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            if (user) {
                setIsAuthReady(true);
            } else {
                try {
                    await signInAnonymously(auth!);
                } catch (error) {
                    console.error("Anonymous sign-in failed:", error);
                    setIsAuthReady(true); // Continua mesmo se falhar para não travar
                }
            }
        });

        return () => unsubscribe();
    }, []);

    // Effect for fetching data specific to the selected Turma
    useEffect(() => {
        if (!selectedTurma) {
            setLoading(false);
            return;
        }

        if (!isConfigured) {
            showNotification("Modo de pré-visualização: Faça o deploy no Vercel para carregar dados ao vivo.", "error");
            setLoading(false);
            return;
        }
        
        if (!isAuthReady) return;

        initialLoadDoneRef.current = false; // Reset notification flag when turma changes
        initialEmpLoadDoneRef.current = false;
        initialRegLoadDoneRef.current = false;

        let unsubscribeEmployees = () => { };
        let unsubscribeRegistrations = () => { };
        let unsubscribeAutomacao = () => { };
        let fallbackTimer: ReturnType<typeof setTimeout> | null = null;

        const setupListeners = async () => {
            if (!db) {
                setLoading(false);
                return;
            }

            // Alerta de conexão lenta: se após 8s a nuvem não responder (offline/instabilidade),
            // mantém o blur cobrindo a tela (sem liberar dados velhos de ontem) e exibe o cartão de Internet Lenta.
            fallbackTimer = setTimeout(() => {
                if (!initialLoadDoneRef.current) {
                    setActiveModal(ModalType.ConnectionError);
                }
            }, 8000);

            try {
                // Listeners for the specific turma com includeMetadataChanges para saber quando os dados vêm do servidor
                const collectionName = getTurmaCollectionName(selectedTurma);
                const employeesQuery = query(collection(db, collectionName), orderBy("name", "asc"));
                unsubscribeEmployees = onSnapshot(employeesQuery, { includeMetadataChanges: true }, (querySnapshot) => {
                    if (isDemoModeRef.current) return;

                    setEmployees(prevEmployees => {
                        let newEmployees = [...prevEmployees];
                        querySnapshot.docChanges().forEach(change => {
                            const data = change.doc.data();
                            const employeeData: Employee = {
                                id: change.doc.id,
                                name: data.name,
                                matricula: data.matricula,
                                assDss: data.assDss,
                                bem: data.bem,
                                mal: data.mal,
                                ausente: data.ausente !== undefined ? data.ausente : (data.absent || false),
                                time: data.time ? formatTimestamp(data.time as Timestamp) : null,
                                turno: data.turno || '7H',
                                senha: data.senha || undefined,
                            };

                            if (change.type === 'added') {
                                if (!newEmployees.some(e => e.id === employeeData.id)) {
                                    newEmployees.push(employeeData);
                                }
                            } else if (change.type === 'modified') {
                                const index = newEmployees.findIndex(e => e.id === employeeData.id);
                                if (index !== -1) {
                                    newEmployees[index] = employeeData;
                                }
                            } else if (change.type === 'removed') {
                                newEmployees = newEmployees.filter(e => e.id !== employeeData.id);
                            }
                        });

                        if (querySnapshot.docChanges().length > 0) {
                            return newEmployees.sort((a, b) => a.name.localeCompare(b.name));
                        }
                        return prevEmployees;
                    });

                    // Somente considera o carregamento concluído quando os dados vierem do servidor (ou já estiverem sincronizados),
                    // evitando que o blur suma prematuramente mostrando dados do dia anterior em cache antes da limpeza ser refletida.
                    const isEmpFromCache = querySnapshot.metadata.fromCache;
                    if (!isEmpFromCache && !initialEmpLoadDoneRef.current) {
                        initialEmpLoadDoneRef.current = true;
                        if (initialRegLoadDoneRef.current && !initialLoadDoneRef.current) {
                            if (fallbackTimer) clearTimeout(fallbackTimer);
                            if (visibilityTimerRef.current) clearTimeout(visibilityTimerRef.current);
                            setActiveModal(prev => prev === ModalType.ConnectionError ? ModalType.None : prev);
                            setLoading(false);
                            showNotification(`Dados da Turma ${TURMA_DISPLAY_NAMES[selectedTurma]} carregados!`, 'success');
                            initialLoadDoneRef.current = true;
                        }
                    }

                }, (error) => {
                    console.error("Error listening to employee updates:", error);
                    if (!isDemoModeRef.current) showNotification(`Erro ao carregar funcionários: ${error.message}`, "error");
                    if (fallbackTimer) clearTimeout(fallbackTimer);
                    setLoading(false);
                });

                const registrationCollectionName = getTurmaRegistrationName(selectedTurma);
                const registrationsQuery = query(collection(db, registrationCollectionName));
                unsubscribeRegistrations = onSnapshot(registrationsQuery, { includeMetadataChanges: true }, (querySnapshot) => {
                    if (isDemoModeRef.current) return;
                    const registrations = querySnapshot.docs.map(d => ({ id: d.id, ...d.data() })) as ManualRegistration[];
                    const mainReg = registrations.find(r => r.id === 'registro_7H') || registrations.find(r => r.TURNO === '7H');
                    const specialReg = registrations.find(r => r.id === 'registro_6H') || registrations.find(r => r.TURNO === '6H');
                    const config6H = querySnapshot.docs.find(d => d.id === 'config_6H');
                    if (config6H) {
                        setIs6HActive(config6H.data().ativado ?? false);
                    } else {
                        setIs6HActive(false);
                    }
                    
                    const configSorteio = querySnapshot.docs.find(d => d.id === 'config_sorteio');
                    if (configSorteio) {
                        setIsSorteioActive(configSorteio.data().ativado ?? false);
                    } else {
                        setIsSorteioActive(false);
                    }

                    const configPularTelas = querySnapshot.docs.find(d => d.id === 'config_pular_telas');
                    const pularAtivo = configPularTelas?.data()?.ativado ?? false;
                    setIsPularTelasActive(pularAtivo);
                    if (pularAtivo) {
                        // Pular telas automaticamente ao carregar a turma.
                        // Marca que foi o Pular Telas quem setou essas chaves (não uma escolha manual do usuário),
                        // para podermos reverter com segurança se a config for desativada depois.
                        localStorage.setItem('themeSelected', 'true');
                        localStorage.setItem('selectedLayout', 'custom');
                        localStorage.setItem('hasSeenTutorial', 'true');
                        localStorage.setItem('pularTelasAutoSet', 'true');
                        setHasSelectedTheme(true);
                        setSelectedLayout('custom');
                    } else if (localStorage.getItem('pularTelasAutoSet') === 'true') {
                        // A config está desligada para esta turma, mas as chaves foram deixadas
                        // pelo Pular Telas em uma sessão/turma anterior. Reverte com segurança,
                        // sem afetar quem selecionou tema/layout manualmente de propósito.
                        localStorage.removeItem('themeSelected');
                        localStorage.removeItem('selectedLayout');
                        localStorage.removeItem('hasSeenTutorial');
                        localStorage.removeItem('pularTelasAutoSet');
                        setHasSelectedTheme(false);
                        setSelectedLayout(null);
                    }

                    const configSignaturePassword = querySnapshot.docs.find(d => d.id === 'config_senha_assinatura');
                    if (configSignaturePassword) {
                        setIsSignaturePasswordActive(configSignaturePassword.data().ativado ?? false);
                    } else {
                        setIsSignaturePasswordActive(false);
                    }

                    const configAdminTheme = querySnapshot.docs.find(d => d.id === 'config_tema_admin');
                    if (configAdminTheme) {
                        setIsAdminOnlyTheme(configAdminTheme.data().ativado || false);
                    } else {
                        setIsAdminOnlyTheme(false);
                    }
                    
                    const configRaffle = querySnapshot.docs.find(d => d.id === 'config_dss_raffle');
                    if (configRaffle) {
                        const data = configRaffle.data();
                        drawn7HRef.current = data.drawn7H || [];
                        drawn6HRef.current = data.drawn6H || [];
                    } else {
                        drawn7HRef.current = [];
                        drawn6HRef.current = [];
                    }
                    
                    const newDbMainSubject = mainReg?.assunto || '';
                    const newDbMainMatricula = mainReg?.matricula || '';
                    const newDbSpecialSubject = specialReg?.assunto || '';
                    const newDbSpecialMatricula = specialReg?.matricula || '';

                    if (newDbMainSubject !== lastDbMainSubject.current) {
                        setMainSubject(newDbMainSubject);
                        lastDbMainSubject.current = newDbMainSubject;
                    }
                    if (newDbMainMatricula !== lastDbMainMatricula.current) {
                        setMainMatricula(newDbMainMatricula);
                        lastDbMainMatricula.current = newDbMainMatricula;
                    }
                    setMainResponsible(mainReg?.name || '');
                    setMainRegisterTime(mainReg?.horario || '');

                    if (newDbSpecialSubject !== lastDbSpecialSubject.current) {
                        setSpecialSubject(newDbSpecialSubject);
                        lastDbSpecialSubject.current = newDbSpecialSubject;
                    }
                    if (newDbSpecialMatricula !== lastDbSpecialMatricula.current) {
                        setSpecialMatricula(newDbSpecialMatricula);
                        lastDbSpecialMatricula.current = newDbSpecialMatricula;
                    }
                    setSpecialResponsible(specialReg?.name || '');
                    setSpecialRegisterTime(specialReg?.horario || '');
                    
                    // Somente considera o registro concluído quando vier do servidor (ou sincronizado)
                    const isRegFromCache = querySnapshot.metadata.fromCache;
                    if (!isRegFromCache && !initialRegLoadDoneRef.current) {
                        initialRegLoadDoneRef.current = true;
                        if (initialEmpLoadDoneRef.current && !initialLoadDoneRef.current) {
                            if (fallbackTimer) clearTimeout(fallbackTimer);
                            if (visibilityTimerRef.current) clearTimeout(visibilityTimerRef.current);
                            setActiveModal(prev => prev === ModalType.ConnectionError ? ModalType.None : prev);
                            setLoading(false);
                            showNotification(`Dados da Turma ${TURMA_DISPLAY_NAMES[selectedTurma]} carregados!`, 'success');
                            initialLoadDoneRef.current = true;
                        }
                    }
                });

                const configAutomacaoQuery = doc(db, 'configuracoes', 'automacao');
                unsubscribeAutomacao = onSnapshot(configAutomacaoQuery, (docSnap) => {
                    if (isDemoModeRef.current) return;
                    if (docSnap.exists()) {
                        const data = docSnap.data();
                        setIsAutomationPaused(data[selectedTurma] === true);
                    } else {
                        setIsAutomationPaused(false);
                    }
                }, (error) => console.error("Error listening to automacao updates:", error));

            } catch (error) {
                console.error("Listener setup failed:", error);
                const message = error instanceof Error ? error.message : 'Verifique as credenciais.';
                if (!isDemoModeRef.current) showNotification(`Falha na conexão: ${message}`, "error");
                if (fallbackTimer) clearTimeout(fallbackTimer);
                setLoading(false);
            }
        };

        setupListeners();

        return () => {
            if (fallbackTimer) clearTimeout(fallbackTimer);
            if (visibilityTimerRef.current) clearTimeout(visibilityTimerRef.current);
            unsubscribeEmployees();
            unsubscribeRegistrations();
            unsubscribeAutomacao();
        };
    }, [selectedTurma, isAuthReady]);

    // Carrega administradores SOMENTE quando as telas que precisam da lista estão abertas
    useEffect(() => {
        const needsAdmins = activeModal === ModalType.ManageAdmins || activeModal === ModalType.EditAdmin;
        if (!isAdmin || !db || !needsAdmins) return;
        
        const administratorsQuery = query(collection(db, 'administrators'));
        const unsubscribeAdministrators = onSnapshot(administratorsQuery, (querySnapshot) => {
            const adminsData: Administrator[] = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Administrator));
            setAdministrators(adminsData);
        }, (error) => console.error("Error listening to admin updates:", error));

        return () => unsubscribeAdministrators();
    }, [isAdmin, activeModal]);

    const setScale = useCallback((newScale: number, scrollX?: number, scrollY?: number) => {
        const viewport = viewportRef.current;
        const scalableContainer = scalableContainerRef.current;
        const contentWrapper = contentWrapperRef.current;
        if (!viewport || !scalableContainer || !contentWrapper) return;

        // Calcular escala mínima com a LARGURA ORIGINAL INTOCADA (scalableContainerRef)
        // Isso impede a "Tremedeira Matemática" descrita, pois a raiz nunca encolhe.
        let minScale = 0.2;
        if (scalableContainer.offsetWidth > 0) {
            minScale = Math.min(0.8, window.innerWidth / scalableContainer.offsetWidth);
        }

        const finalScale = Math.max(minScale, Math.min(newScale, 2.0));
        scaleStateRef.current.currentScale = finalScale;

        scalableContainer.style.transform = `scale(${finalScale})`;

        const originalWidth = scalableContainer.offsetWidth;
        const originalHeight = scalableContainer.offsetHeight;

        contentWrapper.style.width = `${originalWidth * finalScale}px`;
        contentWrapper.style.height = `${originalHeight * finalScale}px`;

        if (scrollX !== undefined) viewport.scrollLeft = scrollX;
        if (scrollY !== undefined) viewport.scrollTop = scrollY;
    }, []);

    const initializeScale = useCallback(() => {
        const viewport = viewportRef.current;
        const scalableContainer = scalableContainerRef.current;
        if (!viewport || !scalableContainer) return;

        const isMobileView = ('ontouchstart' in window || navigator.maxTouchPoints > 0) || window.innerWidth < 1366;

        if (isMobileView) {
            const oneColumnScale = viewport.clientWidth / 920;
            const finalScale = Math.min(Math.max(oneColumnScale, 0.3), 1.0) * 0.8;
            setScale(finalScale, 0, 0);
        } else {
            setScale(0.8, 0, 0);
        }
    }, [setScale]);


    useEffect(() => {
        const viewport = viewportRef.current;
        const scalableContainer = scalableContainerRef.current;

        if (!viewport || !scalableContainer) return;

        initializeScale();
        const initTimer = setTimeout(initializeScale, 50);

        let initialDistance = 0;
        let initialScale = 1;
        let scrollStart = { x: 0, y: 0 };
        let touchCenter = { x: 0, y: 0 };

        const handleTouchStart = (e: TouchEvent) => {
            if (e.touches.length === 2) {
                e.preventDefault();
                initialDistance = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
                initialScale = scaleStateRef.current.currentScale;
                scrollStart = { x: viewport.scrollLeft, y: viewport.scrollTop };
                touchCenter = {
                    x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
                    y: (e.touches[0].clientY + e.touches[1].clientY) / 2
                };
            }
        };

        const handleTouchMove = (e: TouchEvent) => {
            if (e.touches.length === 2) {
                e.preventDefault();
                const currentDistance = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
                const scaleRatio = currentDistance / initialDistance;
                let newScale = initialScale * scaleRatio;

                let minScale = 0.2;
                const scalableContainer = scalableContainerRef.current;
                if (scalableContainer && scalableContainer.offsetWidth > 0) {
                    minScale = Math.min(1.0, window.innerWidth / scalableContainer.offsetWidth);
                }

                if (newScale < minScale) {
                    newScale = minScale;
                    if (scaleStateRef.current.currentScale === minScale) {
                        return; // Anti-Shake: Aborta a continuação matemática do offsetX se já estivermos travados
                    }
                }

                const originX = touchCenter.x - viewport.getBoundingClientRect().left;
                const originY = touchCenter.y - viewport.getBoundingClientRect().top;

                const contentOriginX = (scrollStart.x + originX) / initialScale;
                const contentOriginY = (scrollStart.y + originY) / initialScale;

                const newScrollX = (contentOriginX * newScale) - originX;
                const newScrollY = (contentOriginY * newScale) - originY;

                setScale(newScale, newScrollX, newScrollY);
            }
        };

        const handleWheel = (e: WheelEvent) => {
            if (e.ctrlKey || e.metaKey) {
                e.preventDefault();
                const zoomIntensity = 0.002;
                const delta = -e.deltaY * zoomIntensity;
                let newScale = scaleStateRef.current.currentScale + delta * scaleStateRef.current.currentScale;

                let minScale = 0.2;
                const scalableContainer = scalableContainerRef.current;
                if (scalableContainer && scalableContainer.offsetWidth > 0) {
                    minScale = Math.min(1.0, window.innerWidth / scalableContainer.offsetWidth);
                }

                if (newScale < minScale) {
                    newScale = minScale;
                    if (scaleStateRef.current.currentScale === minScale) {
                        return; // Faz com que rolar o scroll no limite para trás ignore calclos de offset fantasmas
                    }
                }

                const originX = e.clientX - viewport.getBoundingClientRect().left;
                const originY = e.clientY - viewport.getBoundingClientRect().top;

                const contentOriginX = (viewport.scrollLeft + originX) / scaleStateRef.current.currentScale;
                const contentOriginY = (viewport.scrollTop + originY) / scaleStateRef.current.currentScale;

                const newScrollX = (contentOriginX * newScale) - originX;
                const newScrollY = (contentOriginY * newScale) - originY;

                setScale(newScale, newScrollX, newScrollY);
            }
        };

        const handleMouseDown = (e: MouseEvent) => {
            // Não iniciar drag se clicar em botões, inputs ou áreas interativas
            const target = e.target as HTMLElement;
            if (target.closest('button, input, select, textarea, a, [role="button"]')) {
                return;
            }

            dragScrollRef.current.isDragging = true;
            dragScrollRef.current.moved = false;
            dragScrollRef.current.startX = e.pageX - viewport.offsetLeft;
            dragScrollRef.current.startY = e.pageY - viewport.offsetTop;
            dragScrollRef.current.scrollLeft = viewport.scrollLeft;
            dragScrollRef.current.scrollTop = viewport.scrollTop;
            
            viewport.style.cursor = 'grabbing';
            viewport.style.userSelect = 'none';
        };

        const handleMouseMove = (e: MouseEvent) => {
            if (!dragScrollRef.current.isDragging) return;
            
            e.preventDefault();
            const x = e.pageX - viewport.offsetLeft;
            const y = e.pageY - viewport.offsetTop;
            const walkX = (x - dragScrollRef.current.startX);
            const walkY = (y - dragScrollRef.current.startY);

            if (Math.abs(walkX) > 5 || Math.abs(walkY) > 5) {
                dragScrollRef.current.moved = true;
            }

            viewport.scrollLeft = dragScrollRef.current.scrollLeft - walkX;
            viewport.scrollTop = dragScrollRef.current.scrollTop - walkY;
        };

        const handleMouseUp = () => {
            if (!dragScrollRef.current.isDragging) return;
            dragScrollRef.current.isDragging = false;
            viewport.style.cursor = 'grab';
            viewport.style.removeProperty('user-select');
        };

        let lastWidth = window.innerWidth;
        const handleResize = () => {
            const activeTag = document.activeElement?.tagName;
            if (activeTag === 'INPUT' || activeTag === 'TEXTAREA') {
                return;
            }

            if (window.innerWidth !== lastWidth) {
                lastWidth = window.innerWidth;
                setScale(scaleStateRef.current.currentScale);
                initializeScale();
            }
        };

        window.addEventListener('load', initializeScale);
        window.addEventListener('resize', handleResize);
        viewport.addEventListener('wheel', handleWheel, { passive: false });
        viewport.addEventListener('touchstart', handleTouchStart, { passive: false });
        viewport.addEventListener('touchmove', handleTouchMove, { passive: false });
        
        // Mouse Events for Drag-to-Scroll
        viewport.addEventListener('mousedown', handleMouseDown);
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
        
        // Set initial cursor
        viewport.style.cursor = 'grab';

        return () => {
            clearTimeout(initTimer);
            window.removeEventListener('load', initializeScale);
            window.removeEventListener('resize', handleResize);
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
            if (viewport) {
                viewport.removeEventListener('wheel', handleWheel);
                viewport.removeEventListener('touchstart', handleTouchStart);
                viewport.removeEventListener('touchmove', handleTouchMove);
                viewport.removeEventListener('mousedown', handleMouseDown);
            }
        };

    }, [initializeScale, setScale, selectedTurma, selectedLayout]);

    const handleEnterDemoMode = useCallback(() => {
        if (!selectedTurma) {
            showNotification('Selecione uma turma antes de entrar no modo de demonstração.', 'error');
            return;
        }
        isDemoModeRef.current = true;

        const firstNames = ["João", "Maria", "Pedro", "Ana", "Carlos", "Fernanda", "Lucas", "Juliana", "Marcos", "Beatriz", "Rafael", "Camila", "Gustavo", "Larissa", "Bruno"];
        const lastNames = ["Silva", "Santos", "Oliveira", "Souza", "Rodrigues", "Ferreira", "Alves", "Pereira", "Lima", "Gomes", "Costa", "Ribeiro", "Martins"];

        const generateName = () => {
            const first = firstNames[Math.floor(Math.random() * firstNames.length)];
            const last = lastNames[Math.floor(Math.random() * lastNames.length)];
            return `${first} ${last}`;
        };

        const mockEmployees: Employee[] = Array.from({ length: 45 }).map((_, i) => {
            const isPresent = Math.random() > 0.3;
            const isBem = isPresent && Math.random() > 0.1;
            const isMal = isPresent && !isBem;
            const isAbsent = !isPresent;

            return {
                id: `demo-${i}`,
                name: generateName(),
                matricula: `${1000 + i}`,
                assDss: isBem,
                bem: isBem,
                mal: isMal,
                ausente: isAbsent,
                time: isPresent ? formatTimestamp(Timestamp.now()) : null,
                turno: i < 35 ? '7H' : '6H'
            };
        }).sort((a, b) => a.name.localeCompare(b.name));

        const mockAdmins: Administrator[] = [
            { id: 'admin1', name: 'Admin Demo User', matricula: '9999', email: 'admin@demo.com' }
        ];

        setEmployees(mockEmployees);
        setAdministrators(mockAdmins);
        setIsDemoMode(true);
        setIsAdmin(true);
        setActiveModal(ModalType.None);
        setLoading(false);
        showNotification('Modo de Demonstração Ativado! Dados fictícios carregados.', 'success');
    }, [selectedTurma, showNotification]);

    const processStatusUpdate = useCallback(async (id: string, type: StatusType) => {
        if (!selectedTurma) return;

        const employee = employeesRef.current.find(e => e.id === id);
        if (!employee) return;

        const isChecking = !(employee as any)[type];

        if (!isChecking && !isAdminRef.current) {
            showNotification('Apenas administradores podem desmarcar esta opção.', 'error');
            return;
        }

        const updatedData: { [key: string]: any } = {};

        if (type === 'ausente') {
            updatedData.ausente = isChecking;
            if (isChecking) {
                updatedData.assDss = false;
                updatedData.bem = false;
                updatedData.mal = false;
            }
        } else {
            if (isChecking) {
                updatedData.ausente = false;
            }

            if (type === 'assDss') {
                updatedData.assDss = isChecking;
            } else if (type === 'bem') {
                updatedData.bem = isChecking;
                if (isChecking) {
                    updatedData.assDss = true;
                    updatedData.mal = false;
                }
            } else if (type === 'mal') {
                updatedData.mal = isChecking;
                if (isChecking) {
                    updatedData.bem = false;
                    sendAlertEmail(employee.name, employee.matricula, employee.turno);
                }
            }
        }

        if (isDemoMode) {
            const finalStates = {
                ausente: updatedData.ausente !== undefined ? updatedData.ausente : employee.ausente,
                assDss: updatedData.assDss !== undefined ? updatedData.assDss : employee.assDss,
                bem: updatedData.bem !== undefined ? updatedData.bem : employee.bem,
                mal: updatedData.mal !== undefined ? updatedData.mal : employee.mal,
            };

            let newTime = employee.time;
            if (finalStates.ausente) {
                newTime = null;
            } else if (finalStates.assDss) {
                if (!newTime) {
                    const date = new Date();
                    newTime = `${date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })} ${date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
                }
            } else {
                newTime = null;
            }

            setEmployees(prev => prev.map(e => e.id === id ? { ...e, ...updatedData, time: newTime } : e));
            return;
        }

        if (!db) {
            showNotification("A conexão com o banco de dados não está disponível.", "error");
            return;
        }

        // Verificar estabilidade da internet ANTES de gravar no banco
        // (feito APÓS o guard isDemoMode para não bloquear o modo demonstração)
        const isStable = await isInternetFastAndStable();
        if (!isStable) {
            setActiveModal(ModalType.ConnectionError);
            return;
        }

        try {
            const finalStates = {
                ausente: updatedData.ausente !== undefined ? updatedData.ausente : employee.ausente,
                assDss: updatedData.assDss !== undefined ? updatedData.assDss : employee.assDss,
                bem: updatedData.bem !== undefined ? updatedData.bem : employee.bem,
                mal: updatedData.mal !== undefined ? updatedData.mal : employee.mal,
            };

            if (finalStates.ausente) {
                updatedData.time = null;
            } else if (finalStates.assDss) {
                if (!employee.time) {
                    updatedData.time = serverTimestamp();
                }
            } else {
                updatedData.time = null;
            }
            const collectionName = getTurmaCollectionName(selectedTurma);
            const docRef = doc(db, collectionName, id);
            await updateDoc(docRef, updatedData);
            logAuditEvent(adminEmailRef.current, 'ALTERAÇÃO DE STATUS', `Funcionário: ${employee.name} | Alteração: ${type} → ${isChecking ? 'marcado' : 'desmarcado'}`, selectedTurma);
        } catch (error) {
            console.error("Error updating status:", error);
            const message = error instanceof Error ? error.message : 'Ocorreu um erro desconhecido.';
            showNotification(`Falha ao atualizar status: ${message}`, 'error');
        }
    }, [selectedTurma, showNotification, isDemoMode, sendAlertEmail]);

    const handleTimeUpdate = useCallback(async (id: string, newDate: Date | null) => {
        if (!isAdminRef.current) {
            showNotification('Apenas administradores podem editar o horário.', 'error');
            return;
        }

        if (isDemoMode) {
            const newTimeStr = newDate ? `${newDate.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })} ${newDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : null;
            setEmployees(prev => prev.map(e => e.id === id ? { ...e, time: newTimeStr } : e));
            showNotification('Horário atualizado com sucesso (DEMO)!', 'success');
            return;
        }

        if (!db || !selectedTurma) {
            showNotification("A conexão com o banco de dados não está disponível.", "error");
            return;
        }

        try {
            const collectionName = getTurmaCollectionName(selectedTurma);
            const docRef = doc(db, collectionName, id);
            await updateDoc(docRef, {
                time: newDate ? Timestamp.fromDate(newDate) : null
            });
            showNotification('Horário atualizado com sucesso!', 'success');
            const emp = employeesRef.current.find(e => e.id === id);
            logAuditEvent(adminEmailRef.current, 'EDIÇÃO DE HORÁRIO', `Funcionário: ${emp?.name || id} | Novo horário: ${newDate ? newDate.toLocaleString('pt-BR') : 'Vazio'}`, selectedTurma);
        } catch (error) {
            console.error("Error updating time:", error);
            const message = error instanceof Error ? error.message : 'Ocorreu um erro desconhecido.';
            showNotification(`Falha ao atualizar horário: ${message}`, 'error');
        }
    }, [isAdminRef, isDemoMode, selectedTurma, showNotification]);

    const handleMatriculaUpdate = useCallback(async (id: string, newMatricula: string) => {
        if (!isAdminRef.current) {
            showNotification('Apenas administradores podem editar a matrícula.', 'error');
            return;
        }

        if (isDemoMode) {
            setEmployees(prev => prev.map(e => e.id === id ? { ...e, matricula: newMatricula } : e));
            showNotification('Matrícula atualizada com sucesso (DEMO)!', 'success');
            return;
        }

        if (!db || !selectedTurma) {
            showNotification("A conexão com o banco de dados não está disponível.", "error");
            return;
        }

        try {
            const collectionName = getTurmaCollectionName(selectedTurma);

            // Check for duplicates
            const q = query(collection(db, collectionName), where("matricula", "==", newMatricula));
            const querySnapshot = await getDocs(q);
            if (!querySnapshot.empty && querySnapshot.docs[0].id !== id) {
                showNotification('Esta matrícula já está em uso por outro funcionário.', 'error');
                return;
            }

            const docRef = doc(db, collectionName, id);
            await updateDoc(docRef, {
                matricula: newMatricula
            });
            showNotification('Matrícula atualizada com sucesso!', 'success');
            const emp = employeesRef.current.find(e => e.id === id);
            logAuditEvent(adminEmailRef.current, 'EDIÇÃO DE MATRÍCULA', `Funcionário: ${emp?.name || id} | Nova matrícula: ${newMatricula}`, selectedTurma);
        } catch (error) {
            console.error("Error updating matricula:", error);
            const message = error instanceof Error ? error.message : 'Ocorreu um erro desconhecido.';
            showNotification(`Falha ao atualizar matrícula: ${message}`, 'error');
        }
    }, [isAdminRef, isDemoMode, selectedTurma, showNotification]);

    const checkDssRaffle = useCallback((id: string, type: StatusType) => {
        if (!isSorteioActiveRef.current) return false;

        const employee = employeesRef.current.find(e => e.id === id);
        if (!employee) return false;

        const isSpecial = employee.turno === '6H';
        const currentSubject = isSpecial ? lastDbSpecialSubject.current : lastDbMainSubject.current;

        if (currentSubject) return false; // Tema já preenchido

        const drawnList = isSpecial ? drawn6HRef.current : drawn7HRef.current;
        
        // Check se o usuário já foi sorteado
        if (drawnList.includes(id)) {
            // Verifica se todos já foram sorteados para resetar o ciclo
            const activeShiftEmployees = employeesRef.current.filter(e => (e.turno === '6H') === isSpecial && !e.ausente);
            const activeIds = activeShiftEmployees.map(e => e.id);
            const allDrawn = activeIds.length > 0 && activeIds.every(eid => drawnList.includes(eid));
            
            if (allDrawn) {
                // Reseta localmente
                if (isSpecial) drawn6HRef.current = [];
                else drawn7HRef.current = [];
            } else {
                return false;
            }
        }

        // Chance de 60% de solicitar matrícula de registro da DSS
        if (Math.random() < 0.6) {
            pendingRaffleTypeRef.current = type;
            setPendingRaffleId(id);
            setActiveModal(ModalType.DssRaffle);
            return true;
        }

        return false;
    }, []);

    const handleStatusChange = useCallback((id: string, type: StatusType) => {
        const employee = employeesRef.current.find(e => e.id === id);
        if (!employee) return;

        const isChecking = !(employee as any)[type];

        if (isSignaturePasswordActive && !isAdminRef.current) {
            if (type === 'assDss' && isChecking) {
                setPendingEmployeeId(id);
                setActiveModal(ModalType.SignaturePassword);
                return;
            }

            if (type === 'bem' && isChecking && !employee.assDss) {
                showNotification('Clique em ASS. DSS primeiro', 'error');
                return;
            }
        }

        if (type === 'mal' && isChecking) {
            if (!isAdminRef.current && employee.bem) {
                showNotification('Não é possível marcar "Estou mal" após ter marcado "Estou Bem"', 'error');
                return;
            }
            setPendingEmployeeId(id);
            setActiveModal(ModalType.ConfirmMal);
            return;
        }

        if (type === 'ausente' && isChecking) {
            setPendingEmployeeId(id);
            setActiveModal(ModalType.ConfirmAusente);
            return;
        }

        if ((type === 'assDss' || type === 'bem') && isChecking && !isAdminRef.current) {
            if (checkDssRaffle(id, type)) {
                return; // Raffle assumiu o fluxo
            }
        }

        processStatusUpdate(id, type);
    }, [processStatusUpdate, isSignaturePasswordActive, checkDssRaffle, showNotification]);

    const handleConfirmMal = useCallback(() => {
        if (pendingEmployeeId) {
            processStatusUpdate(pendingEmployeeId, 'mal');
            setPendingEmployeeId(null);
            setActiveModal(ModalType.None);
        }
    }, [pendingEmployeeId, processStatusUpdate]);

    const handleConfirmAusente = useCallback(() => {
        if (pendingEmployeeId) {
            processStatusUpdate(pendingEmployeeId, 'ausente');
            setPendingEmployeeId(null);
            setActiveModal(ModalType.None);
        }
    }, [pendingEmployeeId, processStatusUpdate]);

    const handleConfirmSignaturePassword = useCallback(async (password: string) => {
        if (!pendingEmployeeId || !selectedTurma) return;
        
        const employee = employeesRef.current.find(e => e.id === pendingEmployeeId);
        if (!employee) return;
        
        const correctPassword = employee.senha || employee.matricula;
        
        if (password === correctPassword) {
            if (!isAdminRef.current && checkDssRaffle(pendingEmployeeId, 'assDss')) {
                // Raffle assumiu o fluxo. Limpa pendingEmployeeId para evitar
                // conflito de estado entre SignaturePassword e DssRaffle.
                setPendingEmployeeId(null);
                setActiveModal(ModalType.DssRaffle); // garantia de modal ativo
                return;
            }
            
            processStatusUpdate(pendingEmployeeId, 'assDss');
            setPendingEmployeeId(null);
            setActiveModal(ModalType.None);
            showNotification('Assinatura DSS confirmada com sucesso!', 'success');
        } else {
            showNotification('Senha incorreta. Tente novamente.', 'error');
        }
    }, [pendingEmployeeId, processStatusUpdate, selectedTurma, showNotification, checkDssRaffle]);

    const handleManualRegister = useCallback(async (turno: '7H' | '6H', matricula: string, rawSubject: string): Promise<boolean> => {
        if (!selectedTurma || !db) return false;

        const subject = rawSubject ? rawSubject.toUpperCase() : '';

        if (!matricula) {
            showNotification('Por favor, insira uma matrícula.', 'error');
            return false;
        }

        if (matricula.length !== 8) {
            setActiveModal(ModalType.InvalidMatricula);
            return false;
        }

        let resolvedName = '';
        let actualMatricula = matricula;
        
        const currentEmp = employeesRef.current.find(e => (isSignaturePasswordActive && e.senha === matricula) || e.matricula === matricula);
        if (currentEmp) {
            resolvedName = currentEmp.name;
            actualMatricula = currentEmp.matricula;
        } else {
            const adminQ = query(collection(db, 'administrators'), where('matricula', '==', matricula), limit(1));
            const adminSnap = await getDocs(adminQ);
            if (!adminSnap.empty) {
                resolvedName = adminSnap.docs[0].data().name;
            } else {
                for (const t of ALL_TURMAS) {
                    if (t === selectedTurma) continue;
                    const q = query(collection(db, getTurmaCollectionName(t)), where("matricula", "==", matricula), limit(1));
                    const snap = await getDocs(q);
                    if (!snap.empty) {
                        resolvedName = snap.docs[0].data().name;
                        break;
                    }
                }
            }
        }

        if (isDemoMode) {
            showNotification(`Registro para turno ${turno} salvo com sucesso (DEMO).`, 'success');
            return true;
        }

        if (!db) {
            showNotification("A conexão com o banco de dados não está disponível.", "error");
            return false;
        }

        const registrationCollectionName = getTurmaRegistrationName(selectedTurma);
        const docId = `registro_${turno}`; // Creates a predictable ID like "registro_7H" or "registro_6H"
        const docRef = doc(db, registrationCollectionName, docId);

        const currentHorario = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

        const registrationData = {
            matricula: actualMatricula,
            name: resolvedName,
            assunto: subject || 'Não preenchido',
            TURNO: turno, // Explicitly using the '7H' or '6H' parameter
            horario: currentHorario,
        };

        try {
            // setDoc will create the document if it doesn't exist, or completely overwrite it if it does.
            // This simplifies the logic from query/update/add to a single operation.
            await setDoc(docRef, registrationData);

            showNotification(`Registro para turno ${turno} salvo com sucesso.`, 'success');
            logAuditEvent(adminEmailRef.current, 'REGISTRO MANUAL', `Registro manual salvo | Turno: ${turno} | Matrícula: ${matricula} | Assunto: ${subject || 'Não preenchido'}`, selectedTurma);
            return true;
        } catch (error) {
            console.error("Error saving manual registration:", error);
            const message = error instanceof Error ? error.message : 'Ocorreu um erro desconhecido.';
            showNotification(`Falha ao salvar registro: ${message}`, 'error');
            return false;
        }
    }, [selectedTurma, isDemoMode, isSignaturePasswordActive, showNotification, db]);

    const handleDssRaffleCancel = useCallback(() => {
        if (pendingRaffleId) {
            // Se ele cancela, apenas libera a marcação normalmente, conforme o req "não é obrigatório".
            processStatusUpdate(pendingRaffleId, pendingRaffleTypeRef.current);
            setPendingRaffleId(null);
            setPendingEmployeeId(null);
            setActiveModal(ModalType.None);
        }
    }, [pendingRaffleId, processStatusUpdate]);

    const handleDssRaffleSubmit = useCallback(async (subject: string, inspectorMatricula: string) => {
        if (!pendingRaffleId || !selectedTurma) return;

        const employee = employeesRef.current.find(e => e.id === pendingRaffleId);
        if (!employee) return;

        const isSpecial = employee.turno === '6H';
        const shift = isSpecial ? '6H' : '7H';

        if (!db) {
            showNotification('A conexão com o banco de dados não está disponível.', 'error');
            return;
        }

        try {
            // 1. Atualizar config_dss_raffle
            const newDrawn = isSpecial ? [...drawn6HRef.current, employee.id] : [...drawn7HRef.current, employee.id];
            if (isSpecial) drawn6HRef.current = newDrawn;
            else drawn7HRef.current = newDrawn;

            const docRef = doc(db, getTurmaRegistrationName(selectedTurma), 'config_dss_raffle');
            await setDoc(docRef, {
                drawn7H: drawn7HRef.current,
                drawn6H: drawn6HRef.current
            }, { merge: true });

            // 2. Preencher assunto e matricula
            const success = await handleManualRegister(shift, inspectorMatricula, subject);
            
            if (!success) return; // Se falhou (ex: matrícula inválida), não prossegue nem fecha o modal

            // 3. Processar a marcação com o tipo original (assDss ou bem)
            processStatusUpdate(pendingRaffleId, pendingRaffleTypeRef.current);
            
            setPendingRaffleId(null);
            setPendingEmployeeId(null);
            setActiveModal(ModalType.None);
            
            showNotification('Tema da DSS registrado! Obrigado!', 'success');
        } catch (err) {
            console.error('Erro ao salvar raffle:', err);
            showNotification('Erro ao salvar informações.', 'error');
        }
    }, [pendingRaffleId, selectedTurma, handleManualRegister, processStatusUpdate, showNotification]);

    const handleChangeSignaturePassword = useCallback(async (
        currentPassword: string, 
        newPassword: string
    ) => {
        if (!pendingEmployeeId || !selectedTurma) return false;
        
        const employee = employeesRef.current.find(e => e.id === pendingEmployeeId);
        if (!employee) return false;
        
        const correctPassword = employee.senha || employee.matricula;
        
        if (currentPassword !== correctPassword) {
            showNotification('Senha atual incorreta.', 'error');
            return false;
        }

        if (isDemoMode) {
            // No modo DEMO, atualiza apenas localmente
            setEmployees(prev => prev.map(e => 
                e.id === pendingEmployeeId ? { ...e, senha: newPassword } : e
            ));
            showNotification('Senha alterada com sucesso (DEMO)!', 'success');
            return true;
        }

        if (!db) {
            showNotification("A conexão com o banco de dados não está disponível.", "error");
            return false;
        }
        
        try {
            const collectionName = getTurmaCollectionName(selectedTurma);
            const docRef = doc(db, collectionName, pendingEmployeeId);
            await updateDoc(docRef, { senha: newPassword });
            showNotification('Senha alterada com sucesso!', 'success');
            return true;
        } catch (error) {
            showNotification('Erro ao alterar a senha.', 'error');
            return false;
        }
    }, [pendingEmployeeId, isDemoMode, selectedTurma, showNotification]);

    const processToggleSpecialTeam = useCallback(async (id: string) => {
        if (!selectedTurma) return;
        setTogglingSpecialTeamId(id);
        const employee = employeesRef.current.find(e => e.id === id);
        if (!employee) {
            setTogglingSpecialTeamId(null);
            return;
        }
        const newTurno = employee.turno === '6H' ? '7H' : '6H';
        const displayTurno = employee.turno === '6H' ? getMainShiftLabel(selectedTurma) : getShiftLabel(selectedTurma);

        if (isDemoMode) {
            setTimeout(() => {
                setEmployees(prev => prev.map(e => e.id === id ? { ...e, turno: newTurno } : e));
                showNotification(`${employee.name} foi movido para o turno ${displayTurno} (DEMO).`, 'success');
                setTogglingSpecialTeamId(null);
            }, 500);
            return;
        }

        if (!db) {
            showNotification("A conexão com o banco de dados não está disponível.", "error");
            return;
        }

        try {
            const collectionName = getTurmaCollectionName(selectedTurma);
            const docRef = doc(db, collectionName, id);
            await updateDoc(docRef, {
                turno: newTurno
            });
            showNotification(`${employee.name} foi movido para o turno ${displayTurno}.`, 'success');
            logAuditEvent(adminEmailRef.current, 'ALTERAÇÃO DE TURNO', `Funcionário: ${employee.name} | Novo turno: ${displayTurno}`, selectedTurma);
        } catch (error) {
            console.error("Failed to toggle special team status:", error);
            const message = error instanceof Error ? error.message : 'Ocorreu um erro desconhecido.';
            showNotification(`Falha ao atualizar status: ${message}`, 'error');
        } finally {
            setTogglingSpecialTeamId(null);
        }
    }, [selectedTurma, isDemoMode, showNotification]);

    const handleToggleSpecialTeam = useCallback((id: string) => {
        setPendingEmployeeId(id);
        setActiveModal(ModalType.ConfirmTurno);
    }, []);

    const handleConfirmTurno = useCallback(() => {
        if (pendingEmployeeId) {
            processToggleSpecialTeam(pendingEmployeeId);
            setPendingEmployeeId(null);
            setActiveModal(ModalType.None);
        }
    }, [pendingEmployeeId, processToggleSpecialTeam]);

    const processDeleteUser = useCallback(async (employeeId: string) => {
        if (!selectedTurma) return;
        const employeeToDelete = employeesRef.current.find(e => e.id === employeeId);
        if (!employeeToDelete) return;

        if (isDemoMode) {
            setEmployees(prev => prev.filter(e => e.id !== employeeId));
            showNotification(`Usuário ${employeeToDelete.name} deletado com sucesso (DEMO)!`, 'success');
            return;
        }
        if (!db) {
            showNotification("A conexão com o banco de dados não está disponível.", "error");
            return;
        }
        try {
            const collectionName = getTurmaCollectionName(selectedTurma);
            const docRef = doc(db, collectionName, employeeId);
            await deleteDoc(docRef);
            showNotification(`Usuário ${employeeToDelete.name} deletado com sucesso!`, 'success');
            logAuditEvent(adminEmailRef.current, 'EXCLUSÃO DE USUÁRIO', `Funcionário deletado: ${employeeToDelete.name} (Matrícula: ${employeeToDelete.matricula})`, selectedTurma);
        } catch (error) {
            console.error("Error deleting user:", error);
            const message = error instanceof Error ? error.message : 'Ocorreu um erro desconhecido.';
            showNotification(`Falha ao deletar: ${message}`, 'error');
        }
    }, [selectedTurma, isDemoMode, showNotification]);

    const handleDeleteUser = useCallback((employeeId: string) => {
        if (!isAdminRef.current) {
            showNotification('Apenas administradores podem deletar usuários.', 'error');
            return;
        }
        const employeeToDelete = employeesRef.current.find(e => e.id === employeeId);
        if (!employeeToDelete) {
            showNotification('Usuário não encontrado.', 'error');
            return;
        }

        setPendingEmployeeId(employeeId);
        setActiveModal(ModalType.ConfirmDelete);
    }, [showNotification]);

    const handleConfirmDelete = useCallback(() => {
        if (pendingEmployeeId) {
            processDeleteUser(pendingEmployeeId);
            setPendingEmployeeId(null);
            setActiveModal(ModalType.None);
        }
    }, [pendingEmployeeId, processDeleteUser]);

    const processToggle6HState = useCallback(async (active: boolean) => {
        if (!selectedTurma) return;

        if (isDemoMode) {
            if (!active) {
                // Ao desativar, move todos do 6H pro 7H
                setEmployees(prev => prev.map(e => e.turno === '6H' ? { ...e, turno: '7H' } : e));
            }
            setIs6HActive(active);
            showNotification(active ? 'Turno 6H Ativado (DEMO)' : 'Turno 6H Desativado e funcionários movidos para 7H (DEMO)', 'success');
            return;
        }

        if (!db) {
            showNotification("A conexão com o banco de dados não está disponível.", "error");
            return;
        }

        try {
            const batch = writeBatch(db);

            if (!active) {
                // Move everyone to 7H
                const collectionName = getTurmaCollectionName(selectedTurma);
                const employeesSnap = await getDocs(query(collection(db, collectionName), where("turno", "==", "6H")));
                employeesSnap.forEach(doc => {
                    batch.update(doc.ref, { turno: '7H' });
                });
            }

            // Save settings explicitly in the registration collection as config_6H
            const docRef = doc(db, getTurmaRegistrationName(selectedTurma), 'config_6H');
            batch.set(docRef, { ativado: active }, { merge: true });

            await batch.commit();

            const label = getShiftLabel(selectedTurma);
            showNotification(active ? `Turno ${label} Ativado com sucesso!` : `Turno ${label} Desativado. Todos os funcionários foram movidos para 7H.`, 'success');
            logAuditEvent(adminEmailRef.current, 'ALTERAÇÃO DE COLUNA 6H', `Turno ${label}: ${active ? 'Ativado' : 'Desativado'}`, selectedTurma);
        } catch (error) {
            console.error("Error toggling 6H state:", error);
            const message = error instanceof Error ? error.message : 'Ocorreu um erro desconhecido.';
            showNotification(`Falha ao alterar estado do turno: ${message}`, 'error');
        }
    }, [selectedTurma, isDemoMode, showNotification]);

    const handleToggle6H = useCallback(() => {
        if (!isAdminRef.current || !selectedTurma) {
            showNotification('Apenas administradores podem alterar as opções do turno.', 'error');
            return;
        }
        
        if (is6HActive) {
            setActiveModal(ModalType.ConfirmDeactivate6H);
        } else {
            // Reativar direto
            processToggle6HState(true);
        }
    }, [is6HActive, selectedTurma, showNotification, processToggle6HState]);

    const handleConfirmDeactivate6H = useCallback(() => {
        processToggle6HState(false);
        setActiveModal(ModalType.None);
    }, [processToggle6HState]);

    const handleToggleSignaturePassword = useCallback(async () => {
        if (!isAdminRef.current || !selectedTurma) {
            showNotification('Apenas administradores podem alterar esta configuração.', 'error');
            return;
        }

        const newActive = !isSignaturePasswordActive;

        if (isDemoMode) {
            setIsSignaturePasswordActive(newActive);
            showNotification(newActive ? 'Senha de assinatura ativada (DEMO).' : 'Senha de assinatura desativada (DEMO).', 'success');
            return;
        }

        if (!db) {
            showNotification("A conexão com o banco de dados não está disponível.", "error");
            return;
        }

        try {
            const docRef = doc(db, getTurmaRegistrationName(selectedTurma), 'config_senha_assinatura');
            await setDoc(docRef, { ativado: newActive }, { merge: true });
            showNotification(newActive ? 'Senha de assinatura ATIVADA para esta turma.' : 'Senha de assinatura DESATIVADA para esta turma.', 'success');
            logAuditEvent(adminEmailRef.current, 'ALTERAÇÃO SENHA ASSINATURA', `Senha de assinatura: ${newActive ? 'Ativada' : 'Desativada'}`, selectedTurma);
        } catch (error) {
            console.error("Error toggling signature password:", error);
            showNotification('Falha ao alterar configuração de senha.', 'error');
        }
    }, [isSignaturePasswordActive, selectedTurma, isDemoMode, showNotification]);

    const handleToggleSorteio = useCallback(async () => {
        if (adminNivel !== '2' || !selectedTurma) {
            showNotification('Apenas Master Admins (Nível 2) podem alterar esta configuração.', 'error');
            return;
        }

        const newActive = !isSorteioActive;

        if (isDemoMode) {
            setIsSorteioActive(newActive);
            showNotification(newActive ? 'Sorteio da DSS ativado (DEMO).' : 'Sorteio da DSS desativado (DEMO).', 'success');
            return;
        }

        if (!db) return;

        try {
            const docRef = doc(db, getTurmaRegistrationName(selectedTurma), 'config_sorteio');
            await setDoc(docRef, { ativado: newActive }, { merge: true });
            showNotification(newActive ? 'Sorteio da DSS ATIVADO para esta turma.' : 'Sorteio da DSS DESATIVADO para esta turma.', 'success');
            logAuditEvent(adminEmailRef.current, 'ALTERAÇÃO SORTEIO DSS', `Sorteio da DSS: ${newActive ? 'Ativado' : 'Desativado'}`, selectedTurma);
        } catch (error) {
            console.error("Error toggling sorteio:", error);
            showNotification('Falha ao alterar configuração de sorteio.', 'error');
        }
    }, [isSorteioActive, selectedTurma, isDemoMode, showNotification, adminNivel]);

    const handleTogglePularTelas = useCallback(async () => {
        if (adminNivel !== '2' || !selectedTurma) {
            showNotification('Apenas Master Admins (Nível 2) podem alterar esta configuração.', 'error');
            return;
        }

        const newActive = !isPularTelasActive;

        if (isDemoMode) {
            setIsPularTelasActive(newActive);
            showNotification(newActive ? 'Pular Telas Iniciais ATIVADO (DEMO).' : 'Pular Telas Iniciais DESATIVADO (DEMO).', 'success');
            return;
        }

        if (!db) {
            showNotification('A conexão com o banco de dados não está disponível.', 'error');
            return;
        }

        try {
            const docRef = doc(db, getTurmaRegistrationName(selectedTurma), 'config_pular_telas');
            await setDoc(docRef, { ativado: newActive }, { merge: true });
            showNotification(newActive ? 'Pular Telas Iniciais ATIVADO para esta turma.' : 'Pular Telas Iniciais DESATIVADO para esta turma.', 'success');
            logAuditEvent(adminEmailRef.current, 'ALTERAÇÃO PULAR TELAS', `Pular Telas: ${newActive ? 'Ativado' : 'Desativado'}`, selectedTurma);
        } catch (error) {
            console.error("Error toggling pular telas:", error);
            showNotification('Falha ao alterar configuração de pular telas.', 'error');
        }
    }, [isPularTelasActive, selectedTurma, isDemoMode, showNotification, adminNivel]);

    const handleToggleAdminOnlyTheme = useCallback(async () => {
        if (!isAdminRef.current || !selectedTurma) {
            showNotification('Apenas administradores podem alterar esta configuração.', 'error');
            return;
        }

        const newActive = !isAdminOnlyTheme;

        if (isDemoMode) {
            setIsAdminOnlyTheme(newActive);
            showNotification(newActive ? 'Tema DSS bloqueado para administradores (DEMO).' : 'Tema DSS liberado para todos (DEMO).', 'success');
            return;
        }

        if (!db) {
            showNotification("A conexão com o banco de dados não está disponível.", "error");
            return;
        }

        try {
            const docRef = doc(db, getTurmaRegistrationName(selectedTurma), 'config_tema_admin');
            await setDoc(docRef, { ativado: newActive }, { merge: true });
            showNotification(newActive ? 'Tema DSS BLOQUEADO (Somente Administradores).' : 'Tema DSS LIBERADO (Todos podem preencher).', 'success');
            logAuditEvent(adminEmailRef.current, 'ALTERAÇÃO BLOQUEIO TEMA DSS', `Bloqueio de Tema DSS: ${newActive ? 'Ativado' : 'Desativado'}`, selectedTurma);
        } catch (error) {
            console.error("Error toggling admin only theme:", error);
            showNotification('Falha ao alterar configuração do Tema DSS.', 'error');
        }
    }, [isAdminOnlyTheme, selectedTurma, isDemoMode, showNotification]);

    const handleAdminLogin = async (inputStr: string, isBiometric = false) => {
        const normalizedInput = inputStr.trim();
        const normalizedEmailInput = normalizedInput.toLowerCase();

        const isFirstAdminLogin = !localStorage.getItem('hasSeenAdminTutorial');

        const processLogin = async (loggedEmail: string, isDemo = false) => {
            setIsAdmin(true);
            setAdminEmail(loggedEmail);
            
            const storageKey = `hasSeenNotice_${loggedEmail}`;
            const lastSeenStr = localStorage.getItem(storageKey);
            let hasSeenUpdate = false;
            
            if (lastSeenStr) {
                const lastSeenTime = parseInt(lastSeenStr, 10);
                // Verifica se passou menos de 24 horas
                if (Date.now() - lastSeenTime < 24 * 60 * 60 * 1000) {
                    hasSeenUpdate = true;
                }
            }

            if (!hasSeenUpdate) {
                setActiveModal(ModalType.AdminUpdateNotice);
            } else {
                // Sugere registro biométrico se estiver no celular e biometria ainda não estiver cadastrada
                const isCell = await isMobileCellularWithBiometrics();
                const alreadyRegistered = hasRegisteredBiometrics();
                if (isCell && !alreadyRegistered && !isDemo) {
                    setActiveModal(ModalType.BiometricEnrollment);
                } else {
                    setActiveModal(ModalType.AdminOptions);
                }
            }
            
            showNotification(isDemo ? 'Acesso Admin (DEMO) concedido.' : 'Login de administrador bem-sucedido!', 'success');

            if (!isDemo) {
                logAuditEvent(loggedEmail, 'LOGIN', `Admin logou no sistema`, selectedTurma);
            }

            if (isFirstAdminLogin) {
                localStorage.setItem('hasSeenAdminTutorial', 'true');
                setIsAdminTutorialOpen(true);
            }
        };

        if (isDemoMode) {
            await processLogin(normalizedEmailInput, true);
            return;
        }

        if (!db) {
            showNotification("A conexão com o banco de dados não está disponível.", "error");
            return;
        }
        if (!normalizedInput) {
            showNotification('Por favor, insira um e-mail ou senha.', 'error');
            return;
        }
        try {
            // 1. Tenta buscar pela senha exata
            const qSenha = query(collection(db, 'administrators'), where("senha", "==", normalizedInput));
            const snapshotSenha = await getDocs(qSenha);
            
            if (!snapshotSenha.empty) {
                const adminDoc = snapshotSenha.docs[0];
                const adminData = adminDoc.data();
                setAdminNivel(adminData.nivel || '1');
                await processLogin(adminData.email);
                return;
            }

            // 2. Tenta buscar pelo e-mail
            const qEmail = query(collection(db, 'administrators'), where("email", "==", normalizedEmailInput));
            const snapshotEmail = await getDocs(qEmail);
            
            if (!snapshotEmail.empty) {
                const adminDoc = snapshotEmail.docs[0];
                const adminData = adminDoc.data();
                
                // Se o admin JÁ TIVER uma senha, ele não pode logar usando só o e-mail
                // a não ser que esteja usando autenticação biométrica
                if (adminData.senha && !isBiometric) {
                    showNotification('Credenciais inválidas.', 'error');
                } else {
                    setAdminNivel(adminData.nivel || '1');
                    await processLogin(adminData.email);
                }
            } else {
                showNotification('Credenciais de administrador inválidas.', 'error');
            }
        } catch (error) {
            console.error("Admin login error:", error);
            const message = error instanceof Error ? error.message : 'Ocorreu um erro desconhecido.';
            showNotification(`Erro no login: ${message}`, 'error');
        }
    };

    const handleChangeAdminPassword = async (newPassword: string) => {
        if (!adminEmail || !db) return;
        
        try {
            const q = query(collection(db, 'administrators'), where("email", "==", adminEmail));
            const snapshot = await getDocs(q);
            
            if (!snapshot.empty) {
                const adminDoc = snapshot.docs[0];
                await updateDoc(adminDoc.ref, { senha: newPassword });
                
                if (hasRegisteredBiometrics()) {
                    clearBiometricData();
                }

                showNotification('Senha alterada com sucesso!', 'success');
                setActiveModal(ModalType.AdminOptions);
                logAuditEvent(adminEmail, 'ALTERAÇÃO DE SENHA', `Admin alterou a própria senha`, selectedTurma);
            } else {
                showNotification('Administrador não encontrado.', 'error');
            }
        } catch (error) {
            console.error("Erro ao alterar senha de admin:", error);
            showNotification('Falha ao alterar senha.', 'error');
        }
    };

    const handleAddAdministrator = async (name: string, email: string, matricula: string, nivel: string) => {
        if (!db || !adminEmail) return;
        try {
            const normalizedEmail = email.trim().toLowerCase();
            const normalizedMatricula = matricula.trim();

            const emailExists = administrators.some(a => (a.email || '').trim().toLowerCase() === normalizedEmail);
            if (emailExists) {
                showNotification('Já existe um administrador com este e-mail.', 'error');
                return;
            }

            const matriculaExists = administrators.some(a => (a.matricula || '').trim() === normalizedMatricula);
            if (matriculaExists) {
                showNotification('Já existe um administrador com esta matrícula.', 'error');
                return;
            }

            await addDoc(collection(db, 'administrators'), {
                name: name.trim(),
                email: normalizedEmail,
                matricula: normalizedMatricula,
                nivel,
                senha: normalizedEmail // Senha inicial é o próprio e-mail corporativo
            });
            showNotification('Administrador adicionado com sucesso!', 'success');
            logAuditEvent(adminEmail, 'NOVO ADMINISTRADOR', `Novo administrador adicionado: ${name} (Nível ${nivel})`, selectedTurma);
        } catch (error) {
            console.error("Erro ao adicionar administrador:", error);
            showNotification('Falha ao adicionar administrador.', 'error');
        }
    };

    const handleEditAdministrator = async (id: string, name: string, email: string, matricula: string, nivel: string) => {
        if (!db || !adminEmail) return;
        try {
            const normalizedEmail = email.trim().toLowerCase();
            const normalizedMatricula = matricula.trim();

            const emailExists = administrators.some(a => a.id !== id && (a.email || '').trim().toLowerCase() === normalizedEmail);
            if (emailExists) {
                showNotification('Já existe outro administrador com este e-mail.', 'error');
                return;
            }

            const matriculaExists = administrators.some(a => a.id !== id && (a.matricula || '').trim() === normalizedMatricula);
            if (matriculaExists) {
                showNotification('Já existe outro administrador com esta matrícula.', 'error');
                return;
            }

            const adminDocRef = doc(db, 'administrators', id);
            await updateDoc(adminDocRef, {
                name: name.trim(),
                email: normalizedEmail,
                matricula: normalizedMatricula,
                nivel
            });
            showNotification('Administrador atualizado com sucesso!', 'success');
            logAuditEvent(adminEmail, 'EDIÇÃO DE ADMINISTRADOR', `Administrador atualizado: ${name} (Nível ${nivel})`, selectedTurma);
        } catch (error) {
            console.error("Erro ao atualizar administrador:", error);
            showNotification('Falha ao atualizar administrador.', 'error');
        }
    };

    const handleDeleteAdministrator = async (id: string, name?: string, matricula?: string) => {
        if (!db || !adminEmail) return;
        try {
            const adminDocRef = doc(db, 'administrators', id);
            await deleteDoc(adminDocRef);
            showNotification('Administrador removido com sucesso!', 'success');
            logAuditEvent(adminEmail, 'EXCLUSÃO DE ADMINISTRADOR', `Administrador removido: ${name || 'Desconhecido'} (Mat: ${matricula || 'N/A'})`, selectedTurma);
        } catch (error) {
            console.error("Erro ao deletar administrador:", error);
            showNotification('Falha ao remover administrador.', 'error');
        }
    };

    const handleAddUser = async (name: string, matricula: string, addAnother: boolean) => {
        if (!isAdmin || !selectedTurma) {
            showNotification('Apenas administradores podem adicionar usuários.', 'error');
            return;
        }

        if (!name.trim() || !matricula.trim()) {
            showNotification('Nome e matrícula são obrigatórios.', 'error');
            return;
        }

        const finalName = name.toUpperCase();

        if (isDemoMode) {
            const newUser: Employee = {
                id: `demo-new-${Date.now()}`,
                name: finalName,
                matricula,
                assDss: false,
                bem: false,
                mal: false,
                ausente: false,
                time: null,
                turno: '7H',
                senha: matricula
            };
            setEmployees(prev => [...prev, newUser].sort((a, b) => a.name.localeCompare(b.name)));
            if (!addAnother) {
                setActiveModal(ModalType.None);
            }
            showNotification(`Usuário ${finalName} adicionado com sucesso (DEMO)!`, 'success');
            return;
        }

        if (!db) {
            showNotification("A conexão com o banco de dados não está disponível.", "error");
            return;
        }

        try {
            // Check in CURRENT turma
            const isDuplicateInCurrent = employees.some(e => e.matricula === matricula);
            if (isDuplicateInCurrent) {
                showNotification(`Este usuário ou matrícula já está cadastrado nesta mesma turma!`, 'error');
                return;
            }

            // Cross-turma duplicate check
            const turmasToCheck = ALL_TURMAS.filter(t => t !== selectedTurma);
            for (const turma of turmasToCheck) {
                const collectionName = getTurmaCollectionName(turma);
                const collRef = collection(db, collectionName);

                const matriculaQuery = query(collRef, where("matricula", "==", matricula));
                const matriculaSnapshot = await getDocs(matriculaQuery);

                const foundDoc = matriculaSnapshot.docs[0];

                if (foundDoc) {
                    setExistingUserInfo({ name: foundDoc.data().name, turma: TURMA_DISPLAY_NAMES[turma] || turma });
                    setActiveModal(ModalType.UserExistsWarning);
                    return; // Stop execution
                }
            }

            // If no duplicate is found, proceed to add the user
            const collectionName = getTurmaCollectionName(selectedTurma);
            await addDoc(collection(db, collectionName), {
                name: finalName,
                matricula,
                assDss: false,
                bem: false,
                mal: false,
                ausente: false,
                time: null,
                turno: '7H',
                senha: matricula
            });

            if (!addAnother) {
                setActiveModal(ModalType.None);
            }
            showNotification(`Usuário ${finalName} adicionado com sucesso!`, 'success');
            logAuditEvent(adminEmail, 'NOVO USUÁRIO', `Novo funcionário: ${finalName} (Matrícula: ${matricula}) na Turma ${TURMA_DISPLAY_NAMES[selectedTurma]}`, selectedTurma);
        } catch (error) {
            console.error("Error adding user:", error);
            const errorMessage = error instanceof Error ? error.message : 'Ocorreu um erro.';
            showNotification(`Falha ao adicionar usuário: ${errorMessage}`, 'error');
        }
    };

    const handleClearData = async () => {
        if (!isAdmin || !selectedTurma) {
            showNotification('Apenas administradores podem limpar os dados.', 'error');
            return;
        }

        if (isDemoMode) {
            setEmployees(prev => prev.map(e => ({
                ...e,
                assDss: false,
                bem: false,
                mal: false,
                ausente: false,
                time: null
            })));
            setMainSubject('');
            setMainMatricula('');
            setMainResponsible('');
            setSpecialSubject('');
            setSpecialMatricula('');
            setSpecialResponsible('');
            setMainRegisterTime('');
            setSpecialRegisterTime('');
            setActiveModal(ModalType.None);
            showNotification('Dados limpos com sucesso (DEMO)!', 'success');
            return;
        }

        if (!db) {
            showNotification("A conexão com o banco de dados não está disponível.", "error");
            return;
        }

        try {
            const batch = writeBatch(db);
            const collectionName = getTurmaCollectionName(selectedTurma);
            const employeesSnapshot = await getDocs(collection(db, collectionName));
            employeesSnapshot.forEach((doc) => {
                batch.update(doc.ref, {
                    assDss: false,
                    bem: false,
                    mal: false,
                    ausente: false,
                    time: null,
                });
            });

            const registrationCollectionName = getTurmaRegistrationName(selectedTurma);
            const registrationsSnapshot = await getDocs(collection(db, registrationCollectionName));
            registrationsSnapshot.forEach((doc) => {
                // Preserva documentos de configuração (config_6H, config_senha_assinatura, etc.)
                if (!doc.id.startsWith('config_')) {
                    batch.delete(doc.ref);
                }
            });

            await batch.commit();
            setActiveModal(ModalType.None);
            showNotification('Dados de status diário e registros manuais foram limpos!', 'success');
            logAuditEvent(adminEmail, 'LIMPEZA DE DADOS', `Dados diários limpos da Turma ${TURMA_DISPLAY_NAMES[selectedTurma]}`, selectedTurma);
        } catch (error) {
            console.error("Error clearing data:", error);
            const message = error instanceof Error ? error.message : 'Ocorreu um erro desconhecido.';
            showNotification(`Falha ao limpar dados: ${message}`, 'error');
        }
    };

    const handleReorganize = useCallback(() => {
        setEmployees(prev => [...prev].sort((a, b) => a.name.localeCompare(b.name)));
        setActiveModal(ModalType.None);
        showNotification('Painel reorganizado alfabeticamente!', 'success');
    }, [showNotification]);

    const handleImportEmployee = async (employeeId: string, sourceTurma: TurmaType) => {
        if (!isAdmin || !selectedTurma) {
            showNotification('Ação não permitida.', 'error');
            return;
        }
        if (sourceTurma === selectedTurma) {
            showNotification('A turma de origem deve ser diferente da atual.', 'error');
            return;
        }

        if (isDemoMode) {
            const employeeToMove = { id: `demo-moved-${Date.now()}`, name: "Funcionário Importado", matricula: "0000", turno: "7H", time: null, assDss: false, bem: false, mal: false, ausente: false, senha: "0000" };
            setEmployees(prev => [...prev, employeeToMove].sort((a, b) => a.name.localeCompare(b.name)));
            showNotification(`${employeeToMove.name} importado para a Turma ${TURMA_DISPLAY_NAMES[selectedTurma]} (DEMO).`, 'success');
            setActiveModal(ModalType.None);
            return;
        }

        if (!db) {
            showNotification("A conexão com o banco de dados não está disponível.", "error");
            return;
        }

        const sourceCollectionName = getTurmaCollectionName(sourceTurma);
        const destinationCollectionName = getTurmaCollectionName(selectedTurma);
        const sourceDocRef = doc(db, sourceCollectionName, employeeId);

        try {
            const docSnap = await getDoc(sourceDocRef);
            if (!docSnap.exists()) {
                throw new Error("Documento do funcionário não foi encontrado na turma de origem.");
            }

            const employeeData = docSnap.data();
            const employeeName = employeeData.name || 'O colaborador';

            // Limpa o status diário ao importar, mantendo apenas os dados essenciais.
            const cleanedEmployeeData = {
                name: employeeData.name,
                matricula: employeeData.matricula,
                turno: '7H', // Define o turno padrão para a nova turma
                assDss: false,
                bem: false,
                mal: false,
                ausente: false,
                time: null,
                senha: employeeData.senha || employeeData.matricula,
            };

            const batch = writeBatch(db);

            const newDocRef = doc(collection(db, destinationCollectionName));
            batch.set(newDocRef, cleanedEmployeeData);

            batch.delete(sourceDocRef);

            await batch.commit();

            showNotification(`${employeeName} foi importado para a Turma ${TURMA_DISPLAY_NAMES[selectedTurma]} com sucesso!`, 'success');
            logAuditEvent(adminEmail, 'IMPORTAÇÃO DE USUÁRIO', `Funcionário: ${employeeName} importado da Turma ${TURMA_DISPLAY_NAMES[sourceTurma]} para Turma ${TURMA_DISPLAY_NAMES[selectedTurma]}`, selectedTurma);
            setActiveModal(ModalType.None);

        } catch (error) {
            console.error("Error importing employee:", error);
            const message = error instanceof Error ? error.message : 'Ocorreu um erro desconhecido.';
            showNotification(`Falha ao importar funcionário: ${message}`, 'error');
        }
    };

    const handleSelectTurma = useCallback((turma: TurmaType) => {
        setIsTransitioning(true);
        localStorage.setItem('selectedTurma', turma);
        setLoading(true);
        setEmployees([]); // Limpa dados antigos para evitar exibir dados da turma errada
        setSelectedTurma(turma);
        // Resetar turno secundário conforme tipo da turma
        if (turma.includes('_CCP_') || turma === 'C_CG' || turma === 'ESTAGIO') {
            setIs6HActive(false);
        } else {
            setIs6HActive(true);
        }
    }, []);

    const handleSelectLayout = useCallback((layout: 'standard' | 'custom') => {
        localStorage.setItem('selectedLayout', layout);
        localStorage.removeItem('pularTelasAutoSet'); // Escolha manual, não é mais do Pular Telas
        setSelectedLayout(layout);
    }, []);

    const handleReturnToSelection = useCallback(() => {
        localStorage.removeItem('selectedTurma');
        localStorage.removeItem('selectedLayout');
        setSelectedLayout(null);
        setSelectedTurma(null);
        setEmployees([]);
        setIsAdmin(false);
        isDemoModeRef.current = false;
        setIsDemoMode(false);
    }, []);

    const handleCloseAdminUpdateNotice = useCallback(async () => {
        if (adminEmail) {
            localStorage.setItem(`hasSeenNotice_${adminEmail}`, Date.now().toString());
        }
        const isCell = await isMobileCellularWithBiometrics();
        const alreadyRegistered = hasRegisteredBiometrics();
        if (isCell && !alreadyRegistered && !isDemoMode) {
            setActiveModal(ModalType.BiometricEnrollment);
        } else {
            setActiveModal(ModalType.AdminOptions);
        }
    }, [isDemoMode, adminEmail]);

    const handleHelpClick = useCallback(() => {
        // Não removemos mais as flags aqui para evitar loops de tutorial ao recarregar
        setActiveModal(ModalType.TutorialChoice);
    }, []);

    const stats = useMemo(() => {
        return employees.reduce(
            (acc, e) => {
                acc.total++;
                if (e.bem) acc.bem++;
                if (e.mal) acc.mal++;
                if (e.ausente) acc.ausente++;
                if (!e.bem && !e.assDss && !e.mal && !e.ausente) acc.pendente++;
                return acc;
            },
            { bem: 0, mal: 0, ausente: 0, pendente: 0, total: 0 }
        );
    }, [employees]);

    const mainTeam = useMemo(() => employees.filter(e => e.turno !== '6H').sort((a, b) => a.name.localeCompare(b.name)), [employees]);
    const specialTeam = useMemo(() => employees.filter(e => e.turno === '6H').sort((a, b) => a.name.localeCompare(b.name)), [employees]);

    const groupedMainTeam = useMemo(() => {
        const groups: { letter: string; employees: Employee[] }[] = [];

        mainTeam.forEach(emp => {
            const firstLetter = emp.name.charAt(0).toUpperCase();

            // Allow letters A-Z, otherwise group under '#'
            const groupLetter = /^[A-Z]$/.test(firstLetter) ? firstLetter : '#';

            let group = groups.find(g => g.letter === groupLetter);
            if (!group) {
                group = { letter: groupLetter, employees: [] };
                groups.push(group);
            }
            group.employees.push(emp);
        });

        // Sort letters just to be absolutely sure (A-Z, then #)
        groups.sort((a, b) => {
            if (a.letter === '#') return 1;
            if (b.letter === '#') return -1;
            return a.letter.localeCompare(b.letter);
        });

        return groups;
    }, [mainTeam]);

    // Calcula a quantidade máxima de colunas em qualquer grupo de letra no layout alfabético
    const customLayoutCols = useMemo(() => {
        if (groupedMainTeam.length === 0) return 1;
        return Math.min(3, Math.max(...groupedMainTeam.map(g => g.employees.length)));
    }, [groupedMainTeam]);

    // Tracking vertical scroll percentage of the main viewport 
    // to map to the vertical scroll percentage of the fast scroller bar itself.

    useEffect(() => {
        if (selectedLayout !== 'custom' || groupedMainTeam.length === 0) return;

        const viewport = viewportRef.current;
        if (!viewport) return;

        const handleScroll = () => {
            const barElement = document.getElementById('fast-scroller-bar');
            if (!barElement) return;

            // Calculate how far we've scrolled down the main viewport as a percentage (0 to 1)
            const maxScrollTop = viewport.scrollHeight - viewport.clientHeight;
            if (maxScrollTop <= 0) return;

            const scrollPercentage = viewport.scrollTop / maxScrollTop;

            // Apply that same percentage to the fast scroller bar
            const maxBarScrollTop = barElement.scrollHeight - barElement.clientHeight;
            if (maxBarScrollTop > 0) {
                // Sincroniza a rolagem da barra lateral proporcionalmente
                barElement.scrollTop = maxBarScrollTop * Math.min(Math.max(scrollPercentage, 0), 1);
            }

            // Detectar a letra ativa
            if (groupedMainTeam.length > 0) {
                const viewportRect = viewport.getBoundingClientRect();
                const viewportTop = viewportRect.top;
                let currentActive = groupedMainTeam[0].letter;

                // Margem a partir do topo para ativar a próxima letra
                const THRESHOLD = viewportTop + 200;

                for (const group of groupedMainTeam) {
                    const el = document.getElementById(`letter-group-${group.letter}`);
                    if (el) {
                        const rect = el.getBoundingClientRect();
                        if (rect.top <= THRESHOLD) {
                            currentActive = group.letter;
                        } else {
                            break;
                        }
                    }
                }
                setActiveLetter(currentActive);
            }
        };

        viewport.addEventListener('scroll', handleScroll, { passive: true });
        // Initial sync just in case
        handleScroll();

        return () => viewport.removeEventListener('scroll', handleScroll);
    }, [selectedLayout, groupedMainTeam]);

    const handleFastScroll = useCallback((letter: string) => {
        if (!viewportRef.current) return;

        const barElement = document.getElementById('fast-scroller-bar');
        const groupElement = document.getElementById(`letter-group-${letter}`);

        if (groupElement) {
            const viewportRect = viewportRef.current.getBoundingClientRect();
            const groupRect = groupElement.getBoundingClientRect();

            // Pegar a escala nativa contida no state do app (usada para o Zoom Pinch)
            const scale = scaleStateRef.current.currentScale;

            // Se tivermos a barra lateral, calculamos o centro dela para alinhar o cartão
            let targetVisualOffset = 80 * scale; // Fallback para logo abaixo do header

            if (barElement) {
                const barRect = barElement.getBoundingClientRect();
                const barCenterY = barRect.top - viewportRect.top + (barRect.height / 2);

                // Tentamos pegar o primeiro card dentro do grupo para centralizar por ele, não pela label da letra
                const firstCard = groupElement.querySelector('.card-optimized') || groupElement.querySelector('div[class*="w-[870px]"]');
                const cardHeight = firstCard ? firstCard.getBoundingClientRect().height : 300 * scale;

                // Alinhamos o topo do grupo de forma que o centro do primeiro card 
                // bata com o centro vertical da barra de letras
                // Mas precisamos compensar o título do grupo (que tem aprox 80px)
                const groupTitleHeight = 80 * scale;
                targetVisualOffset = barCenterY - (cardHeight / 2) - groupTitleHeight;
            }

            // Distância visual atual entre o topo do elemento e o topo visível do viewport de rolagem
            const currentRelativeToViewport = groupRect.top - viewportRect.top;

            // Quanto pixels de scroll ainda precisamos para empurrar a borda superior do grupo
            // até a posição do `targetVisualOffset`
            const scrollAmount = currentRelativeToViewport - targetVisualOffset;

            const targetScrollTop = viewportRef.current.scrollTop + scrollAmount;

            viewportRef.current.scrollTo({
                top: targetScrollTop,
                left: 0,
                behavior: 'smooth'
            });

            // Força o comportamento natural de scroll se ele clicar
        }
    }, []);
    const getPendingEmployeeName = () => {
        return employees.find(e => e.id === pendingEmployeeId)?.name || 'Colaborador';
    };

    const getPendingEmployeeTurno = () => {
        const current = employees.find(e => e.id === pendingEmployeeId)?.turno;
        return current === '6H' ? getMainShiftLabel(selectedTurma) : getShiftLabel(selectedTurma);
    };

    const handleTutorialStepChange = useCallback((step: TutorialStep) => {
        const isMobile = window.innerWidth < 1024;
        if (!isMobile) return;

        let targetIdForZoom = step.targetId;

        if (step.targetId === 'tutorial-card-actions' || step.targetId === 'tutorial-card-time') {
            targetIdForZoom = 'tutorial-first-card';
        }

        if (step.targetId === 'tutorial-return-turn-btn' ||
            ['tutorial-stats', 'tutorial-dark-mode', 'tutorial-admin-btn', 'tutorial-change-turma-btn', 'tutorial-help-btn'].includes(step.targetId)) {
            // Se for Turma C_CG, não existe tutorial-special-demo-area, então focalizamos na área do header principal ou na primeira carta
            targetIdForZoom = selectedTurma === 'C_CG' ? 'app-header' : 'tutorial-special-demo-area';
        }

        const element = document.getElementById(targetIdForZoom);
        if (!element) return;

        const margin = 32;
        const availableWidth = window.innerWidth - margin;
        const elementWidth = element.offsetWidth;

        if (elementWidth > 0) {
            let newScale = availableWidth / elementWidth;
            newScale = Math.min(Math.max(newScale, 0.3), 1.1);
            setScale(newScale);
        }
    }, [selectedTurma]);

    // Callbacks estáveis para evitar re-renders de componentes com React.memo
    // IMPORTANTE: Hooks devem ficar ANTES de qualquer return condicional (Regra dos Hooks do React)
    const handleOpenAdminLogin = useCallback(() => {
        if (isAdmin) {
            setActiveModal(ModalType.AdminOptions);
        } else {
            setActiveModal(ModalType.AdminLogin);
        }
    }, [isAdmin]);
    const handleCloseModal = useCallback(() => setActiveModal(ModalType.None), []);
    const handleBackToAdminOptions = useCallback(() => setActiveModal(ModalType.AdminOptions), []);
    const handleBackFromHistory = useCallback(() => setActiveModal(historyOriginModal), [historyOriginModal]);
    const handleOpenAddUser = useCallback(() => setActiveModal(ModalType.AddUser), []);
    const handleOpenReport = useCallback(() => setActiveModal(ModalType.Report), []);
    const handleOpenImportEmployee = useCallback(() => setActiveModal(ModalType.ImportEmployee), []);
    const handleStartAdminTutorial = useCallback(() => setActiveModal(ModalType.AdminTutorialChoice), []);
    const handleRegister7H = useCallback((subject: string, matricula: string) => handleManualRegister('7H', matricula, subject), [handleManualRegister]);
    const handleRegister6H = useCallback((subject: string, matricula: string) => handleManualRegister('6H', matricula, subject), [handleManualRegister]);

    const handleDeclineBiometrics = useCallback(() => {
        setActiveModal(ModalType.AdminOptions);
    }, []);

    const handleActivateBiometrics = useCallback(async () => {
        try {
            if (!adminEmailRef.current) return;
            const success = await registerBiometricAdmin(adminEmailRef.current);
            if (success) {
                showNotification('Acesso por impressão digital ativado com sucesso!', 'success');
            }
        } catch (error) {
            console.error("Falha ao registrar biometria:", error);
            showNotification('Não foi possível registrar a digital neste aparelho.', 'error');
        } finally {
            setActiveModal(ModalType.AdminOptions);
        }
    }, [showNotification]);

    const handleToggleAutomation = useCallback(async () => {
        if (!selectedTurma || !db) return;
        
        try {
            const configRef = doc(db, 'configuracoes', 'automacao');
            const snap = await getDoc(configRef);
            if (snap.exists()) {
                await updateDoc(configRef, { [selectedTurma]: !isAutomationPaused });
            } else {
                await setDoc(configRef, { [selectedTurma]: !isAutomationPaused });
            }
            showNotification(`Ações ${isAutomationPaused ? 'reativadas' : 'pausadas'} para a Turma ${selectedTurma}.`, 'success');
            setActiveModal(ModalType.None);
        } catch (e) {
            console.error(e);
            showNotification('Erro ao pausar as ações. Verifique permissões.', 'error');
        }
    }, [selectedTurma, isAutomationPaused, showNotification]);

    const handleOpenAuditLog = useCallback(async () => {
        if (!db) return;
        try {
            const auditCollection = collection(db, 'auditoria_logs');
            const q = query(auditCollection, orderBy('timestamp_unix', 'desc'), limit(1000));
            const auditSnapshot = await getDocs(q);
            
            const groupedByEmail: Record<string, AuditRecord> = {};
            
            auditSnapshot.forEach(doc => {
                const data = doc.data();
                const email = data.email;
                if (!email) return;
                
                if (!groupedByEmail[email]) {
                    groupedByEmail[email] = {
                        id: email,
                        ultimo_acesso: data.timestamp, // Primeiro (mais recente)
                        ultimo_acesso_unix: data.timestamp_unix || 0,
                        acoes: []
                    };
                }
                
                groupedByEmail[email].acoes.push({
                    action: data.action,
                    details: data.details,
                    timestamp: data.timestamp,
                    timestamp_unix: data.timestamp_unix || 0,
                    turma: data.turma
                });
            });

            setAuditRecords(Object.values(groupedByEmail));
            setActiveModal(ModalType.AuditLog);
        } catch (error) {
            console.error("Erro ao buscar registros de auditoria:", error);
            showNotification('Falha ao carregar registros de auditoria.', 'error');
        }
    }, [showNotification]);



    const currentLiveHistory = useMemo(() => {
        if (!selectedTurma) return null;
        
        const today = new Date();
        const dataISO = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
        const dataFormatted = String(today.getDate()).padStart(2, '0') + '/' + String(today.getMonth() + 1).padStart(2, '0') + '/' + today.getFullYear();
        
        const r: HistoryEmployee[] = employees.map(emp => {
            let s: HistoryStatus = 'PEN';
            if (emp.mal) s = 'MAL';
            else if (emp.ausente) s = 'AUS';
            else if (emp.assDss && emp.bem) s = 'BEM';
            return {
                m: emp.matricula,
                n: emp.name,
                s,
                t: emp.time,
                turno: emp.turno
            };
        });

        const record: HistoryRecord = {
            data: dataFormatted,
            dataISO: dataISO,
            turma: selectedTurma,
            registros7H: mainSubject || mainResponsible ? [{ assunto: mainSubject, name: mainResponsible || '', matricula: mainMatricula }] : [],
            registros6H: specialSubject || specialResponsible ? [{ assunto: specialSubject, name: specialResponsible || '', matricula: specialMatricula }] : [],
            r,
            totalFuncionarios: stats.total,
            totalPresentes: stats.bem,
            totalAusentes: stats.ausente,
            totalMal: stats.mal,
            totalPendentes: stats.pendente
        };
        return record;
    }, [selectedTurma, employees, mainSubject, mainResponsible, mainMatricula, specialSubject, specialResponsible, specialMatricula, stats]);

    const handleThemeContinue = useCallback(() => {
        localStorage.setItem('themeSelected', 'true');
        localStorage.removeItem('pularTelasAutoSet'); // Escolha manual, não é mais do Pular Telas
        setHasSelectedTheme(true);
    }, []);

    const handleLockedClick = useCallback(() => {
        showNotification('Faça login como Adm para preencher', 'error');
    }, [showNotification]);

    const memoizedTutorialSteps = useMemo(() => getTutorialSteps(selectedTurma, is6HActive), [selectedTurma, is6HActive]);
    const handleCloseAdminTutorial = useCallback(() => setIsAdminTutorialOpen(false), []);

    const isFirstTimeSetupPending = !hasSelectedTheme || !selectedLayout;

    // Se não tem turma escolhida, OU se está transicionando de turma,
    // OU se está no carregamento inicial e as configurações (Tema/Layout) ainda estão pendentes
    // (isso previne que a tela de Tema/Layout "pisque" antes do Firebase carregar a config de Pular Telas)
    if (!selectedTurma || (loading && isTransitioning) || (loading && isFirstTimeSetupPending)) {
        return (
            <div className="relative w-full h-[100dvh]">
                <TurmaSelectionScreen
                    onSelect={handleSelectTurma}
                    isDarkMode={isDarkMode}
                    onToggleDarkMode={handleToggleDarkMode}
                />
                {loading && selectedTurma && (
                    <div className="absolute inset-0 z-[100] bg-light-bg-secondary/50 dark:bg-dark-bg/50 backdrop-blur-[2px] transition-opacity duration-300 cursor-wait" />
                )}
            </div>
        );
    }

    if (!hasSelectedTheme) {
        return (
            <div className="relative w-full h-[100dvh]">
                <ThemeSelectionScreen 
                    isDarkMode={isDarkMode} 
                    onToggleDarkMode={handleToggleDarkMode} 
                    onContinue={handleThemeContinue} 
                />
                {loading && (
                    <div className="absolute inset-0 z-[100] bg-light-bg-secondary/50 dark:bg-dark-bg/50 backdrop-blur-[2px] transition-opacity duration-300 cursor-wait" />
                )}
            </div>
        );
    }

    if (!selectedLayout) {
        return (
            <div className="relative w-full h-[100dvh]">
                <LayoutSelectionScreen
                    onSelect={handleSelectLayout}
                    isDarkMode={isDarkMode}
                    onToggleDarkMode={handleToggleDarkMode}
                    onBack={handleReturnToSelection}
                    selecionadaTurma={selectedTurma}
                />
                {loading && (
                    <div className="absolute inset-0 z-[100] bg-light-bg-secondary/50 dark:bg-dark-bg/50 backdrop-blur-[2px] transition-opacity duration-300 cursor-wait" />
                )}
            </div>
        );
    }

    return (
        <div className="bg-light-bg-secondary dark:bg-dark-bg min-h-screen text-light-text dark:text-dark-text transition-colors relative overflow-hidden">
            <div ref={viewportRef} className={`viewport fixed inset-0 bg-light-bg-secondary dark:bg-dark-bg`}>
                <div ref={contentWrapperRef} className="origin-top-left">
                    <div ref={scalableContainerRef} className="scalable-container relative w-fit origin-top-left p-8 bg-light-bg-secondary dark:bg-dark-bg pt-[calc(2rem+env(safe-area-inset-top))] pb-[calc(2rem+env(safe-area-inset-bottom))]">
                        {loading && (
                            <div className="absolute inset-0 z-[100] bg-light-bg-secondary/50 dark:bg-dark-bg/50 backdrop-blur-[2px] transition-opacity duration-300 cursor-wait" />
                        )}
                        <Header
                            stats={stats}
                            loading={loading}
                            onAdminClick={handleOpenAdminLogin}
                            onHelpClick={handleHelpClick}
                            isDarkMode={isDarkMode}
                            onToggleDarkMode={handleToggleDarkMode}
                            turma={selectedTurma}
                            onReturnToSelection={handleReturnToSelection}
                            is6HActive={is6HActive}
                            specialTeamCount={specialTeam.length}
                        />

                        {isDemoMode && (
                            <div className="absolute top-6 left-1/2 transform -translate-x-1/2 bg-yellow-400 text-black px-4 py-1 rounded-full font-bold shadow-md z-10 animate-pulse pointer-events-none">
                                MODO DEMONSTRAÇÃO ATIVO
                            </div>
                        )}

                        <div className="flex gap-8 flex-nowrap relative">
                            <div className="flex flex-col gap-8 shrink-0 relative w-fit">
                                {selectedTurma !== 'ESTAGIO' && (
                                <ManualRegisterSection
                                    subject={mainSubject}
                                    matricula={mainMatricula}
                                    onRegister={handleRegister7H}
                                    employeesForLookup={employees}
                                    administrators={administrators}
                                    turma={selectedTurma}
                                    dbName={mainResponsible}
                                    registerTime={mainRegisterTime}
                                    isAdminOnlyTheme={isAdminOnlyTheme}
                                    isAdmin={isAdmin}
                                    onLockedClick={handleLockedClick}
                                />
                                )}

                                <div className="flex gap-6 pr-12 relative w-fit">
                                    <div 
                                        className="flex flex-col gap-8 shrink-0 relative pb-2"
                                        style={selectedLayout === 'custom' ? {
                                            minWidth: customLayoutCols <= 1 ? '870px' : customLayoutCols === 2 ? '1764px' : '2658px'
                                        } : undefined}
                                    >
                                        {/* RENDERIZAÇÃO BASEADA NO LAYOUT SELECIONADO */}
                                        {selectedLayout === 'standard' ? (
                                            <div className="flex flex-wrap gap-[24px] w-max max-w-[2660px]">
                                                {mainTeam.map((emp, index) => (
                                                    <div key={emp.id} className="w-[870px]">
                                                        <EmployeeCard
                                                            employee={emp}
                                                            onStatusChange={handleStatusChange}
                                                            onToggleSpecialTeam={handleToggleSpecialTeam}
                                                            isTogglingSpecialTeam={togglingSpecialTeamId === emp.id}
                                                            isAdmin={isAdmin}
                                                            onDelete={handleDeleteUser}
                                                            onTimeChange={handleTimeUpdate}
                                                            onMatriculaChange={handleMatriculaUpdate}
                                                            domId={index === 0 ? "tutorial-first-card" : undefined}
                                                            hideShiftButton={selectedTurma === 'ESTAGIO' || !is6HActive}
                                                            shiftLabel={getShiftLabel(selectedTurma)}
                                                        />
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            /* RENDERIZAÇÃO LAYOUT 'CUSTOM' (ALFABÉTICO) */
                                            groupedMainTeam.map((group) => (
                                                <div key={group.letter} id={`letter-group-${group.letter}`} className="flex flex-col w-fit mb-4">
                                                    <div className="bg-light-card dark:bg-dark-card backdrop-blur-md py-4 px-6 mb-6 border-2 border-primary/20 flex items-center gap-6 shadow-md rounded-2xl w-full">
                                                        <div className="w-14 h-14 bg-primary text-white rounded-xl flex items-center justify-center text-3xl font-bold shadow-lg shrink-0">
                                                            {group.letter}
                                                        </div>
                                                        <span className="text-light-text-secondary dark:text-dark-text-secondary opacity-80 text-2xl font-medium ml-auto">
                                                            {group.employees.length} {group.employees.length === 1 ? 'colaborador' : 'colaboradores'}
                                                        </span>
                                                    </div>
                                                    <div className="flex flex-wrap gap-[24px] w-max max-w-[2660px]">
                                                        {group.employees.map((emp, index) => (
                                                            <div key={emp.id} className="w-[870px]">
                                                                <EmployeeCard
                                                                    employee={emp}
                                                                    onStatusChange={handleStatusChange}
                                                                    onToggleSpecialTeam={handleToggleSpecialTeam}
                                                                    isTogglingSpecialTeam={togglingSpecialTeamId === emp.id}
                                                                    isAdmin={isAdmin}
                                                                    onDelete={handleDeleteUser}
                                                                    onTimeChange={handleTimeUpdate}
                                                                    onMatriculaChange={handleMatriculaUpdate}
                                                                    domId={index === 0 && group.letter === groupedMainTeam[0]?.letter ? "tutorial-first-card" : undefined}
                                                                    hideShiftButton={selectedTurma === 'ESTAGIO' || !is6HActive}
                                                                    shiftLabel={getShiftLabel(selectedTurma)}
                                                                />
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            ))
                                        )}

                                        {mainTeam.length === 0 && (
                                            <div className="w-full min-h-[65vh] flex flex-col items-center justify-center text-center py-20 text-light-text-secondary dark:text-dark-text-secondary text-xl font-medium">
                                                {!loading && (
                                                    <>Nenhum colaborador encontrado na Turma {selectedTurma}.</>
                                                )}
                                            </div>
                                        )}
                                    </div>

                                    {/* ALPHABETICAL FAST SCROLLER (Somente no layout custom) */}
                                    {selectedLayout === 'custom' && (
                                        <div
                                            id="fast-scroller-bar"
                                            className="sticky top-[100px] h-fit max-h-[80vh] flex flex-col gap-1 z-10 p-2 bg-light-card/80 dark:bg-dark-card/80 backdrop-blur-xl rounded-full shadow-lg border border-white/20 dark:border-white/5 ml-4 self-start overflow-y-auto hide-scrollbar"
                                            onTouchStart={(e) => e.stopPropagation()}
                                            onTouchMove={(e) => e.stopPropagation()}
                                            onWheel={(e) => e.stopPropagation()}
                                        >
                                            {groupedMainTeam.map(group => (
                                                <div
                                                    key={`nav-${group.letter}`}
                                                    id={`nav-letter-${group.letter}`}
                                                    onClick={() => handleFastScroll(group.letter)}
                                                    className={`w-8 h-8 flex items-center justify-center rounded-full text-sm font-bold cursor-pointer transition-all shadow-sm flex-shrink-0 ${activeLetter === group.letter
                                                        ? 'bg-primary text-white scale-110 shadow-md ring-2 ring-primary/30'
                                                        : 'bg-transparent text-light-text-secondary dark:text-dark-text-secondary hover:bg-primary/20 hover:text-primary dark:hover:text-primary-light'
                                                        }`}
                                                >
                                                    {group.letter}
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                </div>
                            </div>
                            {selectedTurma !== 'ESTAGIO' && is6HActive && (
                                <SpecialTeamPanel
                                    specialTeam={specialTeam}
                                    onStatusChange={handleStatusChange}
                                    onToggleSpecialTeam={handleToggleSpecialTeam}
                                    togglingSpecialTeamId={togglingSpecialTeamId}
                                    isAdmin={isAdmin}
                                    onDeleteUser={handleDeleteUser}
                                    onTimeChange={handleTimeUpdate}
                                    onMatriculaUpdate={handleMatriculaUpdate}
                                    subject={specialSubject}
                                    matricula={specialMatricula}
                                    onRegister={handleRegister6H}
                                    employeesForLookup={employees}
                                    administrators={administrators}
                                    turma={selectedTurma}
                                    dbName={specialResponsible}
                                    registerTime={specialRegisterTime}
                                    isAdminOnlyTheme={isAdminOnlyTheme}
                                    onLockedClick={handleLockedClick}
                                />
                            )}
                        </div>
                        <Footer />
                    </div>
                </div>
            </div>

                <Suspense fallback={null}>
                    <AdminLoginModal
                        isOpen={activeModal === ModalType.AdminLogin}
                        onClose={handleCloseModal}
                        onLogin={handleAdminLogin}
                        showNotification={showNotification}
                        scale={modalScale}
                    />
                    <ConfirmBiometricModal
                        isOpen={activeModal === ModalType.BiometricEnrollment}
                        onClose={handleDeclineBiometrics}
                        onActivate={handleActivateBiometrics}
                        scale={modalScale}
                    />
                    <AdminOptionsModal
                        isOpen={activeModal === ModalType.AdminOptions}
                        onClose={handleCloseModal}
                        onClear={handleClearData}
                        onReorganize={handleReorganize}
                        onAddUser={handleOpenAddUser}
                        onSendReport={handleOpenReport}
                        onImportUser={handleOpenImportEmployee}
                        onEnterDemo={handleEnterDemoMode}
                        onStartAdminTutorial={handleStartAdminTutorial}
                        onToggle6H={handleToggle6H}
                        onToggleAutomation={handleToggleAutomation}
                        onHistory={() => {
                            setHistoryOriginModal(ModalType.AdminOptions);
                            setActiveModal(ModalType.HistoryView);
                        }}
                        onClearBiometrics={() => {
                            clearBiometricData();
                            showNotification('Acesso por impressão digital desativado neste aparelho.', 'success');
                            setActiveModal(ModalType.None);
                        }}
                        onChangeAdminPassword={() => setActiveModal(ModalType.ChangeAdminPassword)}
                        onManageAdmins={() => setActiveModal(ModalType.ManageAdmins)}
                        onAuditLog={handleOpenAuditLog}
                        onToggleSignaturePassword={handleToggleSignaturePassword}
                        hasBiometrics={hasRegisteredBiometrics()}
                        is6HActive={is6HActive}
                        isAutomationPaused={isAutomationPaused}
                        isSignaturePasswordActive={isSignaturePasswordActive}
                        isSorteioActive={isSorteioActive}
                        onToggleSorteio={handleToggleSorteio}
                        isPularTelasActive={isPularTelasActive}
                        onTogglePularTelas={handleTogglePularTelas}
                        scale={modalScale}
                        selectedTurma={selectedTurma}
                        currentAdminNivel={adminNivel}
                        isAdminOnlyTheme={isAdminOnlyTheme}
                        onToggleAdminOnlyTheme={handleToggleAdminOnlyTheme}
                    />
                    <AuditLogModal
                        isOpen={activeModal === ModalType.AuditLog}
                        onClose={handleCloseModal}
                        onBack={handleBackToAdminOptions}
                        auditRecords={auditRecords}
                        scale={modalScale}
                    />
                    <AddUserModal
                        isOpen={activeModal === ModalType.AddUser}
                        onClose={handleCloseModal}
                        onBack={handleBackToAdminOptions}
                        onAdd={handleAddUser}
                        scale={modalScale}
                    />
                    <ReportModal
                        isOpen={activeModal === ModalType.Report}
                        onClose={handleCloseModal}
                        onBack={handleBackToAdminOptions}
                        onHistory={() => {
                            setHistoryOriginModal(ModalType.Report);
                            setActiveModal(ModalType.HistoryView);
                        }}
                        employees={employees}
                        showNotification={showNotification}
                        scale={modalScale}
                        subject7H={mainSubject}
                        responsible7H={mainResponsible}
                        matricula7H={mainMatricula}
                        subject6H={specialSubject}
                        responsible6H={specialResponsible}
                        matricula6H={specialMatricula}
                        adminEmail={adminEmail}
                        turma={selectedTurma}
                        is6HActive={is6HActive}
                    />
                    <HistoryModal
                        isOpen={activeModal === ModalType.HistoryView}
                        onClose={handleCloseModal}
                        onBack={handleBackFromHistory}
                        scale={modalScale}
                        turma={selectedTurma}
                        showNotification={showNotification}
                        currentLiveHistory={currentLiveHistory}
                        adminEmail={adminEmail}
                        administrators={administrators}
                        is6HActive={is6HActive}
                    />
                    <ImportEmployeeModal
                        isOpen={activeModal === ModalType.ImportEmployee}
                        onClose={handleCloseModal}
                        onBack={handleBackToAdminOptions}
                        onImport={handleImportEmployee}
                        currentTurma={selectedTurma}
                        scale={modalScale}
                        showNotification={showNotification}
                    />
                    <UserExistsWarningModal
                        isOpen={activeModal === ModalType.UserExistsWarning}
                        onClose={handleCloseModal}
                        onImportClick={() => setActiveModal(ModalType.ImportEmployee)}
                        existingUserInfo={existingUserInfo}
                        scale={modalScale}
                    />
                    <InteractiveTutorial
                        isOpen={activeModal === ModalType.Tutorial}
                        onClose={handleCloseModal}
                        steps={memoizedTutorialSteps}
                        scale={modalScale}
                        onStepChange={handleTutorialStepChange}
                    />
                    <InteractiveTutorial
                        isOpen={isAdminTutorialOpen}
                        onClose={handleCloseAdminTutorial}
                        steps={adminTutorialSteps}
                        scale={modalScale}
                        onStepChange={handleTutorialStepChange}
                    />
                    <InvalidMatriculaModal
                        isOpen={activeModal === ModalType.InvalidMatricula}
                        onClose={() => setActiveModal(ModalType.None)}
                        scale={modalScale}
                    />
                    <ConfirmMalModal
                        isOpen={activeModal === ModalType.ConfirmMal}
                        onClose={() => { setPendingEmployeeId(null); setActiveModal(ModalType.None); }}
                        onConfirm={handleConfirmMal}
                        scale={modalScale}
                    />
                    <ConfirmTurnoModal
                        isOpen={activeModal === ModalType.ConfirmTurno}
                        onClose={() => { setPendingEmployeeId(null); setActiveModal(ModalType.None); }}
                        onConfirm={handleConfirmTurno}
                        employeeName={getPendingEmployeeName()}
                        targetTurno={getPendingEmployeeTurno()}
                        scale={modalScale}
                    />
                    <ConfirmAusenteModal
                        isOpen={activeModal === ModalType.ConfirmAusente}
                        onClose={() => { setPendingEmployeeId(null); setActiveModal(ModalType.None); }}
                        onConfirm={handleConfirmAusente}
                        employeeName={getPendingEmployeeName()}
                        scale={modalScale}
                    />
                    <ConnectionErrorModal
                        isOpen={activeModal === ModalType.ConnectionError}
                        onClose={() => setActiveModal(ModalType.None)}
                        scale={modalScale}
                    />
                    {activeModal === ModalType.SignaturePassword && (
                        <SignaturePasswordModal
                            isOpen={true}
                            onClose={() => {
                                setActiveModal(ModalType.None);
                                setPendingEmployeeId(null);
                            }}
                            onConfirm={handleConfirmSignaturePassword}
                            onChangePassword={handleChangeSignaturePassword}
                            employeeName={getPendingEmployeeName()}
                            scale={modalScale}
                        />
                    )}
                    <AdminPasswordModal
                        isOpen={activeModal === ModalType.ChangeAdminPassword}
                        onClose={handleCloseModal}
                        onBack={handleBackToAdminOptions}
                        onConfirm={handleChangeAdminPassword}
                        scale={modalScale}
                    />
                    <ManageAdminsModal
                        isOpen={activeModal === ModalType.ManageAdmins}
                        onClose={handleCloseModal}
                        onBack={handleBackToAdminOptions}
                        administrators={administrators}
                        currentAdminEmail={adminEmail}
                        onOpenAddAdmin={() => setActiveModal(ModalType.AddAdmin)}
                        onOpenEditAdmin={(id) => {
                            setEditingAdminId(id);
                            setActiveModal(ModalType.EditAdmin);
                        }}
                        onDeleteAdmin={handleDeleteAdministrator}
                        scale={modalScale}
                    />
                    <AddAdminModal
                        isOpen={activeModal === ModalType.AddAdmin}
                        onClose={handleCloseModal}
                        onBack={() => setActiveModal(ModalType.ManageAdmins)}
                        onAddAdmin={handleAddAdministrator}
                        scale={modalScale}
                    />
                    <EditAdminModal
                        isOpen={activeModal === ModalType.EditAdmin}
                        onClose={() => {
                            setEditingAdminId(null);
                            handleCloseModal();
                        }}
                        onBack={() => {
                            setEditingAdminId(null);
                            setActiveModal(ModalType.ManageAdmins);
                        }}
                        admin={administrators.find(a => a.id === editingAdminId) || null}
                        onEditAdmin={handleEditAdministrator}
                        scale={modalScale}
                    />
                    <ConfirmDeleteModal
                        isOpen={activeModal === ModalType.ConfirmDelete}
                        onClose={() => { setPendingEmployeeId(null); setActiveModal(ModalType.None); }}
                        onConfirm={handleConfirmDelete}
                        employeeName={getPendingEmployeeName()}
                        scale={modalScale}
                    />
                    <ConfirmDeactivate6HModal
                        isOpen={activeModal === ModalType.ConfirmDeactivate6H}
                        onClose={() => setActiveModal(ModalType.None)}
                        onConfirm={handleConfirmDeactivate6H}
                        selectedTurma={selectedTurma}
                        scale={modalScale}
                    />
                    <TutorialChoiceModal
                        isOpen={activeModal === ModalType.TutorialChoice}
                        onClose={() => setActiveModal(ModalType.None)}
                        onSelectInteractive={() => setActiveModal(ModalType.Tutorial)}
                        onSelectVideo={() => setActiveModal(ModalType.TutorialVideo)}
                        scale={modalScale}
                    />
                    <TutorialVideoModal
                        isOpen={activeModal === ModalType.TutorialVideo}
                        onClose={() => setActiveModal(ModalType.None)}
                        scale={modalScale}
                    />
                    <AdminUpdateNoticeModal
                        isOpen={activeModal === ModalType.AdminUpdateNotice}
                        onClose={handleCloseAdminUpdateNotice}
                        scale={modalScale}
                    />
                    <TutorialChoiceModal
                        isOpen={activeModal === ModalType.AdminTutorialChoice}
                        onClose={() => setActiveModal(ModalType.None)}
                        onSelectInteractive={() => {
                            setActiveModal(ModalType.None);
                            setIsAdminTutorialOpen(true);
                        }}
                        onSelectVideo={() => setActiveModal(ModalType.AdminTutorialVideo)}
                        scale={modalScale}
                    />
                    <TutorialVideoModal
                        isOpen={activeModal === ModalType.AdminTutorialVideo}
                        onClose={() => setActiveModal(ModalType.None)}
                        scale={modalScale}
                        videoUrl="https://drive.google.com/file/d/1VONdGRijqHaymNi-Y7fcyrHhAQ5FFLM_/preview?hd=1"
                    />
                    <DssRaffleModal
                        isOpen={activeModal === ModalType.DssRaffle}
                        onClose={handleDssRaffleCancel}
                        onSubmit={handleDssRaffleSubmit}
                        employeeName={pendingRaffleId ? (employees.find(e => e.id === pendingRaffleId)?.name || 'COLABORADOR') : ''}
                        scale={modalScale}
                    />
                </Suspense>

            <div
                className="fixed z-[99999] space-y-3 top-[calc(1.25rem+env(safe-area-inset-top))] right-[calc(1.25rem+env(safe-area-inset-right))]"
                style={{ transform: `scale(${modalScale})`, transformOrigin: 'top right' }}
            >
                {notifications.map(n => <Notification key={n.id} notification={n} onDismiss={dismissNotification} />)}
            </div>
        </div>
    );
};

export default App;
