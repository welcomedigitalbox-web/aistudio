/**
 * Build the image prompt for one angle of one reference.
 *
 * Order matters and is not arbitrary: style first, then subject, then angle,
 * then the sheet framing. Diffusion models weight early tokens more heavily,
 * and the style has to survive across every character in the series.
 *
 * The subject description is inserted VERBATIM. Rewording it between angles is
 * the single most common way a character's face drifts -- if the front view
 * says "sharp cheekbones" and the profile says "angular face", you get two
 * different people.
 */
export function buildRefPrompt(args: {
  styleFragment: string;
  name: string;
  description: string;
  angleFragment: string;
  kind: string;
}) {
  const { styleFragment, description, angleFragment, kind } = args;

  const sheet =
    kind === "character"
      ? "character reference sheet, plain flat background, even lighting, no props, no text, no watermark"
      : "reference plate, even lighting, no text, no watermark";

  return [styleFragment, description, angleFragment, sheet]
    .map((s) => s.trim())
    .filter(Boolean)
    .join(", ");
}

/**
 * A seed shared across every angle of one character. Same seed plus the same
 * description gives noticeably steadier features between angles on most models.
 */
export function makeSeed() {
  return Math.floor(Math.random() * 2_147_483_647);
}
