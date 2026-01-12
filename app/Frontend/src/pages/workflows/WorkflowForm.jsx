import {
  IconArrowDown,
  IconArrowUp,
  IconEdit,
  IconEye,
  IconInfoCircle,
  IconInfoCircleFilled,
  IconPlus,
  IconSquareLetterX,
  IconTrash,
} from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { useForm, useFieldArray, Controller } from 'react-hook-form';
import { toast } from 'react-toastify';
import {
  checkDuplicateWorkflow,
  CopyWorkflow,
  CreateWorkflow,
  EditWorkflow,
  GetAllRoles,
  getDepartments,
  getRolesHierarchyInDepartment,
  GetUsersWithDetails,
  GetWorkflowsList,
} from '../../common/Apis';
import {
  Autocomplete,
  TextField,
  FormControl,
  FormLabel,
  FormGroup,
  FormHelperText,
} from '@mui/material';
import TreeGraph from '../../components/TreeGraph';
import CustomButton from '../../CustomComponents/CustomButton';
import CustomModal from '../../CustomComponents/CustomModal';

export default function WorkflowForm({
  handleCloseForm,
  editData,
  setEditData,
  updateList,
}) {
  const [selectedNodes, setSelectedNodes] = useState([]);
  const [actionsLoading, setActionsLoading] = useState(false);
  const {
    register,
    handleSubmit,
    control,
    setValue,
    getValues,
    reset,
    formState: { errors },
  } = useForm({
    defaultValues: {
      name: '',
      description: '',
      steps: [],
    },
  });

  const {
    fields: stepFields,
    append: appendStep,
    remove: removeStep,
    move: moveStep,
  } = useFieldArray({ control, name: 'steps' });

  const [showAssignmentForm, setShowAssignmentForm] = useState(false);
  const [isDuplicate, setIsDuplicate] = useState(false);
  const [currentStepIndex, setCurrentStepIndex] = useState(null);
  const [currentAssignmentIndex, setCurrentAssignmentIndex] = useState(null);
  const [editingAssignment, setEditingAssignment] = useState(null);
  const [workflowsList, setWorkflowsList] = useState([]);

  const handleAddAssignment = (stepIndex) => {
    setIsDuplicate(false);
    setCurrentStepIndex(stepIndex);
    setShowAssignmentForm(true);
  };
  const handleMoveStepUp = (index) => {
    setIsDuplicate(false);
    if (index > 0) {
      moveStep(index, index - 1); // Move step up
    }
  };

  const handleMoveStepDown = (index) => {
    setIsDuplicate(false);
    if (index < stepFields.length - 1) {
      moveStep(index, index + 1); // Move step down
    }
  };

  const handleAssignmentSubmit = (assignment, assignmentIndex = null) => {
    const updatedSteps = [...stepFields];
    const stepName = getValues(`steps.${currentStepIndex}.stepName`);
    setIsDuplicate(false);
    if (assignmentIndex !== null) {
      // Update existing assignment
      updatedSteps[currentStepIndex].assignments[assignmentIndex] = {
        ...assignment,
        selectedRoles: assignment.selectedRoles || [],
      };
    } else {
      // Add new assignment
      updatedSteps[currentStepIndex].assignments = [
        ...(updatedSteps[currentStepIndex].assignments || []),
        { ...assignment, selectedRoles: assignment.selectedRoles || [] },
      ];
    }

    updatedSteps[currentStepIndex].stepName = stepName;
    setValue('steps', updatedSteps);
    setShowAssignmentForm(false);
    setSelectedNodes([]);
    setEditingAssignment(null); // Reset editing state
    setCurrentAssignmentIndex(null); // Reset assignment index
  };
  const createWorkflow = async (data) => {
    setIsDuplicate(false);
    if (!data?.steps || data.steps.length < 2) {
      toast.info('Please add at least two steps to proceed.');
      return;
    }

    if (data?.steps?.find((item) => item.assignments.length == 0)) {
      toast.info('Please add assignments');
      return;
    }

    try {
      const resD = await checkDuplicateWorkflow(data);
      if (resD?.data?.is_workflow_duplicate) {
        setIsDuplicate(true);
        return;
      }
      const res = editData
        ? await EditWorkflow(editData?.id, data)
        : await CreateWorkflow(data);
      toast.success(res?.data?.message);
      updateList();
      handleCloseForm();
      reset();
      setEditData(null);
    } catch (error) {
      toast.error(error?.response?.data?.messaeg || error?.message);
    }
  };
  const handleEditAssignment = (stepIndex, assignmentIndex, selectedRoles) => {
    setIsDuplicate(false);
    setCurrentStepIndex(stepIndex);
    setCurrentAssignmentIndex(assignmentIndex); // Store the index of the assignment being edited
    const assignment = stepFields[stepIndex].assignments[assignmentIndex];
    setEditingAssignment(assignment); // Store the assignment data to edit
    setShowAssignmentForm(true);
    setSelectedNodes(selectedRoles || []);
  };

  const handleCopyWorkflow = async (id) => {
    setIsDuplicate(false);
    setActionsLoading(true);
    setIsDuplicate(false);
    try {
      const response = await CopyWorkflow(id);
      setValue('steps', response?.data);
      toast.success(response?.data?.message || 'Workflow Steps Updated!');
    } catch (error) {
      toast.error(
        error?.response?.data?.message ||
          error?.response?.data?.error ||
          error?.message,
      );
    } finally {
      setActionsLoading(false);
    }
  };
  const getWorkflowsToCopy = async () => {
    setIsDuplicate(false);
    try {
      const response = await GetWorkflowsList();
      setWorkflowsList(response.data);
    } catch (error) {
      toast.error(
        error?.response?.data?.message ||
          error?.response?.data?.message ||
          error?.message,
      );
    }
  };
  useEffect(() => {
    if (editData) {
      reset(editData);
    }
  }, [editData]);
  useEffect(() => {
    getWorkflowsToCopy();
  }, []);
  return (
    <div className="mx-auto bg-white overflow-auto p-2">
      <h2 className="text-xl font-bold mb-4 text-center">Add Workflow</h2>

      <form onSubmit={handleSubmit(createWorkflow)}>
        {/* Workflow Name */}
        <div className="mb-4">
          <label className="block text-sm font-semibold mb-2">
            Workflow Name :
          </label>
          <input
            {...register('name', {
              required: 'Workflow name is required',
              pattern: {
                value: /^[a-zA-Z0-9\s_-]+$/,
                message: 'Special characters are not allowed',
              },
            })}
            className="border p-2 sm:p-3 w-full rounded-md"
            placeholder="Enter workflow name"
          />
          {errors.name && (
            <p className="text-red-500 text-sm mt-1">{errors.name.message}</p>
          )}
        </div>

        {/* Workflow Description */}
        <div className="mb-4">
          <label className="block text-sm font-semibold mb-2">
            Description :
          </label>
          <textarea
            {...register('description')}
            required
            className="border p-2 sm:p-3 w-full rounded-md"
            placeholder="Provide a brief description"
          />
        </div>

        {/* ------------------------------------------------------------- */}
        {/* WORKFLOW TEMPLATE DROPDOWN (NEW SECTION) */}
        {/* ------------------------------------------------------------- */}

        <div className="mb-6">
          <label className="block text-sm font-semibold mb-2">
            Choose From Existing Workflows :
          </label>

          <div className="border p-3 rounded-md bg-gray-50">
            <div className="max-h-48 overflow-y-auto space-y-2 pr-1">
              {workflowsList && workflowsList.length > 0 ? (
                workflowsList.map((wf) => (
                  <div
                    key={wf.workflowId}
                    className="flex justify-between items-center border p-2 rounded-md bg-white hover:bg-gray-100 transition"
                  >
                    <div>
                      <p className="font-semibold text-sm">{wf.workflowName}</p>
                      <p className="text-xs text-gray-600">
                        {wf.workflowDescription}
                      </p>
                    </div>

                    <CustomButton
                      type="button"
                      disabled={actionsLoading}
                      click={() => handleCopyWorkflow(wf.workflowId)}
                      text={'Use'}
                    ></CustomButton>
                  </div>
                ))
              ) : (
                <p className="text-gray-500 text-sm italic">
                  No workflows found.
                </p>
              )}
            </div>
          </div>
        </div>

        {/* ------------------------------------------------------------- */}
        {/* Steps Section */}
        {/* ------------------------------------------------------------- */}

        <div>
          <h3 className="text-lg font-semibold mb-4">Workflow Steps :</h3>

          {stepFields.map((step, stepIndex) => (
            <div
              key={step.id}
              className="border border-black p-7 rounded-md shadow-8 mb-4 relative bg-gray-100"
            >
              <div className="absolute top-2 right-2 flex space-x-2">
                <CustomButton
                  type="button"
                  click={() => handleMoveStepUp(stepIndex)}
                  disabled={stepIndex === 0 || actionsLoading}
                  title="Move Step Up"
                  text={<IconArrowUp size={20} />}
                />
                <CustomButton
                  type="button"
                  click={() => handleMoveStepDown(stepIndex)}
                  disabled={
                    stepIndex === stepFields.length - 1 || actionsLoading
                  }
                  title="Move Step Down"
                  text={<IconArrowDown size={20} />}
                />
                <CustomButton
                  type="button"
                  click={() => removeStep(stepIndex)}
                  disabled={actionsLoading}
                  title="Remove Step"
                  variant="danger"
                  text={<IconTrash size={20} />}
                />
              </div>

              {/* Step Name */}
              <label className="block text-sm font-semibold mb-2">
                Step Name :
              </label>
              <input
                {...register(`steps.${stepIndex}.stepName`)}
                required
                className="border p-2 sm:p-3 w-full rounded-md mb-2"
                placeholder={`Step ${stepIndex + 1} Name`}
              />

              {/* Assignment Header */}
              <div className="flex justify-between items-center mt-4">
                <h4 className="text-sm font-semibold">Assignments :</h4>

                <button
                  type="button"
                  onClick={() => handleAddAssignment(stepIndex)}
                  className="text-blue-500 hover:text-blue-700 text-sm flex items-center border p-1 rounded-md px-5"
                >
                  <IconPlus size={14} className="mr-1" /> Add
                </button>
              </div>

              {/* Assignment List Table */}
              {step.assignments && step.assignments.length > 0 ? (
                <div className="mt-2 border rounded-md">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-200 font-semibold">
                        <tr className="border-b">
                          <th className="p-2 text-left">Assignee Type</th>
                          <th className="p-2 text-left">Action Type</th>
                          <th className="p-2 text-left">Assignees</th>
                          <th className="p-2 text-left">Action</th>
                        </tr>
                      </thead>

                      <tbody>
                        {step.assignments.map((assignment, index) => (
                          <tr key={index} className="border-b">
                            <td className="p-2">{assignment.assigneeType}</td>
                            <td className="p-2">{assignment.actionType}</td>
                            <td className="p-2">
                              {assignment.assigneeIds
                                .map(
                                  (item) =>
                                    item?.name || item?.username || item?.role,
                                )
                                .filter(Boolean)
                                .join(', ') || 'N/A'}
                            </td>

                            {/* Actions */}
                            <td className="p-2 flex gap-2">
                              <CustomButton
                                type="button"
                                click={() =>
                                  handleEditAssignment(
                                    stepIndex,
                                    index,
                                    assignment.selectedRoles,
                                  )
                                }
                                text={<IconEdit size={18} />}
                              />

                              <CustomButton
                                type="button"
                                variant="danger"
                                click={() => {
                                  const updatedSteps = [...stepFields];
                                  updatedSteps[stepIndex].assignments.splice(
                                    index,
                                    1,
                                  );
                                  setValue('steps', updatedSteps);
                                }}
                                text={<IconTrash size={18} />}
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <p className="text-gray-500 text-sm mt-2 italic border p-2 rounded-md">
                  No assignments added.
                </p>
              )}
            </div>
          ))}

          {/* Add Step Button */}
          <button
            type="button"
            onClick={() => {
              setIsDuplicate(false);
              appendStep({ stepName: '', assignments: [] });
            }}
            disabled={actionsLoading}
            className="bg-button-secondary-default hover:bg-button-secondary-hover text-white px-4 py-2 rounded-md flex items-center justify-center w-full"
          >
            <IconPlus className="mr-2" size={18} /> Add Step
          </button>
        </div>

        {/* Submit Buttons */}
        <hr className="mt-15 border-t-2 border-gray-300" />
        {isDuplicate && (
          <div className="mt-4 p-3 px-5 bg-red-300 text-red-800 flex gap-3 rounded-2xl font-semibold">
            <IconInfoCircleFilled />A workflow already exists.
          </div>
        )}

        <div className="flex flex-col sm:flex-row justify-end space-y-2 sm:space-y-0 sm:space-x-2 mt-4">
          <CustomButton
            type="button"
            click={() => handleCloseForm()}
            disabled={actionsLoading}
            text="Cancel"
            variant="none"
            className="flex-1"
          />

          <CustomButton
            disabled={actionsLoading}
            type="submit"
            text={editData ? 'Update' : 'Submit'}
            className="flex-1"
          />
        </div>
      </form>

      {/* Assignment Form as Modal */}
      {showAssignmentForm && (
        <AssignmentForm
          onSubmit={handleAssignmentSubmit}
          onClose={() => {
            setShowAssignmentForm(false);
            setSelectedNodes([]);
            setEditingAssignment(null); // Reset editing state
            setCurrentAssignmentIndex(null); // Reset assignment index
          }}
          setSelectedNodes={setSelectedNodes}
          selectedNodes={selectedNodes}
          editingAssignment={editingAssignment} // Pass the assignment to edit
          currentAssignmentIndex={currentAssignmentIndex} // Pass the assignment index
          actionsLoading={actionsLoading}
          setActionsLoading={setActionsLoading}
        />
      )}
    </div>
  );
}

// Assignment Form (Modal)
function AssignmentForm({
  onSubmit,
  onClose,
  setSelectedNodes,
  selectedNodes,
  editingAssignment,
  currentAssignmentIndex,
  actionsLoading,
  setActionsLoading,
}) {
  const onSubmitHandler = (data) => {
    if (editingAssignment && currentAssignmentIndex !== null) {
      data.selectedRoles = selectedNodes;
      onSubmit(data, currentAssignmentIndex);
    } else {
      onSubmit({ ...data, selectedRoles: selectedNodes });
    }
    onClose();
  };
  function sortSelectedRolesByStep(data, selectedIds, direction) {
    const selectedSet = new Set(selectedIds);

    // Helper: find parent-child relationships
    function findParents(node) {
      const results = [];
      if (node.children) {
        for (const child of node.children) {
          if (selectedSet.has(child.id)) {
            results.push({ child: child.id, parent: node.id });
          }
          results.push(...findParents(child));
        }
      }
      return results;
    }

    // Gather all parent-child pairs
    let parentChildPairs = [];
    for (const root of data) {
      parentChildPairs = parentChildPairs.concat(findParents(root));
    }

    // Step 1: identify leaf nodes (selected with no selected children)
    const selectedWithChildren = new Set(
      parentChildPairs.map((pc) => pc.parent),
    );
    const leaves = Array.from(selectedSet).filter(
      (id) => !selectedWithChildren.has(id),
    );

    // Step 2: find selected parents of the selected leaves
    const parents = parentChildPairs
      .filter((pc) => leaves.includes(pc.child) && selectedSet.has(pc.parent))
      .map((pc) => pc.parent);

    const uniqueParents = [...new Set(parents)];

    // Map IDs to names
    const idToName = {};
    (function mapAll(nodes) {
      for (const n of nodes) {
        idToName[n.id] = n.name;
        if (n.children) mapAll(n.children);
      }
    })(data);

    // Build step-based output
    let stepGroups = [];

    if (leaves.length && uniqueParents.length) {
      stepGroups =
        direction === 'UPWARDS'
          ? [
              { step: 1, roles: leaves.map((id) => idToName[id]) },
              { step: 2, roles: uniqueParents.map((id) => idToName[id]) },
            ]
          : [
              { step: 1, roles: uniqueParents.map((id) => idToName[id]) },
              { step: 2, roles: leaves.map((id) => idToName[id]) },
            ];
    } else if (leaves.length) {
      stepGroups = [{ step: 1, roles: leaves.map((id) => idToName[id]) }];
    } else if (uniqueParents.length) {
      stepGroups = [
        { step: 1, roles: uniqueParents.map((id) => idToName[id]) },
      ];
    }

    // Return JSX UI
    return (
      <div>
        {stepGroups.map((group) => (
          <div key={group.step} className="text-sm text-gray-800 mb-1">
            <strong>Step {group.step}:</strong> {group.roles.join(', ')}
          </div>
        ))}
      </div>
    );
  }

  const { register, handleSubmit, watch, control, setValue } = useForm({
    defaultValues: editingAssignment || {
      assigneeType: 'USER',
      actionType: 'APPROVAL',
      assigneeIds: [],
      direction: null,
    },
  });
  const [departmentsAndRoles, setDepartmentsAndRoles] = useState([]);
  const [assigneeType, assigneeIds] = watch(['assigneeType', 'assigneeIds']);
  const [openWorkflows, setOpenWorkflows] = useState(false);

  // network calls
  const [userList, setUserList] = useState([]);
  const GetUserList = async () => {
    const response = await GetUsersWithDetails();
    setUserList(response?.data);
  };

  const [roleList, setRoleList] = useState([]);
  const GetRoleList = async () => {
    const response = await GetAllRoles();
    setRoleList(response?.data?.roles);
  };

  const [departmentList, setDepartmentList] = useState([]);
  const GetDepartmentList = async () => {
    const response = await getDepartments();
    setDepartmentList(response?.data?.departments);
  };

  useEffect(() => {
    if (editingAssignment) {
      // Pre-fill form fields
      console.log('callded');
      setValue('assigneeType', editingAssignment.assigneeType);
      setValue('actionType', editingAssignment.actionType);
      setValue('assigneeIds', editingAssignment.assigneeIds);
      // setValue('accessTypes', editingAssignment.accessTypes || []);
      if (
        editingAssignment.assigneeType === 'DEPARTMENT' &&
        editingAssignment.selectedRoles
      ) {
        setSelectedNodes(editingAssignment.selectedRoles); // Pre-fill selected roles
      }
    }

    // Existing logic for fetching users, roles, or departments
    if (userList.length === 0 && assigneeType?.toLowerCase() === 'user') {
      GetUserList();
    } else if (
      roleList.length === 0 &&
      assigneeType?.toLowerCase() === 'role'
    ) {
      GetRoleList();
    } else if (
      departmentList.length === 0 &&
      assigneeType?.toLowerCase() === 'department'
    ) {
      GetDepartmentList();
    }
  }, [assigneeType, editingAssignment, setValue]);

  // workflows
  const [currentPage, setCurrentPage] = useState(0);
  const [hierarchyData, setHierarchyData] = useState({});
  const [loading, setLoading] = useState(false);
  const selectedDepartments = departmentList.filter((dep) =>
    assigneeIds?.some((item) => item?.id == dep?.id),
  );

  const currentDepartment = selectedDepartments?.[currentPage];

  useEffect(() => {
    const fetchHierarchy = async () => {
      if (!currentDepartment || hierarchyData[currentDepartment.id]) return;

      try {
        setLoading(true);
        const response = await getRolesHierarchyInDepartment(
          currentDepartment.id,
        );
        setHierarchyData((prev) => ({
          ...prev,
          [currentDepartment.id]: response.data.data,
        }));
      } catch (error) {
        toast.error(
          error?.response?.data?.message || 'Failed to load hierarchy',
        );
      } finally {
        setLoading(false);
      }
    };

    fetchHierarchy();
  }, [currentDepartment]);

  return (
    <>
      <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 px-4">
        <div className="bg-white p-4 sm:p-6 rounded-md shadow-lg w-full max-w-2xl max-h-[95vh] overflow-auto">
          <h3 className="text-lg font-semibold mb-4 text-center">
            Add Assignment
          </h3>

          <form onSubmit={handleSubmit(onSubmitHandler)}>
            {/* Assignee Type */}
            <label className="block text-sm font-semibold mb-2">
              Assignee Type
            </label>
            <select
              {...register('assigneeType')}
              required
              disabled={editingAssignment}
              className="border p-2 w-full rounded-sm mb-3"
            >
              <option value="USER">User</option>
              <option value="ROLE">Role</option>
              <option value="DEPARTMENT">Department</option>
            </select>

            {/* Assignee Selection */}
            {assigneeType?.toLowerCase() === 'user' && (
              <>
                <label className="block text-sm font-semibold mb-2">
                  Users
                </label>
                <Controller
                  name="assigneeIds"
                  control={control}
                  render={({ field }) => {
                    const allSelected =
                      field.value?.length === userList?.length; // Check if all users are selected

                    // Add "Select All" option at the top
                    const enhancedOptions = [
                      {
                        id: 'all',
                        username: allSelected ? 'Deselect All' : 'Select All',
                      },
                      ...(userList || []),
                    ];

                    return (
                      <Autocomplete
                        multiple
                        className="mb-3"
                        size="small"
                        options={enhancedOptions}
                        getOptionLabel={(option) => option.username}
                        value={
                          allSelected
                            ? userList
                            : userList?.filter((u) =>
                                field.value.some((item) => item.id === u.id),
                              )
                        }
                        onChange={(_, value) => {
                          if (value.some((v) => v.id === 'all')) {
                            field.onChange(allSelected ? [] : userList); // Select/Deselect all
                          } else {
                            field.onChange(value); // Normal selection
                          }
                        }}
                        renderInput={(params) => (
                          <TextField {...params} variant="outlined" />
                        )}
                      />
                    );
                  }}
                />
              </>
            )}

            {assigneeType?.toLowerCase() === 'role' && (
              <>
                <label className="block text-sm font-semibold mb-2">
                  Roles
                </label>
                <Controller
                  name="assigneeIds"
                  control={control}
                  render={({ field }) => {
                    const allSelected =
                      field.value?.length === roleList?.length; // Check if all are selected

                    // Add "Select All" option at the top
                    const enhancedOptions = [
                      {
                        id: 'all',
                        role: allSelected ? 'Deselect All' : 'Select All',
                        departmentName: '',
                      },
                      ...(roleList || []),
                    ];

                    return (
                      <Autocomplete
                        multiple
                        className="mb-3"
                        size="small"
                        options={enhancedOptions}
                        getOptionLabel={(option) =>
                          option.id === 'all'
                            ? option.role
                            : `${option.role} (department - ${option.departmentName})`
                        }
                        value={
                          allSelected
                            ? roleList
                            : roleList?.filter(
                                (r) =>
                                  field.value.some((item) => item.id === r.id), // Compare full objects
                              )
                        }
                        onChange={(_, value) => {
                          if (value.some((v) => v.id === 'all')) {
                            field.onChange(allSelected ? [] : roleList); // Select/Deselect all
                          } else {
                            field.onChange(value); // Store full object instead of just IDs
                          }
                        }}
                        renderInput={(params) => (
                          <TextField {...params} variant="outlined" />
                        )}
                      />
                    );
                  }}
                />
              </>
            )}

            {assigneeType.toLowerCase() === 'department' && (
              <>
                <label className="block text-sm font-semibold mb-2">
                  Departments
                </label>
                <Controller
                  name="assigneeIds"
                  control={control}
                  render={({ field }) => {
                    const allSelected =
                      field.value?.length === departmentList?.length; // Check if all are selected

                    const enhancedOptions = [
                      {
                        id: 'all',
                        name: allSelected ? 'Deselect All' : 'Select All',
                      },
                      ...(departmentList || []),
                    ];

                    return (
                      <Autocomplete
                        multiple
                        className="mb-3"
                        size="small"
                        options={enhancedOptions}
                        getOptionLabel={(option) =>
                          option.id === 'all'
                            ? option.name
                            : `${option.name} (code - ${option.id})`
                        }
                        value={
                          allSelected
                            ? departmentList
                            : departmentList?.filter(
                                (d) =>
                                  field.value.some((item) => item.id === d.id), // Compare full objects
                              )
                        }
                        onChange={(_, value) => {
                          if (value.some((v) => v.id === 'all')) {
                            field.onChange(allSelected ? [] : departmentList); // Select/Deselect all
                          } else {
                            field.onChange(value); // Store full objects instead of just IDs
                          }
                        }}
                        renderInput={(params) => (
                          <TextField {...params} variant="outlined" />
                        )}
                      />
                    );
                  }}
                />

                {assigneeIds?.length !== 0 ? (
                  <button
                    type="button"
                    className="bg-button-secondary-default hover:bg-button-secondary-hover rounded-md text-white p-2 border ml-auto block"
                    onClick={() => setOpenWorkflows(true)}
                  >
                    Select Roles
                  </button>
                ) : null}
                {selectedNodes && selectedNodes.length > 0 ? (
                  <>
                    <div className="flex mt-2 items-center bg-purple-100 border-l-4 border-purple-500 text-blue-800 p-3 rounded-md">
                      <IconInfoCircle size={20} className="mr-2" />
                      <span>
                        Selected roles will take part on behalf of the selected
                        department
                      </span>
                    </div>

                    <div className="mb-3 mt-1 border rounded-md overflow-x-auto">
                      <table className="min-w-[500px] w-full border-collapse">
                        {/* Table Head */}
                        <thead>
                          <tr className="bg-gray-200 text-sm font-semibold border-b">
                            <th className="p-2 text-left">Department Code</th>
                            <th className="p-2 text-left">Flow</th>
                            <th className="p-2 text-center hidden">
                              Allow Parallel ( Process will be sent to all roles
                              at the same time )
                            </th>
                            <th className="p-2 text-center">Direction</th>
                          </tr>
                        </thead>

                        {/* Table Body */}
                        <tbody>
                          {selectedNodes.map((node, index) => (
                            <tr key={index} className="border-b text-sm">
                              <td className="p-3 whitespace-nowrap">
                                {node.department}
                              </td>
                              <td className="p-3 whitespace-nowrap">
                                {sortSelectedRolesByStep(
                                  node.roles,
                                  node.roles.map((item) => item.id),
                                  node.direction,
                                )}
                              </td>
                              <td className="p-3 text-center hidden">
                                <input
                                  type="checkbox"
                                  checked={node.allowParallel || false}
                                  onChange={(e) => {
                                    const updatedNodes = [...selectedNodes];
                                    updatedNodes[index] = {
                                      ...node,
                                      allowParallel: e.target.checked, // Toggle allowParallel
                                    };
                                    setSelectedNodes(updatedNodes); // Notify parent component
                                  }}
                                  className="cursor-pointer"
                                />
                              </td>
                              <td className="p-3 text-center">
                                <label className="block text-sm font-semibold mb-2">
                                  Direction Of Flow
                                </label>
                                <select
                                  value={node.direction || ''}
                                  onChange={(e) => {
                                    const updatedNodes = [...selectedNodes];
                                    updatedNodes[index] = {
                                      ...node,
                                      direction: e.target.value,
                                    };
                                    setSelectedNodes(updatedNodes);
                                  }}
                                  required
                                  className="border p-2 w-full rounded-sm mb-3"
                                >
                                  <option value="">Select Direction</option>
                                  <option value="UPWARDS">UPWARDS</option>
                                  <option value="DOWNWARDS">DOWNWARDS</option>
                                </select>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                ) : (
                  <p className="text-gray-500 my-3 text-sm mt-2 italic border p-2 rounded-md">
                    No Roles Selected.
                  </p>
                )}
              </>
            )}

            {/* Access Types Selection */}
            {/* <label className="block text-sm font-semibold mb-2">
              Access Type
            </label>
            <Controller
              name="accessTypes"
              control={control}
              render={({ field }) => (
                <Autocomplete
                  multiple
                  className="mb-3"
                  size="small"
                  options={['READ', 'EDIT', 'DOWNLOAD']}
                  onChange={(_, value) => field.onChange(value)}
                  renderInput={(params) => (
                    <TextField {...params} variant="outlined" />
                  )}
                />
              )}
            /> */}

            {/* Action Type */}
            <label className="block text-sm font-semibold mb-2">
              Action Type
            </label>
            <select
              {...register('actionType')}
              required
              className="border p-2 w-full rounded-sm mb-3"
            >
              <option value="APPROVAL">APPROVAL</option>
              <option value="REVIEW">VIEW</option>
              {/* <option value="RECOMMENDATION">RECOMMENDATION</option> */}
            </select>

            {/* Direction */}
            {/* {assigneeType.toLowerCase() == 'department' && (
              <>
                <label className="block text-sm font-semibold mb-2">
                  Direction Of Flow
                </label>
                <select
                  {...register('direction')}
                  required
                  className="border p-2 w-full rounded-sm mb-3"
                >
                  <option value="UPWARDS">UPWARDS</option>
                  <option value="DOWNWARDS">DOWNWARDS</option>
                </select>
              </>
            )} */}

            {/* Submit & Cancel Buttons */}
            <div className="flex justify-end space-x-2">
              <CustomButton
                type="button"
                disabled={loading | actionsLoading}
                click={() => {
                  onClose();
                }}
                variant={'danger'}
                text={'Cancel'}
                className={'w-30'}
              ></CustomButton>
              <CustomButton
                type="submit"
                disabled={loading | actionsLoading}
                className={'w-30'}
                text={editingAssignment ? 'Update' : 'Save'}
              ></CustomButton>
            </div>
          </form>
        </div>
      </div>

      {openWorkflows && currentDepartment && (
        <CustomModal size="full" isOpen={openWorkflows && currentDepartment}>
          <div className="p-3 w-full relative">
            <button
              onClick={() => {
                setOpenWorkflows(false);
                setCurrentPage(0);
              }}
              className="absolute right-2 top-2"
            >
              <IconSquareLetterX />
            </button>
            {/* Show Single Department */}
            <div className="mb-4 max-h-[80vh] overflow-auto">
              <h3 className="font-bold">
                Department : {currentDepartment.name}
              </h3>

              {/* Show Hierarchy if Available */}
              <div className="mb-4">
                {/* Show Hierarchy in TreeGraph */}
                <TreeGraph
                  data={hierarchyData[currentDepartment.id] || []}
                  loading={loading}
                  controls={true}
                  departmentId={currentDepartment.id}
                  onHierarchyUpdate={(value) => setSelectedNodes(value)}
                  selectedNodes={selectedNodes}
                />
              </div>
            </div>

            {/* Pagination Controls */}
            <div className="flex justify-between mt-4">
              <button
                onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 0))}
                disabled={currentPage === 0}
                className={`px-3 py-1 border rounded ${
                  currentPage === 0 ? 'opacity-50' : ''
                }`}
              >
                Previous
              </button>
              <button
                onClick={() =>
                  setCurrentPage((prev) =>
                    prev + 1 < departmentList.length ? prev + 1 : prev,
                  )
                }
                disabled={currentPage + 1 >= departmentList.length}
                className={`px-3 py-1 border rounded ${
                  currentPage + 1 >= departmentList.length ? 'opacity-50' : ''
                }`}
              >
                Next
              </button>
            </div>
          </div>
        </CustomModal>
      )}
    </>
  );
}
