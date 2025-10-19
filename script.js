// ========================== CONFIGURAÇÃO ==========================

// Elementos da página
const tbody = document.getElementById('employee-table-body');
const loadingIndicator = document.getElementById('loading-indicator');

// ======================= BANCO DE DADOS FALSO (MOCK) =======================
// No futuro, vamos substituir isso por uma chamada ao Supabase!
let MOCK_DATA = [
    {
        nome: "Naylan Moreira",
        matricula: "1001**",
        checkbox_ass_dss_checked: false,
        dss_data_hora: "",
        checkbox_fantasma_checked: false,
        checkbox_estoubem_checked: false,
        checkbox_estoumal_checked: false
    },
    {
        nome: "Fulano de Tal",
        matricula: "1002**",
        checkbox_ass_dss_checked: true,
        dss_data_hora: "18/10/2025 08:30:15",
        checkbox_fantasma_checked: false,
        checkbox_estoubem_checked: true,
        checkbox_estoumal_checked: false
    },
    {
        nome: "Ciclana da Silva",
        matricula: "1003**",
        checkbox_ass_dss_checked: false,
        dss_data_hora: "",
        checkbox_fantasma_checked: true,
        checkbox_estoubem_checked: false,
        checkbox_estoumal_checked: true
    }
];
// ================================================================

// Função que simula a busca de dados no banco
async function carregarFuncionarios() {
    loadingIndicator.textContent = "Carregando dados...";
    loadingIndicator.style.display = 'block';
    
    // Simula uma pequena demora da rede (meio segundo)
    setTimeout(() => {
        try {
            // Desenha a tabela com os dados do MOCK_DATA
            atualizarTabela(MOCK_DATA);
            loadingIndicator.style.display = 'none';
        } catch (error) {
            console.error("Falha ao renderizar tabela:", error);
            tbody.innerHTML = `<tr><td colspan="6">Erro ao renderizar dados.</td></tr>`;
            loadingIndicator.textContent = "Erro!";
        }
    }, 500); // 500ms = 0.5 segundos
}

// Função que simula a atualização de dados no banco
async function atualizarCheckboxNaPlanilha(matricula, tipoCheckbox, valor) {
    loadingIndicator.textContent = "Salvando...";
    loadingIndicator.style.display = 'block';

    // Simula uma pequena demora da rede
    setTimeout(() => {
        try {
            // Acha o colaborador no nosso banco de dados falso
            const matriculaLimpa = matricula.trim().replace(/\*\*/g, '');
            const colaborador = MOCK_DATA.find(c => c.matricula.trim().replace(/\*\*/g, '') === matriculaLimpa);

            if (!colaborador) {
                throw new Error(`Colaborador com matrícula ${matriculaLimpa} não encontrado.`);
            }

            // Atualiza o valor no banco de dados falso
            switch(tipoCheckbox) {
                case 'ASS_DSS':
                    colaborador.checkbox_ass_dss_checked = valor;
                    // Se marcou, adiciona data/hora. Se desmarcou, limpa.
                    colaborador.dss_data_hora = valor ? new Date().toLocaleString('pt-BR') : "";
                    break;
                case 'ESTOU_BEM':
                    colaborador.checkbox_estoubem_checked = valor;
                    if (valor) colaborador.checkbox_estoumal_checked = false; // Desmarca o outro
                    break;
                case 'ESTOU_MAL':
                    colaborador.checkbox_estoumal_checked = valor;
                    if (valor) colaborador.checkbox_estoubem_checked = false; // Desmarca o outro
                    break;
                case 'FANTASMA':
                    colaborador.checkbox_fantasma_checked = valor;
                    break;
            }
            
            console.log("Banco de dados FALSO atualizado:", MOCK_DATA);
            
            // Recarrega a tabela para mostrar os dados atualizados
            carregarFuncionarios();

        } catch (error) {
            console.error("Falha ao atualizar checkbox:", error);
            alert("Ocorreu um erro ao salvar a alteração.");
            loadingIndicator.textContent = "Erro!";
        }
    }, 300); // 300ms
}

// ======================== FUNÇÕES DE RENDERIZAÇÃO (NÃO MUDAM) ========================
// Esta parte é a mesma, pois ela só desenha o layout que queremos

function atualizarTabela(colaboradores) {
    if (!colaboradores || colaboradores.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6">Nenhum colaborador encontrado.</td></tr>';
        return;
    }

    const fragment = document.createDocumentFragment();
    colaboradores.forEach((col) => {
        const dssDataHora = col.dss_data_hora || "";
        const isHighlighted = col.checkbox_fantasma_checked;
        const isAssDssChecked = col.checkbox_ass_dss_checked;
        const isEstouBemChecked = col.checkbox_estoubem_checked;
        const isEstouMalChecked = col.checkbox_estoumal_checked;
        const matriculaLimpa = col.matricula.trim().replace(/\*\*/g, '');

        let nomeCellClass = 'cell-nome';
        if (isEstouBemChecked) nomeCellClass += ' estado-positivo';
        else if (isEstouMalChecked) nomeCellClass += ' estado-negativo';

        const tr1 = document.createElement('tr');
        if (isHighlighted) tr1.classList.add('highlighted-block');
        tr1.innerHTML = `
            <td colspan="2" class="${nomeCellClass}">${escapeHtml(col.nome)}</td>
            <td class="cell-check ${isAssDssChecked ? 'ass-dss-marcado' : ''}"><input type="checkbox" data-tipo="ASS_DSS" ${isAssDssChecked ? 'checked' : ''}></td>
            <td class="cell-check ${isEstouBemChecked ? 'estou-bem-marcado' : ''}"><input type="checkbox" data-tipo="ESTOU_BEM" ${isEstouBemChecked ? 'checked' : ''}></td>
            <td class="cell-check ${isEstouMalChecked ? 'estou-mal-marcado' : ''}"><input type="checkbox" data-tipo="ESTOU_MAL" ${isEstouMalChecked ? 'checked' : ''}></td>
            <td class="cell-fantasma"></td>
        `;

        const tr2 = document.createElement('tr');
        if (isHighlighted) tr2.classList.add('highlighted-block');
        tr2.innerHTML = `
            <td class="cell-matricula">${escapeHtml(col.matricula)}</td>
            <td class="cell-matricula-vazio"></td>
            <td colspan="2" class="cell-espaco-inferior">${escapeHtml(dssDataHora)}</td>
            <td class="cell-timestamp"></td>
            <td class="cell-fantasma"><input type="checkbox" data-tipo="FANTASMA" ${isHighlighted ? 'checked' : ''}></td>
        `;

        const tr3 = document.createElement('tr');
        tr3.innerHTML = `<td colspan="6" class="cell-em-branco"></td>`;

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

// ======================== INICIALIZAÇÃO E EVENTOS (NÃO MUDAM) ========================

tbody.addEventListener('change', (event) => {
    if (event.target.type === 'checkbox') {
        const checkbox = event.target;
        const tipo = checkbox.dataset.tipo;
        const valor = checkbox.checked;
        const tr = checkbox.closest('tr');
        const matricula = tr.dataset.matricula;

        if (matricula && tipo) {
            // Desabilita o checkbox para evitar clique duplo
            checkbox.disabled = true; 
            // Chama a função FALSA de salvar
            atualizarCheckboxNaPlanilha(matricula, tipo, valor)
                .finally(() => {
                    // Re-habilita o checkbox após salvar
                    // (A tabela será recarregada, então não precisamos nos preocupar com este checkbox específico)
                });
        }
    }
});

// Inicia o processo
document.addEventListener('DOMContentLoaded', carregarFuncionarios);
