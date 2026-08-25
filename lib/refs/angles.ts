/**
 * The angle set a character needs before it can serve as a video reference.
 *
 * Front and three-quarter carry most of the weight -- image-to-video models
 * key off them. Profile and expression matter less for generation and more for
 * the human deciding whether the design actually works.
 */
export const CHARACTER_ANGLES = [
  {
    id: "front",
    label: "Front",
    fragment: "front view, facing camera directly, neutral expression, full head and shoulders",
  },
  {
    id: "three_quarter",
    label: "Three-quarter",
    fragment: "three-quarter view, head turned 45 degrees, neutral expression, head and shoulders",
  },
  {
    id: "profile",
    label: "Profile",
    fragment: "side profile view, facing left, neutral expression, head and shoulders",
  },
  {
    id: "full_body",
    label: "Full body",
    fragment: "full body standing, front view, arms relaxed at sides, full outfit visible",
  },
  {
    id: "expression",
    label: "Expression",
    fragment: "front view, mid-expression, a flicker of feeling crossing the face, head and shoulders",
  },
] as const;

export const LOCATION_ANGLES = [
  { id: "wide", label: "Wide", fragment: "wide establishing shot, no people" },
  { id: "medium", label: "Medium", fragment: "medium shot from inside the space, no people" },
  { id: "detail", label: "Detail", fragment: "close detail of a characteristic surface or object in the space" },
] as const;

export const PROP_ANGLES = [
  { id: "front", label: "Front", fragment: "front view, plain neutral background, studio lighting" },
  { id: "angle", label: "Angled", fragment: "three-quarter angle, plain neutral background, studio lighting" },
] as const;

export function anglesFor(kind: string) {
  if (kind === "character") return CHARACTER_ANGLES;
  if (kind === "location") return LOCATION_ANGLES;
  if (kind === "prop") return PROP_ANGLES;
  return [];
}
