"use client"

import { formatTime } from "@/lib/date"
import { foodName, macroTotals, summariseFood } from "@/lib/food"
import type { ClockFormat, FoodEntry } from "@/lib/types"
import { formatCount } from "@/lib/units"
import { Duplicate, Plus, Trash } from "./icons"

/**
 * The day's food, as one section with a row per item — exactly the shape an exercise block has.
 * Section heading, then rows of time, name and value, with duplicate and delete on each.
 *
 * One section rather than one per food. An exercise block groups the sets of *that* movement, and
 * the parallel for eating is not "one block per dish" — it's the meals of the day, in order.
 *
 * ## Keeping the numbers on the row
 *
 * The value is `48P 61C 22F 620kcal`, which is a lot of characters to fit beside a name and a clock
 * on a 390px screen. Three things stop it bleeding: the macro string is `shrink-0` so it never
 * compresses, the name is the only flexible column and truncates, and the macros sit in the quiet
 * mono face a size down. The name is what loses characters, because a clipped "Chicken bo…" is still
 * legible where a clipped "48P 61C 22F 620kc" is not.
 */
export function FoodLog({
  foods,
  clock,
  onAdd,
  onEdit,
  onDuplicate,
  onDelete,
}: {
  foods: FoodEntry[]
  clock: ClockFormat
  onAdd: () => void
  onEdit: (food: FoodEntry) => void
  onDuplicate: (food: FoodEntry) => void
  onDelete: (food: FoodEntry) => void
}) {
  if (foods.length === 0) return null
  const totals = macroTotals(foods)

  return (
    <section className="border-b px-3 py-3 last:border-b-0">
      <div className="mb-1 flex items-baseline justify-between gap-3 pl-1">
        <h2
          className="min-w-0 truncate text-[14px] font-normal tracking-[-0.005em]"
          style={{ color: "var(--text-muted)" }}
        >
          Food
        </h2>

        <div className="flex shrink-0 items-baseline gap-2">
          {/* The day's total beside the heading rather than as a footer row: it's the headline,
              and the rows below it are the working. */}
          {foods.length > 1 && (
            <span className="nums-quiet text-[12px]" style={{ color: "var(--text-faint)" }}>
              {formatCount(totals.kcal)} kcal
            </span>
          )}
          <button
            type="button"
            onClick={onAdd}
            aria-label="Add food"
            className="flex size-7 items-center justify-center rounded-md transition-colors hover:bg-[var(--bg-hover)]"
            style={{ color: "var(--text-faint)" }}
          >
            <Plus size={15} />
          </button>
        </div>
      </div>

      <ul className="flex flex-col">
        {foods.map((food) => (
          <li
            key={food.id}
            className="flex items-center rounded-md transition-colors hover:bg-[var(--bg-hover)]"
          >
            <button
              type="button"
              onClick={() => onEdit(food)}
              className="flex min-w-0 flex-1 items-baseline gap-2.5 py-2 pl-1 text-left"
            >
              <span
                className="nums-quiet shrink-0 text-[12px]"
                style={{ color: "var(--text-faint)" }}
              >
                {formatTime(food.loggedAt, clock) ?? "--:--"}
              </span>
              <span className="min-w-0 flex-1 truncate text-[15px]">{foodName(food)}</span>
              <span
                className="nums-quiet shrink-0 text-[11px]"
                style={{ color: "var(--text-muted)" }}
              >
                {summariseFood(food)}
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
