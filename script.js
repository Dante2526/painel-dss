/* eslint-disable no-undef */ // Ignora o aviso sobre 'interact'

// "Alvo" = qualquer elemento com a classe .bloco
const alvo = '.bloco';

// 1. Ligar a função de REDIMENSIONAR
interact(alvo)
  .resizable({
    // Permitir redimensionar por todas as bordas
    edges: { left: true, right: true, bottom: true, top: true },

    listeners: {
      // O que fazer QUANDO o usuário está redimensionando
      move (event) {
        let target = event.target;
        let x = (parseFloat(target.getAttribute('data-x')) || 0);
        let y = (parseFloat(target.getAttribute('data-y')) || 0);

        // Atualiza a largura e altura no CSS do elemento
        target.style.width = event.rect.width + 'px';
        target.style.height = event.rect.height + 'px';

        // Isso é para ajustar a posição enquanto redimensiona (necessário)
        x += event.deltaRect.left;
        y += event.deltaRect.top;
        target.style.transform = 'translate(' + x + 'px,' + y + 'px)';
        target.setAttribute('data-x', x);
        target.setAttribute('data-y', y);
      }
    },
    // Manter a proporção (opcional, comente se não quiser)
    // preserveAspectRatio: true, 
    
    // Limites de tamanho
    modifiers: [
      interact.modifiers.restrictSize({
        min: { width: 150, height: 100 } // Tamanho mínimo
      })
    ]
  })
  
  // 2. Ligar a função de ARRASTAR
  .draggable({
    listeners: { 
      // O que fazer QUANDO o usuário está arrastando
      move (event) {
        let target = event.target;
        let x = (parseFloat(target.getAttribute('data-x')) || 0) + event.dx;
        let y = (parseFloat(target.getAttribute('data-y')) || 0) + event.dy;

        // Move o elemento
        target.style.transform = 'translate(' + x + 'px, ' + y + 'px)';

        // Salva a nova posição
        target.setAttribute('data-x', x);
        target.setAttribute('data-y', y);
      }
    },
    // Trazer o bloco para a frente quando é clicado
    modifiers: [
      interact.modifiers.bringToFront()
    ]
  });
