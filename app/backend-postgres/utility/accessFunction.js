import prisma from "../config/prisma-config.js";

export const returnParentsForUpload = async (upload) => {
  try {
    const uploadArrayToBeStoredInUser = [];
    const visitedParentIds = new Set(); // Keep track of visited parent IDs

    // Base case: Stop recursion if the upload array is empty
    if (upload.length === 0) {
      return uploadArrayToBeStoredInUser;
    }

    for (const documentId of upload) {
      // Fetch the document using Prisma
      const childDocument = await prisma.document.findUnique({
        where: { id: documentId },
        select: {
          id: true,
          parentId: true,
          isProject: true,
        },
      });

      if (!childDocument) {
        continue; // Skip if the document is not found
      }

      // Check if the document is not a project
      if (childDocument.isProject !== true) {
        const parentId = childDocument.parentId;

        // Only add unique parent IDs
        if (parentId && !visitedParentIds.has(parentId)) {
          uploadArrayToBeStoredInUser.push(parentId);
          visitedParentIds.add(parentId);
        }

        // Recurse with the parent ID
        const childUpload = [parentId];
        const childResults = await returnParentsForUpload(childUpload);

        // Append recursive results
        uploadArrayToBeStoredInUser.push(...childResults);
      }
    }

    return uploadArrayToBeStoredInUser;
  } catch (error) {
    console.error("Error in returnParentsForUpload:", error);
    return null;
  }
};

export const returnParentsForDownload = async (download) => {
  try {
    const downloadArrayToBeStoredInUser = [];
    const visitedParentIds = new Set(); // Keep track of visited parent IDs

    // Define a base case to stop the recursion
    if (download.length === 0) {
      return downloadArrayToBeStoredInUser;
    }

    for (const documentId of download) {
      const childDocument = await prisma.document.findUnique({
        where: { id: documentId },
        select: {
          parentId: true,
          isProject: true,
        },
      });

      if (!childDocument) {
        continue; // Skip if the document doesn't exist
      }

      // Check if it's not a project to continue the recursion
      if (childDocument.isProject !== true && childDocument.parentId !== null) {
        const parentId = childDocument.parentId;

        // Only process unique parent IDs
        if (!visitedParentIds.has(parentId)) {
          downloadArrayToBeStoredInUser.push(parentId);
          visitedParentIds.add(parentId); // Mark as visited
        }

        // Recurse with the parent ID
        const childResults = await returnParentsForDownload([parentId]);
        downloadArrayToBeStoredInUser.push(...childResults);
      }
    }

    return downloadArrayToBeStoredInUser;
  } catch (error) {
    console.error("Error in returnParentsForDownload:", error);
    return null;
  }
};

export const returnParentsForView = async (view) => {
  try {
    const viewArrayToBeStoredInUser = [];
    const visitedParentIds = new Set(); // Keep track of visited parent IDs

    // Define a base case to stop the recursion
    if (view.length === 0) {
      return viewArrayToBeStoredInUser;
    }

    for (let i = 0; i < view.length; i++) {
      // Fetch the child document from the database using Prisma
      const childDocument = await prisma.document.findUnique({
        where: { id: view[i] },
        include: {
          parent: true, // Include the parent document in the query
        },
      });

      if (!childDocument) {
        continue; // Skip this document and continue with the next one
      }

      // Check if it's not a project to continue the recursion
      if (childDocument.isProject !== true && childDocument.parent) {
        const parentId = childDocument.parent.id;

        // Only push unique parent IDs into the array
        if (!visitedParentIds.has(parentId)) {
          viewArrayToBeStoredInUser.push(parentId);
          visitedParentIds.add(parentId); // Add the parent ID to the Set
        }

        const childView = [parentId]; // Create an array for the parent ID
        const childResults = await returnParentsForView(childView); // Recurse with the parent ID

        // Append the results of the recursive call to the main array
        viewArrayToBeStoredInUser.push(...childResults);
      }
    }

    return viewArrayToBeStoredInUser;
  } catch (error) {
    console.error("Error in returnParentsForView:", error);
    return null;
  }
};

export const getParents = async (view) => {
  try {
    const viewArrayToBeStoredInUser = [];
    const visitedParentIds = new Set(); // Keep track of visited parent IDs

    // Define a base case to stop the recursion
    if (view.length === 0) {
      return viewArrayToBeStoredInUser;
    }

    for (let i = 0; i < view.length; i++) {
      console.log("view[i]", view[i]);
      const childDocument = await prisma.document.findUnique({
        where: {
          id: parseInt(view[i]), // Convert view[i] to integer if needed
        },
        include: {
          parent: true, // Include the parent document
        },
      });

      if (!childDocument) {
        continue; // Skip this document and continue with the next one
      }

      // Check if it's not a project to continue the recursion
      if (childDocument.isProject !== true) {
        const parentId = childDocument.parentId;

        // Only push unique parent IDs into the array
        if (parentId && !visitedParentIds.has(parentId)) {
          viewArrayToBeStoredInUser.push(parentId);
          visitedParentIds.add(parentId); // Add the parent ID to the Set
        }

        const childView = [parentId]; // Create an array for the parent ID
        const childResults = await getParents(childView); // Recurse with the parent ID

        // Append the results of the recursive call to the main array
        viewArrayToBeStoredInUser.push(...childResults);
      }
    }

    return viewArrayToBeStoredInUser;
  } catch (error) {
    console.error("Error in getParents:", error);
    return null;
  } finally {
    await prisma.$disconnect();
  }
};

export const uploadAccess = async (upload, create) => {
  let uploadArrayToBeStored = [];

  // Assuming `upload` is an array of document IDs or document objects
  // Let's first fetch the parents of the upload documents

  for (const doc of upload) {
    const document = await prisma.document.findUnique({
      where: { id: doc.id }, // or you may use a different unique identifier
      include: { parent: true }, // Including the parent document
    });

    if (document?.parent) {
      uploadArrayToBeStored.push(document.parent.id);
    }
  }

  // Now, merge the parent document IDs with the original uploads (assuming `upload` is an array of document objects)
  uploadArrayToBeStored = [
    ...uploadArrayToBeStored,
    ...upload.map((doc) => doc.id),
  ];

  // Remove duplicates
  uploadArrayToBeStored = [...new Set(uploadArrayToBeStored)];

  if (create) {
    // If `create` is true, return the list of document IDs to be stored
    return uploadArrayToBeStored;
  }

  // If any additional logic is needed when `create` is false, you can add it here
};

export const downloadAccess = async (download, create) => {
  // Fetch parents for the given documents
  let downloadArrayToBeStored = await returnParentsForDownload(download);

  // Flatten the array to include both the current downloads and the parents
  downloadArrayToBeStored = [...downloadArrayToBeStored, ...download];

  // Ensure uniqueness
  downloadArrayToBeStored = [...new Set(downloadArrayToBeStored)];

  // If we are creating new download entries, return the array
  if (create) {
    return downloadArrayToBeStored;
  }

  // Otherwise, proceed to handle the download permissions with Prisma

  // Assuming 'downloadable' refers to Document's downloadable field or User's related roles
  const userDownloadableDocs = await prisma.user.findMany({
    where: {
      id: { in: downloadArrayToBeStored }, // Assuming 'download' is an array of user IDs
    },
    select: {
      id: true,
      downloadable: true, // Assuming downloadable field exists in User model
      roles: {
        select: {
          role: true,
          downloadable: true, // Get download permissions for roles
        },
      },
    },
  });

  const accessibleDownloads = [];

  // Now filter through the downloaded documents based on permissions
  userDownloadableDocs.forEach((user) => {
    const userDownloads = user.downloadable; // User's downloadable docs
    user.roles.forEach((role) => {
      if (role.downloadable) {
        userDownloads.push(...role.downloadable); // Add role-specific downloadable docs
      }
    });

    // Add the documents the user is allowed to download to the result
    accessibleDownloads.push(...userDownloads);
  });

  // Remove duplicates from the final list of accessible downloads
  return [...new Set(accessibleDownloads)];
};

export const viewAccess = async (view, create) => {
  let viewArrayToBeStored = [];

  // Assuming view refers to a department or user
  if (view.departmentId) {
    // Get parent departments for the provided department
    const parentDepartments = await prisma.department.findMany({
      where: {
        id: view.departmentId,
      },
      include: {
        parentDepartment: true, // Get the parent department(s)
      },
    });

    // Get all parent department IDs (recursive if necessary)
    const getParentDepartments = (department) => {
      let departments = [];
      if (department.parentDepartment) {
        departments.push(department.parentDepartment.id);
        departments = [
          ...departments,
          ...getParentDepartments(department.parentDepartment),
        ];
      }
      return departments;
    };

    // Add the parent departments recursively
    parentDepartments.forEach((department) => {
      viewArrayToBeStored = [
        ...viewArrayToBeStored,
        ...getParentDepartments(department),
      ];
    });

    // Include the view department in the array
    viewArrayToBeStored.push(view.departmentId);
  } else if (view.userId) {
    // If view is a user, get the user's department(s)
    const userDepartments = await prisma.user.findUnique({
      where: {
        id: view.userId,
      },
      include: {
        branches: true, // User's related departments
      },
    });

    // Add user's departments to the array
    userDepartments.branches.forEach((department) => {
      viewArrayToBeStored.push(department.id);
    });
  }

  // Remove duplicates
  viewArrayToBeStored = [...new Set(viewArrayToBeStored)];

  if (create) {
    return viewArrayToBeStored;
  }
};

export const getChildrenForFullAccess = async (id) => {
  let children = [];

  // Find the document by ID using Prisma
  const document = await prisma.document.findUnique({
    where: { id },
    include: { children: true }, // Include the 'children' relation
  });

  if (!document) {
    return [];
  }

  if (document.children && document.children.length > 0) {
    for (let i = 0; i < document.children.length; i++) {
      children.push(document.children[i]);
      const nested = await getChildrenForFullAccess(document.children[i].id); // Make recursive call with child id
      children = [...children, ...nested];
    }
  }

  return children;
};

export const getChildrenForDoc = async (id) => {
  console.log("id from child doc", id);
  let children = [];

  const document = await prisma.document.findUnique({
    where: { id: id },
    include: {
      children: true, // Ensuring you load the children relation
    },
  });

  if (!document) {
    return []; // Return an empty array if no document is found
  }

  // Check if document has children and return them
  if (document.children && document.children.length > 0) {
    children = document.children;
  }

  return children;
};

export const fullAccess = async (fullAccess) => {
  let uploads = [];
  let downloads = [];
  let views = [];

  for (let i = 0; i < fullAccess.length; i++) {
    const doc = fullAccess[i];

    // Get child documents related to this document (if any)
    const children = await prisma.document.findMany({
      where: { parentId: doc.id },
    });

    let array = [...children.map((child) => child.id), doc.id];

    if (doc.upload) {
      let upload = [...new Set(array)];
      // Get the parent departments and any other related entities that can upload
      const parents = await prisma.department.findMany({
        where: {
          documents: {
            some: {
              id: doc.id,
            },
          },
        },
        select: {
          id: true, // Assuming the department ID is required
        },
      });
      uploads = [...uploads, ...upload, ...parents.map((dept) => dept.id)];
    }

    if (doc.download) {
      let download = [...new Set(array)];
      // Get the parent departments and any other related entities that can download
      const parents = await prisma.department.findMany({
        where: {
          documents: {
            some: {
              id: doc.id,
            },
          },
        },
        select: {
          id: true, // Assuming the department ID is required
        },
      });
      downloads = [
        ...downloads,
        ...download,
        ...parents.map((dept) => dept.id),
      ];
    }

    if (doc.view) {
      let view = [...new Set(array)];
      // Get the parent departments and any other related entities that can view
      const parents = await prisma.department.findMany({
        where: {
          documents: {
            some: {
              id: doc.id,
            },
          },
        },
        select: {
          id: true, // Assuming the department ID is required
        },
      });
      views = [...views, ...view, ...parents.map((dept) => dept.id)];
    }
  }

  return {
    upload: uploads,
    download: downloads,
    view: views,
  };
};
