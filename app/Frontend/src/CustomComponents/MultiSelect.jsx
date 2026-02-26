// // // components/CustomMultiSelectTags.jsx
// // import React, { useState, useRef, useEffect } from 'react';
// // import { IconX, IconChevronDown, IconChevronUp } from '@tabler/icons-react';
// // import { useFloating } from '@floating-ui/react';

// // export default function CustomMultiSelectTags({
// //   tags = [], // current selected tags array
// //   allAvailableTags = [], // full list of possible tags
// //   onChange, // callback: (newTagsArray) => void
// //   placeholder = 'Type to search tags...',
// //   className = '',
// // }) {
// //   const { refs, floatingStyles } = useFloating();
// //   const [search, setSearch] = useState('');
// //   const [isOpen, setIsOpen] = useState(false);
// //   const dropdownRef = useRef(null);
// //   const inputRef = useRef(null);

// //   // Close when click outside
// //   useEffect(() => {
// //     const handleClickOutside = (event) => {
// //       if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
// //         setIsOpen(false);
// //         setSearch(''); // optional: clear search when closing
// //       }
// //     };

// //     document.addEventListener('mousedown', handleClickOutside);
// //     return () => document.removeEventListener('mousedown', handleClickOutside);
// //   }, []);

// //   const filteredTags = allAvailableTags.filter(
// //     (tag) =>
// //       tag.toLowerCase().includes(search.toLowerCase()) && !tags.includes(tag),
// //   );

// //   const addTag = (tagToAdd) => {
// //     if (tags.includes(tagToAdd)) return;
// //     onChange([...tags, tagToAdd]);
// //     setSearch('');
// //     setIsOpen(false); // close after select (optional - you can remove if you want multi-select without close)
// //   };

// //   const removeTag = (tagToRemove) => {
// //     onChange(tags.filter((t) => t !== tagToRemove));
// //   };

// //   const toggleDropdown = () => {
// //     setIsOpen((prev) => !prev);
// //     if (!isOpen) {
// //       inputRef.current?.focus();
// //     }
// //   };

// //   return (
// //     <div className={`relative w-full ${className}`} ref={dropdownRef}>
// //       {/* Selected tags + input */}
// //       <div
// //         ref={refs.setReference}
// //         className="flex items-center flex-wrap gap-2 border border-gray-300 rounded-lg p-2 bg-white min-h-[42px]"
// //       >
// //         {tags.map((tag) => (
// //           <span
// //             key={tag}
// //             className="flex items-center gap-1 bg-indigo-100 text-indigo-700 px-3 py-1 rounded-full text-sm whitespace-nowrap"
// //           >
// //             {tag}
// //             <button
// //               type="button"
// //               onClick={(e) => {
// //                 e.stopPropagation();
// //                 removeTag(tag);
// //               }}
// //               className="hover:bg-indigo-200 rounded-full p-0.5 transition"
// //             >
// //               <IconX size={14} />
// //             </button>
// //           </span>
// //         ))}

// //         <div className="flex-1 flex items-center min-w-[140px]">
// //           <input
// //             ref={inputRef}
// //             value={search}
// //             onChange={(e) => {
// //               setSearch(e.target.value);
// //               setIsOpen(true);
// //             }}
// //             onFocus={() => setIsOpen(true)}
// //             placeholder={placeholder}
// //             className="flex-1 outline-none text-sm bg-transparent"
// //           />
// //           <button
// //             type="button"
// //             onClick={toggleDropdown}
// //             className="ml-2 text-gray-500 hover:text-gray-700"
// //           >
// //             {isOpen ? (
// //               <IconChevronUp size={18} />
// //             ) : (
// //               <IconChevronDown size={18} />
// //             )}
// //           </button>
// //         </div>
// //       </div>
// //       <div ref={refs.setFloating} style={floatingStyles}>
// //         <div>
// //           {filteredTags.length > 0 ? (
// //             filteredTags.map((tag) => (
// //               <div
// //                 key={tag}
// //                 onClick={() => addTag(tag)}
// //                 className="px-4 py-2.5 cursor-pointer hover:bg-indigo-50 text-sm border-b border-gray-100 last:border-b-0"
// //               >
// //                 {tag}
// //               </div>
// //             ))
// //           ) : search.trim() ? (
// //             <div className="px-4 py-3 text-sm text-gray-500 text-center">
// //               No tags matching "{search}"
// //             </div>
// //           ) : (
// //             <div className="px-4 py-3 text-sm text-gray-500 text-center">
// //               Start typing to search tags
// //             </div>
// //           )}
// //         </div>
// //       </div>

// //       {/* {isOpen && (
// //         <div className="absolute mt-1 w-full bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-auto z-50">
// //           {filteredTags.length > 0 ? (
// //             filteredTags.map((tag) => (
// //               <div
// //                 key={tag}
// //                 onClick={() => addTag(tag)}
// //                 className="px-4 py-2.5 cursor-pointer hover:bg-indigo-50 text-sm border-b border-gray-100 last:border-b-0"
// //               >
// //                 {tag}
// //               </div>
// //             ))
// //           ) : search.trim() ? (
// //             <div className="px-4 py-3 text-sm text-gray-500 text-center">
// //               No tags matching "{search}"
// //             </div>
// //           ) : (
// //             <div className="px-4 py-3 text-sm text-gray-500 text-center">
// //               Start typing to search tags
// //             </div>
// //           )}
// //         </div>
// //       )} */}
// //     </div>
// //   );
// // }

// // components/CustomMultiSelectTags.jsx
// import React, { useState, useRef, useEffect } from 'react';
// import {
//   useFloating,
//   offset,
//   flip,
//   shift,
//   autoUpdate,
//   FloatingPortal,
// } from '@floating-ui/react';
// import { IconX, IconChevronDown, IconChevronUp } from '@tabler/icons-react';

// export default function CustomMultiSelectTags({
//   tags = [],
//   allAvailableTags = [],
//   onChange,
//   placeholder = 'Search or add tags...',
//   className = '',
// }) {
//   const [search, setSearch] = useState('');
//   const [isOpen, setIsOpen] = useState(false);

//   const { refs, floatingStyles, strategy } = useFloating({
//     placement: 'bottom-start',
//     middleware: [offset(6), flip(), shift()],
//     whileElementsMounted: autoUpdate,
//   });

//   const dropdownRef = useRef(null);
//   const inputRef = useRef(null);

//   // Close when clicking outside
//   useEffect(() => {
//     const handleClickOutside = (event) => {
//       if (
//         dropdownRef.current &&
//         !dropdownRef.current.contains(event.target) &&
//         refs.reference.current &&
//         !refs.reference.current.contains(event.target)
//       ) {
//         setIsOpen(false);
//         setSearch('');
//       }
//     };

//     document.addEventListener('mousedown', handleClickOutside);
//     return () => document.removeEventListener('mousedown', handleClickOutside);
//   }, [refs.reference]);

//   const filteredTags = allAvailableTags.filter(
//     (tag) =>
//       tag.toLowerCase().includes(search.toLowerCase()) && !tags.includes(tag),
//   );

//   const addTag = (tagToAdd) => {
//     if (tags.includes(tagToAdd)) return;
//     onChange([...tags, tagToAdd]);
//     setSearch('');
//     // Keep open so user can add more tags quickly (optional: setIsOpen(false) if you prefer close)
//   };

//   const removeTag = (tagToRemove) => {
//     onChange(tags.filter((t) => t !== tagToRemove));
//   };

//   const handleKeyDown = (e) => {
//     if (e.key === 'Enter' && search.trim()) {
//       e.preventDefault();
//       addTag(search.trim().toLowerCase());
//     }
//   };

//   return (
//     <div className={`w-full ${className}`} ref={dropdownRef}>
//       {/* Trigger / Selected tags area */}
//       <div
//         ref={refs.setReference}
//         className={`
//           flex items-center flex-wrap gap-2
//           border border-gray-300 rounded-lg p-2
//           bg-white min-h-[42px] cursor-text
//           focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500
//         `}
//         onClick={() => {
//           setIsOpen(true);
//           inputRef.current?.focus();
//         }}
//       >
//         {tags.map((tag) => (
//           <span
//             key={tag}
//             className="flex items-center gap-1 bg-indigo-100 text-indigo-800 px-3 py-1 rounded-full text-sm whitespace-nowrap"
//           >
//             {tag}
//             <button
//               type="button"
//               onClick={(e) => {
//                 e.stopPropagation();
//                 removeTag(tag);
//               }}
//               className="hover:bg-indigo-200 rounded-full p-0.5 transition"
//             >
//               <IconX size={14} />
//             </button>
//           </span>
//         ))}

//         <div className="flex-1 flex items-center min-w-[140px]">
//           <input
//             ref={inputRef}
//             value={search}
//             onChange={(e) => {
//               setSearch(e.target.value);
//               setIsOpen(true);
//             }}
//             onKeyDown={handleKeyDown}
//             placeholder={placeholder}
//             className="flex-1 outline-none text-sm bg-transparent"
//           />
//           <button
//             type="button"
//             onClick={() => setIsOpen((prev) => !prev)}
//             className="ml-1 text-gray-500 hover:text-gray-700"
//           >
//             {isOpen ? (
//               <IconChevronUp size={18} />
//             ) : (
//               <IconChevronDown size={18} />
//             )}
//           </button>
//         </div>
//       </div>

//       {/* Portal-rendered dropdown */}
//       <FloatingPortal>
//         {isOpen && (
//           <div
//             ref={refs.setFloating}
//             style={{
//               ...floatingStyles,
//               position: strategy,
//               zIndex: 10000,
//               minWidth: refs.reference.current?.offsetWidth || 240,
//               maxWidth: 'min(90vw, 360px)',
//             }}
//             className="
//               bg-white border border-gray-300
//               rounded-lg shadow-xl
//               max-h-64 overflow-auto
//               divide-y divide-gray-100
//             "
//           >
//             {filteredTags.length > 0 ? (
//               filteredTags.map((tag) => (
//                 <div
//                   key={tag}
//                   onClick={() => addTag(tag)}
//                   className="px-4 py-2.5 cursor-pointer hover:bg-indigo-50 text-sm"
//                 >
//                   {tag}
//                 </div>
//               ))
//             ) : search.trim() ? (
//               <div className="px-4 py-4 text-sm text-gray-500 text-center">
//                 No tags found for "{search}"
//               </div>
//             ) : (
//               <div className="px-4 py-4 text-sm text-gray-500 text-center">
//                 Start typing to search tags...
//               </div>
//             )}
//           </div>
//         )}
//       </FloatingPortal>
//     </div>
//   );
// }

// components/CustomMultiSelectTags.jsx
import React, { useState, useRef, useEffect } from 'react';
import {
  useFloating,
  offset,
  flip,
  shift,
  autoUpdate,
  FloatingPortal,
} from '@floating-ui/react';
import { IconX, IconChevronDown, IconChevronUp } from '@tabler/icons-react';

export default function CustomMultiSelectTags({
  tags = [],
  allAvailableTags = [],
  onChange,
  placeholder = 'Search or add tags...',
  className = '',
}) {
  const [search, setSearch] = useState('');
  const [isOpen, setIsOpen] = useState(false);

  const { refs, floatingStyles, strategy } = useFloating({
    placement: 'bottom-start',
    middleware: [offset(6), flip(), shift({ padding: 8 })],
    whileElementsMounted: autoUpdate,
  });

  const inputRef = useRef(null);

  // Close when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        refs.reference.current &&
        !refs.reference.current.contains(event.target) &&
        refs.floating.current &&
        !refs.floating.current.contains(event.target)
      ) {
        setIsOpen(false);
        setSearch('');
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [refs.reference, refs.floating]);

  const filteredTags = allAvailableTags.filter(
    (tag) =>
      tag.toLowerCase().includes(search.toLowerCase()) && !tags.includes(tag),
  );

  const addTag = (tagToAdd) => {
    if (tags.includes(tagToAdd)) return;
    onChange([...tags, tagToAdd]);
    setSearch('');
    // Keep dropdown open for adding multiple tags
    inputRef.current?.focus();
  };

  const removeTag = (tagToRemove) => {
    onChange(tags.filter((t) => t !== tagToRemove));
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && search.trim()) {
      e.preventDefault();
      // Allow creating new tags that aren't in the list
      const newTag = search.trim().toLowerCase();
      if (!tags.includes(newTag)) {
        onChange([...tags, newTag]);
        setSearch('');
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
      setSearch('');
    }
  };

  const toggleDropdown = () => {
    setIsOpen((prev) => !prev);
    if (!isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  };

  return (
    <div className={`w-full ${className}`}>
      {/* Trigger / Selected tags area */}
      <div
        ref={refs.setReference}
        className={`
          flex items-center flex-wrap gap-1.5 
          border border-gray-300 rounded-md p-2 
          bg-white min-h-[38px] cursor-text
          focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500
          transition-all duration-200
        `}
        onClick={() => {
          setIsOpen(true);
          inputRef.current?.focus();
        }}
      >
        {tags.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded-md text-xs font-medium whitespace-nowrap"
          >
            {tag}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                removeTag(tag);
              }}
              className="hover:bg-indigo-200 rounded-full p-0.5 transition-colors"
            >
              <IconX size={12} />
            </button>
          </span>
        ))}

        <div className="flex-1 flex items-center min-w-[100px]">
          <input
            ref={inputRef}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setIsOpen(true);
            }}
            onKeyDown={handleKeyDown}
            placeholder={tags.length === 0 ? placeholder : ''}
            className="flex-1 outline-none text-xs bg-transparent"
          />
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              toggleDropdown();
            }}
            className="ml-1 text-gray-500 hover:text-gray-700 p-0.5 rounded-full hover:bg-gray-100"
          >
            {isOpen ? (
              <IconChevronUp size={16} />
            ) : (
              <IconChevronDown size={16} />
            )}
          </button>
        </div>
      </div>

      {/* Portal-rendered dropdown - ensures it appears above all content */}
      <FloatingPortal>
        {isOpen && (
          <div
            ref={refs.setFloating}
            style={{
              ...floatingStyles,
              zIndex: 99999,
              minWidth: refs.reference.current?.offsetWidth || 200,
              maxWidth: 'min(90vw, 400px)',
            }}
            className="
              bg-white border border-gray-200 
              rounded-lg shadow-xl 
              max-h-64 overflow-y-auto
              py-1
            "
          >
            {filteredTags.length > 0 ? (
              filteredTags.map((tag, index) => (
                <div
                  key={tag + index}
                  onClick={() => addTag(tag)}
                  className="px-3 py-2 cursor-pointer hover:bg-indigo-50 text-sm transition-colors border-b border-gray-100 last:border-b-0"
                >
                  {tag}
                </div>
              ))
            ) : search.trim() ? (
              <div className="px-3 py-3 text-sm text-gray-500 text-center">
                <div>No tags found for "{search}"</div>
                <button
                  onClick={() => {
                    const newTag = search.trim().toLowerCase();
                    if (!tags.includes(newTag)) {
                      onChange([...tags, newTag]);
                      setSearch('');
                      setIsOpen(false);
                    }
                  }}
                  className="mt-2 text-blue-600 hover:text-blue-800 font-medium"
                >
                  + Create "{search}"
                </button>
              </div>
            ) : (
              <div className="px-3 py-3 text-sm text-gray-500 text-center">
                Type to search or create tags
              </div>
            )}
          </div>
        )}
      </FloatingPortal>
    </div>
  );
}
