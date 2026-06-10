import prisma from "../config/prisma-config.js";

class SearchIndexService {
  // Existing searchContent method
  static async searchContent(content, { page, pageSize }) {
    try {
      const documents = await prisma.document.findMany({
        where: {
          documentContent: {
            content: {
              contains: content,
              mode: "insensitive",
            },
          },
        },
        select: {
          id: true,
          path: true,
          tags: true,
          name: true,
          isArchived: true,
          inBin: true,
          createdBy: { select: { username: true } },
          processDocuments: {
            select: {
              partNumber: true,
              processId: true,
              description: true,
              preApproved: true,
              superseding: true,
              process: { select: { name: true } },
            },
          },
          documentContent: { select: { content: true } },
        },
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdOn: "desc" },
      });

      const totalCount = await prisma.document.count({
        where: {
          documentContent: {
            content: { contains: content, mode: "insensitive" },
          },
        },
      });

      const results = documents.map((doc) => ({
        id: doc.id,
        path: doc.path,
        tags: doc.tags,
        name: doc.name,
        isArchived: doc.isArchived,
        inBin: doc.inBin,
        createdByUsername: doc.createdBy?.username || null,
        partNumber: doc.processDocuments[0]?.partNumber || null,
        processId: doc.processDocuments[0]?.processId || null,
        processName: doc.processDocuments[0]?.process?.name || null,
        description: doc.processDocuments[0]?.description || null,
        preApproved: doc.processDocuments[0]?.preApproved || null,
        superseding: doc.processDocuments[0]?.superseding || null,
        contentSnippet: doc.documentContent?.content?.slice(0, 100) || "",
        rank: 1, // Placeholder rank; adjust for relevance if needed
      }));

      return {
        results,
        totalCount,
        totalPages: Math.ceil(totalCount / pageSize),
      };
    } finally {
    }
  }

  // New method to index document content
  static async indexDocumentContent(documentId, content) {
    try {
      // Upsert the document content (create if not exists, update if exists)
      await prisma.documentContent.upsert({
        where: { documentId }, // Assuming documentId is the unique identifier
        update: { content }, // Update content if the record exists
        create: {
          documentId,
          content,
        },
      });
      console.log(`Successfully saved content for document ${documentId}`);
    } catch (error) {
      console.error(
        `Failed to index content for document ${documentId}:`,
        error,
      );
      throw error; // Re-throw to allow caller to handle the error
    } finally {
    }
  }
}

export default SearchIndexService;
