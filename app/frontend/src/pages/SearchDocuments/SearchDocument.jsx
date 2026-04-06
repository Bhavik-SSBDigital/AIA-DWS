import React, { useEffect, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { toast } from 'react-toastify';
import CustomButton from '../../CustomComponents/CustomButton';
import CustomCard from '../../CustomComponents/CustomCard';
import Title from '../../CustomComponents/Title';
import TopLoader from '../../common/Loader/TopLoader';
import { IconEye, IconScript } from '@tabler/icons-react';
import { ImageConfig } from '../../config/ImageConfig';
import DocumentVersioning from '../DocumentVersioning';
import ViewFile from '../view/View';
import CustomModal from '../../CustomComponents/CustomModal';
import CustomTextField from '../../CustomComponents/CustomTextField';
import {
  deepSearch,
  GetUsersWithDetails,
  ViewDocument,
  getDepartments,
  createPhysicalRequest,
  getSearches,
  deleteSearch,
} from '../../common/Apis';

export default function DocumentSearch() {
  // State
  const { register, handleSubmit, reset } = useForm();
  const [results, setResults] = useState([]);
  const [filesData, setFilesData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [pagination, setPagination] = useState({ page: 1, pageSize: 10 });
  const [users, setUsers] = useState([]);
  const [fileView, setFileView] = useState(null);
  const [lastQuery, setLastQuery] = useState();
  const [departments, setDepartments] = useState([]);
  const [open, setOpen] = useState(null);
  const [selectedItem, setSelectedItem] = useState(null);
  const [actionsLoading, setActionsLoading] = useState(false);
  const [recentSearches, setRecentSearches] = useState([]);

  // Form for physical document request
  const {
    register: registerDepartment,
    handleSubmit: handleSubmitDepartment,
    formState: {
      errors: departmentErrors,
      isSubmitting: isSubmittingDepartment,
    },
    control: controlDepartment,
    reset: resetDepartment,
  } = useForm({
    defaultValues: {
      departmentId: '',
      reason: '',
    },
  });

  // Handlers

  const handleSearchAgain = (query) => {
    // directly reuse your onSubmit logic
    setLastQuery(query);
    fetchDocuments(query, true);
  };

  const handleRemoveSearch = async (id) => {
    try {
      const response = await deleteSearch(id);
      toast.success(response?.data?.message);
      setRecentSearches((prev) => prev.filter((s) => s.id !== id));
    } catch (error) {
      toast.error(error?.response?.data?.error || error?.message);
    }
  };

  const fetchDocuments = async (data, showToast) => {
    setLoading(true);
    try {
      const queryParams = new URLSearchParams(data).toString();
      const response = await deepSearch(queryParams);
      if (showToast) {
        toast.success(
          `${response?.data?.pagination?.totalCount} results found`,
        );
      }

      setResults(response?.data?.data || []);
      setPagination((prev) => ({
        ...prev,
        totalCount: response?.data?.pagination?.totalCount || 0,
        totalPages: response?.data?.pagination?.totalPages || 1,
      }));
      return response?.data?.id;
    } catch (err) {
      toast.error('Failed to fetch documents');
    } finally {
      setLoading(false);
    }
  };

  const onSubmit = async (data) => {
    const usedFilters = Object.entries(data).reduce((acc, [key, value]) => {
      if (value !== '' && value !== null && value !== undefined) {
        acc[key] = value;
      }
      return acc;
    }, {});

    setLastQuery(usedFilters);
    const id = await fetchDocuments(usedFilters, true);

    // Add to recent searches
    const newEntry = {
      id: id, // or use uuid
      searchQuery: usedFilters,
      searchType: 'metadata', // you can adjust dynamically
      searchedAt: new Date().toISOString(),
    };

    setRecentSearches((prev) => [newEntry, ...prev].slice(0, 10)); // keep max 10
  };

  const getMatchedFields = (doc) => {
    const fields = [];

    const check = (key, label, value) => {
      if (
        lastQuery?.[key] !== undefined &&
        lastQuery?.[key] !== '' &&
        value !== undefined &&
        value !== null
      ) {
        fields.push({ label, value: highlightMatch(key, value) });
      }
    };

    check('content', 'Content', doc.content);
    check('processName', 'Process Name', doc.processName);
    check('processId', 'Process ID', doc.processId);
    check('description', 'Description', doc.description);
    check('createdByUsername', 'Created By', doc.createdByUsername);
    check('isArchived', 'Archived', doc.isArchived ? 'true' : 'false');
    check('inBin', 'In Bin', doc.inBin ? 'true' : 'false');
    check('preApproved', 'Pre-Approved', doc.preApproved?.toString());
    check('superseding', 'Superseding', doc.superseding?.toString());

    if (Array.isArray(doc.tags) && doc.tags.length > 0 && lastQuery?.tags) {
      doc.tags.forEach((tag) => {
        if (tag.toLowerCase().includes(lastQuery.tags.toLowerCase())) {
          fields.push({ label: 'Tag', value: highlightMatch('tags', tag) });
        }
      });
    }

    return fields;
  };

  const highlightMatch = (fieldKey, value) => {
    if (!lastQuery?.[fieldKey] || typeof value !== 'string') return value;

    const query = lastQuery[fieldKey].toString().toLowerCase();
    const lowerValue = value.toLowerCase();
    const index = lowerValue.indexOf(query);

    if (index === -1) return value;

    const before = value.substring(0, index);
    const match = value.substring(index, index + query.length);
    const after = value.substring(index + query.length);

    return (
      <>
        {before}
        <span className="bg-yellow-200 font-semibold rounded-sm px-0.5">
          {match}
        </span>
        {after}
      </>
    );
  };

  const handleViewFile = async (name, path, fileId, type, isEditing) => {
    setLoading(true);
    try {
      const fileData = await ViewDocument(name, path, type, fileId);
      setFileView(fileData);
    } catch (error) {
      console.error('Error:', error);
      toast.error(error?.response?.data?.message || error?.message);
    } finally {
      setLoading(false);
    }
  };

  const handlePhysicalDocumentRequest = (doc) => {
    setSelectedItem(doc);
    setOpen('physicalDocument');
  };

  const handlePagination = (dir) => {
    const newPage = dir === 'next' ? pagination.page + 1 : pagination.page - 1;

    const updatedPagination = {
      ...pagination,
      page: Math.max(1, newPage),
    };

    setPagination(updatedPagination);

    fetchDocuments({
      ...lastQuery,
      page: Math.max(1, newPage),
      pageSize: pagination.pageSize,
    });
  };

  const getUsers = async () => {
    try {
      const response = await GetUsersWithDetails();
      setUsers(response?.data);
    } catch (error) {
      // console.log(error);
    }
  };

  const getDepartmentList = async () => {
    try {
      const response = await getDepartments();
      setDepartments(response?.data?.departments);
    } catch (error) {
      // console.log(error);
    }
  };

  const onSubmitPhysicalRequest = async (data) => {
    setActionsLoading(true);
    try {
      await createPhysicalRequest({ ...data, documentId: selectedItem?.id });
      resetDepartment();
      setOpen(false);
      toast.success('Physical document request submitted successfully');
    } catch (err) {
      toast.error(err?.response?.data?.message || err?.message);
    } finally {
      setActionsLoading(false);
    }
  };

  const getRecentSearches = async () => {
    try {
      const response = await getSearches();
      setRecentSearches(response?.data?.data || []);
    } catch (error) {
      // console.log(error);
    }
  };

  useEffect(() => {
    getRecentSearches();
    getUsers();
    getDepartmentList();
  }, []);

  return (
    <div className="space-y-2">
      {/* Recent Searches Section */}
      <div>
        <h3 className="text-lg font-semibold text-gray-800 mb-3">
          Recent Searches
        </h3>
        <div className="space-y-3 overflow-auto max-h-[25vh]">
          {recentSearches.map((search) => (
            <div
              key={search.id}
              className="flex items-center justify-between border p-3 rounded shadow-sm bg-white"
            >
              {/* Search Query Preview */}
              <div className="text-sm text-gray-700">
                <p className="font-medium">Type: {search.searchType}</p>
                <p className="text-xs text-gray-500">
                  {Object.entries(search.searchQuery)
                    .map(([key, val]) => `${key}: ${val}`)
                    .join(', ')}
                </p>
                <p className="text-xs text-gray-400">
                  {new Date(search.searchedAt).toLocaleString()}
                </p>
              </div>

              {/* Actions */}
              <div className="flex space-x-2">
                <CustomButton
                  text="Search Again"
                  disabled={actionsLoading}
                  click={() => handleSearchAgain(search.searchQuery)}
                />
                <CustomButton
                  text="Remove"
                  disabled={actionsLoading}
                  className="bg-red-500 hover:bg-red-600 text-white"
                  click={() => handleRemoveSearch(search.id)}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      <CustomCard className={'mx-auto'}>
        {(loading || actionsLoading) && <TopLoader />}
        <Title text={'Deep Document Search'} />

        <form
          onSubmit={handleSubmit(onSubmit)}
          className="grid grid-cols-1 md:grid-cols-2 gap-4"
        >
          {/* name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Document Name
            </label>
            <input
              {...register('name')}
              placeholder="Enter document name"
              className="w-full border p-2 rounded"
            />
          </div>

          {/* content */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Content
            </label>
            <input
              {...register('content')}
              placeholder="Search document content"
              className="w-full border p-2 rounded"
            />
          </div>

          {/* tags */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Tags
            </label>
            <input
              {...register('tags')}
              placeholder="Comma-separated tags"
              className="w-full border p-2 rounded"
            />
          </div>

          {/* partNumber */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Part Number
            </label>
            <input
              {...register('partNumber')}
              placeholder="Enter part number"
              className="w-full border p-2 rounded"
            />
          </div>

          {/* isArchived */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Archived
            </label>
            <select
              {...register('isArchived')}
              className="w-full border p-2 rounded"
            >
              <option value="">Select</option>
              <option value="true">Yes</option>
              <option value="false">No</option>
            </select>
          </div>

          {/* inBin */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              In Bin
            </label>
            <select
              {...register('inBin')}
              className="w-full border p-2 rounded"
            >
              <option value="">Select</option>
              <option value="true">Yes</option>
              <option value="false">No</option>
            </select>
          </div>

          {/* createdByUsername */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Created By
            </label>
            <select
              {...register('createdByUsername')}
              className="w-full border p-2 rounded"
            >
              <option value="">Select</option>
              {users?.map((user, index) => {
                const roles = user.roles?.join(', ') || 'No Roles';
                const departments = user.departments?.length
                  ? `(${user.departments.join(', ')})`
                  : '';

                return (
                  <option key={user.id} value={user.username}>
                    {`${user.username} - ${roles} ${departments}`}
                  </option>
                );
              })}
            </select>
          </div>

          {/* processName */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Process Name
            </label>
            <input
              {...register('processName')}
              placeholder="Enter process name"
              className="w-full border p-2 rounded"
            />
          </div>

          {/* processId */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Process ID
            </label>
            <input
              {...register('processId')}
              placeholder="Enter process ID"
              className="w-full border p-2 rounded"
            />
          </div>

          {/* description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Description
            </label>
            <input
              {...register('description')}
              placeholder="Enter description"
              className="w-full border p-2 rounded"
            />
          </div>

          {/* preApproved */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Pre-Approved
            </label>
            <select
              {...register('preApproved')}
              className="w-full border p-2 rounded"
            >
              <option value="">Select</option>
              <option value="true">Yes</option>
              <option value="false">No</option>
            </select>
          </div>

          {/* superseding */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Superseding
            </label>
            <select
              {...register('superseding')}
              className="w-full border p-2 rounded"
            >
              <option value="">Select</option>
              <option value="true">Yes</option>
              <option value="false">No</option>
            </select>
          </div>

          {/* Buttons */}
          <div className="md:col-span-2 flex justify-end gap-4 mt-2">
            <CustomButton disabled={loading} type="submit" text="Search" />
            <CustomButton
              text="Clear"
              type="button"
              variant="none"
              disabled={loading}
              click={() => {
                reset();
                setResults([]);
                setLastQuery(null);
                setPagination({
                  page: 1,
                  pageSize: 10,
                  totalCount: 0,
                  totalPages: 1,
                });
              }}
            />
          </div>
        </form>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 mt-6">
          {results.map((doc) => {
            const extension = doc.name?.split('.').pop()?.toLowerCase();
            const matchedFields = getMatchedFields(doc);

            return (
              <CustomCard
                key={doc.id}
                className="relative flex flex-col justify-between"
              >
                {/* Status Badge */}
                <div className="absolute top-0 right-1">
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full shadow-sm ${
                      doc.inBin
                        ? 'bg-red-100 text-red-800'
                        : doc?.isArchived
                          ? 'bg-orange-100 text-orange-800'
                          : 'bg-green-100 text-green-800'
                    }`}
                  >
                    {doc.isArchived
                      ? 'Archived'
                      : doc.inBin
                        ? 'Deleted'
                        : 'Active'}
                  </span>
                </div>

                {/* Header */}
                <div className="flex gap-3 items-center">
                  <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
                    <img
                      width={28}
                      src={ImageConfig[extension] || ImageConfig['default']}
                      alt="icon"
                    />
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold break-words">
                      {highlightMatch('name', doc.name)}
                    </p>
                    <p className="text-sm text-gray-500">
                      Type: {highlightMatch('partNumber', extension)}
                    </p>
                  </div>
                </div>

                {/* Matched Info */}
                {matchedFields.length > 0 && (
                  <div className="mt-4 text-sm bg-gray-50 border rounded p-2 space-y-1">
                    <p className="font-medium text-gray-700">Matched Info:</p>
                    {matchedFields.map((field, i) => (
                      <p key={i} className="text-gray-600">
                        <span className="font-medium">{field.label}:</span>{' '}
                        {field.value}
                      </p>
                    ))}
                  </div>
                )}

                {/* Actions */}
                <div className="mt-4 flex justify-end gap-2">
                  <CustomButton
                    text={<IconEye size={18} className="text-white" />}
                    title="View (Updated)"
                    click={() =>
                      handleViewFile(
                        doc.name,
                        doc.path,
                        doc.id,
                        extension,
                        false,
                      )
                    }
                  />
                  <CustomButton
                    text={<IconScript size={18} className="text-white" />}
                    title="Request Physical Document"
                    click={() => handlePhysicalDocumentRequest(doc)}
                    disabled={actionsLoading}
                  />
                </div>
              </CustomCard>
            );
          })}
        </div>

        {/* Pagination Controls */}
        {pagination.totalPages > 1 && (
          <div className="flex justify-between items-center mt-6">
            <CustomButton
              text="Previous"
              disabled={pagination.page === 1}
              type={'button'}
              click={() => handlePagination('prev')}
            />
            <span>
              Page {pagination.page} of {pagination.totalPages}
            </span>
            <CustomButton
              text="Next"
              type={'button'}
              disabled={pagination.page === pagination.totalPages}
              click={() => handlePagination('next')}
            />
          </div>
        )}

        {/* Physical Document Request Modal */}
        <CustomModal
          isOpen={open === 'physicalDocument'}
          onClose={() => {
            setOpen(false);
            resetDepartment();
          }}
          size="md"
        >
          <h2 className="text-lg font-semibold mb-4">
            Request Physical Document
          </h2>

          <form
            onSubmit={handleSubmitDepartment(onSubmitPhysicalRequest)}
            className="space-y-4"
          >
            {/* Department Dropdown */}
            <div>
              <select
                {...registerDepartment('departmentId', {
                  required: 'Department is required',
                })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring focus:ring-green-500"
              >
                <option value="">-- Select Department --</option>
                {departments?.map((item) => (
                  <option key={item?.id} value={item?.id}>
                    {item?.name}
                  </option>
                ))}
              </select>
              {departmentErrors.departmentId && (
                <p className="text-red-500 text-sm mt-1">
                  {departmentErrors.departmentId.message}
                </p>
              )}
            </div>

            {/* Reason Input */}
            <div>
              <Controller
                name="reason"
                control={controlDepartment}
                rules={{ required: 'Reason is required' }}
                render={({ field }) => (
                  <CustomTextField
                    {...field}
                    label="Reason"
                    placeholder="Enter Reason"
                    error={departmentErrors.reason?.message}
                  />
                )}
              />
            </div>

            {/* Buttons */}
            <div className="flex justify-end gap-3 pt-2">
              <CustomButton
                type="button"
                variant="danger"
                disabled={actionsLoading}
                click={() => {
                  setOpen(false);
                  resetDepartment();
                }}
                text="Cancel"
              />
              <CustomButton
                type="submit"
                variant="primary"
                text={'Submit'}
                disabled={actionsLoading}
              />
            </div>
          </form>
        </CustomModal>

        {/* View File Modal */}
        {fileView && (
          <ViewFile
            docu={fileView}
            setFileView={setFileView}
            handleViewClose={() => setFileView(null)}
          />
        )}
      </CustomCard>
    </div>
  );
}
