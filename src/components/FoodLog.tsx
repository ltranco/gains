"use client"

import { formatTime } from "@/lib/date"
import { foodName, summariseFood } from "@/lib/food"
import type { ClockFormat, FoodEntry } from "@/lib/types"
import { Duplicate, Trash } from "./icons"

/**
 * The day's food, as one section with a row per item — exactly the shape an exercise block has.
 * Section heading, then rows of time, name and value, with duplicate and delete on each.
 *
 * One section rather than one per food. An exercise block groups the sets of *that* movement, and
 * the parallel for eating is not "one block per dish" — it's the meals of the day, in order.
 *
 * ## Two lines, not one
 *
 * `48P 61C 22F 620kcal` beside a name and a clock fits on a 390px screen, but only just, and it read
 * as cramped — the name had barely a third of the row and truncated on anything longer than "Chicken
 * bowl". So the macros drop to their own line under the name, which gives the name the full width and
 * gives the numbers room to be read rather than squinted at.
 *
 * Everything is top-aligned: the clock and the two action buttons sit against the first line, so a
 * two-line row still scans as one row with a hanging detail rather than as a block that has drifted
 * out of the column.
 */
export function FoodLog({
  foods,
  clock,
  onEdit,
  onDuplicate,
  onDelete,
}: {
  foods: FoodEntry[]
  clock: ClockFormat
  onEdit: (food: FoodEntry) => void
  onDuplicate: (food: FoodEntry) => void
  onDelete: (food: FoodEntry) => void
}) {
  if (foods.length === 0) return null

  return (
    <section className="border-b px-3 py-3 last:border-b-0">
      {/* A heading and nothing else, matching the exercise blocks. The day's calorie total lived
          here for a while, which was one more number on a screen whose whole top strip is already
          that number — the rings say it, larger and against its target. */}
      <h2
        className="mb-1 truncate pl-1 text-[14px] font-normal tracking-[-0.005em]"
        style={{ color: "var(--text-muted)" }}
      >
        Food
      </h2>

      <ul className="flex flex-col">
        {foods.map((food) => (
          <li
            key={food.id}
            className="flex items-start rounded-md transition-colors hover:bg-[var(--bg-hover)]"
          >
            <button
              type="button"
              onClick={() => onEdit(food)}
              className="flex min-w-0 flex-1 items-start gap-2.5 py-2 pl-1 text-left"
            >
              <span
                className="nums-quiet shrink-0 text-[12px] leading-[1.45]"
                style={{ color: "var(--text-faint)" }}
              >
                {formatTime(food.loggedAt, clock) ?? "--:--"}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] leading-tight">{foodName(food)}</span>
                <span
                  className="nums-quiet mt-1 block truncate text-[12px]"
                  style={{ color: "var(--text-muted)" }}
                >
                  {summariseFood(food)}
                </span>
              </span>
            </button>

            <RowAction label={`Duplicate ${foodName(food)}`} onClick={() => onDuplicate(food)}>
              <Duplicate size={15} />
            </RowAction>
            <RowAction label={`Delete ${foodName(food)}`} onClick={() => onDelete(food)} danger>
              <Trash size={15} />
            </RowAction>
          </li>
        ))}
      </ul>
    </section>
  )
}

function RowAction({
  label,
  onClick,
  danger,
  children,
}: {
  label: string
  onClick: () => void
  danger?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="flex size-9 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-[var(--bg-active)]"
      style={{ color: danger ? "var(--danger)" : "var(--text-faint)" }}
    >
      {children}
    </button>
  )
}
