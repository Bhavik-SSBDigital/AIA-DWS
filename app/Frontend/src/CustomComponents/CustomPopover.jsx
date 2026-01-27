import React from "react";

const positionClasses = {
  top: "bottom-full left-1/2 -translate-x-1/2 mb-3",
  bottom: "top-full left-1/2 -translate-x-1/2 mt-3",
  left: "right-full top-1/2 -translate-y-1/2 mr-3",
  right: "left-full top-1/2 -translate-y-1/2 ml-3",
};

const CustomPopover = ({
  trigger,
  children,
  position = "bottom",
  width = "w-72",
}) => {
  return (
    <div className="relative inline-block group">
      {/* Trigger */}
      {trigger}

      {/* Popover */}
      <div
        className={`
          absolute z-50 ${positionClasses[position]} ${width}
          rounded-xl border border-gray-200 bg-white p-4 shadow-xl
          opacity-0 invisible translate-y-2
          transition-all duration-200
          group-hover:visible group-hover:opacity-100 group-hover:translate-y-0
        `}
      >
        {children}
      </div>
    </div>
  );
};

export default CustomPopover;
