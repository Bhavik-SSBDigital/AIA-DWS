import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';

const Editor = ({
  documentId,
  fileType,
  name,
  path,
  accessToken,
  onError,
  readOnly,
}) => {
  const [editorUrl, setEditorUrl] = useState('');
  const [lock, setLock] = useState(null);
  const [error, setError] = useState(null);
  const backend_url = import.meta.env.VITE_BACKEND_URL;

  useEffect(() => {
    console.log("called righhttt")
    const fetchEditorUrl = async () => {
      try {
        console.log('Editor.jsx: Starting fetchEditorUrl', {
          documentId,
          fileType,
          name,
          path,
          accessToken: accessToken ? 'present' : 'missing',
          readOnly,
        });

        if (!documentId || !fileType || !accessToken) {
          throw new Error(
            `Missing required props: ${!documentId ? 'documentId' : ''} ${!fileType ? 'fileType' : ''} ${!accessToken ? 'accessToken' : ''}`,
          );
        }

        // Fetch WOPI token and acquire lock if not readOnly
        const tokenResponse = await axios.post(
          `${backend_url}/wopi/token/${documentId}`,
          { readOnly }, // Send readOnly in the request body
          {
            headers: { 'x-authorization': `Bearer ${accessToken}` },
          },
        );
        const { lock: lockValue } = tokenResponse.data;
        setLock(lockValue);

        const wopiToken = tokenResponse.data.access_token;

        // Acquire lock for editable documents
        if (!readOnly) {
          await axios.post(
            `${backend_url}/wopi/files/${documentId}/lock`,
            {},
            {
              headers: {
                'x-authorization': `Bearer ${accessToken}`,
                'X-WOPI-Lock': lockValue || 'lock-value',
              },
            },
          );
        }

        // Fetch Collabora discovery XML

        const discoveryResponse = await axios.get(
          `${backend_url}/hosting/discovery`,
          {
            headers: {
              Origin: `${backend_url}`,
              'Access-Control-Request-Method': 'GET',
              'Access-Control-Request-Headers': 'content-type',
            },
            withCredentials: false,
          },
        );

        console.log("discovery response", discoveryResponse)

        // Parse the XML string
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(
          discoveryResponse.data,
          'application/xml',
        );
        const discoveryNode = xmlDoc.querySelector('wopi-discovery');
        if (!discoveryNode) {
          throw new Error(
            'Invalid Collabora discovery response: Missing wopi-discovery element',
          );
        }

        // Map file extensions to Collabora app names
        const appMap = {
          docx: 'writer',
          doc: 'writer',
          odt: 'writer',
          xlsx: 'calc',
          xls: 'calc',
          ods: 'calc',
          pptx: 'impress',
          ppt: 'impress',
          odp: 'impress',
          odg: 'draw',
          pdf: 'draw',
          tiff: 'draw',
        };

        const appName = appMap[fileType.toLowerCase()];
        if (!appName) {
          throw new Error(
            `Unsupported file type: ${fileType}. Supported types: ${Object.keys(appMap).join(', ')}`,
          );
        }

        // Find the specific action based on readOnly and fileType
        let action;
        if (readOnly) {
          action = Array.from(
            xmlDoc.querySelectorAll(`app[name="${appName}"] action`),
          ).find(
            (action) =>
              action.getAttribute('name') === 'view' &&
              action.getAttribute('ext') === fileType.toLowerCase(),
          );
          if (!action) {
            console.warn(
              `Editor.jsx: No view action found for ${fileType}, falling back to edit with IsReadOnly=1`,
            );
            action = Array.from(
              xmlDoc.querySelectorAll(`app[name="${appName}"] action`),
            ).find(
              (action) =>
                action.getAttribute('name') === 'edit' &&
                action.getAttribute('ext') === fileType.toLowerCase(),
            );
          }
        } else {
          action = Array.from(
            xmlDoc.querySelectorAll(`app[name="${appName}"] action`),
          ).find(
            (action) =>
              action.getAttribute('name') === 'edit' &&
              action.getAttribute('ext') === fileType.toLowerCase(),
          );
        }

        if (!action) {
          const availableActions = Array.from(
            xmlDoc.querySelectorAll(`app[name="${appName}"] action`),
          )
            .map(
              (a) =>
                `${a.getAttribute('name')}:${a.getAttribute('ext') || 'any'}`,
            )
            .join(', ');
          throw new Error(
            `No suitable action found for file type: ${fileType} in app: ${appName}. Available actions: ${availableActions}`,
          );
        }

        // Verify Collabora server is reachable
        try {
          await axios.get(`${backend_url}/collabora/capabilities`);
        } catch (err) {
          throw new Error('Collabora server is not reachable');
        }

        // Construct WOPISrc and query string
        const wopiSrc = `${backend_url}/wopi/files/${documentId}`;

        const params = new URLSearchParams({
          access_token: wopiToken,
          lang: 'en-US',
          closebutton: '0',
          revisionhistory: '1',
          ...(readOnly && { IsReadOnly: '1' }),
        });
        const url = `${action.getAttribute('urlsrc')}WOPISrc=${encodeURIComponent(wopiSrc)}&${params.toString()}`;

        setEditorUrl(url);
      } catch (err) {
        console.error('Editor.jsx: Error fetching editor URL:', err);
        const errorMessage = err.response
          ? `Server error: ${err.response.status} - ${err.response.data?.message || err.message}`
          : `Network error: ${err.message}`;
        setError(errorMessage);
        toast.error(`Failed to load Collabora Online editor: ${errorMessage}`);
        if (onError) onError(err);
      }
    };

    fetchEditorUrl();

    // Cleanup function to unlock the file
    return () => {
      if (!readOnly && documentId && accessToken && lock) {
        axios
          .post(
            `${backend_url}/wopi/files/${documentId}/unlock`,
            {},
            {
              headers: {
                'x-authorization': `Bearer ${accessToken}`,
                'X-WOPI-Lock': lock,
              },
            },
          )
          .then(() => {
            console.log('Editor.jsx: File unlocked successfully');
          })
          .catch((err) => {
            console.error('Editor.jsx: Error unlocking file:', err);
            toast.error('Failed to unlock file on session end');
          });
      }
    };
  }, [documentId, fileType, name, path, accessToken, onError, readOnly, lock]);

  const handleIframeError = (event) => {
    console.error('Editor.jsx: Iframe load error:', event, event.target.src);
    setError(
      'Failed to load Collabora Online editor. Please check server logs.',
    );
    toast.error('Failed to load Collabora Online editor');
  };

  if (error) {
    return <div className="text-center text-red-500">Error: {error}</div>;
  }

  if (!editorUrl) {
    return (
      <div className="text-center text-gray-500">
        Loading Collabora Online editor...
      </div>
    );
  }

  return (
    <iframe
      src={editorUrl}
      title="Collabora Online Editor"
      width="100%"
      height="100%"
      style={{ border: 'none', minHeight: '600px' }}
      allowFullScreen
      onError={handleIframeError}
    />
  );
};

export default Editor;
