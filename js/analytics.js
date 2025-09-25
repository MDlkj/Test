import * as models from './models.js';
import { load as loadSettings } from './settings.js';

function formatDateInTimezone(timezone, date = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(date);
}

function sum(array) {
  return array.reduce((acc, value) => acc + value, 0);
}

function xpNeededForLevel(n) {
  return 200 * n + 40 * Math.pow(n, 1.6);
}

export async function totalsForDate(date) {
  const settings = await loadSettings();
  const timezone = settings.timezone;
  const points = await models.listPoints();
  const sessions = await models.listSessions();
  const todaysPoints = points.filter((entry) => entry.date === date);
  const pointsTotal = sum(todaysPoints.map((entry) => entry.points || 0));
  const focusMinutes = sessions
    .filter(
      (session) =>
        session.type === 'focus' &&
        session.end &&
        formatDateInTimezone(timezone, new Date(session.end)) === date
    )
    .reduce((acc, session) => acc + (session.end - session.start) / 60000, 0);
  const completions = todaysPoints.filter((entry) => entry.reason === 'completion');
  const tasksDone = completions.filter((entry) => entry.sourceType === 'task').length;
  const subtasksDone = completions.filter((entry) => entry.sourceType === 'subtask').length;
  return {
    points: pointsTotal,
    minutes: Math.round(focusMinutes),
    tasksDone,
    subtasksDone,
  };
}

export async function levelProgress() {
  const profile = await models.getProfile();
  const currentLevel = profile.level || 0;
  const currentXP = profile.xpTotal || 0;
  const nextLevel = currentLevel + 1;
  const neededForCurrent = xpNeededForLevel(currentLevel);
  const neededForNext = xpNeededForLevel(nextLevel);
  const span = Math.max(1, neededForNext - neededForCurrent);
  const intoLevel = Math.max(0, currentXP - neededForCurrent);
  const percent = Math.min(100, Math.round((intoLevel / span) * 100));
  return { level: currentLevel, percent, totalXP: currentXP };
}

export async function last30Days() {
  const settings = await loadSettings();
  const timezone = settings.timezone;
  const points = await models.listPoints();
  const sessions = await models.listSessions();
  const map = new Map();

  for (let i = 0; i < 30; i++) {
    const date = formatDateInTimezone(timezone, new Date(Date.now() - i * 86400000));
    map.set(date, { date, points: 0, minutes: 0 });
  }

  for (const entry of points) {
    if (map.has(entry.date)) {
      map.get(entry.date).points += entry.points || 0;
    }
  }

  for (const session of sessions) {
    if (session.type !== 'focus' || !session.end) continue;
    const date = formatDateInTimezone(timezone, new Date(session.end));
    if (map.has(date)) {
      map.get(date).minutes += (session.end - session.start) / 60000;
    }
  }

  const days = Array.from(map.values())
    .sort((a, b) => (a.date < b.date ? -1 : 1))
    .map((item) => ({ ...item, minutes: Math.round(item.minutes) }));

  const best = days.reduce((max, day) => (day.points > (max?.points ?? 0) ? day : max), null);
  return { days, bestDay: best };
}

export async function breakdowns() {
  const [points, tasks, subtasks, projects] = await Promise.all([
    models.listPoints(),
    models.listTasks(),
    models.listSubtasks(),
    models.listProjects(),
  ]);
  const taskMap = new Map(tasks.map((task) => [task.id, task]));
  const subtaskMap = new Map(subtasks.map((sub) => [sub.id, sub]));
  const projectMap = new Map(projects.map((project) => [project.id, project]));

  const byProject = new Map();
  const byDifficulty = new Map();

  for (const entry of points) {
    if (entry.reason !== 'completion') continue;
    let projectId = null;
    let difficulty = entry.difficulty ?? 1;
    if (entry.sourceType === 'task') {
      const task = taskMap.get(entry.sourceId);
      if (task) {
        projectId = task.projectId;
        difficulty = task.difficulty ?? difficulty;
      }
    } else if (entry.sourceType === 'subtask') {
      const sub = subtaskMap.get(entry.sourceId);
      if (sub) {
        difficulty = sub.difficulty ?? difficulty;
        const parent = taskMap.get(sub.taskId);
        projectId = parent?.projectId ?? null;
      }
    }
    if (projectId) {
      const bucket = byProject.get(projectId) || { projectId, points: 0, completions: 0 };
      bucket.points += entry.points || 0;
      bucket.completions += 1;
      byProject.set(projectId, bucket);
    }
    const diffBucket = byDifficulty.get(difficulty) || { difficulty, points: 0, completions: 0 };
    diffBucket.points += entry.points || 0;
    diffBucket.completions += 1;
    byDifficulty.set(difficulty, diffBucket);
  }

  const projectResults = Array.from(byProject.values()).map((bucket) => ({
    ...bucket,
    name: projectMap.get(bucket.projectId)?.name ?? 'Other',
    color: projectMap.get(bucket.projectId)?.color ?? '#999999',
  }));

  const difficultyResults = Array.from(byDifficulty.values()).sort((a, b) => a.difficulty - b.difficulty);

  return { byProject: projectResults, byDifficulty: difficultyResults };
}

