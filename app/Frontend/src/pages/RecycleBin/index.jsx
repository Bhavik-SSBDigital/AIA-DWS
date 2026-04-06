import { useEffect, useState } from 'react';
import {
  IconTrash,
  IconRestore,
  IconSquareLetterX,
  IconDotsVertical,
  IconSettings,
} from '@tabler/icons-react';
import ViewFile from '../view/View';
import CustomCard from '../../CustomComponents/CustomCard';
import TopLoader from '../../common/Loader/TopLoader';
import CustomModal from '../../CustomComponents/CustomModal';
import { ImageConfig } from '../../config/ImageConfig';
import CustomButton from '../../CustomComponents/CustomButton';
import folderIcon from '../../assets/images/folder.png';

import moment from 'moment';
import {
  GetBinFolderData,
  GetBinRootFolders,
  RecoverDeletedFile,
  ViewDocument,
} from '../../common/Apis';
import { toast } from 'react-toastify';
import PathBar from '../../components/path/PathBar';
import ComponentLoader from '../../common/Loader/ComponentLoader';
import CustomTextField from '../../CustomComponents/CustomTextField';

const RecycleBin = () => {
  const [loading, setLoading] = useState(false);
  const [deletedFiles, setDeletedFiles] = useState([]);
  const [selectedItem, setSelectedItem] = useState(null);
  const [actionsLoading, setActionsLoading] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [showProperties, setShowProperties] = useState(false);
  const [currentPath, setCurrentPath] = useState(
    sessionStorage.getItem('recyclePath') || '..',
  );
  const [fileView, setFileView] = useState();
  const [searchTerm, setSearchTerm] = useState('');

  // Handlers
  const handleFolderClick = (item) => {
    setSelectedItem(item);
    if (item.type === 'folder') {
      let newPath = item.path;
      if (!newPath.startsWith('..')) {
        newPath = '..' + newPath;
      }
      setCurrentPath(`${newPath}/${item.name}`);
      sessionStorage.setItem('recyclePath', `${newPath}/${item.name}`);
    }
  };

  const handleViewFile = async (name, path, fileId, type, isEditing) => {
    setActionsLoading(true);
    try {
      const fileData = await ViewDocument(name, path, type, fileId);
      setFileView(fileData);
    } catch (error) {
      console.error('Error:', error);
      toast.error(error?.response?.data?.message || error?.message);
    } finally {
      setActionsLoading(false);
    }
  };

  const restoreFile = async (item) => {
    setActionsLoading(true);
    try {
      const response = await RecoverDeletedFile(item.id);
      toast.success(response?.data?.message);
      setDeletedFiles(deletedFiles.filter((file) => file.id !== item.id));
    } catch (error) {
      toast.error(error?.response?.data?.message || error?.message);
    } finally {
      setActionsLoading(false);
      setIsMenuOpen(false);
    }
  };

  const getData = async (updatedPath) => {
    setLoading(true);
    try {
      const response =
        updatedPath === '..'
          ? await GetBinRootFolders()
          : await GetBinFolderData(updatedPath);
      setDeletedFiles(response?.data?.children || []);
    } catch (error) {
      // console.log(error?.response?.data?.message || error?.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    getData(currentPath);
  }, [currentPath]);

  // Filter files/folders by search
  const filteredFiles = deletedFiles.filter((item) =>
    item.name.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  if (loading) return <ComponentLoader />;

  return (
    <>
      {actionsLoading && <TopLoader />}
      <PathBar
        pathValue={currentPath}
        setCurrentPath={setCurrentPath}
        state={'recyclePath'}
      />

      {/* Search bar */}
      <div className="flex items-center gap-2 mt-3 mb-2">
        <CustomTextField
          type="text"
          placeholder="Search files or folders..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full outline-none text-sm"
        />
      </div>

      {/* file and folders */}
      <div className="flex-1 max-h-[calc(100vh-160px)] overflow-auto mt-2">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-1">
          {filteredFiles.length > 0 ? (
            filteredFiles.map((item) => (
              <div key={item.id} className="relative">
                <CustomCard
                  className="flex flex-row items-center justify-center p-4 hover:shadow-lg cursor-pointer relative"
                  title={item.name}
                  click={() =>
                    item.type === 'folder' ? handleFolderClick(item) : null
                  }
                  onDoubleClick={() =>
                    item.type === 'folder'
                      ? null
                      : handleViewFile(item.name, item.path, item.id, item.type)
                  }
                >
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedItem(item);
                      setIsMenuOpen(true);
                    }}
                    className="absolute top-1 right-0 hover:bg-blue-50 p-1 rounded-[50%] z-9"
                  >
                    <IconDotsVertical size={22} />
                  </button>
                  <img
                    src={
                      item.type !== 'folder'
                        ? ImageConfig[item.type] || ImageConfig['default']
                        : folderIcon
                    }
                    className="h-12 p-2"
                    alt={item.type}
                  />
                  <h2 className="cursor-text font-semibold truncate w-full text-center">
                    {item.name}
                  </h2>
                </CustomCard>
              </div>
            ))
          ) : (
            <CustomCard className="w-full text-center">
              <h2 className="font-semibold">No results found</h2>
            </CustomCard>
          )}
        </div>
      </div>

      {/* actions modal */}
      {selectedItem && (
        <CustomModal isOpen={isMenuOpen}>
          <h3 className="font-semibold mb-3">{selectedItem.name}</h3>
          <div className="flex flex-col gap-2">
            {selectedItem.type !== 'folder' && (
              <>
                <CustomButton
                  variant="none"
                  text={
                    <>
                      <IconRestore size={18} /> Restore
                    </>
                  }
                  className="w-full flex items-center gap-2"
                  click={() => restoreFile(selectedItem)}
                />
                {/* <CustomButton
                  variant="none"
                  text={
                    <>
                      <IconTrash size={18} /> Delete Permanently
                    </>
                  }
                  className="w-full flex items-center gap-2"
                  click={() => deletePermanently(selectedItem)}
                /> */}
              </>
            )}
            <CustomButton
              variant="none"
              text={
                <>
                  <IconSettings size={18} /> Properties
                </>
              }
              className="w-full flex items-center gap-2"
              click={() => {
                setIsMenuOpen(false);
                setShowProperties(true);
              }}
              disabled={actionsLoading}
            />
          </div>
          <CustomButton
            variant="danger"
            text={
              <>
                <IconSquareLetterX size={18} /> Close
              </>
            }
            className="w-full flex items-center gap-2 mt-4"
            click={() => setIsMenuOpen(false)}
          />
        </CustomModal>
      )}

      {/* show properties modal */}
      <CustomModal isOpen={showProperties}>
        <div className="flex justify-between items-center border-b pb-2 mb-4 gap-3">
          <h2 className="text-lg font-semibold">
            {selectedItem?.name} Properties
          </h2>
          <button
            onClick={() => setShowProperties(false)}
            className="text-gray-500 hover:text-gray-700"
          >
            <IconSquareLetterX className="hover:text-red-500" />
          </button>
        </div>
        <div className="space-y-2">
          <p className="flex justify-between">
            <span className="font-medium">Name:</span> {selectedItem?.name}
          </p>
          <p className="flex justify-between">
            <span className="font-medium">Path:</span> {selectedItem?.path}
          </p>
          <p className="flex justify-between">
            <span className="font-medium">Type:</span> {selectedItem?.type}
          </p>
          <p className="flex justify-between">
            <span className="font-medium">Size:</span> {selectedItem?.size}{' '}
            bytes
          </p>
          <p className="flex justify-between">
            <span className="font-medium">Created On:</span>{' '}
            {moment(selectedItem?.createdOn).format('DD-MM-YYYY')}
          </p>
          <p className="flex justify-between">
            <span className="font-medium">Last Updated:</span>{' '}
            {moment(selectedItem?.lastUpdated).format('DD-MM-YYYY')}
          </p>
          <p className="flex justify-between">
            <span className="font-medium">Last Accessed:</span>{' '}
            {moment(selectedItem?.lastAccessed).format('DD-MM-YYYY')}
          </p>
          <p className="flex justify-between">
            <span className="font-medium">Rejected:</span>{' '}
            {selectedItem?.isRejected ? 'Yes' : 'No'}
          </p>
        </div>
      </CustomModal>

      {/* View File Modal */}
      {fileView && (
        <ViewFile
          docu={fileView}
          setFileView={setFileView}
          handleViewClose={() => setFileView(null)}
        />
      )}
    </>
  );
};

export default RecycleBin;
