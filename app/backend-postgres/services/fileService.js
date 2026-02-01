// services/fileService.js - Keep everything exactly as it was, just add:

// services/fileProtectionService.js
import ExcelJS from "exceljs";
import mammoth from "mammoth";
import AdmZip from "adm-zip";
import fs from "fs";
import path from "path";

export class FileProtectionService {
  static async protectExcelFile(filePath) {
    try {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(filePath);

      // Add read-only protection to all worksheets
      workbook.worksheets.forEach((worksheet) => {
        // Make entire worksheet read-only
        worksheet.eachRow((row) => {
          row.eachCell((cell) => {
            cell.protection = { locked: true };
          });
        });

        // Protect the worksheet with a password (empty string means no password but locked)
        worksheet.protect("", {
          selectLockedCells: true,
          selectUnlockedCells: true,
          formatCells: false,
          formatColumns: false,
          formatRows: false,
          insertColumns: false,
          insertRows: false,
          insertHyperlinks: false,
          deleteColumns: false,
          deleteRows: false,
          sort: false,
          autoFilter: false,
          pivotTables: false,
        });
      });

      // Create a temporary file
      const tempPath = filePath + ".protected.xlsx";
      await workbook.xlsx.writeFile(tempPath);

      return tempPath;
    } catch (error) {
      console.error("Error protecting Excel file:", error);
      return filePath; // Return original if protection fails
    }
  }

  static async protectWordFile(filePath) {
    try {
      // For .docx files (which are ZIP files)
      if (filePath.endsWith(".docx")) {
        const zip = new AdmZip(filePath);
        const entries = zip.getEntries();

        // Modify document.xml to add read-only recommendation
        let documentXml = null;
        entries.forEach((entry) => {
          if (entry.entryName === "word/document.xml") {
            documentXml = zip.readAsText(entry);
          }
        });

        if (documentXml) {
          // Add read-only recommendation by modifying settings.xml
          let settingsXml = null;
          entries.forEach((entry) => {
            if (entry.entryName === "word/settings.xml") {
              settingsXml = zip.readAsText(entry);
            }
          });

          if (!settingsXml) {
            // Create settings.xml if it doesn't exist
            settingsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
              <w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
                <w:writeProtection w:recommended="1"/>
              </w:settings>`;
          } else {
            // Add writeProtection if not present
            if (!settingsXml.includes("writeProtection")) {
              settingsXml = settingsXml.replace(
                "</w:settings>",
                '<w:writeProtection w:recommended="1"/></w:settings>',
              );
            }
          }

          // Update the zip
          zip.updateFile("word/settings.xml", Buffer.from(settingsXml, "utf8"));

          const tempPath = filePath + ".protected.docx";
          zip.writeZip(tempPath);
          return tempPath;
        }
      }

      return filePath;
    } catch (error) {
      console.error("Error protecting Word file:", error);
      return filePath;
    }
  }

  static async protectOfficeFile(filePath) {
    const ext = path.extname(filePath).toLowerCase();

    switch (ext) {
      case ".xlsx":
      case ".xls":
        return await this.protectExcelFile(filePath);
      case ".docx":
      case ".doc":
        return await this.protectWordFile(filePath);
      default:
        return filePath;
    }
  }

  static cleanupTempFile(tempPath) {
    if (tempPath && tempPath.includes(".protected.")) {
      setTimeout(() => {
        try {
          fs.unlinkSync(tempPath);
        } catch (e) {
          // Ignore cleanup errors
        }
      }, 5000);
    }
  }
}
