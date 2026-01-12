// import { useState } from 'react';
// import { IconPlus, IconX, IconTags } from '@tabler/icons-react';

// export default function TagsManager({ tags = [], onChange, className = '' }) {
//   const [input, setInput] = useState('');
//   const [isFocused, setIsFocused] = useState(false);

//   const addTag = () => {
//     const trimmed = input.trim().toLowerCase();
//     if (!trimmed) return;
//     if (tags.includes(trimmed)) {
//       setInput('');
//       return;
//     }

//     const newTags = [...tags, trimmed];
//     onChange(newTags);
//     setInput('');
//   };

//   const removeTag = (tagToRemove) => {
//     const newTags = tags.filter((tag) => tag !== tagToRemove);
//     onChange(newTags);
//   };

//   const handleKeyDown = (e) => {
//     if (e.key === 'Enter' || e.key === ',') {
//       e.preventDefault();
//       addTag();
//     }
//     if (e.key === 'Backspace' && input === '' && tags.length > 0) {
//       const newTags = tags.slice(0, -1);
//       onChange(newTags);
//     }
//   };

//   return (
//     <div className={`w-full ${className}`}>
//       {/* Label */}
//       <label className="mb-1.5 flex items-center gap-2 text-sm font-medium text-gray-700">
//         <IconTags size={18} stroke={1.8} />
//         Tags
//       </label>

//       {/* Main input container */}
//       <div
//         className={`
//           min-h-[44px] w-full px-3 py-2.5 rounded-xl border-2
//           transition-all duration-200 shadow-sm
//           flex flex-wrap items-center gap-2.5 bg-white
//           ${
//             isFocused
//               ? 'border-indigo-500 ring-2 ring-indigo-100/70'
//               : 'border-gray-300 hover:border-gray-400'
//           }
//         `}
//       >
//         {/* Render existing tags */}
//         {tags.map((tag) => (
//           <div
//             key={tag}
//             className="
//               group flex items-center gap-1.5 pl-3 pr-2 py-1
//               bg-indigo-50 text-indigo-700 rounded-full
//               text-sm font-medium transition-colors hover:bg-indigo-100
//             "
//           >
//             <span>{tag}</span>
//             <button
//               type="button"
//               onClick={() => removeTag(tag)}
//               className="
//                 p-1 rounded-full text-indigo-600 opacity-70
//                 hover:opacity-100 hover:bg-indigo-200/60 transition-all
//               "
//               aria-label={`Remove ${tag}`}
//             >
//               <IconX size={14} stroke={2.5} />
//             </button>
//           </div>
//         ))}

//         {/* Input field + add button */}
//         <div className="flex-1 min-w-[140px] flex items-center">
//           <input
//             type="text"
//             value={input}
//             onChange={(e) => setInput(e.target.value)}
//             onKeyDown={handleKeyDown}
//             onFocus={() => setIsFocused(true)}
//             onBlur={() => setIsFocused(false)}
//             placeholder={tags.length === 0 ? 'Add new tag...' : ''}
//             className="
//               flex-1 bg-transparent outline-none
//               text-gray-800 placeholder-gray-400 text-sm
//             "
//           />

//           {input.trim() && (
//             <button
//               type="button"
//               onClick={addTag}
//               className="
//                 p-1.5 rounded-full bg-indigo-600 text-white
//                 hover:bg-indigo-700 active:scale-95
//                 transition-all duration-150 shadow-sm
//               "
//               title="Add tag"
//             >
//               <IconPlus size={16} stroke={2.5} />
//             </button>
//           )}
//         </div>
//       </div>

//       {/* Helper text */}
//       <div className="mt-1.5 text-xs text-gray-500 flex items-center gap-1.5">
//         <span>Press</span>
//         <kbd className="px-1.5 py-0.5 bg-gray-100 rounded text-gray-600 text-[0.7rem] font-mono">
//           Enter
//         </kbd>
//         <span>or</span>
//         <kbd className="px-1.5 py-0.5 bg-gray-100 rounded text-gray-600 text-[0.7rem] font-mono">
//           ,
//         </kbd>
//         <span>to add • Backspace removes last</span>
//       </div>
//     </div>
//   );
// }

import { useEffect, useState } from 'react';
import { IconTags, IconPlus, IconX, IconLoader2 } from '@tabler/icons-react';
import apiClient from '../../common/Apis';

export default function TagsMasterPage() {
  const [tags, setTags] = useState([]);
  const [newTags, setNewTags] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Fetch existing tags
  const fetchTags = async () => {
    try {
      setLoading(true);
      const { data } = await apiClient.get('/tags');
      setTags(data.map((t) => t.name.toLowerCase()));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTags();
  }, []);

  // Add tag on Enter or comma
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag(input);
    }
  };

  const addTag = (value) => {
    const tag = value.trim().toLowerCase();
    if (!tag) return;
    if (newTags.includes(tag) || tags.includes(tag)) return;

    setNewTags([...newTags, tag]);
    setInput('');
  };

  const removeTag = (tag) => {
    setNewTags(newTags.filter((t) => t !== tag));
  };

  const handleSubmit = async () => {
    if (newTags.length === 0) return;
    setSubmitting(true);

    try {
      await apiClient.post('/tags', { tags: newTags });
      setNewTags([]);
      fetchTags();
    } catch (e) {
      console.error(e);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-5xl mx-auto space-y-10">
        {/* Header */}
        <div className="flex items-center gap-4">
          <div className="p-4 bg-indigo-600 rounded-xl shadow">
            <IconTags size={28} className="text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-bold">Tag Management</h1>
            <p className="text-gray-500">Add one or many tags at once</p>
          </div>
        </div>

        {/* Add Tags */}
        <div className="bg-white rounded-xl shadow-lg p-6 space-y-4">
          {/* Tag Input */}
          <div className="flex flex-wrap gap-2 items-center border rounded-lg p-3 focus-within:ring-2 focus-within:ring-indigo-400">
            {newTags.map((tag) => (
              <span
                key={tag}
                className="flex items-center gap-1 px-3 py-1 bg-indigo-100 text-indigo-700 rounded-full text-sm"
              >
                {tag}
                <button onClick={() => removeTag(tag)}>
                  <IconX size={14} />
                </button>
              </span>
            ))}

            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type tag & press Enter"
              className="flex-1 min-w-[160px] outline-none text-sm"
            />
          </div>

          {/* Submit */}
          <button
            onClick={handleSubmit}
            disabled={submitting || newTags.length === 0}
            className="flex items-center gap-2 px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg disabled:opacity-50"
          >
            {submitting ? (
              <IconLoader2 size={18} className="animate-spin" />
            ) : (
              <IconPlus size={18} />
            )}
            Add {newTags.length} Tag{newTags.length !== 1 && 's'}
          </button>
        </div>

        {/* Tags List */}
        <div className="bg-white rounded-xl shadow-lg">
          <div className="p-5 border-b">
            <h2 className="font-semibold">All Tags ({tags.length})</h2>
          </div>

          {loading ? (
            <div className="py-10 text-center">
              <IconLoader2 className="animate-spin mx-auto" />
            </div>
          ) : (
            <div className="p-6 grid grid-cols-2 md:grid-cols-4 gap-3">
              {tags.map((tag) => (
                <div
                  key={tag}
                  className="px-4 py-2 text-center bg-gray-100 rounded-lg text-gray-700"
                >
                  {tag}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
