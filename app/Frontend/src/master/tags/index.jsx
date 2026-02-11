import { useEffect, useState, useCallback, useRef } from 'react';
import { IconTags, IconPlus, IconX, IconLoader2 } from '@tabler/icons-react';
import apiClient from '../../common/Apis';
import CustomButton from '../../CustomComponents/CustomButton';
import { toast } from 'react-toastify';

export default function TagsMasterPage() {
  const [tags, setTags] = useState([]);
  const [newTags, setNewTags] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const inputRef = useRef(null);

  // Fetch tags
  const fetchTags = useCallback(async () => {
    try {
      setLoading(true);
      const { data } = await apiClient.get('/tags');

      // setTags(data.map((t) => t.name.toLowerCase()));
      setTags(data.map((t) => t.name));
    } catch (err) {
      console.error('Fetch tags failed:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTags();
  }, [fetchTags]);

  // Add tag (button only)
  const addTag = useCallback(() => {
    const tag = input.trim();
    // const tag = input.trim().toLowerCase();
    if (!tag) return;

    if (newTags.includes(tag) || tags.includes(tag)) {
      setInput('');
      // inputRef.current.focus();
      return;
    }

    setNewTags((prev) => [...prev, tag]);
    setInput('');
    // inputRef.current.focus();
  }, [input, newTags, tags]);

  const removeTag = (tag) => {
    setNewTags((prev) => prev.filter((t) => t !== tag));
  };

  const getRepeatedWords = () => {
    const countMap = newTags.reduce((acc, word) => {
      const lower = word.toLowerCase().trim();
      if (!lower) return acc; // skip empty
      acc[lower] = (acc[lower] || 0) + 1;
      return acc;
    }, {});

    // Only keep words that appear ≥ 2 times
    return Object.entries(countMap)
      .filter(([_, count]) => count >= 2)
      .map(([word, count]) => ({ word, count }))
      .sort((a, b) => b.count - a.count); // most frequent first
  };

  const [open, setOpen] = useState(false);
  const [hasRepeats, setHasRepeats] = useState([]);

  // Submit tags
  const checkTags = async () => {
    if (!newTags.length) return;

    const repeated = getRepeatedWords();

    if (repeated.length) {
      setOpen(true);
      setHasRepeats(repeated);
    } else {
      handleSubmit();
    }
  };
  const handleSubmit = async () => {
    if (!newTags.length) return;

    try {
      setSubmitting(true);
      await apiClient.post('/tags', { tags: newTags });
      setNewTags([]);
      fetchTags();
      toast.success('Tags saved.');
      setOpen(false);
      setHasRepeats([]);
    } catch (err) {
      console.error('Submit tags failed:', err);
      toast.error('Failed to save tags.');
    } finally {
      setSubmitting(false);
    }
  };
  const handleClose = () => {
    setOpen(false);
    setHasRepeats([]);
  };

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4">
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          {/* overlay click to close */}
          <div
            className="absolute inset-0"
            onClick={handleClose}
            aria-hidden="true"
          />

          {/* dialog panel */}
          <div
            className={`
        relative w-full max-w-md mx-4 sm:mx-6 
        bg-white rounded-xl shadow-2xl 
        overflow-hidden transform transition-all
        scale-100
      `}
          >
            {/* Header */}
            <div className="px-6 py-5 border-b border-gray-200">
              <h2 className="text-xl font-semibold text-gray-900">
                Repeated Words Found
              </h2>
            </div>

            {/* Body */}
            <div className="px-6 py-5 max-h-[70vh] overflow-y-auto">
              {hasRepeats.length > 0 ? (
                <>
                  {/* Warning banner */}
                  <div className="mb-5 p-4 bg-amber-50 border border-amber-200 rounded-lg text-amber-800">
                    <div className="flex items-center gap-3">
                      <svg
                        className="w-5 h-5 flex-shrink-0 text-amber-600"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path d="M10 2a8 8 0 100 16 8 8 0 000-16zM9 5h2v6H9V5zm0 8h2v2H9v-2z" />
                      </svg>
                      <p className="text-sm font-medium">
                        Some words appear more than once!
                      </p>
                    </div>
                  </div>

                  <p className="mb-3 text-gray-700 font-medium">
                    Repeated words ({hasRepeats.length}):
                  </p>

                  <ul className="space-y-2">
                    {hasRepeats.map(({ word, count }) => (
                      <li
                        key={word + count}
                        className="py-2 px-3 bg-gray-50 rounded-md border border-gray-100"
                      >
                        <span className="font-medium text-gray-900">
                          {word}
                        </span>
                        <span className="text-gray-500 ml-2">
                          — appeared{' '}
                          <span className="font-semibold text-indigo-700">
                            {count}
                          </span>{' '}
                          time{count > 1 ? 's' : ''}
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <p className="text-gray-600 py-4 text-center">
                  No repeated words were found.
                </p>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex justify-end gap-3">
              <button
                onClick={handleClose}
                className="
            px-5 py-2.5 
            text-gray-700 font-medium 
            bg-white border border-gray-300 
            rounded-lg hover:bg-gray-50 
            focus:outline-none focus:ring-2 focus:ring-gray-300
            transition-colors
          "
              >
                Close
              </button>

              <button
                onClick={handleSubmit}
                className="
            px-5 py-2.5 
            text-white font-medium 
            bg-indigo-600 rounded-lg 
            hover:bg-indigo-700 
            focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2
            transition-colors
          "
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      )}
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
          <div className="flex gap-2 items-center">
            <div className="flex flex-1 flex-wrap gap-2 items-center h-10 px-2 border rounded-lg p-1 focus-within:ring-2 focus-within:ring-indigo-400">
              {newTags.map((tag, idx) => (
                <span
                  key={tag + idx}
                  className="flex items-center gap-1 px-3 py-1 bg-indigo-100 text-indigo-700 rounded-full text-sm"
                >
                  {tag}
                  <button
                    type="button"
                    onClick={() => removeTag(tag)}
                    className="hover:text-red-500"
                  >
                    <IconX size={14} />
                  </button>
                </span>
              ))}

              <input
                value={input}
                ref={inputRef}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Type tag"
                className="flex-1 min-w-[160px] outline-none text-sm"
              />

              {/* <CustomButton text="Add" className="px-4 py-2" click={addTag} /> */}
            </div>
            <button
              onClick={addTag}
              disabled={submitting}
              className="flex items-center h-10 gap-2 px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg disabled:opacity-50"
            >
              {submitting ? (
                <IconLoader2 size={18} className="animate-spin" />
              ) : (
                <IconPlus size={18} />
              )}
              Add
            </button>
          </div>

          {/* Submit */}
          <button
            onClick={checkTags}
            disabled={submitting || !newTags.length}
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
              {tags.map((tag, idx) => (
                <div
                  key={tag + idx}
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
