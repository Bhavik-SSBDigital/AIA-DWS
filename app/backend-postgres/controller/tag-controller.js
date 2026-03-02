import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

export const add_tags = async (req, res) => {
  try {
    let { tags } = req.body;

    if (!Array.isArray(tags) || tags.length === 0) {
      return res.status(400).json({
        message: "tags must be a non-empty array of strings",
      });
    }

    // normalize + deduplicate
    tags = [...new Set(tags.map((t) => t?.trim()).filter(Boolean))];

    const result = await prisma.tag.createMany({
      data: tags.map((name) => ({ name })),
      skipDuplicates: true,
    });

    return res.status(201).json({
      message: "Tags added successfully",
      added: result.count,
    });
  } catch (err) {
    console.error("add_tags error:", err);
    res.status(500).json({ message: "Failed to add tags" });
  }
};

export const get_tags = async (req, res) => {
  try {
    const tags = await prisma.tag.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
      },
    });

    res.status(200).json(tags);
  } catch (err) {
    console.error("get_tags error:", err);
    res.status(500).json({ message: "Failed to fetch tags" });
  }
};

// PUT /tags/:id
export const update_tag = async (req, res) => {
  try {
    const { id } = req.params;
    const { name } = req.body;

    if (!name || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ message: "Tag name is required" });
    }

    const trimmedName = name.trim();

    // Check if another tag already uses this name (unique constraint)
    const existing = await prisma.tag.findFirst({
      where: {
        name: trimmedName,
        NOT: { id: parseInt(id) },
      },
    });
    if (existing) {
      return res.status(409).json({ message: "Tag name already exists" });
    }

    const updatedTag = await prisma.tag.update({
      where: { id: parseInt(id) },
      data: { name: trimmedName },
    });

    res.status(200).json(updatedTag);
  } catch (err) {
    console.error("update_tag error:", err);
    if (err.code === "P2025") {
      // Record not found
      return res.status(404).json({ message: "Tag not found" });
    }
    res.status(500).json({ message: "Failed to update tag" });
  }
};

// DELETE /tags/:id
export const delete_tag = async (req, res) => {
  try {
    const { id } = req.params;

    await prisma.tag.delete({
      where: { id: parseInt(id) },
    });

    res.status(200).json({ message: "Tag deleted successfully" });
  } catch (err) {
    console.error("delete_tag error:", err);
    if (err.code === "P2025") {
      return res.status(404).json({ message: "Tag not found" });
    }
    // If tag is referenced elsewhere, Prisma will throw P2003 (foreign key)
    // You may choose to handle cascading deletes or block deletion
    res.status(500).json({ message: "Failed to delete tag" });
  }
};
