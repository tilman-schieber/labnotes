// Experiment numbers and user initials: the two halves of a code like TS-012.
//
// Numbers are per project, assigned when an experiment is created and never reused; they live in
// `documents.metadata.number`. Initials come from `users.initials`, or from the display name.

// "Tilman Schieber" -> "TS", "Ana María López" -> "AML", "researcher" -> "RE".
export function initialsFor(displayName) {
  const words = String(displayName ?? '')
    .split(/[\s\-_.]+/)
    .map((word) => word.replace(/[^\p{L}\p{N}]/gu, ''))
    .filter(Boolean);
  if (words.length === 0) {
    return '';
  }
  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase();
  }
  return words.map((word) => word[0]).join('').toUpperCase().slice(0, 4);
}

// Initials as stored: letters and digits only, upper case, at most 6 characters.
export function normaliseInitials(value) {
  const cleaned = String(value ?? '').replace(/[^\p{L}\p{N}]/gu, '').toUpperCase().slice(0, 6);
  return cleaned || null;
}

export function experimentNumberOf(document) {
  const number = Number(document?.metadata?.number);
  return Number.isInteger(number) && number > 0 ? number : null;
}

// The next free number among `siblings` (experiments of the same project).
export function nextExperimentNumber(siblings) {
  const highest = siblings.reduce((max, sibling) => Math.max(max, experimentNumberOf(sibling) ?? 0), 0);
  return highest + 1;
}

// Numbers for experiments that predate numbering, per project in creation order; returns the
// documents that need a number, with the number to give them. Existing numbers are kept.
export function planBackfill(documents) {
  const experiments = documents.filter((document) => document.kind === 'experiment');
  const byProject = new Map();
  for (const experiment of experiments) {
    const list = byProject.get(experiment.parentId) ?? [];
    list.push(experiment);
    byProject.set(experiment.parentId, list);
  }

  const assignments = [];
  for (const siblings of byProject.values()) {
    const ordered = [...siblings].sort((left, right) => String(left.createdAt).localeCompare(String(right.createdAt)));
    let next = nextExperimentNumber(ordered);
    for (const experiment of ordered) {
      if (experimentNumberOf(experiment) === null) {
        assignments.push({ id: experiment.id, number: next });
        next += 1;
      }
    }
  }
  return assignments;
}

export function formatExperimentNumber(number) {
  return String(number).padStart(3, '0');
}
