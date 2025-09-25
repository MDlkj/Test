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

function xpNeeded(n) {
  return 200 * n + 40 * Math.pow(n, 1.6);
}

export function levelForXP(xp) {
  let level = 0;
  while (xp >= xpNeeded(level + 1)) {
    level += 1;
    if (level > 9999) break;
  }
  return level;
}

function diffDays(a, b) {
  const da = new Date(a + 'T00:00:00Z');
  const db = new Date(b + 'T00:00:00Z');
  const diff = Math.round((db - da) / 86400000);
  return diff;
}

async function focusMinutesForTarget(targetType, targetId) {
  const sessions = await models.getSessionsForTarget(targetType, targetId);
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  let minutes = 0;
  for (const session of sessions) {
    if (session.type !== 'focus') continue;
    if (!session.end) continue;
    if (session.end < cutoff) continue;
    minutes += (session.end - session.start) / 60000;
  }
  return minutes;
}

async function completionMeta(targetType, id) {
  if (targetType === 'task') {
    const task = await models.getTask(id);
    return { target: task, parentTask: task };
  }
  if (targetType === 'subtask') {
    const sub = await models.getSubtask(id);
    const parent = sub ? await models.getTask(sub.taskId) : null;
    return { target: sub, parentTask: parent };
  }
  return { target: null, parentTask: null };
}

function computeXP({ base, difficulty, focusMinutes, pomoMinutes, streakBonus }) {
  const mult = 0.8 + 0.2 * difficulty;
  const focusBonus = Math.min(focusMinutes / pomoMinutes, 1) * 0.5;
  const xp = Math.round(base * mult * (1 + focusBonus) * streakBonus);
  return xp;
}

async function updateStreak(profile, today) {
  if (!profile.lastActiveDate) {
    profile.streakDays = 1;
  } else if (profile.lastActiveDate === today) {
    // streak unchanged
  } else {
    const diff = diffDays(profile.lastActiveDate, today);
    if (diff === 1) {
      profile.streakDays += 1;
    } else if (diff > 1) {
      profile.streakDays = 1;
    }
  }
  profile.lastActiveDate = today;
}

async function evaluateBadges(profile, settings, completionRecord) {
  const newlyEarned = [];
  const badgeSet = new Set(profile.badges || []);

  function ensure(id) {
    if (!badgeSet.has(id)) {
      badgeSet.add(id);
      newlyEarned.push(id);
    }
  }

  if (profile.streakDays >= 3) ensure('stay-hard-i');
  if (profile.streakDays >= 7) ensure('stay-hard-ii');
  if (profile.streakDays >= 30) ensure('stay-hard-iii');

  if (completionRecord?.difficulty >= 4) {
    const ledger = await models.listPoints();
    const recentDates = new Set();
    for (let i = 0; i < 7; i++) {
      const date = new Date(Date.now() - i * 86400000);
      recentDates.add(formatDateInTimezone(settings.timezone, date));
    }
    const difficultCompletions = ledger.filter(
      (entry) =>
        entry.reason === 'completion' &&
        entry.difficulty >= 4 &&
        recentDates.has(entry.date)
    );
    if (difficultCompletions.length >= 5) ensure('cookie-jar');
  }

  const today = formatDateInTimezone(settings.timezone);
  const sessions = await models.listSessions();
  const todaysFocus = sessions.filter(
    (session) =>
      session.type === 'focus' &&
      session.end &&
      formatDateInTimezone(settings.timezone, new Date(session.end)) === today
  );
  if (todaysFocus.length >= 4) ensure('cant-hurt-me');

  const ledger = await models.listPoints();
  const daysNeeded = 10;
  const daySet = new Set();
  for (const entry of ledger) {
    if (entry.reason === 'completion' && entry.points > 0) {
      daySet.add(entry.date);
    }
  }
  const ordered = Array.from(daySet).sort();
  let bestRun = 0;
  let run = 0;
  for (let i = 0; i < ordered.length; i++) {
    if (i === 0) {
      run = 1;
    } else {
      const prev = ordered[i - 1];
      const diff = diffDays(prev, ordered[i]);
      if (diff === 1) {
        run += 1;
      } else if (diff === 0) {
        // same day, ignore
      } else {
        run = 1;
      }
    }
    if (run > bestRun) bestRun = run;
  }
  if (bestRun >= daysNeeded) ensure('accountability-mirror');

  profile.badges = Array.from(badgeSet);
  return newlyEarned;
}

export async function awardOnComplete(targetType, id) {
  const settings = await loadSettings();
  const profile = await models.getProfile();
  const meta = await completionMeta(targetType, id);
  if (!meta.target) return { xpAwarded: 0, badges: [] };

  if (targetType === 'subtask' && meta.parentTask && meta.parentTask.awardSubtasksSeparately === false) {
    return { xpAwarded: 0, badges: [] };
  }

  const focusMinutes = await focusMinutesForTarget(targetType, id);
  const pomoMinutes = settings.pomoMinutes || 25;
  const base = targetType === 'task' ? 50 : 15;
  const difficulty = meta.target.difficulty ?? 1;
  const streakBonus = 1 + 0.05 * Math.min(profile.streakDays || 0, 20);
  let xp = computeXP({ base, difficulty, focusMinutes, pomoMinutes, streakBonus });

  if (targetType === 'subtask' && focusMinutes < 3) {
    xp = 0;
  }
  if (targetType === 'task' && focusMinutes <= 2) {
    xp = Math.min(xp, 10);
  }

  if (xp <= 0) {
    return { xpAwarded: 0, badges: [] };
  }

  const today = formatDateInTimezone(settings.timezone);
  await updateStreak(profile, today);
  profile.xpTotal = (profile.xpTotal || 0) + xp;
  profile.level = levelForXP(profile.xpTotal);

  const record = {
    date: today,
    sourceType: targetType,
    sourceId: id,
    points: xp,
    reason: 'completion',
    difficulty,
    createdAt: Date.now(),
  };
  await models.addPoints(record);

  const badges = await evaluateBadges(profile, settings, record);
  await models.updateProfile(profile);
  return { xpAwarded: xp, badges };
}

