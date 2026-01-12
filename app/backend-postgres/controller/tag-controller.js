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
