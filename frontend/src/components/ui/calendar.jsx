import * as React from "react"
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp } from "lucide-react"
import { DayPicker } from "react-day-picker"

import { cn } from "@/lib/utils"
import { buttonVariants } from "@/components/ui/button"

const CHEVRONS = { left: ChevronLeft, right: ChevronRight, up: ChevronUp, down: ChevronDown }

// react-day-picker v9. Styling comes only from these Tailwind classes (the library's
// style.css is not imported). In v9 the modifier classes (selected, today, range_*)
// land on the day cell, so they style the day button through `[&>button]`.
function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}) {
  const isRange = props.mode === "range"
  const selectedButton =
    "[&>button]:bg-primary [&>button]:text-primary-foreground [&>button]:hover:bg-primary [&>button]:hover:text-primary-foreground [&>button]:focus:bg-primary [&>button]:focus:text-primary-foreground"

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("p-3", className)}
      classNames={{
        months: "relative flex flex-col gap-4 sm:flex-row",
        month: "space-y-4",
        month_caption: "relative flex h-7 items-center justify-center pt-1",
        caption_label: "text-sm font-medium",
        nav: "absolute inset-x-1 top-1 z-10 flex items-center justify-between",
        button_previous: cn(
          buttonVariants({ variant: "outline" }),
          "h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100 disabled:opacity-25"
        ),
        button_next: cn(
          buttonVariants({ variant: "outline" }),
          "h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100 disabled:opacity-25"
        ),
        month_grid: "w-full border-collapse space-y-1",
        weekdays: "flex",
        weekday: "w-8 rounded-md text-[0.8rem] font-normal text-muted-foreground",
        week: "mt-2 flex w-full",
        day: "relative p-0 text-center text-sm focus-within:relative focus-within:z-20",
        day_button: cn(
          buttonVariants({ variant: "ghost" }),
          "h-8 w-8 p-0 font-normal"
        ),
        // In range mode every selected day gets the accent strip; the two ends are
        // drawn as solid buttons on top of it.
        selected: isRange ? "bg-accent" : cn("rounded-md", selectedButton),
        range_start: cn("rounded-l-md", selectedButton),
        range_end: cn("rounded-r-md", selectedButton),
        range_middle: "[&>button]:text-accent-foreground",
        today: "[&>button]:bg-accent [&>button]:text-accent-foreground",
        outside: "[&>button]:text-muted-foreground [&>button]:opacity-50",
        disabled: "[&>button]:text-muted-foreground [&>button]:opacity-50",
        hidden: "invisible",
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation = "left", className, size, disabled, ...rest }) => {
          const Icon = CHEVRONS[orientation] ?? ChevronLeft
          return <Icon className={cn("h-4 w-4", className)} {...rest} />
        },
      }}
      {...props} />
  );
}
Calendar.displayName = "Calendar"

export { Calendar }
