// Reusable multiple-choice quiz.
// Markup:
// <div class="quiz">
//   <div class="q" data-answer="1">            (0-based index of the right option)
//     <p class="prompt">Question?</p>
//     <ol class="opts"><li>A</li><li>B</li><li>C</li></ol>
//     <p class="why">Explanation shown after answering.</p>
//   </div>
// </div>
// <p class="quiz-score"></p>
(function () {
  const style = document.createElement('style');
  style.textContent = `
    .quiz .q { margin: 1.5rem 0; }
    .quiz .prompt { font-weight: 600; margin-bottom: .4rem; }
    .quiz .opts { list-style: none; padding: 0; margin: 0; }
    .quiz .opts li { border: 1px solid var(--rule); border-radius: 6px; padding: .5rem .8rem; margin: .35rem 0;
      cursor: pointer; background: var(--surface); font-size: .95em; }
    .quiz .opts li:hover { border-color: var(--accent); }
    .quiz .opts li:focus-visible { outline: 2px solid var(--accent); }
    .quiz .done li { cursor: default; }
    .quiz .done li:hover { border-color: var(--rule); }
    .quiz li.right { background: var(--good-soft); border-color: var(--good); }
    .quiz li.wrong { background: var(--bad-soft); border-color: var(--bad); }
    .quiz .why { display: none; font-size: .92em; color: var(--muted); margin: .5rem 0 0; }
    .quiz .done ~ .why { display: block; }
    .quiz-score { font: 600 .9rem system-ui, sans-serif; color: var(--accent); }
  `;
  document.head.appendChild(style);

  document.querySelectorAll('.quiz').forEach((quiz) => {
    const questions = quiz.querySelectorAll('.q');
    const score = quiz.parentElement.querySelector('.quiz-score');
    let answered = 0, correct = 0;
    questions.forEach((q) => {
      const answer = Number(q.dataset.answer);
      const list = q.querySelector('.opts');
      list.querySelectorAll('li').forEach((li, i) => {
        li.tabIndex = 0;
        const pick = () => {
          if (list.classList.contains('done')) return;
          list.classList.add('done');
          li.classList.add(i === answer ? 'right' : 'wrong');
          list.children[answer].classList.add('right');
          answered++; if (i === answer) correct++;
          if (score) score.textContent = `${correct} / ${answered} certas` +
            (answered === questions.length ? ' — recarregue a página para tentar de novo amanhã.' : '');
        };
        li.addEventListener('click', pick);
        li.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
      });
    });
  });
})();
