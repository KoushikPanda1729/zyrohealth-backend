// Twilio's two interactive message types reply differently: a tapped
// list-picker item returns its `id` in Body, but a tapped quick-reply button
// (used automatically for <=3 options) returns the button's TITLE text in
// Body instead — confirmed empirically, not documented consistently. This
// matches either (plus plain manual typing of a number or the option name)
// so callers work the same regardless of which UI Twilio actually rendered.
export function matchOptionIndex(
  trimmed: string,
  titles: string[],
): number | undefined {
  const numeric = Number(trimmed);
  if (Number.isInteger(numeric) && numeric >= 1 && numeric <= titles.length) {
    return numeric - 1;
  }
  const lower = trimmed.trim().toLowerCase();
  const idx = titles.findIndex((t) => t.toLowerCase() === lower);
  return idx >= 0 ? idx : undefined;
}
