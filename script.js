// ========================== CONFIGURAÇÃO ==========================
const tbody = document.getElementById('employee-table-body');
const loadingIndicator = document.getElementById('loading-indicator');

// ======================= BANCO DE DADOS FALSO (MOCK) =======================
// Propriedade "checkbox_fantasma_checked" removida
let MOCK_DATA = [
    {
        nome: "Naylan Moreira",
        matricula: "1001**",
        checkbox_ass_dss_checked: false,
        dss_data_hora: "",
        checkbox_estoubem_checked: false,
        checkbox_estoumal_checked: false
    },
    {
        nome: "Fulano de Tal",
        matricula: "1002**",
        checkbox_ass_dss_checked: true,
        dss_data_hora: "18/10/2025 08:30:15",
        checkbox_estoubem_checked: true,
        checkbox_estoumal_checked: false
    },
    {
        nome: "Ciclana da Silva",
        matricula: "1003**",
        checkbox_ass_dss_checked: false,
        dss_data_hora: "",
        checkbox_estoubem_checked: false,
        checkbox_estoumal_checked: true
    }
];
// ================================================================

async function carregarFuncionarios() {
    loadingIndicator.textContent = "Carregando dados...";
    loadingIndicator.style.display = 'block';
    
    setTimeout(() => {
        try {
            atualizarTabela(MOCK_DATA);
            loadingIndicator.style.display = 'none';
        } catch (error) {
            console.error("Falha ao renderizar tabela:", error);
            tbody.innerHTML = `<tr><td colspan="5">Erro ao renderizar dados.</td></tr>`; // Colspan 5
            loadingIndicator.textContent = "Erro!";
        }
    }, 500); 
}

async function atualizarCheckboxNaPlanilha(matricula, tipoCheckbox, valor) {
    loadingIndicator.textContent = "Salvando...";
    loadingIndicator.style.display = 'block';

    setTimeout(() => {
        try {
            const matriculaLimpa = matricula.trim().replace(/\*\*/g, '');
            const colaborador = MOCK_DATA.find(c => c.matricula.trim().replace(/\*\*/g, '') === matriculaLimpa);

            if (!colaborador) {
                throw new Error(`Colaborador com matrícula ${matriculaLimpa} não encontrado.`);
            }

            // Atualiza o valor no banco de dados falso
            switch(tipoCheckbox) {
                case 'ASS_DSS':
                    colaborador.checkbox_ass_dss_checked = valor;
                    colaborador.dss_data_hora = valor ? new Date().toLocaleString('pt-BR') : "";
                    break;
                case 'ESTOU_BEM':
                    colaborador.checkbox_estoubem_checked = valor;
                    if (valor) colaborador.checkbox_estoumal_checked = false; 
                    break;
                case 'ESTOU_MAL':
                    colaborador.checkbox_estoumal_checked = valor;
                    if (valor) colaborador.checkbox_estoubem_checked = false; 
                    break;
                // Caso 'FANTASMA' removido
            }
            
            console.log("Banco de dados FALSO atualizado:", MOCK_DATA);
            carregarFuncionarios();

        } catch (error) {
            console.error("Falha ao atualizar checkbox:", error);
            alert("Ocorreu um erro ao salvar a alteração.");
            loadingIndicator.textContent = "Erro!";
        }
    }, 300); 
}

// ======================== FUNÇÕES DE RENDERIZAÇÃO ========================

function atualizarTabela(colaboradores) {
    if (!colaboradores || colaboradores.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5">Nenhum colaborador encontrado.</td></tr>'; // Colspan 5
        return;
    }

    const fragment = document.createDocumentFragment();
    colaboradores.forEach((col) => {
        const dssDataHora = col.dss_data_hora || "";
        // Lógica "isHighlighted" removida
        const isAssDssChecked = col.checkbox_ass_dss_checked;
        const isEstouBemChecked = col.checkbox_estoubem_checked;
        const isEstouMalChecked = col.checkbox_estoumal_checked;
        const matriculaLimpa = col.matricula.trim().replace(/\*\*/g, '');

        let nomeCellClass = 'cell-nome';
        if (isEstouBemChecked) nomeCellClass += ' estado-positivo';
        else if (isEstouMalChecked) nomeCellClass += ' estado-negativo';

        const tr1 = document.createElement('tr');
        // Classe "highlighted-block" removida
        tr1.innerHTML = `
            <td colspan="2" class="${nomeCellClass}">${escapeHtml(col.nome)}</td>
            <td class="cell-check ${isAssDssChecked ? 'ass-dss-marcado' : ''}"><input type="checkbox" data-tipo="ASS_DSS" ${isAssDssChecked ? 'checked' : ''}></td>
            <td class="cell-check ${isEstouBemChecked ? 'estou-bem-marcado' : ''}"><input type="checkbox" data-tipo="ESTOU_BEM" ${isEstouBemChecked ? 'checked' : ''}></td>
            <td class="cell-check ${isEstouMalChecked ? 'estou-mal-marcado' : ''}"><input type="checkbox" data-tipo="ESTOU_MAL" ${isEstouMalChecked ? 'checked' : ''}></td>
            `;

        const tr2 = document.createElement('tr');
        // Classe "highlighted-block" removida
        tr2.innerHTML = `
            <td class="cell-matricula">${escapeHtml(col.matricula)}</td>
            <td class="cell-matricula-vazio"></td>
            <td colspan="2" class="cell-espaco-inferior">${escapeHtml(dssDataHora)}</td>
            <td class="cell-timestamp"></td>
            `;

        const tr3 = document.createElement('tr');
        tr3.innerHTML = `<td colspan="5" class="cell-em-branco"></td>`; // Colspan 5

        [tr1, tr2].forEach(tr => tr.dataset.matricula = matriculaLimpa);
        fragment.appendChild(tr1);
        fragment.appendChild(tr2);
        fragment.appendChild(tr3);
    });

    tbody.innerHTML = '';
    tbody.appendChild(fragment);
}

function escapeHtml(unsafe) {
    return unsafe.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

// ======================== INICIALIZAÇÃO E EVENTOS ========================

tbody.addEventListener('change', (event) => {
    if (event.target.type === 'checkbox') {
        const checkbox = event.target;
        const tipo = checkbox.dataset.tipo;
        const valor = checkbox.checked;
        const tr = checkbox.closest('tr');
        const matricula = tr.dataset.matricula;

        if (matricula && tipo) {
            checkbox.disabled = true; 
            atualizarCheckboxNaPlanilha(matricula, tipo, valor);
            // .finally() removido para simplificar, já que a tabela recarrega
        }
    }
});

// Inicia o processo
document.addEventListener('DOMContentLoaded', carregarFuncionarios);
