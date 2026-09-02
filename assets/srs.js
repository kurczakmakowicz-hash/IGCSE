/* Spaced repetition scheduling: a trimmed-down SM-2.
 *
 * A card is {ease, interval, reps, lapses, due, last}. `due` and all intervals
 * are whole days; `due` is a day index so that comparisons are timezone-stable
 * within one browser. Grades are 0 again, 1 hard, 2 good, 3 easy.
 */
window.SRS = (function () {
  var DAY = 86400000;
  var MAX_INTERVAL = 365;
  var MIN_EASE = 1.3;

  function today() {
    var d = new Date();
    d.setHours(0, 0, 0, 0);
    return Math.round(d.getTime() / DAY);
  }

  function fresh() {
    return { ease: 2.5, interval: 0, reps: 0, lapses: 0, due: today(), last: 0 };
  }

  function grade(card, g) {
    var c = card || fresh();
    var ease = c.ease || 2.5;
    var interval = c.interval || 0;
    var reps = c.reps || 0;
    var lapses = c.lapses || 0;

    if (g === 0) {
      lapses += 1;
      reps = 0;
      interval = 0;
      ease = Math.max(MIN_EASE, ease - 0.2);
    } else if (g === 1) {
      reps += 1;
      interval = interval ? Math.max(1, Math.round(interval * 1.2)) : 1;
      ease = Math.max(MIN_EASE, ease - 0.15);
    } else if (g === 2) {
      reps += 1;
      interval = reps <= 1 ? 1 : reps === 2 ? 3 : Math.round(interval * ease);
    } else {
      reps += 1;
      ease = ease + 0.15;
      interval = reps <= 1 ? 3 : Math.round(interval * ease * 1.3);
    }
    interval = Math.min(Math.max(interval, 0), MAX_INTERVAL);

    return {
      ease: Math.round(ease * 100) / 100,
      interval: interval,
      reps: reps,
      lapses: lapses,
      // A lapsed card comes back in the same session rather than tomorrow.
      due: today() + interval,
      last: Date.now()
    };
  }

  function isDue(card) {
    return !card || (card.due || 0) <= today();
  }

  /* Human-readable next interval for the grade buttons. */
  function preview(card, g) {
    var n = grade(card, g).interval;
    if (n === 0) return 'now';
    if (n === 1) return '1 day';
    if (n < 30) return n + ' days';
    if (n < 365) return Math.round(n / 30) + ' mo';
    return '1 yr';
  }

  return { today: today, fresh: fresh, grade: grade, isDue: isDue, preview: preview, DAY: DAY };
})();
