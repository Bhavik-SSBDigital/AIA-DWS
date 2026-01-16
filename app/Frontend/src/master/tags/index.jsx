import { useEffect, useState, useCallback, useRef } from 'react';
import { IconTags, IconPlus, IconX, IconLoader2 } from '@tabler/icons-react';
import apiClient from '../../common/Apis';
import CustomButton from '../../CustomComponents/CustomButton';

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
      setTags(data.map((t) => t.name.toLowerCase()));
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
    const tag = input.trim().toLowerCase();
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

  // Submit tags
  const handleSubmit = async () => {
    if (!newTags.length) return;

    try {
      setSubmitting(true);
      await apiClient.post('/tags', { tags: newTags });
      setNewTags([]);
      fetchTags();
    } catch (err) {
      console.error('Submit tags failed:', err);
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
          <div className="flex gap-2 items-center">
            <div className="flex flex-1 flex-wrap gap-2 items-center border rounded-lg p-1 focus-within:ring-2 focus-within:ring-indigo-400">
              {newTags.map((tag) => (
                <span
                  key={tag}
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
            onClick={handleSubmit}
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
