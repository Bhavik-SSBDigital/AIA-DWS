import React, { useEffect, useState } from 'react';
import { DataGrid } from '@mui/x-data-grid';
import { Link, useNavigate } from 'react-router-dom';
import moment from 'moment';
import { IconTrash, IconEdit } from '@tabler/icons-react';
import { toast } from 'react-toastify';
import ComponentLoader from '../../common/Loader/ComponentLoader';
import { deleteRole, GetAllRoles } from '../../common/Apis';
import CustomButtom from '../../CustomComponents/CustomButton';
import DeleteConfirmationModal from '../../CustomComponents/DeleteConfirmation';
import CustomCard from '../../CustomComponents/CustomCard';

const RolesList = () => {
  const backendUrl = import.meta.env.VITE_BACKEND_URL;
  const navigate = useNavigate();

  const [roles, setRoles] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [actionsLoading, setActionsLoading] = useState(false);
  const [isModalOpen, setModalOpen] = useState(false);
  const [deleteItemId, setDeleteItemId] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const { data } = await GetAllRoles();
        setRoles(data.roles);
      } catch (error) {
        toast.error('Failed to fetch roles');
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, []);

  const handleDelete = async (id) => {
    setActionsLoading(true);
    try {
      const response = await deleteRole(id);
      if (response?.status === 200) {
        setRoles((prev) =>
          prev.map((item) =>
            (item.id || item._id) === id
              ? { ...item, status: 'Inactive' }
              : item,
          ),
        );
        toast.success(response?.data?.message);
      }
    } catch (error) {
      toast.error(error?.response?.data?.message || error?.message);
    } finally {
      setActionsLoading(false);
      setModalOpen(false);
    }
  };

  const handleEdit = (row) => {
    navigate(`/roles/edit/${row.id}`);
  };

  const filteredRoles = roles
    .filter(
      (row) =>
        row?.role?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        row?.departmentName?.toLowerCase().includes(searchTerm.toLowerCase()),
    )
    .map((row) => ({ ...row }));

  const columns = [
    {
      field: 'role',
      headerName: 'Role Name',
      flex: 1,
      renderCell: (params) => params.row.role || '--',
    },
    {
      field: 'departmentName',
      headerName: 'Department',
      flex: 1,
      renderCell: (params) => params.row.departmentName || '--',
    },
    {
      field: 'createdAt',
      headerName: 'Created At',
      flex: 1,
      renderCell: (params) =>
        params?.value
          ? moment(params.value).format('DD-MMM-YYYY hh:mm A')
          : '--',
    },
    {
      field: 'updatedAt',
      headerName: 'Updated At',
      flex: 1,
      renderCell: (params) =>
        params?.value
          ? moment(params.value).format('DD-MMM-YYYY hh:mm A')
          : '--',
    },
    {
      field: 'actions',
      headerName: 'Actions',
      flex: 1,
      sortable: false,
      renderCell: (params) => (
        <div className="flex space-x-2 m-1">
          <CustomButtom
            variant="secondary"
            click={() => handleEdit(params.row)}
            disabled={actionsLoading}
            text={<IconEdit color="white" />}
          />
          <CustomButtom
            variant="danger"
            click={() => {
              setDeleteItemId(params.row.id);
              setModalOpen(true);
            }}
            disabled={actionsLoading || params.row.status == 'Inactive'}
            text={<IconTrash color="white" />}
          />
        </div>
      ),
    },
  ];

  return isLoading ? (
    <ComponentLoader />
  ) : (
    <CustomCard>
      <div className="flex items-end justify-between gap-3 mb-1">
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Search
          </label>
          <input
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full p-2 border rounded max-w-[200px]"
          />
        </div>
        <Link to="/roles/createNew">
          <CustomButtom text="Add Role" />
        </Link>
      </div>

      <DataGrid
        rows={filteredRoles}
        columns={columns}
        pageSize={10}
        autoHeight
        disableSelectionOnClick
      />

      <DeleteConfirmationModal
        isOpen={isModalOpen}
        onClose={() => setModalOpen(false)}
        onConfirm={() => handleDelete(deleteItemId)}
        isLoading={actionsLoading}
        deactive={true}
      />
    </CustomCard>
  );
};

export default RolesList;
