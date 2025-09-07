import React, { useState } from "react";
import { format } from "date-fns";
import { Calendar } from "./calendar";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";
import { Button } from "./button";
import { Input } from "./input";

interface DateRange {
  startDate: Date | null;
  endDate: Date | null;
}

interface DateRangePickerProps {
  value: DateRange;
  onChange: (range: DateRange) => void;
  placeholder?: string;
  className?: string;
}

export const DateRangePicker: React.FC<DateRangePickerProps> = ({
  value,
  onChange,
  placeholder = "Select date range",
  className = "",
}) => {
  const [isOpen, setIsOpen] = useState(false);

  const handleDateChange = (date: Date) => {
    if (!value.startDate || (value.startDate && value.endDate)) {
      onChange({ startDate: date, endDate: null });
    } else {
      onChange({ startDate: value.startDate, endDate: date });
      setIsOpen(false);
    }
  };

  const formattedStartDate = value.startDate ? format(value.startDate, "MM/dd/yyyy") : "";
  const formattedEndDate = value.endDate ? format(value.endDate, "MM/dd/yyyy") : "";

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={`${className} justify-start text-left font-normal`}
        >
          {formattedStartDate && formattedEndDate
            ? `${formattedStartDate} - ${formattedEndDate}`
            : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          initialFocus
          mode="range"
          selected={{ from: value.startDate || undefined, to: value.endDate || undefined }}
          onSelect={(range) =>
            onChange({ startDate: range?.from || null, endDate: range?.to || null })
          }
        />
      </PopoverContent>
    </Popover>
  );
};
