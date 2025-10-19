// ========================== CONFIGURAÇÃO ==========================
// 👇 COLE A URL DA SUA API AQUI DENTRO DAS ASPAS! 👇
const URL_DA_API = "https://script.google.com/macros/s/AKfycbyVZeOff8VB-fj-vUfwSZ59qPUR8mNKkgn0bjH0xPZJIIjrSPVm0GsTr1HYponfUhQg/exec";

// Elementos da página
const tbody = document.getElementById('employee-table-body');
const loadingIndicator = document.getElementById('loading-indicator');
let ultimoDados = null; // Para evitar recargas desnecessárias

// ======================= FUNÇÕES DE COMUNICAÇÃO =======================

async function carregarFuncionarios() {
    loadingIndicator.style.display = 'block';
    try {
        const response = await fetch(URL_DA_API);
        if (!response.ok) throw new Error(`Erro de rede: ${response.statusText}`);
        
        const jsonResponse = await response.json();
        if (jsonResponse.success) {
            atualizarTabela(jsonResponse.data);
        } else {
            throw new Error(`Erro na API: ${jsonResponse.error}`);
        }
    } catch (error) {
        console.error("Falha ao carregar colaboradores:", error);
        tbody.innerHTML = `<tr><td colspan="6">Erro ao carregar: ${error.message}</td></tr>`;
    } finally {
        loadingIndicator.style.display = 'none';
    }
}

async function atualizarCheckboxNaPlanilha(matricula, tipoCheckbox, valor) {
    loadingIndicator.style.display = 'block';
    console.log(`Enviando: Matrícula=${matricula}, Tipo=${tipoCheckbox}, Valor=${valor}`);
    try {
        const response = await fetch(URL_DA_API, {
            method: 'POST',
            mode: 'no-cors',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({ matricula, tipoCheckbox, valor })
        });
        // Com 'no-cors', não podemos ler a resposta, então presumimos sucesso e recarregamos.
    } catch (error) {
        console.error("Falha ao atualizar checkbox:", error);
        alert("Ocorreu um erro ao salvar a alteração. A página será recarregada.");
    } finally {
        // Recarrega os dados para garantir que a interface reflita o estado real da planilha
        setTimeout(carregarFuncionarios, 500); 
    }
}

// ======================== FUNÇÕES DE RENDERIZAÇÃO ========================

function atualizarTabela(colaboradores) {
    const dadosAtuais = JSON.stringify(colaboradores);
    if (dadosAtuais === ultimoDados) {
        return; // Não faz nada se os dados forem os mesmos
    }
    ultimoDados = dadosAtuais;

    if (!colaboradores || colaboradores.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6">Nenhum colaborador encontrado.</td></tr>';
        return;
    }

    const fragment = document.createDocumentFragment();
    colaboradores.forEach((col, index) => {
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

        // Adiciona a matrícula a todas as linhas para fácil acesso no evento de clique
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

// Event listener único na tabela para gerenciar todos os cliques
tbody.addEventListener('change', (event) => {
    if (event.target.type === 'checkbox') {
        const checkbox = event.target;
        const tipo = checkbox.dataset.tipo;
        const valor = checkbox.checked;
        
        // Encontra a linha (tr) pai para pegar a matrícula
        const tr = checkbox.closest('tr');
        const matricula = tr.dataset.matricula;

        if (matricula && tipo) {
            atualizarCheckboxNaPlanilha(matricula, tipo, valor);
        }
    }
});

// Inicia o processo
document.addEventListener('DOMContentLoaded', () => {
    carregarFuncionarios(); // Carrega na primeira vez
    setInterval(carregarFuncionarios, 10000); // Atualiza a cada 10 segundos
});