export function TaskSourceDate({ task }) {
  const date = new Date(task.occurredAt || task.createdAt);
  if (!Number.isFinite(date.getTime())) return <span>Source date unavailable</span>;
  const label = task.occurredAt
    ? (task.source === 'gmail' ? 'Received' : 'Classroom date')
    : 'Imported (source date unavailable)';
  return <span>{label}: <time dateTime={date.toISOString()}>
    {date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
  </time></span>;
}
