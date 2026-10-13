// Tageszeit als Timecode HH:MM:SS:FF, wie ihn Mischer und Recorder einblenden.
export function timecodeOfDay(d: Date, fps = 25): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const frames = Math.floor((d.getMilliseconds() / 1000) * fps);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}:${pad(frames)}`;
}
