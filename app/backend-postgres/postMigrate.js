import prisma from "../config/prisma-config.js";

async function setupFullTextSearch() {
  try {
    // Check if the column exists
    const columnExists = await prisma.$queryRaw`
      SELECT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'DocumentContent' 
        AND column_name = 'content_tsvector'
      ) AS exists
    `;

    if (!columnExists[0].exists) {
      console.log("Adding tsvector column and GIN index...");
      // Add generated tsvector column
      await prisma.$executeRaw`
        ALTER TABLE "DocumentContent"
        ADD COLUMN "content_tsvector" tsvector
        GENERATED ALWAYS AS (to_tsvector('english', coalesce("content", ''))) STORED;
      `;

      // Create GIN index
      await prisma.$executeRaw`
        CREATE INDEX "DocumentContent_content_tsvector_idx" 
        ON "DocumentContent" USING GIN ("content_tsvector");
      `;
      console.log("Full-text search setup complete.");
    } else {
      console.log("Full-text search column and index already exist.");
    }
  } catch (error) {
    console.error("Error setting up full-text search:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

setupFullTextSearch().catch((e) => {
  console.error(e);
  process.exit(1);
});
