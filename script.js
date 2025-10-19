/* eslint-disable no-undef */ // Ignora avisos sobre 'panzoom' e 'interact'

// ================================================================
// PARTE 1: CONFIGURAR O PAN & ZOOM DO "MUNDO"
// ================================================================

// Pega o "mundo" (o elemento #canvas)
var canvas = document.getElementById('canvas');

// Inicia a biblioteca de panzoom nele
var pz = panzoom(canvas, {
    // Configurações:
    
    // Regra principal: Não comece a arrastar o "mundo"
    // se o clique foi em um "bloco".
    beforeMouseDown: function(e) {
        // e.target é o que foi clicado.
        // .closest('.bloco') procura se o clique foi em um bloco ou em algo dentro dele.
        // Se FOI um bloco (ou seja, o resultado NÃO é 'null'),
        // então a gente retorna 'true' para CANCELAR o panzoom.
        return e.target.closest('.bloco') !== null;
    },
    maxZoom: 3,   // Zoom máximo de 3x
    minZoom: 0.2, // Zoom mínimo
    bounds: false // Permite "passear" (pan) infinitamente
});


// ================================================================
// PARTE 2: CONFIGURAR O ARRASTAR/REDIMENSIONAR DOS "BLOCOS"
// ================================================================

interact('.bloco')
    // 1. Redimensionar (com dedo ou mouse)
    .resizable({
        edges: { left: true, right: true, bottom: true, top: true },
        listeners: {
            move(event) {
                var target = event.target;
                
                // Pega a posição (transform) atual
                var x = (parseFloat(target.getAttribute('data-x')) || 0);
                var y = (parseFloat(target.getAttribute('data-y')) || 0);

                // Atualiza o CSS para o novo tamanho
                target.style.width = event.rect.width + 'px';
                target.style.height = event.rect.height + 'px';

                // Atualiza o 'transform' para mover o bloco enquanto redimensiona
                // (Isso corrige um bug de posição)
                x += event.deltaRect.left;
                y += event.deltaRect.top;
                target.style.transform = 'translate(' + x + 'px,' + y + 'px)';
                
                // Salva as novas posições
                target.setAttribute('data-x', x);
                target.setAttribute('data-y', y);
            }
        },
        modifiers: [
            // Limite de tamanho mínimo
            interact.modifiers.restrictSize({
                min: { width: 150, height: 100 }
            })
        ],
    })
    // 2. Arrastar (com dedo ou mouse)
    .draggable({
        listeners: {
            move(event) {
                var target = event.target;
                
                // Pega a posição (transform) atual e soma o movimento
                var x = (parseFloat(target.getAttribute('data-x')) || 0) + event.dx;
                var y = (parseFloat(target.getAttribute('data-y')) || 0) + event.dy;

                // Aplica o movimento
                target.style.transform = 'translate(' + x + 'px,' + y + 'px)';

                // Salva as novas posições
                target.setAttribute('data-x', x);
                target.setAttribute('data-y', y);
            }
        },
        modifiers: [
            // Traz o bloco que está sendo arrastado para a frente dos outros
            interact.modifiers.bringToFront()
        ]
    });
