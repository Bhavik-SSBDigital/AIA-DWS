import axios from 'axios';

const backendUrl = import.meta.env.VITE_BACKEND_URL;

const EDITABLE_EXTENSIONS = new Set([
  "doc",
  "docx",
  "dot",
  "dotx",
  "docm",
  "dotm",
  "xls",
  "xlsx",
  "xlsm",
  "xlt",
  "xltx",
  "xltm",
  "ppt",
  "pptx",
  "pptm",
  "pot",
  "potx",
  "potm",
  "odt",
  "ods",
  "odp",
  "ott",
  "ots",
  "otp",
  "gdoc",
  "gsheet",
  "gslides",
  "rtf",
  "txt",
  "csv",
  "xml",
  "html",
  "htm",
  "pages",
  "numbers",
  "key",
  "wpd",
  "wps",
  "js",
  "ts",
  "py",
  "java",
  "cpp",
  "c",
  "h",
  "php",
  "rb",
  "go",
  "rs",
  "swift",
  "kt",
  "json",
  "yml",
  "yaml",
  "toml",
  "ini",
  "sql",
  "md",
  "tex",
  "latex",
]);


const isEditableFile = (fileName) => {
  if (!fileName) return false;
  const extension = fileName.split(".").pop().toLowerCase();
  return EDITABLE_EXTENSIONS.has(extension);
};

export const getContentTypeFromExtension = (extension) => {
  const mimeTypes = {
    txt: "text/plain",
    pdf: "application/pdf",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ppt: "application/vnd.ms-powerpoint",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    bmp: "image/bmp",
    svg: "image/svg+xml",
    mp3: "audio/mpeg",
    wav: "audio/wav",
    mp4: "video/mp4",
    avi: "video/x-msvideo",
    mkv: "video/x-matroska",
    zip: "application/zip",
    rar: "application/x-rar-compressed",
    tar: "application/x-tar",
  };
  return mimeTypes[extension] || "application/octet-stream";
};

export const getFileSize = async (fileName, path, token) => {
  // Don't use this for editable files
  if (isEditableFile(fileName)) {
    return null;
  }

  try {
    const url = backendUrl + "/getFileData";
    const response = await axios({
      method: "get",
      url: url,
      headers: {
        Range: `bytes=0-0`,
        "X-File-name": encodeURIComponent(fileName),
        "X-File-path": encodeURIComponent(path),
        "x-authorization": `Bearer ${token}`,
      },
    });
    return response.data.fileSize;
  } catch (error) {
    console.error("Error getting file size:", error);
    return null;
  }
};
// filename must be with its extension
// export const download = async (fileName,path,view) => {
//     let chunks = [];
//     const token = sessionStorage.getItem('accessToken')
//     // console.log('token' +token);
//     let start = 0;
//     let chunkSize = 100 * 1024 * 1024;
//     let end = chunkSize - 1;
//     const fileExtension = fileName.split('.')[1];
//     let fileSize = await getFileSize(fileName,path,token);
//     if (fileSize === undefined) {
//         console.log('file does not exist');
//         alert('file does not exist, please check file name');
//         return;
//     }
//     end = Math.min(end, fileSize - 1);
//     // console.log('file size is', fileSize);
//     // console.log('file size', fileSize);

//     try {
//         while (start < fileSize) {
//             // console.log('url--', backendUrl);
//             const url = backendUrl + '/download';
//             // console.log('start is', start);
//             // console.log('end is', end);
//             // console.log({
//             //     Range: `bytes=${start}-${end}`,
//             //     'x-file-name': encodeURIComponent(fileName),
//             //     'x-file-path': path,
//             //     'content-type': getContentTypeFromExtension(fileExtension),
//             //     'access-control-expose-headers': 'Content-Range'
//             // });
//             const config = {
//                 headers: {
//                     Range: `bytes=${start}-${end}`,
//                     'x-file-name': encodeURIComponent(fileName),
//                     'x-file-path': encodeURIComponent(path),
//                     'content-type': getContentTypeFromExtension(fileExtension),
//                     'x-authorization' : `Bearer ${token}`,
//                     'access-control-expose-headers': 'Content-Range'
//                 },
//                 responseType: 'arraybuffer'
//             };
//             // console.log(config)
//             const response = await axios.post(url, null, config);
//             // const uint8Array = new Uint8Array(response.data);
//             // console.log(uint8Array + "res");

//             // Push the chunk to the array
//             let check = new Blob([response.data]);
//             let check_url = URL.createObjectURL(check);
//             // console.log(check_url + " check url");
//             // chunks.push(new Blob([response.data]));

//             // Update the byte range for the next chunk
//             start = end + 1;
//             end = Math.min(start + chunkSize - 1, fileSize - 1);
//             // console.log('chunks', chunks);
//         }

//         // Create a single Blob from the chunks
//         const combinedBlob = new Blob(chunks, { type: getContentTypeFromExtension(fileExtension) });
//         // console.log(JSON.stringify(combinedBlob) + "combined blob");
//         if(view)
//         {
//             return combinedBlob;
//         }

//         // Create a URL for the Blob
//         const blobUrl = URL.createObjectURL(combinedBlob, { type: getContentTypeFromExtension(fileExtension) });
//         // console.log(blobUrl + "blob url")

//         // Create a new anchor element
//         const anchor = document.createElement('a');
//         anchor.href = blobUrl;
//         anchor.download = `${fileName}`;

//         // Attach the anchor element to the DOM temporarily
//         document.body.appendChild(anchor);

//         // Programmatically trigger a click event on the anchor element
//         anchor.click();

//         // Clean up: revoke the URL and remove the dynamically created anchor element
//         URL.revokeObjectURL(blobUrl);

//         document.body.removeChild(anchor);

//         chunks = [];
//         start = 0;
//     } catch (error) {
//         alert(`download failed for text.txt`);
//         console.error('Error downloading file:', error);
//     }
// };

export const get_file_data = async (fileName, path, view) => {
  const token = sessionStorage.getItem("accessToken");

  // For editable files, use direct download
  if (isEditableFile(fileName)) {
    return await download(fileName, path, view);
  }

  // Only for non-editable files, use chunked download
  try {
    const url = backendUrl + "/download";
    const config = {
      headers: {
        "x-file-name": encodeURIComponent(fileName),
        "x-file-path": encodeURIComponent(path),
        "x-authorization": `Bearer ${token}`,
      },
    };

    const response = await axios.post(url, null, config);

    if (view) {
      return {
        data: response.data.url,
        fileType: response.data.fileType,
      };
    } else {
      const a = document.createElement("a");
      a.href = response.data.url;
      a.target = "_blank";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      return null;
    }
  } catch (error) {
    console.error("Error downloading file:", error);
    throw error;
  }
};

// services/fileService.js - Keep everything exactly as it was, just add:
export const download = async (fileName, path, view) => {
  const token = sessionStorage.getItem("accessToken");

  try {
    const url = backendUrl + "/download";
    const config = {
      headers: {
        "x-file-name": encodeURIComponent(fileName),
        "x-file-path": encodeURIComponent(path),
        "x-authorization": `Bearer ${token}`,
      },
    };

    const response = await axios.post(url, null, config);
    
    // If it's an editable file, just return the URL and let the browser handle it
    if (isEditableFile(fileName)) {
      if (view) {
        window.open(response.data.data, '_blank');
        return null;
      } else {
        window.location.href = response.data.data;
        return null;
      }
    } else {
      // For non-editable files, use your existing logic
      if (view) {
        return {
          data: response.data.data,
          fileType: response.data.fileType,
        };
      } else {
        const a = document.createElement("a");
        a.href = response.data.data;
        a.target = "_blank";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        return null;
      }
    }
  } catch (error) {
    console.error("Error downloading file:", error);
    throw error;
  }
};

export async function uploadFileWithChunks(
  file,
  path,
  customName,
  isInvolvedInProcess,
  tags,
  documentId,
) {
  // console.log('file chunks', path)
  try {
    // console.log('hello bro');
    const chunkSize = 500 * 1024 * 1024; // 500MB chunk size
    const totalChunks = Math.ceil(file.size / chunkSize);
    // console.log('totalChunks', totalChunks);
    for (let chunkNumber = 0; chunkNumber < totalChunks; chunkNumber++) {
      const start = chunkNumber * chunkSize;
      const end = Math.min(start + chunkSize - 1, file.size - 1);
      // console.log('end', end);
      // console.log(typeof file);
      // console.log('file name is', file.name);
      const contentType = getContentTypeFromExtension(
        file.name.split('.').pop(),
      );

      const headers = {
        'X-File-Name':
          customName !== undefined
            ? encodeURIComponent(customName)
            : encodeURIComponent(file.name),
        'X-Total-Chunks': totalChunks,
        'X-Current-Chunk': chunkNumber,
        'X-Chunk-Size': chunkSize,
        'Content-Type': contentType,
        'X-file-path': path,
        'X-file-id': documentId,
        'X-Authorization': `Bearer ${sessionStorage.getItem('accessToken')}`,
        Range: `bytes=${start}-${end}`,
      };

      if (chunkNumber === 0) {
        headers['x-involved-in-process'] = isInvolvedInProcess;
        headers['x-tags'] = tags;
      }

      const chunk = file.slice(start, end + 1);

      const url = backendUrl + '/upload';

      // console.log('url is', url);
      const response = await fetch(url, {
        method: 'POST',
        body: chunk,
        headers: headers,
      });
      // console.log('reseponse', response);

      if (response.status === 409) {
        throw new Error('File with given name already exists');
      }

      if (response.ok) {
        const data = await response.json();
        return data;
        // console.log(`Chunk ${chunkNumber + 1}/${totalChunks} uploaded successfully`);
      } else {
        throw new Error('upload failed');
        console.error(`Chunk ${chunkNumber + 1}/${totalChunks} upload failed`);
      }
    }
  } catch (error) {
    throw error;
  }
}

export async function upload(
  fileList,
  path,
  customName,
  isInvolvedInProcess,
  tags,
  documentId,
) {
  // console.log('path in upload', path);
  // console.log('function we need is called');
  // console.log('filelist length is', fileList);
  if (fileList.length === 0) {
    return;
  }
  try {
    let documentIds = [];
    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      let res =
        customName !== undefined
          ? await uploadFileWithChunks(
              file,
              path,
              customName,
              isInvolvedInProcess,
              tags,
              documentId,
            )
          : await uploadFileWithChunks(
              file,
              path,
              undefined,
              isInvolvedInProcess,
              tags,
              documentId,
            );

      // console.log("res", res)
      documentIds.push(res.documentId);
      // console.log("document ids", documentIds)
      // console.log(path)

      return documentIds;
    }
    // console.log('document ids', documentIds);
  } catch (error) {
    throw error;
  }
}
