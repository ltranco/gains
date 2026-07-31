import { fuzzyScoreTerms } from "./fuzzy"
import {
  EQUIPMENT_LABEL,
  type Equipment,
  type Exercise,
  type Group,
  type Kind,
} from "./types"

/**
 * The exercise catalog, as movements crossed with the implements they're actually done
 * with. Two axes, not one flat list of name-strings: you asked for variants of the same
 * movement to be separate entries, and making that structural means the picker can collapse
 * eleven curls into one expandable row instead of eleven rows to scroll past.
 *
 * Pairs are enumerated by hand, never generated. A cross-product produces "Machine
 * Deadlift" and "Barbell Push Up".
 *
 * Modifiers that change the movement rather than the implement — Incline, Decline,
 * Preacher, Hammer, Concentration — are folded into the movement name. Promoting them to a
 * third axis multiplies out into mostly-nonsense.
 *
 * `slug` is what lands in stored data, so it is frozen. `movement` is display text and can
 * be reworded freely.
 */

type Variant = Equipment | { eq: Equipment; kind?: Kind; name?: string }

interface MovementDef {
  slug: string
  movement: string
  group: Group
  /** Default for every variant; a variant may override (e.g. bodyweight vs cable crunch). */
  kind: Kind
  variants: Variant[]
}

const MOVEMENTS: MovementDef[] = [
  // ─── Push — chest ──────────────────────────────────────────────────────────
  {
    slug: "bench_press",
    movement: "Bench Press",
    group: "push",
    kind: "weight_reps",
    variants: ["barbell", "dumbbell", "machine", "smith"],
  },
  {
    slug: "incline_bench_press",
    movement: "Incline Bench Press",
    group: "push",
    kind: "weight_reps",
    variants: ["barbell", "dumbbell", "machine", "smith"],
  },
  {
    slug: "decline_bench_press",
    movement: "Decline Bench Press",
    group: "push",
    kind: "weight_reps",
    variants: ["barbell", "dumbbell", "machine"],
  },
  {
    slug: "chest_fly",
    movement: "Chest Fly",
    group: "push",
    kind: "weight_reps",
    variants: ["dumbbell", "cable", "machine"],
  },
  {
    slug: "incline_chest_fly",
    movement: "Incline Chest Fly",
    group: "push",
    kind: "weight_reps",
    variants: ["dumbbell", "cable"],
  },
  // Weight-based, not rep-based: a dip belt makes this a loadable movement, and bodyweight
  // is simply 0kg on the same scale. Same call as pull ups, for the same reason.
  {
    slug: "dip",
    movement: "Dip",
    group: "push",
    kind: "weight_reps",
    variants: [{ eq: "bodyweight", name: "Dip" }],
  },
  {
    slug: "push_up",
    movement: "Push Up",
    group: "push",
    kind: "reps",
    variants: [{ eq: "bodyweight", name: "Push Up" }],
  },
  {
    slug: "diamond_push_up",
    movement: "Diamond Push Up",
    group: "push",
    kind: "reps",
    variants: [{ eq: "bodyweight", name: "Diamond Push Up" }],
  },
  {
    slug: "pike_push_up",
    movement: "Pike Push Up",
    group: "push",
    kind: "reps",
    variants: [{ eq: "bodyweight", name: "Pike Push Up" }],
  },

  // ─── Push — shoulders ─────────────────────────────────────────────────────
  {
    slug: "overhead_press",
    movement: "Overhead Press",
    group: "push",
    kind: "weight_reps",
    variants: ["barbell", "dumbbell", "machine", "smith"],
  },
  {
    slug: "arnold_press",
    movement: "Arnold Press",
    group: "push",
    kind: "weight_reps",
    variants: ["dumbbell"],
  },
  {
    slug: "lateral_raise",
    movement: "Lateral Raise",
    group: "push",
    kind: "weight_reps",
    variants: ["dumbbell", "cable", "machine"],
  },
  {
    slug: "front_raise",
    movement: "Front Raise",
    group: "push",
    kind: "weight_reps",
    variants: ["dumbbell", "cable", "barbell"],
  },

  // ─── Push — triceps ───────────────────────────────────────────────────────
  {
    slug: "tricep_pushdown",
    movement: "Tricep Pushdown",
    group: "push",
    kind: "weight_reps",
    variants: ["cable"],
  },
  {
    slug: "overhead_tricep_extension",
    movement: "Overhead Tricep Extension",
    group: "push",
    kind: "weight_reps",
    variants: ["dumbbell", "cable", "ez_bar"],
  },
  {
    slug: "skull_crusher",
    movement: "Skull Crusher",
    group: "push",
    kind: "weight_reps",
    variants: ["ez_bar", "barbell", "dumbbell"],
  },
  {
    slug: "close_grip_bench_press",
    movement: "Close-Grip Bench Press",
    group: "push",
    kind: "weight_reps",
    variants: ["barbell"],
  },
  {
    slug: "tricep_kickback",
    movement: "Tricep Kickback",
    group: "push",
    kind: "weight_reps",
    variants: ["dumbbell", "cable"],
  },

  // ─── Pull — back ──────────────────────────────────────────────────────────
  // The movement you called out. Loadable, so `weight_reps` with 0 meaning bodyweight.
  {
    slug: "pull_up",
    movement: "Pull Up",
    group: "pull",
    kind: "weight_reps",
    variants: [{ eq: "bodyweight", name: "Pull Up" }],
  },
  {
    slug: "chin_up",
    movement: "Chin Up",
    group: "pull",
    kind: "weight_reps",
    variants: [{ eq: "bodyweight", name: "Chin Up" }],
  },
  {
    slug: "neutral_grip_pull_up",
    movement: "Neutral-Grip Pull Up",
    group: "pull",
    kind: "weight_reps",
    variants: [{ eq: "bodyweight", name: "Neutral-Grip Pull Up" }],
  },
  {
    slug: "inverted_row",
    movement: "Inverted Row",
    group: "pull",
    kind: "weight_reps",
    variants: [{ eq: "bodyweight", name: "Inverted Row" }],
  },
  {
    slug: "row",
    movement: "Row",
    group: "pull",
    kind: "weight_reps",
    variants: ["barbell", "dumbbell", "cable", "machine", "t_bar", "smith"],
  },
  {
    slug: "lat_pulldown",
    movement: "Lat Pulldown",
    group: "pull",
    kind: "weight_reps",
    variants: ["cable", "machine"],
  },
  {
    slug: "close_grip_lat_pulldown",
    movement: "Close-Grip Lat Pulldown",
    group: "pull",
    kind: "weight_reps",
    variants: ["cable"],
  },
  {
    slug: "straight_arm_pulldown",
    movement: "Straight-Arm Pulldown",
    group: "pull",
    kind: "weight_reps",
    variants: ["cable"],
  },
  {
    slug: "deadlift",
    movement: "Deadlift",
    group: "pull",
    kind: "weight_reps",
    variants: ["barbell", "trap_bar", "dumbbell"],
  },
  {
    slug: "rack_pull",
    movement: "Rack Pull",
    group: "pull",
    kind: "weight_reps",
    variants: ["barbell"],
  },
  {
    slug: "face_pull",
    movement: "Face Pull",
    group: "pull",
    kind: "weight_reps",
    variants: ["cable"],
  },
  {
    slug: "rear_delt_fly",
    movement: "Rear Delt Fly",
    group: "pull",
    kind: "weight_reps",
    variants: ["dumbbell", "cable", "machine"],
  },
  {
    slug: "shrug",
    movement: "Shrug",
    group: "pull",
    kind: "weight_reps",
    variants: ["barbell", "dumbbell", "trap_bar", "machine", "smith"],
  },
  {
    slug: "upright_row",
    movement: "Upright Row",
    group: "pull",
    kind: "weight_reps",
    variants: ["barbell", "dumbbell", "cable"],
  },
  {
    slug: "dead_hang",
    movement: "Dead Hang",
    group: "pull",
    kind: "duration",
    variants: [{ eq: "bodyweight", name: "Dead Hang" }],
  },

  // ─── Pull — biceps & forearms ─────────────────────────────────────────────
  // The example you gave. One movement, six implements, each its own entry.
  {
    slug: "bicep_curl",
    movement: "Bicep Curl",
    group: "pull",
    kind: "weight_reps",
    variants: ["dumbbell", "barbell", "ez_bar", "cable", "machine", "band"],
  },
  {
    slug: "hammer_curl",
    movement: "Hammer Curl",
    group: "pull",
    kind: "weight_reps",
    variants: ["dumbbell", "cable"],
  },
  {
    slug: "preacher_curl",
    movement: "Preacher Curl",
    group: "pull",
    kind: "weight_reps",
    variants: ["ez_bar", "dumbbell", "machine"],
  },
  {
    slug: "incline_curl",
    movement: "Incline Curl",
    group: "pull",
    kind: "weight_reps",
    variants: ["dumbbell"],
  },
  {
    slug: "concentration_curl",
    movement: "Concentration Curl",
    group: "pull",
    kind: "weight_reps",
    variants: ["dumbbell"],
  },
  {
    slug: "spider_curl",
    movement: "Spider Curl",
    group: "pull",
    kind: "weight_reps",
    variants: ["dumbbell", "ez_bar"],
  },
  {
    slug: "reverse_curl",
    movement: "Reverse Curl",
    group: "pull",
    kind: "weight_reps",
    variants: ["ez_bar", "barbell", "dumbbell", "cable"],
  },
  {
    slug: "wrist_curl",
    movement: "Wrist Curl",
    group: "pull",
    kind: "weight_reps",
    variants: ["dumbbell", "barbell"],
  },

  // ─── Legs — quads ─────────────────────────────────────────────────────────
  {
    slug: "squat",
    movement: "Squat",
    group: "legs",
    kind: "weight_reps",
    variants: ["barbell", "smith", "dumbbell"],
  },
  {
    slug: "front_squat",
    movement: "Front Squat",
    group: "legs",
    kind: "weight_reps",
    variants: ["barbell"],
  },
  {
    slug: "hack_squat",
    movement: "Hack Squat",
    group: "legs",
    kind: "weight_reps",
    variants: ["machine"],
  },
  {
    slug: "kettlebell_swing",
    movement: "Kettlebell Swing",
    group: "legs",
    kind: "weight_reps",
    variants: [{ eq: "kettlebell", name: "Kettlebell Swing" }],
  },
  {
    slug: "goblet_squat",
    movement: "Goblet Squat",
    group: "legs",
    kind: "weight_reps",
    variants: ["kettlebell", "dumbbell"],
  },
  {
    slug: "air_squat",
    movement: "Air Squat",
    group: "legs",
    kind: "reps",
    variants: [{ eq: "bodyweight", name: "Air Squat" }],
  },
  {
    slug: "leg_press",
    movement: "Leg Press",
    group: "legs",
    kind: "weight_reps",
    variants: ["machine"],
  },
  {
    slug: "leg_extension",
    movement: "Leg Extension",
    group: "legs",
    kind: "weight_reps",
    variants: ["machine"],
  },
  {
    slug: "lunge",
    movement: "Lunge",
    group: "legs",
    kind: "weight_reps",
    variants: ["dumbbell", "barbell", { eq: "bodyweight", kind: "reps", name: "Lunge" }],
  },
  {
    slug: "walking_lunge",
    movement: "Walking Lunge",
    group: "legs",
    kind: "weight_reps",
    variants: ["dumbbell", "barbell"],
  },
  {
    slug: "bulgarian_split_squat",
    movement: "Bulgarian Split Squat",
    group: "legs",
    kind: "weight_reps",
    variants: [
      "dumbbell",
      "barbell",
      { eq: "bodyweight", kind: "reps", name: "Bulgarian Split Squat" },
    ],
  },
  {
    slug: "step_up",
    movement: "Step Up",
    group: "legs",
    kind: "weight_reps",
    variants: ["dumbbell", { eq: "bodyweight", kind: "reps", name: "Step Up" }],
  },
  {
    slug: "wall_sit",
    movement: "Wall Sit",
    group: "legs",
    kind: "duration",
    variants: [{ eq: "bodyweight", name: "Wall Sit" }],
  },

  // ─── Legs — hamstrings & glutes ───────────────────────────────────────────
  {
    slug: "romanian_deadlift",
    movement: "Romanian Deadlift",
    group: "legs",
    kind: "weight_reps",
    variants: ["barbell", "dumbbell"],
  },
  {
    slug: "leg_curl",
    movement: "Leg Curl",
    group: "legs",
    kind: "weight_reps",
    variants: ["machine"],
  },
  {
    slug: "seated_leg_curl",
    movement: "Seated Leg Curl",
    group: "legs",
    kind: "weight_reps",
    variants: ["machine"],
  },
  {
    slug: "nordic_curl",
    movement: "Nordic Curl",
    group: "legs",
    kind: "reps",
    variants: [{ eq: "bodyweight", name: "Nordic Curl" }],
  },
  {
    slug: "hip_thrust",
    movement: "Hip Thrust",
    group: "legs",
    kind: "weight_reps",
    variants: ["barbell", "machine"],
  },
  {
    slug: "glute_bridge",
    movement: "Glute Bridge",
    group: "legs",
    kind: "weight_reps",
    variants: ["barbell", { eq: "bodyweight", kind: "reps", name: "Glute Bridge" }],
  },
  {
    slug: "glute_kickback",
    movement: "Glute Kickback",
    group: "legs",
    kind: "weight_reps",
    variants: ["cable", "machine"],
  },
  {
    slug: "good_morning",
    movement: "Good Morning",
    group: "legs",
    kind: "weight_reps",
    variants: ["barbell"],
  },
  {
    slug: "back_extension",
    movement: "Back Extension",
    group: "legs",
    kind: "weight_reps",
    variants: [{ eq: "bodyweight", name: "Back Extension" }, "machine"],
  },

  // ─── Legs — calves & hips ─────────────────────────────────────────────────
  {
    slug: "calf_raise",
    movement: "Calf Raise",
    group: "legs",
    kind: "weight_reps",
    variants: [
      "machine",
      "smith",
      "barbell",
      "dumbbell",
      { eq: "bodyweight", kind: "reps", name: "Calf Raise" },
    ],
  },
  {
    slug: "seated_calf_raise",
    movement: "Seated Calf Raise",
    group: "legs",
    kind: "weight_reps",
    variants: ["machine"],
  },
  {
    slug: "hip_abduction",
    movement: "Hip Abduction",
    group: "legs",
    kind: "weight_reps",
    variants: ["machine", "cable"],
  },
  {
    slug: "hip_adduction",
    movement: "Hip Adduction",
    group: "legs",
    kind: "weight_reps",
    variants: ["machine"],
  },

  // ─── Core — holds ─────────────────────────────────────────────────────────
  // Duration, exactly as you said. Reps would be meaningless here.
  {
    slug: "plank",
    movement: "Plank",
    group: "core",
    kind: "duration",
    variants: [{ eq: "bodyweight", name: "Plank" }],
  },
  {
    slug: "side_plank",
    movement: "Side Plank",
    group: "core",
    kind: "duration",
    variants: [{ eq: "bodyweight", name: "Side Plank" }],
  },
  {
    slug: "hollow_body_hold",
    movement: "Hollow Body Hold",
    group: "core",
    kind: "duration",
    variants: [{ eq: "bodyweight", name: "Hollow Body Hold" }],
  },
  {
    slug: "l_sit",
    movement: "L-Sit",
    group: "core",
    kind: "duration",
    variants: [{ eq: "bodyweight", name: "L-Sit" }],
  },

  // ─── Core — reps ──────────────────────────────────────────────────────────
  // Crunch shows why kind lives on the variant, not the movement: bodyweight crunches are
  // rep-based, cable crunches are a loaded movement you progress by weight.
  {
    slug: "crunch",
    movement: "Crunch",
    group: "core",
    kind: "reps",
    variants: [
      { eq: "bodyweight", name: "Crunch" },
      { eq: "cable", kind: "weight_reps" },
      { eq: "machine", kind: "weight_reps" },
    ],
  },
  {
    slug: "sit_up",
    movement: "Sit Up",
    group: "core",
    kind: "reps",
    variants: [{ eq: "bodyweight", name: "Sit Up" }],
  },
  {
    slug: "leg_raise",
    movement: "Leg Raise",
    group: "core",
    kind: "reps",
    variants: [{ eq: "bodyweight", name: "Leg Raise" }],
  },
  {
    slug: "hanging_leg_raise",
    movement: "Hanging Leg Raise",
    group: "core",
    kind: "reps",
    variants: [{ eq: "bodyweight", name: "Hanging Leg Raise" }],
  },
  {
    slug: "toes_to_bar",
    movement: "Toes to Bar",
    group: "core",
    kind: "reps",
    variants: [{ eq: "bodyweight", name: "Toes to Bar" }],
  },
  {
    slug: "ab_wheel_rollout",
    movement: "Ab Wheel Rollout",
    group: "core",
    kind: "reps",
    variants: [{ eq: "bodyweight", name: "Ab Wheel Rollout" }],
  },
  {
    slug: "russian_twist",
    movement: "Russian Twist",
    group: "core",
    kind: "reps",
    variants: [
      { eq: "bodyweight", name: "Russian Twist" },
      { eq: "dumbbell", kind: "weight_reps" },
    ],
  },
  {
    slug: "bicycle_crunch",
    movement: "Bicycle Crunch",
    group: "core",
    kind: "reps",
    variants: [{ eq: "bodyweight", name: "Bicycle Crunch" }],
  },
  {
    slug: "v_up",
    movement: "V-Up",
    group: "core",
    kind: "reps",
    variants: [{ eq: "bodyweight", name: "V-Up" }],
  },
  {
    slug: "dead_bug",
    movement: "Dead Bug",
    group: "core",
    kind: "reps",
    variants: [{ eq: "bodyweight", name: "Dead Bug" }],
  },
  {
    slug: "mountain_climber",
    movement: "Mountain Climber",
    group: "core",
    kind: "reps",
    variants: [{ eq: "bodyweight", name: "Mountain Climber" }],
  },
  {
    slug: "woodchopper",
    movement: "Woodchopper",
    group: "core",
    kind: "weight_reps",
    variants: ["cable"],
  },
  {
    slug: "pallof_press",
    movement: "Pallof Press",
    group: "core",
    kind: "weight_reps",
    variants: ["cable", "band"],
  },

  // ─── Cardio ───────────────────────────────────────────────────────────────
  // The equipment axis stops earning its keep here, so these carry explicit names: a
  // machine is part of what the exercise *is*, not an implement you swap.
  {
    slug: "run",
    movement: "Run",
    group: "cardio",
    kind: "distance",
    variants: [{ eq: "bodyweight", name: "Run" }],
  },
  {
    slug: "treadmill",
    movement: "Treadmill",
    group: "cardio",
    kind: "distance",
    variants: [{ eq: "machine", name: "Treadmill" }],
  },
  {
    slug: "walk",
    movement: "Walk",
    group: "cardio",
    kind: "distance",
    variants: [{ eq: "bodyweight", name: "Walk" }],
  },
  {
    slug: "hike",
    movement: "Hike",
    group: "cardio",
    kind: "distance",
    variants: [{ eq: "bodyweight", name: "Hike" }],
  },
  {
    slug: "cycle",
    movement: "Cycle",
    group: "cardio",
    kind: "distance",
    variants: [{ eq: "bodyweight", name: "Cycle" }],
  },
  {
    slug: "swim",
    movement: "Swim",
    group: "cardio",
    kind: "distance",
    variants: [{ eq: "bodyweight", name: "Swim" }],
  },
  {
    slug: "rowing_machine",
    movement: "Rowing Machine",
    group: "cardio",
    kind: "distance",
    variants: [{ eq: "machine", name: "Rowing Machine" }],
  },
  {
    slug: "ski_erg",
    movement: "Ski Erg",
    group: "cardio",
    kind: "distance",
    variants: [{ eq: "machine", name: "Ski Erg" }],
  },
  {
    slug: "stationary_bike",
    movement: "Stationary Bike",
    group: "cardio",
    kind: "duration",
    variants: [{ eq: "machine", name: "Stationary Bike" }],
  },
  {
    slug: "assault_bike",
    movement: "Assault Bike",
    group: "cardio",
    kind: "duration",
    variants: [{ eq: "machine", name: "Assault Bike" }],
  },
  {
    slug: "elliptical",
    movement: "Elliptical",
    group: "cardio",
    kind: "duration",
    variants: [{ eq: "machine", name: "Elliptical" }],
  },
  {
    slug: "stair_climber",
    movement: "Stair Climber",
    group: "cardio",
    kind: "duration",
    variants: [{ eq: "machine", name: "Stair Climber" }],
  },
  {
    slug: "jump_rope",
    movement: "Jump Rope",
    group: "cardio",
    kind: "duration",
    variants: [{ eq: "bodyweight", name: "Jump Rope" }],
  },
  {
    slug: "burpee",
    movement: "Burpee",
    group: "cardio",
    kind: "reps",
    variants: [{ eq: "bodyweight", name: "Burpee" }],
  },
  {
    slug: "box_jump",
    movement: "Box Jump",
    group: "cardio",
    kind: "reps",
    variants: [{ eq: "bodyweight", name: "Box Jump" }],
  },
]

/** Display name overrides, keyed by exercise id, for the handful that need one. */
const NAME_OVERRIDES = new Map<string, string>()

function build(): Exercise[] {
  const out: Exercise[] = []
  for (const def of MOVEMENTS) {
    for (const v of def.variants) {
      const variant = typeof v === "string" ? { eq: v } : v
      const id = `${def.slug}.${variant.eq}`
      if (variant.name) NAME_OVERRIDES.set(id, variant.name)
      out.push({
        id,
        movement: def.movement,
        equipment: variant.eq,
        group: def.group,
        kind: variant.kind ?? def.kind,
      })
    }
  }
  return out
}

export const CATALOG: Exercise[] = build()

const BY_ID = new Map(CATALOG.map((e) => [e.id, e]))

export function byId(id: string): Exercise | undefined {
  return BY_ID.get(id)
}

/**
 * "Dumbbell Bicep Curl". Bodyweight and cardio entries carry an explicit name instead,
 * because "Bodyweight Push Up" and "Machine Treadmill" both read as machine output.
 */
export function displayName(ex: Exercise): string {
  return (
    NAME_OVERRIDES.get(ex.id) ?? `${EQUIPMENT_LABEL[ex.equipment]} ${ex.movement}`
  )
}

/** Short label used inside a collapsed movement row, where the movement is already shown. */
export function variantLabel(ex: Exercise): string {
  const override = NAME_OVERRIDES.get(ex.id)
  if (override) return override === ex.movement ? "Bodyweight" : override
  return EQUIPMENT_LABEL[ex.equipment]
}

export interface MovementGroup {
  slug: string
  movement: string
  group: Group
  variants: Exercise[]
}

/** Catalog collapsed back to movements, preserving declaration order. */
export const MOVEMENT_GROUPS: MovementGroup[] = MOVEMENTS.map((def) => ({
  slug: def.slug,
  movement: def.movement,
  group: def.group,
  variants: CATALOG.filter((e) => e.id.startsWith(`${def.slug}.`)),
}))

export function movementGroupsIn(group: Group): MovementGroup[] {
  return MOVEMENT_GROUPS.filter((m) => m.group === group)
}

/**
 * Fuzzy search, ranked. Terms may come in any order, so "db curl", "curl db" and "curl
 * dumbbell" all find Dumbbell Bicep Curl — which plain substring matching could not.
 *
 * Scored against the display name first, because that's what you're picturing when you type.
 * Group and equipment are searched at a discount so "pull" still surfaces the pull group
 * without letting those fields outrank a real name match.
 */
export function search(query: string): Exercise[] {
  const q = query.trim()
  if (!q) return []

  const scored: { exercise: Exercise; score: number }[] = []
  for (const e of CATALOG) {
    const name = displayName(e)
    const primary = fuzzyScoreTerms(q, name)
    const secondary = fuzzyScoreTerms(q, `${name} ${e.movement} ${EQUIPMENT_LABEL[e.equipment]} ${e.group}`)

    const base = primary !== null ? primary : secondary !== null ? secondary * 0.4 - 20 : null
    if (base === null) continue
    // Nudge toward the implement people mean by default. Small enough that it never beats a
    // better text match, large enough to settle near-identical ones.
    const score = base + (11 - EQUIPMENT_RANK[e.equipment]) * 4
    scored.push({ exercise: e, score })
  }

  return scored
    .sort(
      (a, b) =>
        b.score - a.score ||
        displayName(a.exercise).localeCompare(displayName(b.exercise)),
    )
    .map((s) => s.exercise)
}

/** Roughly how likely you meant this implement, when the score can't tell them apart. */
const EQUIPMENT_RANK: Record<Equipment, number> = {
  bodyweight: 0,
  barbell: 1,
  dumbbell: 2,
  cable: 3,
  machine: 4,
  ez_bar: 5,
  smith: 6,
  kettlebell: 7,
  t_bar: 8,
  trap_bar: 9,
  band: 10,
}
