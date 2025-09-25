import { h, clear } from './render.js';

function drawSparkline(canvas, values, highlightIndex) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const width = canvas.width;
  const height = canvas.height;
  ctx.clearRect(0, 0, width, height);
  if (!values.length) return;
  const max = Math.max(...values, 1);
  const step = values.length > 1 ? width / (values.length - 1) : 0;
  ctx.strokeStyle = '#ff5a36';
  ctx.lineWidth = 2;
  ctx.beginPath();
  values.forEach((value, index) => {
    const x = index * step;
    const y = height - (value / max) * height;
    if (index === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  });
  ctx.stroke();
  if (highlightIndex != null && highlightIndex >= 0) {
    const hx = highlightIndex * step;
    const hy = height - (values[highlightIndex] / max) * height;
    ctx.fillStyle = '#ffd166';
    ctx.beginPath();
    ctx.arc(hx, hy, 4, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function render(container, data) {
  clear(container);
  const todayCard = h('div', { className: 'dashboard-grid' });
  todayCard.appendChild(h('div', { className: 'dashboard-row' }, ['Points today', `${data.today.points}`]));
  todayCard.appendChild(h('div', { className: 'dashboard-row' }, ['Productive minutes', `${data.today.minutes}`]));
  todayCard.appendChild(h('div', { className: 'dashboard-row' }, ['Tasks done', `${data.today.tasksDone}`]));
  todayCard.appendChild(h('div', { className: 'dashboard-row' }, ['Subtasks done', `${data.today.subtasksDone}`]));
  todayCard.appendChild(h('div', { className: 'dashboard-row' }, ['🔥 Streak', `${data.profile.streakDays} days`]));
  todayCard.appendChild(h('div', { className: 'dashboard-row' }, ['Level', `Lv ${data.level.level} (${data.level.percent}% to next)`]));
  container.appendChild(todayCard);

  const historyCard = h('div', { className: 'history-card' });
  historyCard.appendChild(h('h3', {}, 'Last 30 days'));
  const pointsCanvas = h('canvas', { className: 'sparkline', width: 260, height: 60 });
  const minutesCanvas = h('canvas', { className: 'sparkline', width: 260, height: 60 });
  historyCard.appendChild(h('div', {}, 'Points'));
  historyCard.appendChild(pointsCanvas);
  historyCard.appendChild(h('div', {}, 'Minutes'));
  historyCard.appendChild(minutesCanvas);
  container.appendChild(historyCard);
  const pointsValues = data.history.days.map((day) => day.points);
  const minutesValues = data.history.days.map((day) => day.minutes);
  const bestIndex = data.history.bestDay ? data.history.days.findIndex((day) => day.date === data.history.bestDay.date) : null;
  drawSparkline(pointsCanvas, pointsValues, bestIndex);
  drawSparkline(minutesCanvas, minutesValues, bestIndex);

  const breakdownCard = h('div', { className: 'breakdown-card' });
  breakdownCard.appendChild(h('h3', {}, 'Breakdown'));
  const projectList = h('ul');
  data.breakdowns.byProject.forEach((bucket) => {
    projectList.appendChild(h('li', {}, `${bucket.name}: ${bucket.points} pts (${bucket.completions} done)`));
  });
  const difficultyList = h('ul');
  data.breakdowns.byDifficulty.forEach((bucket) => {
    difficultyList.appendChild(h('li', {}, `Difficulty ${bucket.difficulty}: ${bucket.points} pts`));
  });
  breakdownCard.appendChild(h('h4', {}, 'Projects'));
  breakdownCard.appendChild(projectList);
  breakdownCard.appendChild(h('h4', {}, 'Difficulty'));
  breakdownCard.appendChild(difficultyList);
  container.appendChild(breakdownCard);
}

